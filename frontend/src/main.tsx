import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.tsx'
import { start } from '@/api/liveServer'

// 짐작 FastAPI 에서 첫 데이터를 읽은 뒤에 그린다 — 서버가 없으면 "연결 끊김"으로 열고 5초마다 다시 붙는다
void start()
  .catch(() => undefined)
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
