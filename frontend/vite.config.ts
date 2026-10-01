import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// 빌드 결과는 frontend/dist 에만 쓴다 (serving_app/static 은 건드리지 않는다).
// base './' — HashRouter 라서 어느 경로에 올려도 그대로 열린다.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
