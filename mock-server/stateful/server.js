// Stateful mock of the OrchLab Instruments API.
//
// Behaviours:
// - Listens on 127.0.0.1:4010 (same as Prism), so the Vite /api proxy works
//   unchanged. Accepts both /api/... and /... paths.
// - Stores everything in data/ (db.json + files/), persisted on every change.
// - Treats X-WP-Nonce presence as "logged in" (any value).
// - Implements the schemas in ../open_api.json (Item, ItemCreate, ItemUpdate,
//   File, FileUploaded, Me, Error).

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Busboy from 'busboy';

const HOST = '127.0.0.1';
const PORT = Number(process.env.PORT) || 4010;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, 'data');
const FILES_DIR = path.join(DATA_DIR, 'files');
const DB_PATH = path.join(DATA_DIR, 'db.json');

const PAGE_SIZE = 50;

const INSTRUMENT = 'sampler';
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB
const QUOTA_LIMIT = 200 * 1024 * 1024; // 200 MB
const ALLOWED_MIMES = ['audio/mpeg', 'image/jpeg', 'image/png'];
const LOGIN_URL = 'https://staging.orchlab.org/wp-login.php';
const ITEM_TYPE_RE = /^[a-z0-9-]{1,32}$/;

// ── Storage ──────────────────────────────────────────────────────────────

// { nextId: number, files: { [id]: File }, items: { [id]: Item } }
// File: { id, mime, bytes, url, createdAt, filename }
// Item: { id, instrument, type, title, schemaVersion, data, fileIds, createdAt, updatedAt }
let db;

function nowIso() {
  return new Date().toISOString();
}

function saveDb() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function loadDb() {
  try {
    const raw = fs.readFileSync(DB_PATH, 'utf8');
    const parsed = JSON.parse(raw);
    db = {
      nextId: Number(parsed.nextId) || 1,
      files: parsed.files || {},
      items: parsed.items || {},
    };
  } catch {
    db = { nextId: 1, files: {}, items: {} };
  }
}

function resetDb() {
  fs.rmSync(DATA_DIR, { recursive: true, force: true });
  db = { nextId: 1, files: {}, items: {} };
}

// ── File helpers ─────────────────────────────────────────────────────────

function fileRecord(id, { mime, bytes, filename }) {
  return {
    id,
    url: `/api/files/${id}/content`,
    mime,
    bytes,
    createdAt: nowIso(),
    filename, // not in the API shape; used for disk writes and cleanup
  };
}

function filePath(id) {
  return path.join(FILES_DIR, String(id));
}

function writeFileBytes(id, buffer) {
  fs.mkdirSync(FILES_DIR, { recursive: true });
  fs.writeFileSync(filePath(id), buffer);
}

function readFileBytes(id) {
  try {
    return fs.readFileSync(filePath(id));
  } catch {
    return null;
  }
}

function deleteFileBytes(id) {
  try {
    fs.rmSync(filePath(id), { force: true });
  } catch {
    // ignore
  }
}

function quotaUsed() {
  let total = 0;
  for (const f of Object.values(db.files)) total += f.bytes;
  return total;
}

// ── Item helpers ─────────────────────────────────────────────────────────

// The public Item shape: files[] resolved for each id in fileIds.
function serializeItem(item) {
  const publicFile = (f) => ({ id: f.id, url: f.url, mime: f.mime, bytes: f.bytes });
  return {
    id: item.id,
    instrument: item.instrument,
    type: item.type,
    title: item.title,
    schemaVersion: item.schemaVersion,
    data: item.data,
    fileIds: item.fileIds,
    files: item.fileIds
      .map((id) => db.files[id])
      .filter(Boolean)
      .map(publicFile),
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
  };
}

// ── Validation ───────────────────────────────────────────────────────────

function stripHtmlTags(str) {
  return String(str).replace(/<[^>]*>/g, '');
}

