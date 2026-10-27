// Saves the current kit to the server: each ready pad becomes a 'sound' item,
// and one 'padset' item references them.

import { uploadFile, createItem, updateItem } from './api.js';
import { SQUARE_COLORS } from './tileConfig.js';

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

/**
 * Save the kit.
 *
 * @param {{ engine: object, tileCount: number, tileStatuses: string[], onPadStatus: Function }} opts
 *   engine: SamplerEngine instance
 *   onPadStatus(index, 'saving' | 'saved' | 'error', message?)
 * @returns {Promise<{ soundIds: (number|null)[], padsFailed: number[], padsetId?: number, padsetError?: string }>}
 */
export async function saveKit({ engine, tileCount, tileStatuses, onPadStatus }) {
  const soundIds = new Array(tileCount).fill(null);
  const padsFailed = [];

  // 1. Upload each ready pad's MP3 and create its sound item
  for (let index = 0; index < tileCount; index++) {
    const status = tileStatuses[index] || 'empty';
    if (status !== 'ready') continue;

    try {
      onPadStatus(index, 'saving');

      const [trimStart, trimEnd] = engine.getTrim(index);
      const settings = {
        padIndex: index,
        trimStart,
        trimEnd,
        speed: engine.getSpeed(index),
        reverse: engine.getReverse(index),
        reverb: engine.getReverb(index),
        delay: engine.getDelay(index),
      };

      // BUG B: a pad loaded from the server already exists there. PATCH it
      // instead of re-uploading, so no MP3 is needed in memory.
      const serverRef = engine.getServerRef ? engine.getServerRef(index) : { soundId: null, fileId: null };
      if (serverRef.soundId && serverRef.fileId) {
        const item = await withRateLimitRetry(() =>
          updateItem(serverRef.soundId, {
            title: `Pad ${index + 1}`.slice(0, 100),
            schemaVersion: 1,
            data: { ...settings, audioFileId: serverRef.fileId },
            fileIds: [serverRef.fileId],
          })
        );
        soundIds[index] = item.id;
        onPadStatus(index, 'saved');
        continue;
      }

      // Otherwise: upload the audio and create a new sound item.
      const mp3 = await engine.getTileMp3(index);

      // Upload the audio (audio/mpeg; uploadFile sets the multipart content type)
      const file = await withRateLimitRetry(() => uploadFile(mp3, 'sound.mp3'));

      const body = {
        instrument: 'sampler',
        type: 'sound',
        title: `Pad ${index + 1}`.slice(0, 100), // Sound item title
        schemaVersion: 1,
        data: {
          ...settings,
          audioFileId: file.id,
        },
        fileIds: [file.id],
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

  const padsetBody = {
    instrument: 'sampler',
    type: 'padset',
    title: `Kit ${new Date().toLocaleString()}`.slice(0, 100),
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