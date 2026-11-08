// Relative API base. In dev with VITE_STAGING_PROXY, requests must stay
// same-origin (through the Vite proxy) so the browser sends no CORS preflight.
// Production always uses VITE_API_BASE exactly as before.
const BASE =
  import.meta.env.DEV && import.meta.env.VITE_STAGING_PROXY
    ? '/api'
    : (import.meta.env.VITE_API_BASE || '/api');

// Site origin for the nonce endpoint. In staging BASE is a full URL ending in
// /wp-json/orchlab-sampler/v1 — strip that suffix to get the origin. In dev
// BASE is just /api, so there is no origin.
const BASE_ORIGIN = BASE.startsWith('http')
  ? BASE.replace(/\/wp-json\/orchlab-sampler\/v1$/, '')
  : '';

const IS_MOCK = import.meta.env.DEV;

let nonce = null;

export async function getNonce() {
  if (IS_MOCK) return 'mock-nonce'; // Prism doesn't serve the nonce endpoint
  const res = await fetch(`${BASE_ORIGIN}/wp-admin/admin-ajax.php?action=rest-nonce`, {
    credentials: 'include',
  });
  if (!res.ok) {
    const err = new Error(`nonce failed: ${res.status}`);
    err.status = res.status;
    // 400/401/403 mean the visitor isn't logged in (or the session expired)
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      err.loggedOut = true;
    }
    throw err;
  }
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
  // 401/403 mean the visitor isn't logged in (or the nonce expired)
  if (res.status === 401 || res.status === 403) err.loggedOut = true;
  if (body.code !== undefined) err.code = body.code;
  if (body.retryAfter !== undefined) err.retryAfter = body.retryAfter;
  return err;
}

// DEV ONLY: simulate API errors for testing error handling.
// Set localStorage.setItem('mockError', '401' | '413' | '429' | '500') to trigger.
// Remove this block before production.
async function maybeMockError() {
  if (!import.meta.env.DEV) return;
  const code = localStorage.getItem('mockError');
  if (code !== '401' && code !== '413' && code !== '429' && code !== '500') return;

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

// Maps a caught error to a plain-language message for the UI.
export function apiMessage(err) {
  if (!err) return 'Something went wrong. Please try again.';
  if (err.loggedOut === true || err.status === 401 || err.status === 403) {
    return 'Log in to use saved kits.';
  }
  const status = err.status;
  // fetch() rejects with a TypeError when the network never connects; any 5xx
  // means the server is up but unhealthy. Either way, retrying later helps.
  if (err.name === 'TypeError' || (typeof status === 'number' && status >= 500 && status <= 599)) {
    return "Can't reach the server. Try again.";
  }
  // Any other failure: show a generic line, but keep the real message in the
  // console so it can still be debugged.
  console.error('API error:', err.message || err);
  return 'Something went wrong. Please try again.';
}

// Verify we can authenticate before starting a save, so a logged-out visitor
// sees one clear message instead of noticing every single pad fail.
export async function checkLogin() {
  await maybeMockError(); // DEV ONLY: honours the mockError stub (e.g. '401')
  await authHeaders();
}

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

// Create any item (sound or padset) with an arbitrary data payload.
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
