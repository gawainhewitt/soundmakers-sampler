// Mock WordPress backend for the Soundmakers Sampler.
//
// Implements the endpoint contract proposed to Kate's team:
//   /wp-json/orchlab-sampler/v1/sounds
//   /wp-json/orchlab-sampler/v1/pad-sets
//
// Notes:
// - Storage is in memory. Restarting the server clears everything.
// - The JWT is decoded to get the user id, but the signature is NOT verified.
//   Verification is Kate's side.
// - Stored files are served without auth, because <audio> and <img> tags
//   cannot send an Authorization header.

import express from 'express';
import multer from 'multer';

const PORT = Number(process.env.PORT) || 3001;
const BASE = '/wp-json/orchlab-sampler/v1';
const PAD_COUNT = 8;
const MAX_FILE_BYTES = 64 * 1024 * 1024; // 64 MB server limit
const HEX_COLOUR = /^#[0-9a-fA-F]{6}$/;
const AUDIO_TYPES = ['audio/mpeg', 'audio/mp3'];
const IMAGE_TYPES = ['image/jpeg', 'image/png'];
const ORIENTATIONS = ['portrait', 'landscape'];

// ── In-memory state ──────────────────────────────────────────────────────

let nextId = 1;
const sounds = new Map();  // id -> sound record
const padSets = new Map(); // id -> pad set record
const files = new Map();   // 'sounds/3' or 'images/9' -> { buffer, mimetype }

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_FILE_BYTES },
});

const app = express();
app.use(express.json());

// ── Helpers ──────────────────────────────────────────────────────────────

// Reads the user id from a JWT's payload without verifying the signature.
function userIdFromRequest(req) {
  const match = /^Bearer\s+(\S+)$/.exec(req.get('Authorization') || '');
  if (!match) return null;

  const parts = match[1].split('.');
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload.id != null ? String(payload.id) : null;
  } catch {
    return null;
  }
}

function requireUser(req, res, next) {
  const userId = userIdFromRequest(req);
  if (!userId) {
    return res.status(401).json({ error: 'Missing or malformed Bearer token' });
  }
  req.userId = userId;
  next();
}

function storeFile(kind, file) {
  const key = `${kind}/${nextId++}`;
  files.set(key, { buffer: file.buffer, mimetype: file.mimetype });
  return key;
}

function deleteFile(key) {
  if (key) files.delete(key);
}

function fileUrl(key) {
  return key ? `${BASE}/files/${key}` : null;
}

// FormData with a repeated field gives an array; a single value gives a string.
function toArray(value) {
  if (value === undefined) return [];
  return Array.isArray(value) ? value : [value];
}

function serializeSound(s) {
  return {
    id: s.id,
    padIndex: s.padIndex,
    title: s.title,
    audioUrl: fileUrl(s.audioKey),
    imageUrl: fileUrl(s.imageKey),
    backgroundColor: s.backgroundColor,
    created_at: s.created_at,
  };
}

function serializePadSet(p) {
  return {
    id: p.id,
    title: p.title,
    soundIds: p.soundIds,
    imageUrls: p.imageKeys.map(fileUrl),
    backgroundColors: p.backgroundColors,
    gridOrientation: p.gridOrientation,
    created_at: p.created_at,
  };
}

// ── Sounds ───────────────────────────────────────────────────────────────

app.get(`${BASE}/sounds`, requireUser, (req, res) => {
  const mine = [...sounds.values()].filter((s) => s.userId === req.userId);
  res.json(mine.map(serializeSound));
});

app.post(
  `${BASE}/sounds`,
  requireUser,
  upload.fields([
    { name: 'file', maxCount: 1 },
    { name: 'image', maxCount: 1 },
  ]),
  (req, res) => {
    const audio = req.files?.file?.[0];
    const image = req.files?.image?.[0];

    if (!audio) {
      return res.status(400).json({ error: 'Missing "file" (MP3)' });
    }
    if (!AUDIO_TYPES.includes(audio.mimetype)) {
      return res.status(415).json({ error: `Unsupported audio type: ${audio.mimetype}` });
    }
    if (image && !IMAGE_TYPES.includes(image.mimetype)) {
      return res.status(415).json({ error: `Unsupported image type: ${image.mimetype}` });
    }

    const raw = req.body.padIndex;
    const padIndex = typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : NaN;
    if (!Number.isInteger(padIndex) || padIndex < 0 || padIndex >= PAD_COUNT) {
      return res.status(400).json({ error: `padIndex must be an integer 0-${PAD_COUNT - 1}` });
    }

    const backgroundColor = req.body.backgroundColor || null;
    if (backgroundColor !== null && !HEX_COLOUR.test(backgroundColor)) {
      return res.status(400).json({ error: 'backgroundColor must be a 6-digit hex colour' });
    }

    const sound = {
      id: nextId++,
      userId: req.userId,
      padIndex,
      title: (req.body.title || 'Untitled').slice(0, 100),
      backgroundColor,
      audioKey: storeFile('sounds', audio),
      imageKey: image ? storeFile('images', image) : null,
      created_at: new Date().toISOString(),
    };

    sounds.set(sound.id, sound);
    res.status(201).json(serializeSound(sound));
  }
);

