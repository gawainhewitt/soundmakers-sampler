const BASE = import.meta.env.VITE_API_BASE || '/api';

// Site origin for the nonce endpoint. In staging BASE is a full URL ending in
// /wp-json/orchlab-sampler/v1 — strip that suffix to get the origin. In dev
// BASE is just /api, so there is no origin.
const BASE_ORIGIN = BASE.startsWith('http')
  ? BASE.replace(/\/wp-json\/orchlab-sampler\/v1$/, '')
  : '';

export async function getMe() {
  const res = await fetch(`${BASE}/me`, { credentials: 'include' });
  if (!res.ok) throw new Error(`GET /me failed: ${res.status}`);
  return res.json();
}

export async function listSounds({ page = 1, perPage = 50 } = {}) {
  const params = new URLSearchParams({
    instrument: 'sampler',
    type: 'sound',
    page: String(page),
    perPage: String(perPage),
  });
  const res = await fetch(`${BASE}/items?${params}`, {
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) throw new Error(`GET /items failed: ${res.status}`);
  return res.json();
}

const IS_MOCK = import.meta.env.DEV;

let nonce = null;

export async function getNonce() {
  if (IS_MOCK) return 'mock-nonce'; // Prism doesn't serve the nonce endpoint
  const res = await fetch(`${BASE_ORIGIN}/wp-admin/admin-ajax.php?action=rest-nonce`, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error(`nonce failed: ${res.status}`);
  return res.text();
}

const DEV_USER = import.meta.env.VITE_API_USER;
const DEV_APP_PASSWORD = import.meta.env.VITE_API_APP_PASSWORD;
const USE_APP_PASSWORD = import.meta.env.DEV && !!DEV_USER && !!DEV_APP_PASSWORD;

export async function authHeaders() {
  if (USE_APP_PASSWORD) {
    const token = btoa(`${DEV_USER}:${DEV_APP_PASSWORD}`);
    return { Authorization: `Basic ${token}` };
  }
  if (!nonce) nonce = await getNonce();
  return { 'X-WP-Nonce': nonce };
}

// Builds an Error from a failed response, carrying status/code/retryAfter.
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

// DEV ONLY: simulate API errors for testing error handling.
// Set localStorage.setItem('mockError', '413' | '429' | '500') to trigger.
// Remove this block before production.
async function maybeMockError() {
  if (!import.meta.env.DEV) return;
  const code = localStorage.getItem('mockError');
  if (code !== '413' && code !== '429' && code !== '500') return;

  const body = { code };
  if (code === '429') body.retryAfter = 5;

  const fakeRes = {
    ok: false,
    status: Number(code),
    json: async () => body,
  };
  throw await apiError(fakeRes);
}
// END DEV ONLY

export async function uploadFile(blob, filename) {
  await maybeMockError();

  const form = new FormData();
  form.append('instrument', 'sampler');
  form.append('file', blob, filename);

  const res = await fetch(`${BASE}/files`, {
    method: 'POST',
    credentials: 'include',
    headers: await authHeaders(),
    body: form,
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function saveSound({ padIndex, title, audioBlob, backgroundColor }) {
  await maybeMockError();

  const audio = await uploadFile(audioBlob, 'sound.mp3');

  const res = await fetch(`${BASE}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify({
      instrument: 'sampler',
      type: 'sound',
      title: String(title).slice(0, 100),
      schemaVersion: 1,
      data: { padIndex, audioFileId: audio.id, backgroundColor },
      fileIds: [audio.id],
    }),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export async function deleteSound(id) {
  await maybeMockError();

  const res = await fetch(`${BASE}/items/${id}`, {
    method: 'DELETE',
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await apiError(res);
  const text = await res.text();
  return text ? JSON.parse(text) : { deleted: true, id };
}

// Fetch a file's raw bytes (e.g. an audio file URL from an item's files[]).
// Uses authHeaders() so the dev mock accepts it.
export async function fetchFileBytes(fileUrl) {
  const res = await fetch(fileUrl, {
    credentials: 'include',
    headers: await authHeaders(),
  });
  if (!res.ok) throw await apiError(res);
  return res.arrayBuffer();
}

// Update an item (PATCH). data and fileIds replace the stored value entirely.
export async function updateItem(id, body) {
  await maybeMockError();

  const res = await fetch(`${BASE}/items/${id}`, {
    method: 'PATCH',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

// Create any item (sound or padset) with an arbitrary data payload. This is
// separate from saveSound, which keeps its narrower behaviour unchanged.
export async function createItem(body) {
  await maybeMockError();

  const res = await fetch(`${BASE}/items`, {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(await authHeaders()),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await apiError(res);
  return res.json();
}

export function fileUrlFor(fileId, serverUrl) {
  if (import.meta.env.DEV && import.meta.env.VITE_API_APP_PASSWORD) {
    return `${BASE}/files/${fileId}/content`;
  }
  return serverUrl;
}
