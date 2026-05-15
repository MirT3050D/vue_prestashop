import { fileURLToPath, URL } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import vueDevTools from 'vite-plugin-vue-devtools'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd())
  
  return {
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
          target: `${env.VITE_PRESTASHOP_URL}/api`,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/api_ps/, '')
        },
        '/ps_front': {
          target: env.VITE_PRESTASHOP_URL,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/ps_front/, ''),
          configure: (proxy) => {
            proxy.on('proxyRes', (proxyRes) => {
              const location = proxyRes.headers.location;

              if (!location) return;

              if (location.startsWith(env.VITE_PRESTASHOP_URL)) {
                proxyRes.headers.location = location.replace(
                  env.VITE_PRESTASHOP_URL,
                  '/ps_front'
                );
                return;
              }

              if (location.startsWith('/')) {
                proxyRes.headers.location = `/ps_front${location}`;
              }
            });
          }
        }
      }
    }
  }
})