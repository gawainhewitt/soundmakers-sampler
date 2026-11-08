import { defineConfig, loadEnv } from 'vite';
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

export default defineConfig(({ command, mode }) => {
  const isDev = command === 'serve';
  const localCerts = isDev ? findLocalCerts() : null;

  // Optional, dev-only: when set, proxy /api to the staging site instead of
  // the Prism mock. Requests stay same-origin, so the browser sends no CORS
  // preflight. The value is the staging origin, e.g. https://staging.orchlab.org
  const stagingOrigin = loadEnv(mode, process.cwd(), '').VITE_STAGING_PROXY;

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
      proxy: {
        '/api': stagingOrigin
          ? {
              // Staging mode: forward /api/... to the staging API. No mock
              // cookie is added; auth comes from the app-password
              // Authorization header, which is passed through untouched.
              target: stagingOrigin,
              changeOrigin: true,
              secure: true, // keep TLS certificate checks on
              rewrite: (p) => p.replace(/^\/api/, '/wp-json/orchlab-sampler/v1'),
            }
          : {
              target: 'http://127.0.0.1:4010',
              changeOrigin: true,
              rewrite: (p) => p.replace(/^\/api/, ''),
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq) => {
                  // Dev-only mock auth: Prism checks that the cookie is present, not its value
                  proxyReq.setHeader('Cookie', 'wordpress_logged_in_{hash}=mock');
                });
              },
            },
      },
    },
    build: {
      outDir: 'dist',
      modulePreload: {
        polyfill: true
      }
    }
  };
});
