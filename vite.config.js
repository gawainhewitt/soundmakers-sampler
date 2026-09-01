import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte'; 
import legacy from '@vitejs/plugin-legacy';
import fs from 'fs';

export default defineConfig({
  plugins: [
    svelte(),
    legacy({
      targets: ['iOS >= 9', 'Safari >= 9', 'defaults'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  server: {
    host: true,
    https: {
      key: fs.readFileSync('./192.168.1.103+1-key.pem'),
      cert: fs.readFileSync('./192.168.1.103+1.pem'),
    }
  },
  build: {
    outDir: 'dist',           // Output to dist directory
    modulePreload: {
      polyfill: true  
    }
  }
});

