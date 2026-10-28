// MP3 encoder wrapper — turns recorded audio into an MP3 Blob.
//
// Encoding runs in a Web Worker (mp3Encoder.worker.js) so the main thread
// stays responsive. The worker is created per call and terminated when the
// call finishes (result or error), so workers are never leaked.

// Convert Float32 samples (range -1..1) to Int16 PCM.
function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

/**
 * Encode PCM samples to an MP3 Blob.
 *
 * @param {Int16Array|Float32Array} samples - mono samples, or interleaved
 *   L/R samples when channels === 2. Float32 is converted (clamped to -1..1).
 * @param {{ sampleRate: number, channels?: number, bitrate?: number }} options
 * @returns {Promise<Blob>} MP3 blob (type 'audio/mpeg')
 */
export async function encodeToMp3(samples, { sampleRate, channels = 1, bitrate = 128 } = {}) {
  if (!sampleRate || sampleRate <= 0) {
    throw new Error('encodeToMp3: sampleRate is required');
  }

  let pcm = samples;
  if (samples instanceof Float32Array) {
    pcm = floatToInt16(samples);
  }
  if (!(pcm instanceof Int16Array)) {
    throw new Error('encodeToMp3: samples must be an Int16Array or Float32Array');
  }

  const worker = new Worker(new URL('./mp3Encoder.worker.js', import.meta.url), { type: 'module' });

  try {
    const chunks = await new Promise((resolve, reject) => {
      worker.onmessage = (event) => {
        const data = event.data;
        if (data && data.ok) {
          resolve(data.chunks);
        } else {
          reject(new Error(data && data.error ? data.error : 'encodeToMp3: worker reported an error'));
        }
      };
      worker.onerror = (event) => {
        reject(new Error('encodeToMp3: worker error: ' + (event.message || 'unknown')));
      };
      worker.postMessage({ samples: pcm, sampleRate, channels, bitrate });
    });

    return new Blob(chunks, { type: 'audio/mpeg' });
  } finally {
    worker.terminate();
  }
}