import type { ReactNode } from 'react'
import { Outlet, useLocation } from 'react-router-dom'

import { useTerminal } from '@/api'
import { pageOf } from '@/app/routes'
import { Header } from '@/components/shell/Header'
import { Sidebar } from '@/components/shell/Sidebar'
import { AlertBanner } from '@/components/terminal/AlertBanner'

/**
 * 앱 틀 — DESIGN.md "4. 배치". 왼쪽 사이드바 255px + 헤더 56px + 본문(좌우 24, 최대 1400).
 */
export function AppShell() {
  const location = useLocation()
  const page = pageOf(location.pathname)
  const terminal = useTerminal()
  const live = terminal.carousels.find((c) => c.live)
  const favorites = terminal.carousels.filter((c) => c.favorite)

  return (
    <div className="min-h-screen bg-background-200">
      <Sidebar page={page} live={live} favorites={favorites} openAlerts={terminal.alerts.length} />
      <div className="flex min-h-screen flex-col pl-[255px]">
        <Header page={page} />
        <AlertBanner alerts={terminal.alerts} />
        <main className="mx-auto w-full max-w-[1448px] flex-1 px-6 pt-4 pb-12 text-gray-1000">
          <Outlet />
        </main>
      </div>
    </div>
  )
}

/** 아직 새로 짜지 않은 옛 화면을 잠시 담는 흰 면 (화면을 새로 짜면 지운다) */
export function LegacyFrame({ children }: { children: ReactNode }) {
  return <div className="material-base p-6">{children}</div>
}

/** 다음 차례에 만들 화면 */
export function NextUp({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">{title}</h1>
      <div className="material-base px-6 py-16 text-center type-label-14 text-gray-900">
        이 화면은 다음 차례에 새 디자인으로 만듭니다.
      </div>
    </div>
  )
}
