import { defineConfig } from 'vite';
import react           from '@vitejs/plugin-react';
import { VitePWA }    from 'vite-plugin-pwa';

export default defineConfig({
  base: process.env.VITE_BASE_URL || '/',

  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icons/*.svg', 'icons/*.png'],
      manifest: false,           // use public/manifest.json directly
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg}'],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'supabase-cache',
              networkTimeoutSeconds: 10,
              cacheableResponse: { statuses: [0, 200] }
            }
          }
        ]
      }
    })
  ],

  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
