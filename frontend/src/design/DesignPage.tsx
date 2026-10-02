import { useEffect, useState, type ComponentType } from 'react'

import { AppHeader } from '@/components/app/AppHeader'
import type { AppTab } from '@/components/app/tabs'
import { demo, server } from '@/design/mock'
import { SHEET_CHROME_PX, SheetSection } from '@/design/SheetSection'
import { FoundationsSection } from '@/design/sections/FoundationsSection'
import { GraphicsSection } from '@/design/sections/GraphicsSection'
import { LabSection } from '@/design/sections/LabSection'
import { LineDrawerSection } from '@/design/sections/LineDrawerSection'
import { MonitoringSection } from '@/design/sections/MonitoringSection'
import { OpsSection } from '@/design/sections/OpsSection'
import { PrimitivesSection } from '@/design/sections/PrimitivesSection'
import { cn } from '@/lib/cn'
import { fmtDateTime } from '@/lib/format'

/**
 * 시트 구역 순서 — id 는 목차 앵커.
 * tab: 그 구역을 볼 때 상단 바에서 선택해 보일 화면 탭 (화면이 아닌 구역은 null).
 */
const SECTIONS: ReadonlyArray<{ id: string; title: string; tab: AppTab | null; Component: ComponentType }> = [
  { id: 'foundations', title: '기초', tab: null, Component: FoundationsSection },
  { id: 'primitives', title: '기본 부품', tab: null, Component: PrimitivesSection },
  { id: 'graphics', title: '그래픽·아이콘', tab: null, Component: GraphicsSection },
  { id: 'ops', title: '운영 현황', tab: 'ops', Component: OpsSection },
  { id: 'line-drawer', title: '라인 상세', tab: 'ops', Component: LineDrawerSection },
  { id: 'monitoring', title: '모델 모니터링', tab: 'monitoring', Component: MonitoringSection },
  { id: 'lab', title: '시나리오 랩', tab: 'lab', Component: LabSection },
]

/** 상단 바 탭을 누르면 옮겨 갈 구역 */
const TAB_SECTION: Record<AppTab, string> = { ops: 'ops', monitoring: 'monitoring', lab: 'lab' }

/** 고정 띠 아래 이만큼 안에 구역 제목이 들어오면 그 구역을 보는 중으로 친다 */
const SPY_SLACK_PX = 24

/** 지금 화면 위쪽에 걸린 구역 id (목차·상단 바 탭 선택 표시용) */
function useCurrentSection(): string {
  const [current, setCurrent] = useState(SECTIONS[0].id)
  useEffect(() => {
    let frame = 0
    const update = () => {
      frame = 0
      let next = SECTIONS[0].id
      for (const { id } of SECTIONS) {
        const el = document.getElementById(id)
        if (el && el.getBoundingClientRect().top <= SHEET_CHROME_PX + SPY_SLACK_PX) next = id
      }
      // 맨 아래까지 내렸으면 마지막 구역
      const root = document.documentElement
      if (window.innerHeight + window.scrollY >= root.scrollHeight - 2) next = SECTIONS[SECTIONS.length - 1].id
      setCurrent(next)
    }
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update)
    }
    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
      if (frame) cancelAnimationFrame(frame)
    }
  }, [])
  return current
}

/** 움직임 규칙: 부드러운 스크롤 없이 바로 옮긴다 (HashRouter 라서 #앵커 링크 대신 버튼) */
function jumpTo(id: string) {
  document.getElementById(id)?.scrollIntoView({ block: 'start' })
}

/**
 * /design — 컴포넌트 시트 한 장.
 * 위에 고정: 상단 바 실물(app-header, 52px) + 시트 목차 띠(32px, 작게).
 * 그 아래 본문 흰 면(main-sheet) 한 장 안에 구역을 순서대로 늘어놓는다. 구역 사이는 여백 32px + hairline.
 */
export function DesignPage() {
  const current = useCurrentSection()
  const currentTab = SECTIONS.find((s) => s.id === current)?.tab ?? null

  return (
    <div className="min-h-screen bg-canvas">
      <div className="sticky top-0 z-20 bg-canvas" style={{ height: SHEET_CHROME_PX }}>
        <AppHeader
          tab={currentTab}
          onTabChange={(tab) => jumpTo(TAB_SECTION[tab])}
          serverStatus={server.status}
          modelVersion={server.modelVersion}
          now={demo.now}
        />
        <nav aria-label="시트 목차" className="flex h-8 items-center gap-5 px-4">
          <span className="type-label text-ink">디자인 시트</span>
          <ol className="flex items-center gap-4">
            {SECTIONS.map(({ id, title }) => (
              <li key={id}>
                <button
                  type="button"
                  onClick={() => jumpTo(id)}
                  aria-current={current === id ? 'location' : undefined}
                  className={cn(
                    'rounded-xs type-caption whitespace-nowrap transition-colors hover:text-ink',
                    current === id ? 'text-ink' : 'text-ink-subtle',
                  )}
                >
                  {title}
                </button>
              </li>
            ))}
          </ol>
          <span className="ml-auto type-caption whitespace-nowrap text-ink-subtle tabular-nums">
            목업 기준 {fmtDateTime(demo.now)}
          </span>
        </nav>
      </div>

      <main className="mx-2 mb-2 rounded-lg border border-hairline bg-surface-1 p-6">
        {SECTIONS.map(({ id, title, Component }) => (
          <SheetSection key={id} id={id} title={title}>
            <Component />
          </SheetSection>
        ))}
      </main>
    </div>
  )
}