app.delete(`${BASE}/sounds/:id`, requireUser, (req, res) => {
  const id = Number(req.params.id);
  const sound = sounds.get(id);

  if (!sound || sound.userId !== req.userId) {
    return res.status(404).json({ error: 'Sound not found' });
  }

  const inUse = [...padSets.values()].some(
    (p) => p.userId === req.userId && p.soundIds.includes(id)
  );
  if (inUse) {
    return res.status(409).json({ error: 'Sound is used by a pad set' });
  }

  deleteFile(sound.audioKey);
  deleteFile(sound.imageKey);
  sounds.delete(id);
  res.status(204).end();
});

// ── Pad sets ─────────────────────────────────────────────────────────────

app.get(`${BASE}/pad-sets`, requireUser, (req, res) => {
  const mine = [...padSets.values()].filter((p) => p.userId === req.userId);
  res.json(mine.map(serializePadSet));
});

// Expected FormData:
//   soundIds         repeated 8 times; a sound id, or "" for an empty pad
//   backgroundColors repeated 8 times; hex colours
//   gridOrientation  "portrait" | "landscape"
//   title
//   image0..image7   optional JPG/PNG per pad, by position
app.post(
  `${BASE}/pad-sets`,
  requireUser,
  upload.fields(
    Array.from({ length: PAD_COUNT }, (_, i) => ({ name: `image${i}`, maxCount: 1 }))
  ),
  (req, res) => {
    const title = (req.body.title || 'Untitled').slice(0, 100);
    const gridOrientation = req.body.gridOrientation;
    if (!ORIENTATIONS.includes(gridOrientation)) {
      return res.status(400).json({ error: `gridOrientation must be one of: ${ORIENTATIONS.join(', ')}` });
    }

    const rawSoundIds = toArray(req.body.soundIds);
    if (rawSoundIds.length !== PAD_COUNT) {
      return res.status(400).json({ error: `soundIds must have ${PAD_COUNT} entries (use "" for an empty pad)` });
    }

    const soundIds = rawSoundIds.map((raw) => {
      if (raw === '') return null;
      const id = Number(raw);
      const sound = sounds.get(id);
      return sound && sound.userId === req.userId ? id : undefined;
    });
    const badSound = soundIds.indexOf(undefined);
    if (badSound !== -1) {
      return res.status(400).json({ error: `soundIds[${badSound}] is not a sound you own` });
    }

    const colours = toArray(req.body.backgroundColors);
    if (colours.length !== PAD_COUNT) {
      return res.status(400).json({ error: `backgroundColors must have ${PAD_COUNT} entries` });
    }
    if (colours.some((c) => !HEX_COLOUR.test(c))) {
      return res.status(400).json({ error: 'Every backgroundColors entry must be a 6-digit hex colour' });
    }

    const images = Array.from({ length: PAD_COUNT }, (_, i) => req.files?.[`image${i}`]?.[0] || null);
    const badImage = images.find((img) => img && !IMAGE_TYPES.includes(img.mimetype));
    if (badImage) {
      return res.status(415).json({ error: `Unsupported image type: ${badImage.mimetype}` });
    }

    const padSet = {
      id: nextId++,
      userId: req.userId,
      title,
      gridOrientation,
      soundIds,
      imageKeys: images.map((img) => (img ? storeFile('images', img) : null)),
      backgroundColors: colours,
      created_at: new Date().toISOString(),
    };

    padSets.set(padSet.id, padSet);
    res.status(201).json(serializePadSet(padSet));
  }
);

app.delete(`${BASE}/pad-sets/:id`, requireUser, (req, res) => {
  const id = Number(req.params.id);
  const padSet = padSets.get(id);

  if (!padSet || padSet.userId !== req.userId) {
    return res.status(404).json({ error: 'Pad set not found' });
  }

  padSet.imageKeys.forEach(deleteFile);
  padSets.delete(id);
  res.status(204).end();
});

// ── Stored files ─────────────────────────────────────────────────────────

app.get(`${BASE}/files/:kind/:id`, (req, res) => {
  const file = files.get(`${req.params.kind}/${req.params.id}`);
  if (!file) {
    return res.status(404).json({ error: 'File not found' });
  }
  res.type(file.mimetype).send(file.buffer);
});

// ── Health and errors ────────────────────────────────────────────────────

app.get('/health', (req, res) => {
  res.json({ ok: true, sounds: sounds.size, padSets: padSets.size, files: files.size });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    return res.status(status).json({ error: err.message, code: err.code });
  }
  if (err.status) {
    return res.status(err.status).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Mock server error' });
});

app.listen(PORT, () => {
  console.log(`Mock sampler backend running at http://localhost:${PORT}${BASE}`);
});