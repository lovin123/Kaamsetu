package com.kaamsetu.audio

import android.media.audiofx.NoiseSuppressor
import android.util.Log
import java.nio.ByteBuffer

/**
 * Fallback denoise using platform NoiseSuppressor attached to AudioRecord session.
 * Does not post-process PCM frames; NS runs on the capture path.
 */
class AndroidNoiseSuppressorProcessor : AudioProcessingService {
  override val mode = DenoiseMode.ANDROID_NS
  private var suppressor: NoiseSuppressor? = null

  override fun initialize(audioSessionId: Int): Boolean {
    if (!NoiseSuppressor.isAvailable()) {
      Log.w(TAG, "NoiseSuppressor.isAvailable() == false")
      return false
    }
    return try {
      suppressor = NoiseSuppressor.create(audioSessionId)
      suppressor?.enabled = true
      suppressor != null
    } catch (t: Throwable) {
      Log.w(TAG, "NoiseSuppressor create failed: ${t.message}")
      false
    }
  }

  override fun processFrame(buffer: ByteBuffer): Boolean {
    // Platform NS operates on the AudioRecord session; frames pass through.
    return suppressor?.enabled == true
  }

  override fun release() {
    try {
      suppressor?.release()
    } catch (_: Throwable) {
    } finally {
      suppressor = null
    }
  }

  companion object {
    private const val TAG = "KaamSetuNS"
  }
}