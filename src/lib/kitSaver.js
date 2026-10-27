// Saves the current kit to the server: each ready pad becomes a 'sound' item,
// and one 'padset' item references them.

import { uploadFile, createItem, fetchFileBytes, authHeaders, fileUrlFor } from './api.js';
import { SQUARE_COLORS } from './tileConfig.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimited(err) {
  return err && err.status === 429 && typeof err.retryAfter === 'number' && err.retryAfter > 0;
}

// Retry a request once on 429 (rate limited), after waiting retryAfter seconds.
// Only 429 is safe to retry: a POST to /items that may have succeeded must
// never be retried blindly.
async function withRateLimitRetry(fn) {
  try {
    return await fn();
  } catch (err) {
    if (isRateLimited(err)) {
      await sleep(err.retryAfter * 1000);
      return fn();
    }
    throw err;
  }
}

// Fetch a single item by id (same pattern as getItem in kitLoader.js).
async function getSoundItem(id) {
  const res = await fetch(`${BASE}/items/${id}`, {
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) {
    const err = new Error(`GET /items/${id} failed: ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

/**
 * Save the kit.
 *
 * @param {{ engine: object, tileCount: number, tileStatuses: string[], onPadStatus: Function, title?: string }} opts
 *   engine: SamplerEngine instance
 *   onPadStatus(index, 'saving' | 'saved' | 'error', message?)
 * @returns {Promise<{ soundIds: (number|null)[], padsFailed: number[], padsetId?: number, padsetError?: string }>}
 */
export async function saveKit({ engine, tileCount, tileStatuses, onPadStatus, title }) {
  const soundIds = new Array(tileCount).fill(null);
  const padsFailed = [];

  // 1. Upload each ready pad's MP3 and create its sound item
  for (let index = 0; index < tileCount; index++) {
    const status = tileStatuses[index] || 'empty';
    if (status !== 'ready') continue;

    try {
      onPadStatus(index, 'saving');

      // Get the audio blob for this pad. A pad loaded from the server (and not
      // re-recorded) has its audio stored on the server: download those bytes
      // so we can re-upload them as a fresh file. Any other pad uses the
      // in-memory MP3.
      let blob;
      const serverRef = engine.getServerRef ? engine.getServerRef(index) : { soundId: null, fileId: null };
      if (serverRef.soundId && serverRef.fileId) {
        const sound = await getSoundItem(serverRef.soundId);
        const srcFile = (sound.files || []).find((f) => f.id === serverRef.fileId);
        if (!srcFile || !srcFile.url) {
          throw new Error(`Pad ${index + 1}: no audio file on server`);
        }
        const bytes = await fetchFileBytes(fileUrlFor(serverRef.fileId, srcFile.url));
        blob = new Blob([bytes], { type: 'audio/mpeg' });
      } else {
        blob = await engine.getTileMp3(index);
      }

      // Upload the audio (audio/mpeg; uploadFile sets the multipart content type).
      // Always upload as a fresh file — never reuse an existing fileIds.
      const uploaded = await withRateLimitRetry(() => uploadFile(blob, 'sound.mp3'));

      const [trimStart, trimEnd] = engine.getTrim(index);

      const body = {
        instrument: 'sampler',
        type: 'sound',
        title: `Pad ${index + 1}`.slice(0, 100), // Sound item title
        schemaVersion: 1,
        data: {
          padIndex: index,
          audioFileId: uploaded.id,
          trimStart,
          trimEnd,
          speed: engine.getSpeed(index),
          reverse: engine.getReverse(index),
          reverb: engine.getReverb(index),
          delay: engine.getDelay(index),
        },
        fileIds: [uploaded.id],
      };

      const item = await withRateLimitRetry(() => createItem(body));
      soundIds[index] = item.id;
      onPadStatus(index, 'saved');
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      padsFailed.push(index);
      onPadStatus(index, 'error', message);
    }
  }

  const savedAny = soundIds.some((id) => id !== null);

  const result = {
    soundIds,
    padsFailed,
  };

  if (!savedAny) {
    return result;
  }

  // 2. Create one padset item referencing the saved sounds
  const orientation =
    typeof window === 'undefined'
      ? 'portrait'
      : window.innerHeight > window.innerWidth
        ? 'portrait'
        : 'landscape';

  // Use the caller-provided kit name when present, otherwise Kit <date>.
  const kitTitle =
    typeof title === 'string' && title.trim() !== ''
      ? title.trim().slice(0, 100)
      : `Kit ${new Date().toLocaleString()}`.slice(0, 100);

  const padsetBody = {
    instrument: 'sampler',
    type: 'padset',
    title: kitTitle,
    schemaVersion: 1,
    data: {
      soundIds,
      imageFileIds: new Array(tileCount).fill(null),
      backgroundColors: SQUARE_COLORS.slice(0, tileCount),
      gridOrientation: orientation,
    },
    fileIds: [],
  };

  try {
    const padset = await withRateLimitRetry(() => createItem(padsetBody));
    result.padsetId = padset.id;
  } catch (err) {
    result.padsetError = err && err.message ? err.message : String(err);
  }

  return result;
}