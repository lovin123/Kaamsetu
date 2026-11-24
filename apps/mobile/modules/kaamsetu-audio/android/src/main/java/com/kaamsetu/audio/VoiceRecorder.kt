package com.kaamsetu.audio

import android.content.Context
import android.media.AudioFormat
import android.media.AudioRecord
import android.media.MediaRecorder
import android.util.Log
import java.io.ByteArrayOutputStream
import java.io.File
import java.io.FileOutputStream
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicBoolean
import kotlin.concurrent.thread

/**
 * Captures 48 kHz mono PCM16, runs DeepFilterNet (or NS / passthrough), writes WAV.
 *
 * DeepFilterNet path matches Kaleyra's FixedSizeAudioChunker pattern:
 * accumulate bytes until a full [frameLength] frame is available, then process.
 */
class VoiceRecorder(private val context: Context) {
  private var audioRecord: AudioRecord? = null
  private var processor: AudioProcessingService? = null
  private var recordingThread: Thread? = null
  private val recording = AtomicBoolean(false)
  private val pcm = ByteArrayOutputStream()
  private var startedAt = 0L
  private var requestedMode = DenoiseMode.DEEPFILTERNET
  var activeMode: DenoiseMode = DenoiseMode.OFF
    private set
  var fellBack = false
    private set

  fun start(mode: DenoiseMode): DenoiseMode {
    if (recording.get()) stop()
    requestedMode = mode
    fellBack = false
    pcm.reset()

    val sampleRate = 48000
    val channelConfig = AudioFormat.CHANNEL_IN_MONO
    val audioFormat = AudioFormat.ENCODING_PCM_16BIT
    val minBuf = AudioRecord.getMinBufferSize(sampleRate, channelConfig, audioFormat)
    val bufferSize = minBuf.coerceAtLeast(sampleRate / 5) * 2

    val record = AudioRecord(
      MediaRecorder.AudioSource.VOICE_RECOGNITION,
      sampleRate,
      channelConfig,
      audioFormat,
      bufferSize,
    )
    if (record.state != AudioRecord.STATE_INITIALIZED) {
      record.release()
      throw IllegalStateException("AudioRecord init failed")
    }
    audioRecord = record

    processor = createProcessorChain(mode, record.audioSessionId)
    activeMode = processor?.mode ?: DenoiseMode.OFF

    // DFN: exact native frame size in bytes. NS/off: 20 ms @ 48 kHz mono 16-bit = 1920.
    val dfn = processor as? DeepFilterNetProcessor
    val frameBytes = dfn?.requiredFrameLength()?.takeIf { it > 0 } ?: 1920

    record.startRecording()
    recording.set(true)
    startedAt = System.currentTimeMillis()

    recordingThread = thread(name = "KaamSetuCapture") {
      val readBuf = ByteArray(frameBytes.coerceAtLeast(minBuf.coerceAtLeast(2048)))
      val pending = ByteArrayOutputStream()
      val direct = ByteBuffer.allocateDirect(frameBytes).order(ByteOrder.LITTLE_ENDIAN)

      while (recording.get()) {
        val read = record.read(readBuf, 0, readBuf.size)
        if (read > 0) {
          pending.write(readBuf, 0, read)
          while (pending.size() >= frameBytes) {
            val chunk = pending.toByteArray()
            val frame = chunk.copyOfRange(0, frameBytes)
            val rest = chunk.copyOfRange(frameBytes, chunk.size)
            pending.reset()
            if (rest.isNotEmpty()) pending.write(rest)

            if (!processAndAppend(direct, frame, frameBytes, record)) {
              break
            }
          }
        } else if (read < 0) {
          Log.w(TAG, "AudioRecord.read error=$read")
          break
        }
      }

      // Flush trailing partial frame only for non-DFN modes (pad). DFN needs full frames.
      if (recording.get().not() && pending.size() > 0 && activeMode != DenoiseMode.DEEPFILTERNET) {
        val tail = pending.toByteArray()
        val padded = ByteArray(frameBytes)
        System.arraycopy(tail, 0, padded, 0, tail.size.coerceAtMost(frameBytes))
        processAndAppend(direct, padded, frameBytes, record)
      }
    }
    return activeMode
  }

