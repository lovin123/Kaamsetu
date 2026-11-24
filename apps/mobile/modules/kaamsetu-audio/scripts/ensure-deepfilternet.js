/**
 * Ensures the Kaleyra DeepFilterNet AAR is present for Android builds.
 * Downloads from Maven Central if missing so every build ships the JNI + model.
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const VERSION = '0.0.8';
const ARTIFACT = `android-deepfilternet-${VERSION}.aar`;
const URL =
  `https://repo1.maven.org/maven2/io/github/kaleyravideo/android-deepfilternet/${VERSION}/${ARTIFACT}`;
const libsDir = path.join(__dirname, '..', 'android', 'libs');
const dest = path.join(libsDir, ARTIFACT);
const MIN_BYTES = 1_000_000; // real AAR is ~27MB; reject empty/corrupt stubs

function download(url, filePath) {
  return new Promise((resolve, reject) => {
    const tmp = `${filePath}.download`;
    const out = fs.createWriteStream(tmp);
    const req = https.get(url, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        out.close();
        fs.unlinkSync(tmp);
        download(res.headers.location, filePath).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        out.close();
        fs.unlinkSync(tmp);
        reject(new Error(`HTTP ${res.statusCode} fetching ${url}`));
        return;
      }
      res.pipe(out);
      out.on('finish', () => {
        out.close(() => {
          fs.renameSync(tmp, filePath);
          resolve();
        });
      });
    });
    req.on('error', (err) => {
      try {
        out.close();
        fs.unlinkSync(tmp);
      } catch (_) {
        /* ignore */
      }
      reject(err);
    });
  });
}

async function main() {
  fs.mkdirSync(libsDir, { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size >= MIN_BYTES) {
    console.log(`[kaamsetu-audio] DeepFilterNet AAR OK (${fs.statSync(dest).size} bytes)`);
    return;
  }
  console.log(`[kaamsetu-audio] Downloading DeepFilterNet ${VERSION}…`);
  await download(URL, dest);
  const size = fs.statSync(dest).size;
  if (size < MIN_BYTES) {
    fs.unlinkSync(dest);
    throw new Error(`Downloaded AAR too small (${size} bytes) — aborting`);
  }
  console.log(`[kaamsetu-audio] Saved ${dest} (${size} bytes)`);
}

main().catch((err) => {
  console.error('[kaamsetu-audio] ensure-deepfilternet failed:', err.message);
  process.exit(1);
});
