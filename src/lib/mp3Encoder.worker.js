// MP3 encoder Web Worker — runs the lamejs encode off the main thread.
//
// Receives: { samples: Int16Array, sampleRate, channels, bitrate }
// Posts back: { ok: true, chunks: Uint8Array[] } (or a single ArrayBuffer)
// On failure: { ok: false, error: string }

import * as lame from '@breezystack/lamejs';

const BLOCK = 1152;

self.onmessage = (event) => {
  const { samples, sampleRate, channels = 1, bitrate = 128 } = event.data;

  try {
    if (!(samples instanceof Int16Array)) {
      throw new Error('worker: samples must be an Int16Array');
    }
    if (!sampleRate || sampleRate <= 0) {
      throw new Error('worker: sampleRate is required');
    }

    const encoder = new lame.Mp3Encoder(channels, sampleRate, bitrate);
    const chunks = [];

    if (channels === 1) {
      for (let i = 0; i < samples.length; i += BLOCK) {
        const block = samples.subarray(i, Math.min(i + BLOCK, samples.length));
        const out = encoder.encodeBuffer(block);
        if (out.length > 0) chunks.push(out);
      }
    } else {
      // Interleaved stereo: deinterleave into left/right blocks of BLOCK frames
      const frames = Math.floor(samples.length / 2);
      const left = new Int16Array(BLOCK);
      const right = new Int16Array(BLOCK);
      for (let i = 0; i < frames; i += BLOCK) {
        const n = Math.min(BLOCK, frames - i);
        for (let j = 0; j < n; j++) {
          left[j] = samples[(i + j) * 2];
          right[j] = samples[(i + j) * 2 + 1];
        }
        const out = encoder.encodeBuffer(left.subarray(0, n), right.subarray(0, n));
        if (out.length > 0) chunks.push(out);
      }
    }

    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);

    self.postMessage({ ok: true, chunks });
  } catch (error) {
    self.postMessage({ ok: false, error: error.message || String(error) });
  }
};