import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Sangeetham',
        short_name: 'Sangeetham',
        description: 'Your private music library and player.',
        theme_color: '#11100e',
        background_color: '#11100e',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone'],
        start_url: '/',
        scope: '/',
        orientation: 'any',
        categories: ['music', 'entertainment'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: 'Library', url: '/library', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
          { name: 'Now playing', url: '/now-playing', icons: [{ src: 'icon-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // The app shell is cached; the API and signed media URLs are never cached.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallbackDenylist: [/^\/api\//],
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        cleanupOutdatedCaches: true,
      },
    }),
  ],
  build: {
    rollupOptions: {
      output: {
        // Libraries change rarely; keeping them in their own chunks means an app update
        // doesn't make the browser download React or the icon set again.
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          motion: ['motion/react'],
          query: ['@tanstack/react-query', 'zustand'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: '0.0.0.0',
    strictPort: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
