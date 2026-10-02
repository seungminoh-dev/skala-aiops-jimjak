import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// npm run build       → frontend/dist (확인용)
// npm run build:serve → serving_app/static (FastAPI 가 "/" 에서 정적 서빙. 기존 파일은 지우고 새로 쓴다)
// base './' — HashRouter 라서 어느 경로에 올려도 그대로 열린다.
//
// 개발 서버(npm run dev)는 API 를 FastAPI(포트 8077 — 로컬 uvicorn·Docker 공통)로 넘긴다. 서버가 없으면 "연결 끊김"으로 열린다.
// 서버 주소가 다르면: API_TARGET=http://127.0.0.1:8090 npm run dev
const API_TARGET = process.env.API_TARGET ?? 'http://127.0.0.1:8077'
const API_PATHS = ['/health', '/predict', '/data', '/logs', '/monitoring', '/models', '/scenarios']

export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: Object.fromEntries(API_PATHS.map((path) => [path, { target: API_TARGET, changeOrigin: true }])),
  },
})
