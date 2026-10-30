import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['stellar/app_icon.png'],
      manifest: {
        name: '课灵 - AI学习助手',
        short_name: '课灵',
        description: '一款AI驱动的学习管理应用，让学习像培育星球一样有趣',
        theme_color: '#14263D',
        background_color: '#FFF6DF',
        display: 'standalone',
        orientation: 'any',
        scope: '/',
        start_url: '/',
        icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254', type: 'image/png', purpose: 'any' }],
        categories: ['education', 'productivity'],
        shortcuts: [
          {
            name: 'AI助手',
            short_name: 'AI',
            description: '与AI学习助手对话',
            url: '/ai',
            icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254' }]
          },
          {
            name: '星球温室',
            short_name: '温室',
            description: '培育你的知识星球',
            url: '/greenhouse',
            icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254' }]
          }
        ]
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,svg}'],
        navigateFallbackDenylist: [/^\/api\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 // 24 hours
              },
              cacheableResponse: {
                statuses: [0, 200]
              }
            }
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith('/stellar/'),
            handler: 'CacheFirst',
            options: { cacheName: 'stellar-art-v1', expiration: { maxEntries: 24, maxAgeSeconds: 2592000 }, cacheableResponse: { statuses: [200] } }
          }
        ]
      },
      devOptions: {
        enabled: false
      }
    })
  ],
  server: {
    host: true,
    port: 5173,
    proxy: { '/api': 'http://localhost:3001' }
  }
})
