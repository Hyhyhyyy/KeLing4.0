import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { copyFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { OFFLINE_SHELL, workboxOptions } from './config/pwa'
const publicBase = process.env.VITE_PUBLIC_BASE || '/';

// https://vite.dev/config/
export default defineConfig({
  base: publicBase,
  plugins: [
    react(),
    {
      name: 'keling-offline-shell',
      apply: 'build',
      writeBundle(output) {
        if (!output.dir) throw new Error('Web output directory is required');
        copyFileSync(resolve(output.dir, 'index.html'), resolve(output.dir, OFFLINE_SHELL));
      }
    },
    VitePWA({
      registerType: 'prompt',
      injectRegister: false,
      includeAssets: ['stellar/app_icon.png'],
      manifest: {
        name: '课灵 - AI学习助手',
        short_name: '课灵',
        description: '一款AI驱动的学习管理应用，让学习像培育星球一样有趣',
        theme_color: '#14263D',
        background_color: '#FFF6DF',
        display: 'standalone',
        orientation: 'any',
        scope: publicBase,
        start_url: publicBase,
        icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254', type: 'image/png', purpose: 'any' }],
        categories: ['education', 'productivity'],
        shortcuts: [
          {
            name: 'AI助手',
            short_name: 'AI',
            description: '与AI学习助手对话',
            url: publicBase + 'ai',
            icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254' }]
          },
          {
            name: '星球温室',
            short_name: '温室',
            description: '培育你的知识星球',
            url: publicBase + 'greenhouse',
            icons: [{ src: 'stellar/app_icon.png?v=planet-20261030', sizes: '1254x1254' }]
          }
        ]
      },
      workbox: workboxOptions(),
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
