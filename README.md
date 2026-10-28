# Tiles: OrchLab Sampler

Tiles is a touch-friendly sampler for disabled adults, built for OrchLab. Users tap a tile to record a sound, tap again to play it back, and edit each sound's trim, speed, reverse, reverb, delay and volume. Kits can be saved to and loaded from the OrchLab server.

Tiles is part of [OrchLab](https://[orchlab-website]), a music-making programme run by the London Philharmonic Orchestra in partnership with Drake Music.

## Features

- **Record and play** up to 8 tiles (1, 2, 4, 6 or 8, set in Settings). Keyboard shortcuts `Z X C V B N M ,` trigger tiles 1–8.
- **Sound editing** per tile: waveform trim, discard outside trim, speed, reverse, reverb, delay, volume (with auto-level and undo).
- **Kits**: save, save as, load, rename and delete kits (called "padsets" in the API). Each pad is stored as a separate sound item, so unchanged pads are updated in place and shared sounds are never deleted.
- **Accessibility-focused UI**: large touch targets, a splash screen with instructions, and no scrolling or pinch-zoom on touch devices.
- **Older device support**: targets iOS 9+ and Safari 9+, with self-hosted polyfills.

## Tech stack

- [Svelte 5](https://svelte.dev) with [Vite 7](https://vitejs.dev)
- Web Audio API (no audio library dependencies)
- [`@breezystack/lamejs`](https://www.npmjs.com/package/@breezystack/lamejs) for MP3 encoding, run in a Web Worker so the UI stays responsive
- [`@vitejs/plugin-legacy`](https://www.npmjs.com/package/@vitejs/plugin-legacy) for legacy browser builds
- Backend: a WordPress REST API (`orchlab-sampler/v1`) for storing kits and audio files

## Project structure

```
src/
├── App.svelte              Screen routing and top-level state
├── main.js                 Entry point, touch and zoom handling
├── app.css                 Global styles
└── lib/
    ├── SamplerEngine.js    Web Audio recording, playback and effects
    ├── mp3Encoder.js       MP3 encoding wrapper (uses the worker)
    ├── mp3Encoder.worker.js
    ├── api.js              REST client (auth, uploads, items)
    ├── kitLoader.js        Load and list kits
    ├── kitSaver.js         Save, overwrite, delete and rename kits
    ├── tileConfig.js       Colours and grid layouts
    ├── GridContainer.svelte  Play grid and keyboard shortcuts
    ├── Square.svelte       A single tile
    ├── OptionsScreen.svelte  Settings and per-tile editor
    ├── Waveform.svelte     Canvas waveform with trim handles
    ├── LoadScreen.svelte   Browse, load, rename and delete kits
    ├── SaveScreen.svelte   Save and save-as
    ├── SplashScreen.svelte
    ├── IconButton.svelte
    └── ResponsiveContainer.svelte
mock-server/                Prism mock of the API (open_api.json)
mock-server/stateful        Stateful mock of the API
public/                     Static assets: images, polyfills
netlify.toml                Deployment config
```

## Getting started

### Prerequisites

- Node.js [version]
- npm

### Install

```bash
npm install
```

### Run locally

```bash
npm run dev
```

Microphone access requires HTTPS on iOS. To run the dev server over HTTPS, create local certificates with [mkcert](https://github.com/FiloSottile/mkcert) in the project root:

```bash
mkcert -install
mkcert <your-lan-ip> localhost
```

Vite picks up any `*-key.pem` and `*.pem` pair automatically. Without them, the dev server runs over plain HTTP and recording will not work on iOS devices.

### Environment variables

Create a `.env.local` file in the project root:

| Variable | Purpose |
| --- | --- |
| `VITE_API_BASE` | Base URL of the API. Defaults to `/api` (proxied to the mock server in dev). |
| `VITE_API_USER` | Dev only: WordPress username for Basic auth. |
| `VITE_API_APP_PASSWORD` | Dev only: WordPress application password. Never commit this. |

In development, `/api` is proxied to `http://127.0.0.1:4010`. 

### Build

```bash
npm run build      # Copies polyfills, then builds to dist/
npm run preview    # Preview the production build
npm run serve      # Serve dist/ over the network (npx sirv-cli)
```

The build step copies `core-js` and `regenerator-runtime` into `public/polyfills/`.

## Notes for developers

- **Auth**: In production, requests use the WordPress REST nonce, fetched from `admin-ajax.php?action=rest-nonce`. In development, Basic auth is used if `VITE_API_USER` and `VITE_API_APP_PASSWORD` are set. Otherwise, the mock nonce is used.
- **Dev-only error simulation**: `api.js` reads `localStorage.mockError` (`413`, `429` or `500`) to simulate API errors. Remove this block before production (it is already gated by `import.meta.env.DEV`).
- **Rate limiting**: Requests that receive a `429` with `retryAfter` are retried once. Create requests are never retried otherwise, to avoid duplicate items.
- **Kit saving**: Pads that were loaded from the server and are not shared with other kits are updated in place. Other pads are re-uploaded. Old sounds are deleted only after the padset update succeeds.


## Licence

See [LICENSE](LICENSE).

## Credits

- OrchLab: London Philharmonic Orchestra and Drake Music
