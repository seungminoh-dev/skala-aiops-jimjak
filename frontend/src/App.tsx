import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/app/AppShell'
import { LIVE_BASE } from '@/app/routes'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { ModelsPage } from '@/pages/carousel/ModelsPage'
import { ScenariosPage } from '@/pages/carousel/ScenariosPage'
import { MonitorPage } from '@/pages/carousel/MonitorPage'
import { OverviewPage } from '@/pages/carousel/OverviewPage'
import { ControlPage } from '@/pages/ControlPage'
import { AlertsPage } from '@/pages/terminal/AlertsPage'
import { CarouselsPage } from '@/pages/terminal/CarouselsPage'
import { LogsPage } from '@/pages/terminal/LogsPage'

/**
 * 라우트 — DESIGN.md "5. 화면". HashRouter.
 * 터미널: #/ Overview · #/carousels · #/alerts · #/logs
 * 수취대: #/t1-03 개요 · #/t1-03/scenarios · #/t1-03/monitoring · #/t1-03/models
 */
export default function App() {
  return (
    <TooltipProvider delayDuration={300}>
      <HashRouter>
        <Routes>
          <Route element={<AppShell />}>
            <Route index element={<ControlPage />} />
            <Route path="carousels" element={<CarouselsPage />} />
            <Route path="alerts" element={<AlertsPage />} />
            <Route path="logs" element={<LogsPage />} />
            <Route path={LIVE_BASE.slice(1)}>
              <Route index element={<OverviewPage />} />
              <Route path="scenarios" element={<ScenariosPage />} />
              <Route path="monitoring" element={<MonitorPage />} />
              <Route path="models" element={<ModelsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
      <Toaster />
    </TooltipProvider>
  )
}
