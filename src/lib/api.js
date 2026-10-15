const BASE = import.meta.env.VITE_API_BASE;

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

async function authHeaders() {
  if (!nonce) nonce = await getNonce();
  return { 'X-WP-Nonce': nonce };
}
