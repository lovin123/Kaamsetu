package com.kaamsetu.audio

import java.nio.ByteBuffer

class PassthroughProcessor : AudioProcessingService {
  override val mode = DenoiseMode.OFF
  override fun initialize(audioSessionId: Int): Boolean = true
  override fun processFrame(buffer: ByteBuffer): Boolean = true
  override fun release() {}
}