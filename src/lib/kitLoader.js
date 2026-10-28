// Loads a saved kit (padset) from the server into the engine.

import { fetchFileBytes, authHeaders, fileUrlFor } from './api.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';

// Site origin for the nonce endpoint (mirrors api.js).
const BASE_ORIGIN = BASE.startsWith('http')
  ? BASE.replace(/\/wp-json\/orchlab-sampler\/v1$/, '')
  : '';

async function apiError(res) {
  let body = {};
  try {
    body = await res.json();
  } catch {
    // body stays {} if the response isn't JSON
  }
  const message = body.message || body.error || `Request failed with status ${res.status}`;
  const err = new Error(message);
  err.status = res.status;
  if (body.code !== undefined) err.code = body.code;
  if (body.retryAfter !== undefined) err.retryAfter = body.retryAfter;
  return err;
}

// Fetch a single item by id.
export async function getItem(id) {
  const res = await fetch(`${BASE}/items/${id}`, {
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// List the user's saved padsets, oldest first.
export async function listPadsets() {
  const params = new URLSearchParams({
    instrument: 'sampler',
    type: 'padset',
    page: '1',
    perPage: '50',
  });
  const res = await fetch(`${BASE}/items?${params}`, {
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// List one page of padsets, sliced from the full kit list. Returns
// { items, hasMore } with items capped at perPage.
export async function listPadsetPage({ page = 1, perPage = 4 } = {}) {
  const all = await listAllPadsets();
  const start = (page - 1) * perPage;
  const end = start + perPage;
  return {
    items: all.slice(start, end),
    hasMore: all.length > end,
  };
}

// Fetch every padsets by walking pages of 50. Used for checks that need to see
// all kits (e.g. shared-sound checks), not just the first 50.
export async function listAllPadsets() {
  const all = [];
  const perPage = 50;
  let page = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const params = new URLSearchParams({
      instrument: 'sampler',
      type: 'padset',
      page: String(page),
      perPage: String(perPage),
    });
    const res = await fetch(`${BASE}/items?${params}`, {
      credentials: 'include',
      headers: await authHeaders(),
    });
    if (!res.ok) throw await apiError(res);
    const items = await res.json();
    all.push(...items);
    if (items.length < perPage) break;
    page++;
  }
  // Newest first (listPadsetPage slices pages from this list)
  all.sort((a, b) => b.id - a.id);
  return all;
}

/**
 * Load a saved kit into the engine.
 *
 * @param {{ engine: object, padsetId: number, tileCount: number }} opts
 * @returns {Promise<{ loaded: number, skipped: number, errors: string[] }>}
 */
export async function loadKit({ engine, padsetId, tileCount }) {
  const result = { loaded: 0, skipped: 0, errors: [] };

  const padset = await getItem(padsetId);
  if (padset.type !== 'padset') {
    throw new Error(`Item ${padsetId} is not a kit (type: ${padset.type})`);
  }

  const soundIds = Array.isArray(padset.data && padset.data.soundIds)
    ? padset.data.soundIds
    : [];

  // BUG A: cover every pad. If the kit has more pads than the session, grow the
  // session's tile count to match; otherwise loop over the session's pads.
  const sessionCount = engine.getTileCount ? engine.getTileCount() : tileCount;
  const loopCount = Math.max(sessionCount, soundIds.length);
  if (loopCount > sessionCount && engine.setTileCount) {
    engine.setTileCount(loopCount);
  }

  for (let index = 0; index < loopCount; index++) {
    const soundId = index < soundIds.length ? soundIds[index] : null;

    // Null pad (or a session pad beyond the kit's length): empty it, even if it
    // was never recorded, so no stale sound survives.
    if (soundId === null || soundId === undefined) {
      engine.clearTile(index);
      continue;
    }

    try {
      const sound = await getItem(soundId);
      if (sound.type !== 'sound') {
        result.skipped++;
        continue;
      }

      const data = sound.data || {};
      const audioFileId = data.audioFileId;
      const file = (sound.files || []).find((f) => f.id === audioFileId);
      if (!file || !file.url) {
        result.errors.push(`Pad ${index + 1}: no audio file`);
        continue;
      }

      const bytes = await fetchFileBytes(fileUrlFor(audioFileId, file.url));
      const ok = await engine.loadTileFromArrayBuffer(bytes, index);
      if (!ok) {
        result.errors.push(`Pad ${index + 1}: could not decode audio`);
        continue;
      }

      // Apply stored edit settings (defaults if missing). Right after loading,
      // getTileDuration returns the full buffer length, a safe trimEnd default.
      const fullDuration = engine.getTileDuration ? engine.getTileDuration(index) : 0;
      engine.setTrim(
        index,
        typeof data.trimStart === 'number' ? data.trimStart : 0,
        typeof data.trimEnd === 'number' ? data.trimEnd : fullDuration
      );
      engine.setSpeed(index, typeof data.speed === 'number' ? data.speed : 1);
      engine.setReverse(index, !!data.reverse);
      engine.setReverb(index, typeof data.reverb === 'number' ? data.reverb : 0);
      engine.setDelay(index, typeof data.delay === 'number' ? data.delay : 0);
      engine.setVolume(index, typeof data.volume === 'number' ? data.volume : 1);

      // BUG B: remember this pad's server item so saving can PATCH it.
      if (engine.markTileFromServer) {
        engine.markTileFromServer(index, { soundId, fileId: audioFileId });
      }

      result.loaded++;
    } catch (err) {
      result.errors.push(`Pad ${index + 1}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  return result;
}
