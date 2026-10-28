// Saves the current kit to the server: each ready pad becomes a 'sound' item,
// and one 'padset' item references them.

import { uploadFile, createItem, updateItem, deleteSound, fetchFileBytes, authHeaders, fileUrlFor } from './api.js';
import { getItem, listAllPadsets } from './kitLoader.js';
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
 * Save the kit. When padsetId is provided, overwrite that padset instead of
 * creating one: untouched server-loaded pads are updated in place (same sound
 * id, no re-upload), changed pads get new sounds, and replaced sounds are
 * cleaned up once the padset update succeeds.
 *
 * @param {{ engine: object, tileCount: number, tileStatuses: string[], onPadStatus: Function, title?: string, padsetId?: number }} opts
 *   engine: SamplerEngine instance
 *   padsetId: when provided, overwrite this padset instead of creating one
 *   onPadStatus(index, 'saving' | 'saved' | 'error', message?)
 * @returns {Promise<{ soundIds: (number|null)[], padsFailed: number[], padsetId?: number, padsetError?: string, deletedOldSounds: number[], skippedShared: number }>}
 */
export async function saveKit({ engine, tileCount, tileStatuses, onPadStatus, title, padsetId }) {
  const soundIds = new Array(tileCount).fill(null);
  const padsFailed = [];
  const result = {
    soundIds,
    padsFailed,
    deletedOldSounds: [],
    skippedShared: 0,
  };

  // ── Overwrite setup: existing title + previous sound ids ────────────────
  let existingTitle = null;
  let previousSoundIds = [];

  if (padsetId) {
    try {
      const current = await getItem(padsetId);
      existingTitle = current.title || null;
      previousSoundIds = Array.isArray(current.data && current.data.soundIds)
        ? current.data.soundIds.filter((id) => id !== null && id !== undefined)
        : [];
    } catch (fetchErr) {
      if (fetchErr && fetchErr.status === 404) {
        throw new Error('Kit no longer exists on the server');
      }
      throw fetchErr;
    }
  }

  // Sound ids referenced by kits OTHER than the one being overwritten. Used to
  // decide whether a server-loaded pad can be updated in place, and which old
  // sounds are safe to delete after an overwrite.
  const sharedSoundIds = new Set();
  let sharedUnknown = false;
  try {
    const otherKits = await listAllPadsets();
    for (const other of otherKits) {
      if (padsetId && other.id === padsetId) continue;
      const ids = Array.isArray(other.data && other.data.soundIds) ? other.data.soundIds : [];
      for (const id of ids) {
        if (id !== null && id !== undefined) sharedSoundIds.add(id);
      }
    }
  } catch (listErr) {
    // If we can't see the other kits we must not risk altering their sounds:
    // server-loaded pads get re-uploaded, and old sounds are kept.
    sharedUnknown = true;
  }

  // Audio file id per saved sound, for markTileFromServer afterwards.
  const savedFileIds = new Array(tileCount).fill(null);

  // 1. Save each ready pad's sound
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

      const serverRef = engine.getServerRef ? engine.getServerRef(index) : { soundId: null, fileId: null };
      const canUpdateInPlace =
        serverRef.soundId &&
        serverRef.fileId &&
        !sharedUnknown &&
        !sharedSoundIds.has(serverRef.soundId);

      if (canUpdateInPlace) {
        // Untouched server-loaded pad: keep the same sound id and PATCH it in
        // place (no upload). The server replaces data, so send it complete.
        const item = await withRateLimitRetry(() =>
          updateItem(serverRef.soundId, {
            title: `Pad ${index + 1}`.slice(0, 100),
            schemaVersion: 1,
            data: { ...settings, audioFileId: serverRef.fileId },
            fileIds: [serverRef.fileId],
          })
        );
        soundIds[index] = item.id;
        savedFileIds[index] = serverRef.fileId;
        onPadStatus(index, 'saved');
        continue;
      }

      // Server-loaded pad that is shared with another kit (or sharing unknown):
      // re-upload the same audio as a fresh file so no other kit is altered.
      let blob;
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

      const body = {
        instrument: 'sampler',
        type: 'sound',
        title: `Pad ${index + 1}`.slice(0, 100), // Sound item title
        schemaVersion: 1,
        data: { ...settings, audioFileId: uploaded.id },
        fileIds: [uploaded.id],
      };

      const item = await withRateLimitRetry(() => createItem(body));
      soundIds[index] = item.id;
      savedFileIds[index] = uploaded.id;
      onPadStatus(index, 'saved');
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      padsFailed.push(index);
      onPadStatus(index, 'error', message);
    }
  }

  const savedAny = soundIds.some((id) => id !== null);

  if (!savedAny) {
    return result;
  }

  // 2. Build the padset referencing the saved sounds
  const orientation =
    typeof window === 'undefined'
      ? 'portrait'
      : window.innerHeight > window.innerWidth
        ? 'portrait'
        : 'landscape';

  // Title: caller-provided; else the existing kit's title (overwrite); else
  // Kit <date> (only for brand-new kits).
  const kitTitle =
    typeof title === 'string' && title.trim() !== ''
      ? title.trim().slice(0, 100)
      : padsetId && existingTitle
        ? String(existingTitle).slice(0, 100)
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

  if (padsetId) {
    // ── Overwrite an existing padset ───────────────────────────────────────
    // Update the padset with the full body (data and fileIds replaced
    // entirely). If this fails, throw and leave the old sounds in place.
    try {
      const updated = await withRateLimitRetry(() => updateItem(padsetId, padsetBody));
      result.padsetId = updated.id;
    } catch (updateErr) {
      if (updateErr && updateErr.status === 404) {
        throw new Error('Kit no longer exists on the server');
      }
      throw updateErr;
    }

    // Only after the update succeeds, delete the previous sounds that were
    // replaced (not in the new sound ids) and that no other kit references.
    if (sharedUnknown) {
      result.padsetError = 'Could not list remaining kits; old sounds were kept.';
    } else {
      const newSoundIdSet = new Set(soundIds.filter((id) => id !== null && id !== undefined));
      for (const soundId of previousSoundIds) {
        // Still used by this kit (an in-place updated pad): keep it.
        if (newSoundIdSet.has(soundId)) continue;
        if (sharedSoundIds.has(soundId)) {
          result.skippedShared++;
          continue;
        }
        try {
          await deleteSound(soundId);
          result.deletedOldSounds.push(soundId);
        } catch (deleteErr) {
          // Keep going if one sound fails
          result.padsetError = result.padsetError
            ? result.padsetError + '; '
            : '';
          result.padsetError += `Could not delete old sound ${soundId}: ${deleteErr && deleteErr.message ? deleteErr.message : String(deleteErr)}`;
        }
      }
    }
  } else {
    // ── Create a new padset ────────────────────────────────────────────────
    try {
      const padset = await withRateLimitRetry(() => createItem(padsetBody));
      result.padsetId = padset.id;
    } catch (err) {
      result.padsetError = err && err.message ? err.message : String(err);
    }
  }

  // 3. After a successful save, remember which pads are now on the server so
  // the next Save can update them in place instead of re-uploading.
  if (result.padsetId) {
    for (let index = 0; index < tileCount; index++) {
      if (soundIds[index] !== null && savedFileIds[index] !== null && engine.markTileFromServer) {
        engine.markTileFromServer(index, {
          soundId: soundIds[index],
          fileId: savedFileIds[index],
        });
      }
    }
  }

  return result;
}

