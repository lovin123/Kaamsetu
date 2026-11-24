package com.kaamsetu.audio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KaamSetuAudioModule : Module() {
  private var recorder: VoiceRecorder? = null

  override fun definition() = ModuleDefinition {
    Name("KaamSetuAudio")

    Function("isAvailable") {
      true
    }

    Function("getActiveMode") {
      recorder?.activeMode?.wire() ?: "off"
    }

    AsyncFunction("startRecording") { mode: String ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("No React context")
      if (recorder == null) recorder = VoiceRecorder(ctx)
      val active = recorder!!.start(DenoiseMode.from(mode))
      mapOf(
        "mode" to active.wire(),
        "sampleRate" to 48000,
      )
    }

    AsyncFunction("stopRecording") {
      val result = recorder?.stop()
        ?: throw IllegalStateException("Not recording")
      mapOf(
        "uri" to result.uri,
        "durationMs" to result.durationMs,
        "modeUsed" to result.modeUsed.wire(),
        "fellBack" to result.fellBack,
      )
    }

    OnDestroy {
      try {
        recorder?.stop()
      } catch (_: Throwable) {
      }
      recorder = null
    }
  }
}