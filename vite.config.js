import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte'; 
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [
    svelte(),
    legacy({
      targets: ['iOS >= 9', 'Safari >= 9', 'defaults'],
      additionalLegacyPolyfills: ['regenerator-runtime/runtime']
    })
  ],
  build: {
    outDir: 'dist',           // Output to dist directory
    modulePreload: {
      polyfill: true  
    }
  }
});