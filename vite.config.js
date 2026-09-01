import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import legacy from '@vitejs/plugin-legacy';
import fs from 'fs';
import path from 'path';

// Look for a local mkcert key/cert pair, e.g. "192.168.1.103+1-key.pem" / "192.168.1.103+1.pem".
// Returns null if none exist (e.g. on a fresh machine, CI, or a production build) —
// mkcert wasn't run there, and we don't want the build to crash on a missing file.
function findLocalCerts() {
  const files = fs.readdirSync(process.cwd());
  const keyFile = files.find(f => f.endsWith('-key.pem'));
  const certFile = files.find(f => f.endsWith('.pem') && !f.endsWith('-key.pem'));

  if (!keyFile || !certFile) return null;

  return {
    key: fs.readFileSync(path.resolve(process.cwd(), keyFile)),
    cert: fs.readFileSync(path.resolve(process.cwd(), certFile)),
  };
}

export default defineConfig(({ command }) => {
  const isDev = command === 'serve';
  const localCerts = isDev ? findLocalCerts() : null;

  if (isDev && !localCerts) {
    console.warn(
      '\n⚠️  No local HTTPS certs found (looked for *-key.pem / *.pem in project root).\n' +
      '   Dev server will run over plain HTTP — mic recording will NOT work on iOS devices.\n' +
      '   Run: mkcert -install && mkcert <your-lan-ip> localhost\n'
    );
  }

  return {
    plugins: [
      svelte(),
      legacy({
        targets: ['iOS >= 9', 'Safari >= 9', 'defaults'],
        additionalLegacyPolyfills: ['regenerator-runtime/runtime']
      })
    ],
    server: {
      host: true,
      https: localCerts || undefined,
    },
    build: {
      outDir: 'dist',
      modulePreload: {
        polyfill: true
      }
    }
  };
});
