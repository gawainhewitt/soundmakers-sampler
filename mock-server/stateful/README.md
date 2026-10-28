# Stateful Mock Server (OrchLab Instruments API)

A dev-only mock of the OrchLab Instruments API that **stores** what it
receives, so items and files persist between requests and across restarts.
It listens on `127.0.0.1:4010` — the same port as Prism — so the existing
Vite `/api` proxy works unchanged. Run Prism instead when you want strict
spec validation; run this when you want state that survives.

## Install

```sh
cd mock-server/stateful
npm install
```

(Only dependency: `busboy`, for multipart parsing. Everything else is a
Node built-in.)

## Start

```sh
cd mock-server/stateful
npm start
```

State lives in `mock-server/stateful/data/` (`db.json` + `files/`). It is
loaded on start and written on every change, so restarts keep your data.

## Reset

Deletes `data/` and starts empty:

```sh
cd mock-server/stateful
npm run reset
```

Normal `npm start` never resets.

## Auth

The mock treats a request as logged in when the `X-WP-Nonce` header is
present (any value). `GET /me` works without it; every other route returns
`401 oli_not_logged_in` without it.

## Smoke test

```sh
# 1. Upload a small MP3
curl -s -X POST http://127.0.0.1:4010/api/files \
  -H "X-WP-Nonce: mock" \
  -F "instrument=sampler" \
  -F "file=@sound.mp3;type=audio/mpeg"

# 2. List items
curl -s -H "X-WP-Nonce: mock" \
  "http://127.0.0.1:4010/api/items?instrument=sampler"

# 3. Fetch a file's bytes and save them to disk
curl -s -O http://127.0.0.1:4010/api/files/<id>/content
```

All routes work under both `/api/...` and `/...` (the Vite proxy strips the
`/api` prefix, so the server accepts both).