/**
 * Delete a saved kit (padset) and its sounds, unless a sound is shared with
 * another remaining padset.
 *
 * @param {{ padset: object }} opts - padset from listPadsets() with id and
 *   data.soundIds.
 * @returns {Promise<{ deletedSounds: number[], skippedShared: number, errors: string[] }>}
 */
export async function deleteKit({ padset }) {
  const result = { deletedSounds: [], skippedShared: 0, errors: [] };

  if (!padset || !padset.id) {
    throw new Error('deleteKit: padset is required');
  }

  // 1. Delete the padset first. If this fails, stop and delete nothing else.
  await deleteSound(padset.id);

  const soundIds = Array.isArray(padset.data && padset.data.soundIds)
    ? padset.data.soundIds.filter((id) => id !== null && id !== undefined)
    : [];
  if (soundIds.length === 0) {
    return result;
  }

  // 2. After the padset is gone, find sounds still used by other padsets.
  const stillUsed = new Set();
  try {
    const remainingPadsets = await listAllPadsets();
    for (const other of remainingPadsets) {
      const ids = Array.isArray(other.data && other.data.soundIds) ? other.data.soundIds : [];
      for (const id of ids) {
        if (id !== null && id !== undefined) stillUsed.add(id);
      }
    }
  } catch (err) {
    // Can't tell what's still used — be conservative and keep all the sounds.
    result.errors.push(`deleteKit: could not list remaining kits: ${err && err.message ? err.message : String(err)}`);
    return result;
  }

  // 3. Delete each sound that no other padset references.
  for (const soundId of soundIds) {
    if (stillUsed.has(soundId)) {
      result.skippedShared++;
      continue;
    }
    try {
      await deleteSound(soundId);
      result.deletedSounds.push(soundId);
    } catch (err) {
      result.errors.push(`deleteKit: could not delete sound ${soundId}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  return result;
}

/**
 * Rename a saved kit (padset). Only the title is sent, so the kit's sounds are
 * left untouched.
 *
 * @param {{ padset: object, title: string }} opts - padset from listPadsets().
 * @returns {Promise<object>} the updated item from the server.
 */
export async function renameKit({ padset, title }) {
  if (!padset || !padset.id) {
    throw new Error('renameKit: padset is required');
  }

  const trimmed = String(title == null ? '' : title).trim();
  if (trimmed === '') {
    throw new Error('Kit name cannot be empty');
  }

  const cappedTitle = trimmed.slice(0, 100);
  return updateItem(padset.id, { title: cappedTitle });
}