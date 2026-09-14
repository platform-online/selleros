/// <reference lib="webworker" />
/**
 * SellerOS service worker.
 *
 * Strategy: precache the whole app shell so the product is fully usable with no
 * network at all, then serve navigation requests from that cache. Nothing here
 * ever reaches the network for app data — SellerOS has no backend, so there is
 * no API to fall back to and no stale-copy risk.
 */
import { clientsClaim } from 'workbox-core';
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { CacheFirst, NetworkFirst } from 'workbox-strategies';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
import { ExpirationPlugin } from 'workbox-expiration';

declare let self: ServiceWorkerGlobalScope;

// `__WB_MANIFEST` is replaced at build time with the hashed asset list, so the
// precache is versioned by content — never by a hand-maintained constant.
precacheAndRoute(self.__WB_MANIFEST);

// Drop precaches left behind by previous releases.
cleanupOutdatedCaches();

// SPA navigation: any document request resolves to the cached shell.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

// App icons and images: content-addressed, so cache-first is always safe.
registerRoute(
  ({ request }) => request.destination === 'image' || request.destination === 'font',
  new CacheFirst({
    cacheName: 'selleros-assets',
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 90 }),
    ],
  }),
);

// Anything same-origin that is not precached: prefer network, keep a copy.
registerRoute(
  ({ url }) => url.origin === self.location.origin,
  new NetworkFirst({
    cacheName: 'selleros-runtime',
    networkTimeoutSeconds: 4,
    plugins: [
      new CacheableResponsePlugin({ statuses: [0, 200] }),
      new ExpirationPlugin({ maxEntries: 40, maxAgeSeconds: 60 * 60 * 24 * 30 }),
    ],
  }),
);

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') void self.skipWaiting();
});

clientsClaim();
