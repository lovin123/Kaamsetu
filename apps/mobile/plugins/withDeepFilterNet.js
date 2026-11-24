/**
 * Expo config plugin:
 * 1) Ensure DeepFilterNet Maven dep is on the app module (JNI + model packaging).
 * 2) pickFirst libdf.so into existing jniLibs block (no duplicate blocks).
 * 3) RECORD_AUDIO / MODIFY_AUDIO_SETTINGS permissions.
 */
const {
  withAppBuildGradle,
  withAndroidManifest,
  createRunOncePlugin,
} = require('@expo/config-plugins');

const DFN_DEP =
  "implementation 'io.github.kaleyravideo:android-deepfilternet:0.0.8'";
const MARKER = 'KaamSetu DeepFilterNet';

function withDeepFilterNetPackaging(config) {
  return withAppBuildGradle(config, (cfg) => {
    if (cfg.modResults.language !== 'groovy') return cfg;
    let contents = cfg.modResults.contents;

    // Inject Maven dep on the app so AGP always packages libdf.so + raw model.
    if (!contents.includes('io.github.kaleyravideo:android-deepfilternet')) {
      if (/dependencies\s*\{/.test(contents)) {
        contents = contents.replace(
          /dependencies\s*\{/,
          `dependencies {\n    // ${MARKER}\n    ${DFN_DEP}`,
        );
      }
    }

    if (!contents.includes(MARKER) || !contents.includes("pickFirsts += ['**/libdf.so']")) {
      if (/jniLibs\s*\{/.test(contents) && !contents.includes("pickFirsts += ['**/libdf.so']")) {
        contents = contents.replace(
          /jniLibs\s*\{/,
          `jniLibs {\n            // ${MARKER}\n            pickFirsts += ['**/libdf.so']`,
        );
      } else if (
        /packagingOptions\s*\{/.test(contents) &&
        !contents.includes("pickFirsts += ['**/libdf.so']")
      ) {
        contents = contents.replace(
          /packagingOptions\s*\{/,
          `packagingOptions {\n        // ${MARKER}\n        jniLibs { pickFirsts += ['**/libdf.so'] }`,
        );
      }
    }

    cfg.modResults.contents = contents;
    return cfg;
  });
}

function withDeepFilterNetPermissions(config) {
  return withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults.manifest;
    if (!manifest['uses-permission']) manifest['uses-permission'] = [];
    const perms = new Set(
      (manifest['uses-permission'] || [])
        .map((p) => p.$?.['android:name'])
        .filter(Boolean),
    );
    for (const name of [
      'android.permission.RECORD_AUDIO',
      'android.permission.MODIFY_AUDIO_SETTINGS',
    ]) {
      if (!perms.has(name)) {
        manifest['uses-permission'].push({ $: { 'android:name': name } });
      }
    }
    return cfg;
  });
}

function withDeepFilterNet(config) {
  config = withDeepFilterNetPackaging(config);
  config = withDeepFilterNetPermissions(config);
  return config;
}

module.exports = createRunOncePlugin(
  withDeepFilterNet,
  'withDeepFilterNet',
  '1.1.0',
);
