import { fileURLToPath, URL } from 'node:url'

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    vue(),
    vueDevTools(),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url))
    },
  },
  server: {
    proxy: {
      '/api_ps': {
        target: 'http://localhost:8081/prestashop_edition_classic_version_8.2.6/api',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api_ps/, '')
      }
    }
  }
})  