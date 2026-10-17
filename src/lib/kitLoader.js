// Loads a saved kit (padset) from the server into the engine.

import { fetchFileBytes } from './api.js';

const BASE = import.meta.env.VITE_API_BASE || '/api';

// Site origin for the nonce endpoint (mirrors api.js).
const BASE_ORIGIN = BASE.startsWith('http')
  ? BASE.replace(/\/wp-json\/orchlab-sampler\/v1$/, '')
  : '';

let nonce = null;

async function getNonce() {
  if (import.meta.env.DEV) return 'mock-nonce';
  const res = await fetch(`${BASE_ORIGIN}/wp-admin/admin-ajax.php?action=rest-nonce`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`nonce failed: ${res.status}`);
  return res.text();
}

async function authHeaders() {
  if (!nonce) nonce = await getNonce();
  return { 'X-WP-Nonce': nonce };
}

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
async function getItem(id) {
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

  const limit = Math.min(soundIds.length, tileCount);

  for (let index = 0; index < limit; index++) {
    const soundId = soundIds[index];

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

      const bytes = await fetchFileBytes(file.url);
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

      result.loaded++;
    } catch (err) {
      result.errors.push(`Pad ${index + 1}: ${err && err.message ? err.message : String(err)}`);
    }
  }

  // soundIds beyond tileCount are ignored and reported as skipped
  result.skipped += Math.max(0, soundIds.length - limit);

  return result;
}