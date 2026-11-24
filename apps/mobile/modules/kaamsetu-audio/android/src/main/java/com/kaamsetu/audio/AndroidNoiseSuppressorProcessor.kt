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
      val ns = NoiseSuppressor.create(audioSessionId) ?: return false
      ns.enabled = true
      suppressor = ns
      true
    } catch (t: Throwable) {
      Log.w(TAG, "NoiseSuppressor create failed: ${t.message}")
      false
    }
  }

  override fun processFrame(buffer: ByteBuffer): Boolean {
    // Platform NS operates on the AudioRecord session; frames always pass through.
    // Return true whenever we still hold a suppressor so mid-session capture continues.
    return suppressor != null
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
