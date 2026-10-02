import { useState } from 'react'

import { actions, useDemoClock, useLine, useOps, type LineId } from '@/api'
import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import { TimeControl } from '@/components/app/TimeControl'
import { CarouselMap } from '@/components/graphics/CarouselMap'
import { ActionNeeded } from '@/components/ops/ActionNeeded'
import { ArrivalsTable } from '@/components/ops/ArrivalsTable'
import { BaggageTimeline, TimelineLegend } from '@/components/ops/BaggageTimeline'
import { Button } from '@/components/ui/button'
import { OpsLineDrawer, type OpsLineTarget } from '@/pages/ops/OpsLineDrawer'

/**
 * #/ 운영 현황 — design/sections/OpsSection 견본과 같은 조립을 api 데이터로.
 * 순서(DESIGN.md): 제목 줄(제목 · 숫자 줄 · 시각 제어) → 조치 필요 → 수취대 타임라인 → 도착편 표 → 확장 범위(수취장 평면도)
 *
 * - 모든 값은 useOps() 한 곳에서: 지금(시각 지정이면 그 시각) 기준으로 다시 계산한 도착편·라인·조치 필요·숫자 줄.
 *   시각 제어는 actions.setAt 으로 앱 상태를 바꾸므로 화면 전체가 그 시각 기준으로 다시 그려지고, 화면을 옮겨도 유지된다.
 * - 제목 줄 → 조치 필요 → 타임라인은 선 없이 좁은 여백(8 · 16px)만 둬서 첫 화면에 타임라인 10행까지 들어오게 한다.
 *   그 아래(도착편, 확장 범위)는 섹션 사이 규칙대로 여백 32px + hairline.
 * - 타임라인 · 표 · 조치 필요 행 · 평면도에서 라인을 고르면 라인 상세 서랍(useLine)이 열린다.
 */
export function OpsPage() {
  const clock = useDemoClock()
  const ops = useOps()

  // 서랍: 닫히는 동안 내용이 비지 않도록 target 은 open 과 따로 둔다
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [target, setTarget] = useState<OpsLineTarget | null>(null)
  const detail = useLine(target?.lineId ?? null, target?.flightId ?? null)
  const [showAllFlights, setShowAllFlights] = useState(false)

  const openLine = (lineId: LineId, flightId?: string) => {
    setTarget({ lineId, flightId: flightId ?? null })
    setDrawerOpen(true)
  }

  // 선택 표시: 막대·행에서 열면 그 편, 라인 이름이면 서랍이 보이는 편. 서랍이 닫히면 지운다
  const selectedFlightId = drawerOpen ? (target?.flightId ?? detail?.focus?.id ?? null) : null
  // 서랍에 연 라인 — 타임라인 행의 라인 이름을 강조한다
  const selectedLineId = drawerOpen ? (target?.lineId ?? null) : null

  const tableFlights = showAllFlights ? ops.flights : ops.windowFlights

  // 남은 예측이 없을 때(마지막 편 뒤로 시각 지정) — ActionNeeded 는 값이 꼭 있어야 해서 기준 시각과 "—"로 채운다
  const nextPrediction = ops.nextPrediction ?? { at: ops.now, flightId: '-' }

  return (
    <>
      <ScreenTitleRow title="운영 현황" headingLevel="h1" figures={ops.figureRow}>
        <TimeControl value={clock.at} onChange={actions.setAt} now={clock.liveNow} />
      </ScreenTitleRow>

      <ActionNeeded
        className="mt-2"
        headingLevel="h3"
        items={ops.actionItems}
        now={ops.now}
        nextPrediction={nextPrediction}
        onOpenLine={openLine}
      />

      <section aria-label="수취대 타임라인" className="mt-4">
        <div className="flex items-baseline justify-between gap-6">
          <h2 className="type-section-title text-ink">수취대 타임라인</h2>
          <TimelineLegend />
        </div>
        <div className="mt-1.5">
          <BaggageTimeline
            lines={ops.lines}
            flights={ops.flights}
            start={ops.windowStart}
            end={ops.windowEnd}
            now={ops.now}
            selectedFlightId={selectedFlightId}
            selectedLineId={selectedLineId}
            onOpenLine={openLine}
          />
        </div>
      </section>

      <section aria-label="도착편" className="mt-8 border-t border-hairline pt-8">
        <div className="flex h-[30px] items-center justify-between">
          <h2 className="type-section-title text-ink">도착편</h2>
          <Button variant="ghost" className="-mr-2.5" onClick={() => setShowAllFlights((v) => !v)}>
            {showAllFlights ? '기본 범위로' : '전체 보기'}
          </Button>
        </div>
        <div className="mt-2">
          <ArrivalsTable
            flights={tableFlights}
            state={tableFlights.length > 0 ? 'ready' : 'empty'}
            selectedFlightId={selectedFlightId}
            onOpenLine={openLine}
          />
        </div>
      </section>

      {/* 확장 범위 — 운영 판단용이 아니라 "한 라인으로 학습 → 같은 구조로 수취장 전체로" 시스템 범위를 보이는 그림.
          범례 한 줄은 평면도가 함께 그린다. 표시 라인 고리도 서랍을 여는 곳이라 data-line-trigger 를 붙인다 */}
      <section aria-label="확장 범위" className="mt-8 border-t border-hairline pt-8">
        <h2 className="type-section-title text-ink">확장 범위</h2>
        <div className="mt-3" data-line-trigger="">
          <CarouselMap
            lines={ops.lines}
            selected={selectedLineId}
            onSelect={(id) => openLine(id)}
          />
        </div>
      </section>

      <OpsLineDrawer open={drawerOpen} detail={detail} onOpenChange={setDrawerOpen} />
    </>
  )
}
