// MP3 encoder wrapper — turns recorded audio into an MP3 Blob.
//
// The encoder library (@breezystack/lamejs) is loaded lazily via dynamic
// import() so it is only fetched the first time encoding is called.

let encoderModulePromise = null;

function loadEncoder() {
  if (!encoderModulePromise) {
    encoderModulePromise = import('@breezystack/lamejs');
  }
  return encoderModulePromise;
}

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

  let lame;
  try {
    lame = await loadEncoder();
  } catch (error) {
    throw new Error('encodeToMp3: failed to load MP3 encoder: ' + error.message);
  }

  let encoder;
  try {
    encoder = new lame.Mp3Encoder(channels, sampleRate, bitrate);
  } catch (error) {
    throw new Error('encodeToMp3: failed to create encoder: ' + error.message);
  }

  const BLOCK = 1152;
  const chunks = [];

  try {
    if (channels === 1) {
      for (let i = 0; i < pcm.length; i += BLOCK) {
        const block = pcm.subarray(i, Math.min(i + BLOCK, pcm.length));
        const out = encoder.encodeBuffer(block);
        if (out.length > 0) chunks.push(out);
      }
    } else {
      // Interleaved stereo: deinterleave into left/right blocks of BLOCK frames
      const frames = Math.floor(pcm.length / 2);
      const left = new Int16Array(BLOCK);
      const right = new Int16Array(BLOCK);
      for (let i = 0; i < frames; i += BLOCK) {
        const n = Math.min(BLOCK, frames - i);
        for (let j = 0; j < n; j++) {
          left[j] = pcm[(i + j) * 2];
          right[j] = pcm[(i + j) * 2 + 1];
        }
        const out = encoder.encodeBuffer(left.subarray(0, n), right.subarray(0, n));
        if (out.length > 0) chunks.push(out);
      }
    }

    const tail = encoder.flush();
    if (tail.length > 0) chunks.push(tail);
  } catch (error) {
    throw new Error('encodeToMp3: encoding failed: ' + error.message);
  }

  return new Blob(chunks, { type: 'audio/mpeg' });
}