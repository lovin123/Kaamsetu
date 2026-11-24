package com.kaamsetu.audio

import android.content.Context
import android.util.Log
import com.rikorose.deepfilternet.NativeDeepFilterNet
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Primary denoise engine — Kaleyra AndroidDeepFilterNet (bundled model AAR).
 *
 * Contract (Kaleyra README + NativeDeepFilterNetTest):
 * - 48 kHz mono 16-bit PCM
 * - Wait for [NativeDeepFilterNet.onModelLoaded] before frameLength / processFrame
 * - direct little-endian ByteBuffer sized to frameLength bytes
 * - processFrame modifies the buffer in-place and returns SNR (or -1 if not ready)
 */
class DeepFilterNetProcessor(private val context: Context) : AudioProcessingService {
  override val mode = DenoiseMode.DEEPFILTERNET
  private var engine: NativeDeepFilterNet? = null
  private var frameLength = 0
  private var failed = false

  override fun initialize(audioSessionId: Int): Boolean {
    return try {
      // applicationContext: matches Kaleyra NativeDeepFilterNetLoader
      val appCtx = context.applicationContext
      val instance = NativeDeepFilterNet(appCtx)

      // Model load is async (coroutine). Official tests: frameLength == -1 until onModelLoaded.
      val latch = CountDownLatch(1)
      instance.onModelLoaded {
        latch.countDown()
      }
      val loaded = latch.await(MODEL_LOAD_TIMEOUT_SEC, TimeUnit.SECONDS)
      if (!loaded) {
        Log.w(TAG, "DeepFilterNet model load timed out after ${MODEL_LOAD_TIMEOUT_SEC}s")
        tryRelease(instance)
        failed = true
        return false
      }

      val attenOk = instance.setAttenuationLimit(ATTENUATION_DB)
      if (!attenOk) {
        Log.w(TAG, "setAttenuationLimit($ATTENUATION_DB) failed after onModelLoaded")
        tryRelease(instance)
        failed = true
        return false
      }

      val len = instance.frameLength.toInt()
      // Official test asserts frameLength != -1 after load; must be positive even byte count.
      if (len <= 0 || len % 2 != 0) {
        Log.w(TAG, "Invalid DeepFilterNet frameLength=$len after model load")
        tryRelease(instance)
        failed = true
        return false
      }

      frameLength = len
      engine = instance
      Log.i(TAG, "DeepFilterNet ready frameLength=$frameLength bytes atten=${ATTENUATION_DB}dB")
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet init failed: ${t.message}", t)
      failed = true
      false
    }
  }

  override fun processFrame(buffer: ByteBuffer): Boolean {
    val eng = engine
    if (failed || eng == null) return false
    if (!buffer.isDirect) {
      Log.w(TAG, "DeepFilterNet requires a direct ByteBuffer")
      failed = true
      return false
    }
    if (buffer.remaining() != frameLength) {
      Log.w(
        TAG,
        "Frame size mismatch remaining=${buffer.remaining()} expected=$frameLength",
      )
      failed = true
      return false
    }
    return try {
      buffer.order(ByteOrder.LITTLE_ENDIAN)
      // Returns SNR; -1f means model not loaded / released (per Kaleyra tests)
      val snr = eng.processFrame(buffer)
      if (snr < 0f) {
        Log.w(TAG, "DeepFilterNet processFrame returned snr=$snr")
        failed = true
        return false
      }
      buffer.rewind()
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet process failed: ${t.message}", t)
      failed = true
      false
    }
  }

  override fun release() {
    try {
      engine?.let { tryRelease(it) }
    } finally {
      engine = null
    }
  }

  fun requiredFrameLength(): Int = frameLength

  private fun tryRelease(instance: NativeDeepFilterNet) {
    try {
      instance.release()
    } catch (_: Throwable) {
    }
  }

  companion object {
    private const val TAG = "KaamSetuDFN"
    private const val ATTENUATION_DB = 30f
    private const val MODEL_LOAD_TIMEOUT_SEC = 20L

    /** Hard classpath check — true only when the Kaleyra AAR was packaged into the APK. */
    fun isOnClasspath(): Boolean =
      try {
        Class.forName("com.rikorose.deepfilternet.NativeDeepFilterNet")
        true
      } catch (_: Throwable) {
        false
      }
  }
}
