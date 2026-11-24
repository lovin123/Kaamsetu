package com.kaamsetu.audio

import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class KaamSetuAudioModule : Module() {
  private var recorder: VoiceRecorder? = null

  override fun definition() = ModuleDefinition {
    Name("KaamSetuAudio")

    Function("isAvailable") {
      DeepFilterNetProcessor.isOnClasspath()
    }

    Function("getActiveMode") {
      recorder?.activeMode?.wire() ?: "off"
    }

    AsyncFunction("startRecording") { mode: String ->
      val ctx = appContext.reactContext
        ?: throw IllegalStateException("No React context")

      val requested = DenoiseMode.from(mode)
      if (requested == DenoiseMode.DEEPFILTERNET && !DeepFilterNetProcessor.isOnClasspath()) {
        throw IllegalStateException(
          "DeepFilterNet AAR missing from APK. Rebuild with: npm run ensure:deepfilternet && npx expo run:android",
        )
      }

      if (recorder == null) recorder = VoiceRecorder(ctx)
      val active = recorder!!.start(requested)

      if (requested == DenoiseMode.DEEPFILTERNET && active != DenoiseMode.DEEPFILTERNET) {
        throw IllegalStateException(
          "DeepFilterNet did not become active (got ${active.wire()}). Check libdf.so packaging.",
        )
      }

      mapOf(
        "mode" to active.wire(),
        "sampleRate" to 48000,
        "deepFilterNetOnClasspath" to DeepFilterNetProcessor.isOnClasspath(),
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