  private fun processAndAppend(
    direct: ByteBuffer,
    frame: ByteArray,
    frameBytes: Int,
    record: AudioRecord,
  ): Boolean {
    direct.clear()
    direct.put(frame, 0, frameBytes)
    direct.flip()

    val ok = processor?.processFrame(direct) ?: true
    if (!ok && processor?.mode == DenoiseMode.DEEPFILTERNET) {
      Log.w(TAG, "DeepFilterNet failed mid-session — switching to NoiseSuppressor")
      processor?.release()
      val ns = AndroidNoiseSuppressorProcessor()
      if (ns.initialize(record.audioSessionId)) {
        processor = ns
        activeMode = DenoiseMode.ANDROID_NS
        fellBack = true
      } else {
        processor = PassthroughProcessor()
        activeMode = DenoiseMode.OFF
        fellBack = true
      }
      // Re-process this frame with the fallback (passthrough / NS session path)
      direct.rewind()
      processor?.processFrame(direct)
    }

    // Ensure we can read the full processed frame (DFN processFrame may leave position at end)
    direct.rewind()
    val out = ByteArray(direct.remaining())
    direct.get(out)
    synchronized(pcm) { pcm.write(out) }
    return true
  }

  fun stop(): Result {
    recording.set(false)
    try {
      recordingThread?.join(2000)
    } catch (_: InterruptedException) {
    }
    recordingThread = null
    try {
      audioRecord?.stop()
    } catch (_: Throwable) {
    }
    audioRecord?.release()
    audioRecord = null
    processor?.release()
    processor = null

    val pcmBytes = synchronized(pcm) { pcm.toByteArray() }
    val durationMs = (System.currentTimeMillis() - startedAt).coerceAtLeast(0)
    val wav = pcmToWav(pcmBytes, 48000, 1, 16)
    val outFile = File(context.cacheDir, "kaamsetu-${System.currentTimeMillis()}.wav")
    FileOutputStream(outFile).use { it.write(wav) }
    return Result(
      uri = "file://${outFile.absolutePath}",
      durationMs = durationMs,
      modeUsed = activeMode,
      fellBack = fellBack,
    )
  }

  private fun createProcessorChain(mode: DenoiseMode, sessionId: Int): AudioProcessingService {
    when (mode) {
      DenoiseMode.DEEPFILTERNET -> {
        val dfn = DeepFilterNetProcessor(context)
        if (dfn.initialize(sessionId)) return dfn
        fellBack = true
        Log.w(TAG, "DeepFilterNet unavailable — falling back to NoiseSuppressor")
        val ns = AndroidNoiseSuppressorProcessor()
        if (ns.initialize(sessionId)) return ns
        return PassthroughProcessor()
      }
      DenoiseMode.ANDROID_NS -> {
        val ns = AndroidNoiseSuppressorProcessor()
        if (ns.initialize(sessionId)) return ns
        fellBack = true
        return PassthroughProcessor()
      }
      DenoiseMode.OFF -> return PassthroughProcessor()
    }
  }

  private fun pcmToWav(pcm: ByteArray, sampleRate: Int, channels: Int, bits: Int): ByteArray {
    val header = ByteArray(44)
    val totalDataLen = pcm.size + 36
    val byteRate = sampleRate * channels * bits / 8
    header[0] = 'R'.code.toByte(); header[1] = 'I'.code.toByte(); header[2] = 'F'.code.toByte(); header[3] = 'F'.code.toByte()
    writeInt(header, 4, totalDataLen)
    header[8] = 'W'.code.toByte(); header[9] = 'A'.code.toByte(); header[10] = 'V'.code.toByte(); header[11] = 'E'.code.toByte()
    header[12] = 'f'.code.toByte(); header[13] = 'm'.code.toByte(); header[14] = 't'.code.toByte(); header[15] = ' '.code.toByte()
    writeInt(header, 16, 16)
    writeShort(header, 20, 1)
    writeShort(header, 22, channels)
    writeInt(header, 24, sampleRate)
    writeInt(header, 28, byteRate)
    writeShort(header, 32, (channels * bits / 8))
    writeShort(header, 34, bits)
    header[36] = 'd'.code.toByte(); header[37] = 'a'.code.toByte(); header[38] = 't'.code.toByte(); header[39] = 'a'.code.toByte()
    writeInt(header, 40, pcm.size)
    return header + pcm
  }

  private fun writeInt(header: ByteArray, offset: Int, value: Int) {
    header[offset] = (value and 0xff).toByte()
    header[offset + 1] = (value shr 8 and 0xff).toByte()
    header[offset + 2] = (value shr 16 and 0xff).toByte()
    header[offset + 3] = (value shr 24 and 0xff).toByte()
  }

  private fun writeShort(header: ByteArray, offset: Int, value: Int) {
    header[offset] = (value and 0xff).toByte()
    header[offset + 1] = (value shr 8 and 0xff).toByte()
  }

  data class Result(
    val uri: String,
    val durationMs: Long,
    val modeUsed: DenoiseMode,
    val fellBack: Boolean,
  )

  companion object {
    private const val TAG = "KaamSetuRecorder"
  }
}