// Validate an item create/update payload. Returns { ok: true } or
// { ok: false, code, message, status }.
function validateItemBody(body, { isPatch }) {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return err('rest_invalid_param', 'Item body must be a JSON object', 400);
  }

  const errors = [];

  // instrument
  const instrument = isPatch && body.instrument === undefined ? undefined : body.instrument;
  if (instrument !== undefined && instrument !== INSTRUMENT) {
    errors.push(`instrument must be "${INSTRUMENT}"`);
  }

  // type
  const type = isPatch && body.type === undefined ? undefined : body.type;
  if (type !== undefined && (typeof type !== 'string' || !ITEM_TYPE_RE.test(type))) {
    errors.push('type must match ^[a-z0-9-]{1,32}$');
  }

  // title
  const title = isPatch && body.title === undefined ? undefined : body.title;
  if (title !== undefined) {
    if (typeof title !== 'string' || stripHtmlTags(title).length > 100) {
      errors.push('title must be a string of at most 100 characters (HTML removed)');
    }
  }

  // schemaVersion
  const schemaVersion = isPatch && body.schemaVersion === undefined ? undefined : body.schemaVersion;
  if (schemaVersion !== undefined && (!Number.isInteger(schemaVersion) || schemaVersion < 1)) {
    errors.push('schemaVersion must be an integer >= 1');
  }

  // data
  const data = isPatch && body.data === undefined ? undefined : body.data;
  if (data !== undefined) {
    if (typeof data !== 'object' || data === null || Array.isArray(data)) {
      errors.push('data must be an object');
    } else if (Buffer.byteLength(JSON.stringify(data), 'utf8') > 256 * 1024) {
      errors.push('data must be at most 256 KB once encoded');
    }
  }

  // fileIds
  const fileIds = isPatch && body.fileIds === undefined ? undefined : body.fileIds;
  if (fileIds !== undefined) {
    if (!Array.isArray(fileIds)) {
      errors.push('fileIds must be an array');
    } else if (
      fileIds.length > 32 ||
      new Set(fileIds).size !== fileIds.length ||
      fileIds.some((id) => !Number.isInteger(id) || id < 1)
    ) {
      errors.push('fileIds must be at most 32 unique positive integers');
    } else {
      const missing = fileIds.filter((id) => !db.files[id]);
      if (missing.length > 0) {
        return err('oli_invalid_file_ref', 'fileIds reference unknown files', 400);
      }
    }
  }

  // On create, required fields must be present
  if (!isPatch) {
    for (const field of ['instrument', 'type', 'schemaVersion', 'data']) {
      if (body[field] === undefined) errors.push(`missing required field: ${field}`);
    }
  }

  if (errors.length > 0) {
    return err('rest_invalid_param', errors.join('; '), 400);
  }
  return { ok: true };
}

// ── Error helper ─────────────────────────────────────────────────────────

function err(code, message, status) {
  return { ok: false, code, message, status };
}

// Send an Error-shaped response.
function sendError(res, code, message, status) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ code, message, data: { status } }));
}

function sendJson(res, statusCode, body) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(body));
}

// ── Auth ─────────────────────────────────────────────────────────────────

function isLoggedIn(req) {
  return Object.prototype.hasOwnProperty.call(req.headers, 'x-wp-nonce');
}

function requireAuth(req, res) {
  if (!isLoggedIn(req)) {
    sendError(res, 'oli_not_logged_in', 'You need to be logged in to save.', 401);
    return false;
  }
  return true;
}

// ── Request handling ─────────────────────────────────────────────────────

function readJsonBody(req, res) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      let parsed = null;
      try {
        parsed = raw ? JSON.parse(raw) : null;
      } catch {
        parsed = null;
      }
      resolve(parsed);
    });
    req.on('error', () => resolve(null));
  });
}

// Parse a multipart form body with busboy.
// Resolves { fields: {...}, files: { [fieldName]: Buffer } } or { error }.
function parseMultipart(req) {
  return new Promise((resolve) => {
    const fields = {};
    const files = {};
    let failed = null;

    const bb = Busboy({ headers: req.headers, limits: { fileSize: MAX_FILE_BYTES } });

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      const chunks = [];
      stream.on('data', (chunk) => chunks.push(chunk));
      stream.on('limit', () => {
        failed = failed || { status: 413, code: 'oli_file_too_large', message: 'File exceeds the 10 MB limit', data: { status: 413 } };
      });
      stream.on('end', () => {
        if (!failed) files[name] = info ? { buffer: Buffer.concat(chunks), mime: info.mimeType, filename: info.filename } : { buffer: Buffer.concat(chunks) };
      });
    });

    bb.on('error', (ex) => {
      if (!failed) failed = { status: 400, code: 'rest_invalid_param', message: 'Malformed multipart body: ' + ex.message, data: { status: 400 } };
      resolve({ error: failed });
    });

    bb.on('finish', () => {
      if (failed) return resolve({ error: failed });
      for (const name of Object.keys(files)) {
        if (files[name] === null) delete files[name];
      }
      resolve({ fields, files });
    });

    req.pipe(bb);
  });
}

// ── Router ───────────────────────────────────────────────────────────────

