// TEMP: remove after spike
// Dev-only test hook: encodes a sine-wave test signal and logs timing/size/URL.
// Imported from main.js behind an import.meta.env.DEV check, so it never runs
// in production builds. The encoder itself stays lazy-loaded in mp3Encoder.js.
import { encodeToMp3 } from './mp3Encoder.js';

export function registerTestEncode() {
  window.__testEncode = async (seconds = 30) => {
    const sampleRate = 44100;
    const channels = 1;
    const length = Math.floor(sampleRate * seconds);
    const samples = new Float32Array(length);
    for (let i = 0; i < length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }

    const start = performance.now();
    const blob = await encodeToMp3(samples, { sampleRate, channels });
    const elapsedMs = performance.now() - start;

    const url = URL.createObjectURL(blob);
    console.log(
      `__testEncode(${seconds}s): encoded in ${elapsedMs.toFixed(0)}ms, ` +
      `size ${blob.size} bytes`
    );
    console.log(`Blob URL (open in a new tab to play): ${url}`);

    return { elapsedMs, size: blob.size, url };
  };
}
// END TEMP