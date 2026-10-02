import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App.tsx'
import { connect } from '@/api/server'

// 짐작 FastAPI 가 답하면 실서버, 아니면 목업으로 — 첫 데이터를 읽은 뒤에 그린다 (api/server.ts)
void connect()
  .catch(() => 'mock')
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
  })
