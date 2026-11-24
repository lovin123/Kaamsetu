package com.kaamsetu.audio

import android.content.Context
import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder

/**
 * Wraps Kaleyra AndroidDeepFilterNet (JNI). Primary denoise engine.
 * Falls back by returning false from initialize/processFrame so the recorder can switch.
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
      val setAttenuation = clazz.getMethod("setAttenuationLimit", Float::class.javaPrimitiveType)
      setAttenuation.invoke(instance, 30f)
      val frameLengthProp = clazz.getMethod("getFrameLength")
      val len = (frameLengthProp.invoke(instance) as Number).toInt()
      frameLength = len
      engine = instance
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet init failed: ${t.message}")
      failed = true
      false
    }
  }

  override fun processFrame(buffer: ByteBuffer): Boolean {
    if (failed || engine == null) return false
    return try {
      buffer.order(ByteOrder.LITTLE_ENDIAN)
      val clazz = engine!!.javaClass
      val process = clazz.getMethod("processFrame", ByteBuffer::class.java)
      process.invoke(engine, buffer)
      true
    } catch (t: Throwable) {
      Log.w(TAG, "DeepFilterNet process failed: ${t.message}")
      failed = true
      false
    }
  }

  override fun release() {
    try {
      engine?.javaClass?.getMethod("release")?.invoke(engine)
    } catch (_: Throwable) {
    } finally {
      engine = null
    }
  }

  fun requiredFrameLength(): Int = frameLength

  companion object {
    private const val TAG = "KaamSetuDFN"
  }
}