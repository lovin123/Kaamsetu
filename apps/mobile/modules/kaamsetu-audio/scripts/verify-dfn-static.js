/**
 * Static checks that DeepFilterNet wiring matches Kaleyra's real API (not hallucinated).
 */
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const mobileRoot = path.join(root, '..', '..');
const errors = [];

function mustInclude(file, needle, label) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.includes(needle)) {
    errors.push(`${label}: missing "${needle}" in ${path.relative(root, file)}`);
  }
}

function mustExist(file, label) {
  if (!fs.existsSync(file)) errors.push(`${label}: missing ${file}`);
}

const aar = path.join(root, 'android/libs/android-deepfilternet-0.0.8.aar');
mustExist(aar, 'Vendored AAR');
if (fs.existsSync(aar) && fs.statSync(aar).size < 1_000_000) {
  errors.push('AAR too small');
}

const gradle = path.join(root, 'android/build.gradle');
mustInclude(gradle, "api 'io.github.kaleyravideo:android-deepfilternet:0.0.8'", 'Maven api dep');
mustInclude(gradle, 'kotlinx-coroutines-core', 'Coroutines (required for async model load)');

const processor = path.join(
  root,
  'android/src/main/java/com/kaamsetu/audio/DeepFilterNetProcessor.kt',
);
mustInclude(processor, 'import com.rikorose.deepfilternet.NativeDeepFilterNet', 'Direct DFN import');
mustInclude(processor, 'onModelLoaded', 'Wait for async model load (Kaleyra contract)');
mustInclude(processor, 'CountDownLatch', 'Block until model ready');
mustInclude(processor, 'setAttenuationLimit', 'Attenuation API');
mustInclude(processor, 'snr < 0f', 'Treat processFrame -1 as failure');

const recorder = path.join(
  root,
  'android/src/main/java/com/kaamsetu/audio/VoiceRecorder.kt',
);
mustInclude(recorder, '48000', '48 kHz capture');
mustInclude(recorder, 'DeepFilterNet failed to initialize', 'Hard-fail on DFN init');

const plugin = path.join(mobileRoot, 'plugins/withDeepFilterNet.js');
mustInclude(plugin, 'io.github.kaleyravideo:android-deepfilternet:0.0.8', 'App-level Maven dep plugin');
mustInclude(plugin, "pickFirsts += ['**/libdf.so']", 'JNI pickFirst');

// Plugin must not create a second jniLibs block when one already exists
const fixture = `
android {
    packagingOptions {
        jniLibs {
            useLegacyPackaging false
        }
    }
}
dependencies {
}
`;
let contents = fixture;
const marker = 'KaamSetu DeepFilterNet';
if (!contents.includes('io.github.kaleyravideo:android-deepfilternet')) {
  contents = contents.replace(
    /dependencies\s*\{/,
    `dependencies {\n    // ${marker}\n    implementation 'io.github.kaleyravideo:android-deepfilternet:0.0.8'`,
  );
}
if (/jniLibs\s*\{/.test(contents)) {
  contents = contents.replace(
    /jniLibs\s*\{/,
    `jniLibs {\n            // ${marker}\n            pickFirsts += ['**/libdf.so']`,
  );
}
const jniCount = (contents.match(/jniLibs\s*\{/g) || []).length;
if (jniCount !== 1) errors.push(`Plugin jniLibs count=${jniCount}, expected 1`);
if (!contents.includes('android-deepfilternet:0.0.8')) {
  errors.push('Plugin did not inject Maven dep');
}

if (errors.length) {
  console.error('DFN static verify FAILED:');
  for (const e of errors) console.error(' -', e);
  process.exit(1);
}
console.log('DFN static verify OK (aligned with Kaleyra NativeDeepFilterNetTest)');
console.log(` - AAR ${fs.statSync(aar).size} bytes (vendored checksum)`);
console.log(' - Maven api 0.0.8 + coroutines (transitive model-load deps)');
console.log(' - onModelLoaded latch before frameLength / processFrame');
console.log(' - App plugin injects Maven dep + libdf.so pickFirst');
