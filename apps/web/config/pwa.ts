import type { GenerateSWOptions } from 'workbox-build';

export const OFFLINE_SHELL = 'offline-shell.html';

export function workboxOptions(): Partial<GenerateSWOptions> {
  return {
    globPatterns: ['**/*.{js,css,ico,svg}', OFFLINE_SHELL],
    navigateFallback: undefined,
    directoryIndex: null,
    cleanupOutdatedCaches: true,
    skipWaiting: false,
    clientsClaim: true,
    runtimeCaching: [
      {
        urlPattern: ({ request, url, sameOrigin }) => sameOrigin && request.mode === 'navigate' && !/\/api(?:\/|$)/.test(url.pathname),
        handler: 'NetworkOnly',
        options: { precacheFallback: { fallbackURL: OFFLINE_SHELL } }
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/fonts\/[^/]+\.woff2$/i.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'stellar-fonts-v1', expiration: { maxEntries: 2, maxAgeSeconds: 2592000, purgeOnQuotaError: true }, cacheableResponse: { statuses: [200] } }
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/api\//.test(url.pathname),
        handler: 'NetworkOnly'
      },
      {
        urlPattern: ({ url, sameOrigin }) => sameOrigin && /\/stellar\/[^/]+\.(?:webp|png)$/i.test(url.pathname),
        handler: 'CacheFirst',
        options: { cacheName: 'stellar-art-v1', expiration: { maxEntries: 24, maxAgeSeconds: 2592000 }, cacheableResponse: { statuses: [200] } }
      }
    ]
  };
}
