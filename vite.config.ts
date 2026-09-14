import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// Base is relative so the bundle works on GitHub Pages project sites
// (/selleros/) and on any future custom domain (www.example.com) without
// hardcoding a host or path assumption.
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      strategies: 'injectManifest',
      srcDir: 'src',
      filename: 'sw.ts',
      registerType: 'prompt',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'SellerOS — Business Operating System',
        short_name: 'SellerOS',
        description:
          'A premium business operating system for e-commerce, F-commerce and online sellers. Products, orders, inventory, ads, finance and insights in one place.',
        lang: 'en',
        dir: 'ltr',
        start_url: './',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f7f8fa',
        theme_color: '#0f172a',
        categories: ['business', 'finance', 'productivity'],
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: './icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      injectManifest: {
        globPatterns: ['**/*.{js,css,html,svg,png,webmanifest,woff2}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],
  resolve: {
    alias: { '@': new URL('./src', import.meta.url).pathname },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom', 'react-router-dom'],
          charts: ['recharts'],
          db: ['dexie', 'dexie-react-hooks'],
        },
      },
    },
  },
  // allowedHosts: local dev/preview servers are reached through a proxy host
  // (e.g. <port>-<sandbox>.e2b.app); Vite's default host allowlist rejects it.
  server: { host: '0.0.0.0', port: 5173, strictPort: false, allowedHosts: true },
  preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
  },
});