const server = http.createServer(async (req, res) => {
  const startHr = process.hrtime.bigint();

  try {
    // Accept /api/... and /... (the Vite proxy strips /api).
    let urlPath = req.url.split('?')[0];
    if (urlPath.startsWith('/api')) urlPath = urlPath.slice(4);

    const method = req.method || 'GET';
    const segments = urlPath.split('/').filter(Boolean); // e.g. ["files", "3"]

    // Looks like an API route? Anything under /files or /items, plus /me.
    const isApiRoute =
      urlPath === '/me' ||
      segments[0] === 'files' ||
      segments[0] === 'items';

    // We only serve /me, /files/*, /items*. Everything else -> 404 API error.
    if (segments.length > 0 && !isApiRoute) {
      sendError(res, 'oli_not_found', 'No route registered for ' + urlPath, 404);
      return;
    }

    // GET /me — public
    if (method === 'GET' && urlPath === '/me') {
      const loggedIn = isLoggedIn(req);
      sendJson(res, 200, {
        loggedIn,
        userId: loggedIn ? 1 : 0,
        displayName: loggedIn ? 'Test User' : null,
        loginUrl: LOGIN_URL,
        quotaUsed: quotaUsed(),
        quotaLimit: loggedIn ? QUOTA_LIMIT : 0,
        instruments: {
          sampler: {
            enabled: true,
            maxFileBytes: MAX_FILE_BYTES,
            allowedMimes: ALLOWED_MIMES,
          },
        },
      });
      return;
    }

    // Everything else requires auth
    if (!requireAuth(req, res)) return;

    // ── /files ────────────────────────────────────────────────────────────
    if (segments[0] === 'files') {
      if (segments.length === 1 && urlPath === '/files') {
        // POST /files
        if (method !== 'POST') {
          sendError(res, 'rest_no_route', 'Method not allowed', 405);
          return;
        }
        const parsed = await parseMultipart(req);
        if (parsed.error) {
          sendError(res, parsed.error.code, parsed.error.message, parsed.error.status);
          return;
        }

        const { fields, files } = parsed;
        if (fields.instrument !== INSTRUMENT) {
          sendError(res, 'rest_invalid_param', `instrument must be "${INSTRUMENT}"`, 400);
          return;
        }
        const file = files.file;
        if (!file) {
          sendError(res, 'rest_missing_callback_param', 'Missing parameter(s): file', 400);
          return;
        }
        if (!ALLOWED_MIMES.includes(file.mime)) {
          sendError(
            res,
            'oli_unsupported_mime',
            `Unsupported file type: ${file.mime}`,
            415
          );
          return;
        }
        if (file.buffer.length > MAX_FILE_BYTES) {
          sendError(res, 'oli_file_too_large', 'File exceeds the 10 MB limit', 413);
          return;
        }

        // 507 if this upload would push the user over their 200 MB quota
        const quotaUsedBytes = quotaUsed();
        if (quotaUsedBytes + file.buffer.length > QUOTA_LIMIT) {
          sendJson(res, 507, {
            code: 'oli_quota_exceeded',
            message: 'You have used all your storage space.',
            data: {
              status: 507,
              quotaUsed: quotaUsedBytes,
              quotaLimit: QUOTA_LIMIT,
            },
          });
          return;
        }

        const id = db.nextId++;
        const record = fileRecord(id, {
          mime: file.mime,
          bytes: file.buffer.length,
          filename: file.filename,
        });
        db.files[id] = record;
        writeFileBytes(id, file.buffer);
        saveDb();

        const { filename, ...publicRecord } = record;
        sendJson(res, 201, publicRecord);
        return;
      }

      // /files/<id> and /files/<id>/content
      const id = Number(segments[1]);
      if (!Number.isInteger(id)) {
        sendError(res, 'rest_invalid_param', 'File id must be an integer', 400);
        return;
      }
      const record = db.files[id];

      if (segments[2] === 'content') {
        // GET /files/<id>/content
        if (method !== 'GET') {
          sendError(res, 'rest_no_route', 'Method not allowed', 405);
          return;
        }
        if (!record) {
          sendError(res, 'oli_not_found', 'File not found', 404);
          return;
        }
        const bytes = readFileBytes(id);
        if (!bytes) {
          sendError(res, 'oli_not_found', 'File not found', 404);
          return;
        }
        res.statusCode = 200;
        res.setHeader('Content-Type', record.mime);
        res.end(bytes);
        return;
      }

      // DELETE /files/<id>
      if (method === 'DELETE') {
        if (!record) {
          sendError(res, 'oli_not_found', 'File not found', 404);
          return;
        }
        const usedBy = Object.values(db.items).filter((item) => item.fileIds.includes(id));
        if (usedBy.length > 0) {
          sendError(
            res,
            'oli_file_in_use',
            'File is referenced by at least one item',
            409
          );
          return;
        }
        delete db.files[id];
        deleteFileBytes(id);
        saveDb();
        sendJson(res, 200, { deleted: true, id });
        return;
      }

      sendError(res, 'oli_not_found', 'No route registered for /files/' + id, 404);
      return;
    }

    // ── /items ────────────────────────────────────────────────────────────
    if (segments[0] === 'items') {
      if (segments.length === 1 && urlPath === '/items') {
        if (method === 'GET') {
          // Matches Prism: 400 when instrument is missing
          const instrument = new URL(req.url, 'http://x').searchParams.get('instrument');
          if (!instrument) {
            sendError(
              res,
              'rest_missing_callback_param',
              'Missing parameter(s): instrument',
              400
            );
            return;
          }
          const type = new URL(req.url, 'http://x').searchParams.get('type');
          const items = Object.values(db.items)
            .filter((item) => item.instrument === instrument)
            .filter((item) => !type || item.type === type)
            .sort((a, b) => a.id - b.id);
          sendJson(res, 200, items.map(serializeItem));
          return;
        }

        if (method === 'POST') {
          const body = await readJsonBody(req, res);
          const check = validateItemBody(body, { isPatch: false });
          if (!check.ok) {
            sendError(res, check.code, check.message, check.status);
            return;
          }

          const id = db.nextId++;
          const now = nowIso();
          const item = {
            id,
            instrument: body.instrument,
            type: body.type,
            title: stripHtmlTags(body.title === undefined ? '' : body.title).slice(0, 100),
            schemaVersion: body.schemaVersion,
            data: body.data,
            fileIds: body.fileIds || [],
            createdAt: now,
            updatedAt: now,
          };
          db.items[id] = item;
          saveDb();
          sendJson(res, 201, serializeItem(item));
          return;
        }

        sendError(res, 'rest_no_route', 'Method not allowed', 405);
        return;
      }

      // /items/<id>
      const id = Number(segments[1]);
      if (!Number.isInteger(id)) {
        sendError(res, 'rest_invalid_param', 'Item id must be an integer', 400);
        return;
      }
      const item = db.items[id];

      if (method === 'GET') {
        if (!item) {
          sendError(res, 'oli_not_found', 'Item not found', 404);
          return;
        }
        sendJson(res, 200, serializeItem(item));
        return;
      }

      if (method === 'PATCH') {
        if (!item) {
          sendError(res, 'oli_not_found', 'Item not found', 404);
          return;
        }
        const body = await readJsonBody(req, res);
        const check = validateItemBody(body, { isPatch: true });
        if (!check.ok) {
          sendError(res, check.code, check.message, check.status);
          return;
        }

        if (body.instrument !== undefined) item.instrument = body.instrument;
        if (body.type !== undefined) item.type = body.type;
        if (body.title !== undefined) item.title = stripHtmlTags(body.title).slice(0, 100);
        if (body.schemaVersion !== undefined) item.schemaVersion = body.schemaVersion;
        if (body.data !== undefined) item.data = body.data; // replace entirely
        if (body.fileIds !== undefined) item.fileIds = body.fileIds; // replace entirely
        item.updatedAt = nowIso();
        saveDb();
        sendJson(res, 200, serializeItem(item));
        return;
      }

      if (method === 'DELETE') {
        if (!item) {
          sendError(res, 'oli_not_found', 'Item not found', 404);
          return;
        }
        // Files used only by this item are deleted from disk too.
        const deletedFileIds = item.fileIds.filter((fid) => {
          const stillUsed = Object.values(db.items).some(
            (other) => other.id !== id && other.fileIds.includes(fid)
          );
          return !stillUsed;
        });
        for (const fid of deletedFileIds) {
          delete db.files[fid];
          deleteFileBytes(fid);
        }
        delete db.items[id];
        saveDb();
        sendJson(res, 200, { deleted: true, id, deletedFileIds });
        return;
      }

      sendError(res, 'rest_no_route', 'Method not allowed', 405);
      return;
    }

    sendError(res, 'oli_not_found', 'No route registered for ' + urlPath, 404);
  } catch (ex) {
    console.error('stateful-mock error:', ex);
    sendError(res, 'oli_server_error', 'Internal server error', 500);
  } finally {
    const ms = Number(process.hrtime.bigint() - startHr) / 1e6;
    console.log(`${req.method} ${req.url} -> ${res.statusCode} (${ms.toFixed(0)}ms)`);
  }
});

// ── Entry ────────────────────────────────────────────────────────────────

if (process.argv.includes('--reset')) {
  resetDb();
  console.log('stateful-mock: data/ removed, starting empty');
} else {
  loadDb();
}

server.listen(PORT, HOST, () => {
  console.log(`Stateful mock Instrument API running at http://${HOST}:${PORT}/api`);
  console.log(`  data: ${DATA_DIR}`);
  console.log(`  reset: npm run reset`);
});
