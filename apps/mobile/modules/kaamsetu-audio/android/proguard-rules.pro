# Keep Kaleyra / DeepFilterNet JNI bindings and model loader
-keep class com.rikorose.deepfilternet.** { *; }
-keep class com.kaleyra.noise_filter.** { *; }
-keepclassmembers class com.rikorose.deepfilternet.NativeDeepFilterNet {
  native <methods>;
  public <methods>;
  public <fields>;
}
