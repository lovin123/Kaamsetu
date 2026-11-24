package com.kaamsetu.audio

import android.content.Context
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Wraps Kaleyra AndroidDeepFilterNet (JNI). Primary denoise engine.
 *
 * Contract (Kaleyra README / DeepAudioFilter sample):
 * - 48 kHz mono 16-bit PCM
 * - direct little-endian ByteBuffer sized to [frameLength] bytes
 * - [processFrame] modifies the buffer in-place; caller must rewind before reading
 * - Falls back by returning false from initialize/processFrame
 */
class DeepFilterNetProcessor(private val context: Context) : AudioProcessingService {
  override val mode = DenoiseMode.DEEPFILTERNET
  private var engine: Any? = null
  private var frameLength = 0
  private var failed = false

  override fun initialize(audioSessionId: Int): Boolean {
    return try {
      val clazz = Class.forName("com.rikorose.deepfilternet.NativeDeepFilterNet")
      val ctor = clazz.getConstructor(Context::class.java)
      val instance = ctor.newInstance(context)

      val setAttenuation =
        clazz.getMethod("setAttenuationLimit", Float::class.javaPrimitiveType)
      setAttenuation.invoke(instance, 30f)

      val len = readFrameLength(clazz, instance)
      if (len <= 0 || len % 2 != 0) {
        Log.w(TAG, "Invalid DeepFilterNet frameLength=$len")
        tryRelease(instance)
        failed = true
        return false
      }

      frameLength = len
      engine = instance
      Log.i(TAG, "DeepFilterNet ready frameLength=$frameLength bytes")
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet init failed: ${t.message}")
      failed = true
      false
    }
  }

  override fun processFrame(buffer: ByteBuffer): Boolean {
    if (failed || engine == null) return false
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
      val clazz = engine!!.javaClass
      val process = clazz.getMethod("processFrame", ByteBuffer::class.java)
      process.invoke(engine, buffer)
      // Kaleyra sample rewinds after processFrame before reading processed PCM
      buffer.rewind()
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet process failed: ${t.message}")
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

  private fun readFrameLength(clazz: Class<*>, instance: Any): Int {
    // Kotlin property `frameLength` → getFrameLength(); also try field for safety
    return try {
      (clazz.getMethod("getFrameLength").invoke(instance) as Number).toInt()
    } catch (_: Throwable) {
      val field = clazz.getField("frameLength")
      (field.get(instance) as Number).toInt()
    }
  }

  private fun tryRelease(instance: Any) {
    try {
      instance.javaClass.getMethod("release").invoke(instance)
    } catch (_: Throwable) {
    }
  }

  companion object {
    private const val TAG = "KaamSetuDFN"
  }
}
