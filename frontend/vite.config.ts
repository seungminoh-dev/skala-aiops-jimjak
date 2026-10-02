import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// npm run build       → frontend/dist (확인용)
// npm run build:serve → serving_app/static (FastAPI 가 "/" 에서 정적 서빙. 기존 파일은 지우고 새로 쓴다)
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
