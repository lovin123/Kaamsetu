package com.kaamsetu.audio

import java.nio.ByteBuffer

enum class DenoiseMode {
  DEEPFILTERNET,
  ANDROID_NS,
  OFF;

  companion object {
    fun from(value: String?): DenoiseMode = when (value?.lowercase()) {
      "deepfilternet" -> DEEPFILTERNET
      "android_ns" -> ANDROID_NS
      else -> OFF
    }
  }

  fun wire(): String = when (this) {
    DEEPFILTERNET -> "deepfilternet"
    ANDROID_NS -> "android_ns"
    OFF -> "off"
  }
}

interface AudioProcessingService {
  val mode: DenoiseMode
  fun initialize(audioSessionId: Int): Boolean
  fun processFrame(buffer: ByteBuffer): Boolean
  fun release()
}