import { useState } from 'react'

import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import { TimeControl } from '@/components/app/TimeControl'
import { CarouselMap } from '@/components/graphics/CarouselMap'
import { ActionNeeded } from '@/components/ops/ActionNeeded'
import { ArrivalsTable } from '@/components/ops/ArrivalsTable'
import { BaggageTimeline, TimelineLegend } from '@/components/ops/BaggageTimeline'
import { LineDrawer, type LineDrawerTarget } from '@/components/ops/LineDrawer'
import { resolveFocus } from '@/components/ops/lineDetailData'
import { Button } from '@/components/ui/button'
import {
  actionItems,
  actionItemsPeak,
  demo,
  flights,
  getFlight,
  lines,
  nextPrediction,
  opsFigureRow,
  type Flight,
  type LineId,
  type Ymdhm,
} from '@/design/mock'
import { SHEET_STICKY_TOP, Specimen } from '@/design/SheetSection'

/** 50분 초과 예측: 아직 도착 전(KE082, 노랑 칸) ↔ 이미 완료(OZ574, 노랑을 지우고 실제·오차) */
const OVER_THRESHOLD_PAIR = ['KE082', 'OZ574'].map((id) => getFlight(id)).filter((f): f is Flight => Boolean(f))

/**
 * 운영 현황 — 실제 화면 순서대로 조립한 미니 화면(본문 폭 그대로).
 * 제목 줄(제목 · 숫자 줄 · 시각 제어) → 조치 필요 → 수취대 타임라인 → 도착편 표 → 확장 범위(수취장 평면도).
 *
 * 첫 화면 확인 기준(DESIGN.md 개요): 1440×900·1280×800 에서 상단 바 · 조치 필요(최대 3행) · 타임라인 10행이 스크롤 없이.
 * 그래서 제목 줄 → 조치 필요 → 타임라인 사이는 선 없이 여백만 좁게(8 · 16px, 타임라인 제목 → 축 6px) 두고,
 * 조치 필요 3행일 때 제목 줄 위 끝 ~ 타임라인 아래 끝이 590px(상단 바 52 + 본문 안쪽 여백 24 제외)이 되게 한다:
 * 제목 줄 46 + 8 + 조치 필요 145(3행) + 16 + 타임라인 제목 21 + 6 + 축 20 + 라인 10행 328(두 단 행 하나 포함) = 590.
 * (마스코트 그림 위 2칸이 비어 있어 제목 줄과 조치 필요 사이는 눈으로 12px 남짓 떨어져 보인다.)
 * 그 아래(도착편 표, 확장 범위)는 섹션 사이 규칙대로 여백 32px + hairline.
 *
 * 타임라인·표·조치 필요 목록·확장 범위 평면도에서 라인을 고르면 라인 상세 서랍(480px)이 실제로 열린다.
 * 도착편 표 기본 범위는 ETA 가 지금 −1시간 ~ +3시간인 편, "전체 보기"는 목업의 모든 편(앞쪽 완료 3편 포함).
 * 그 아래에 같은 부품의 다른 상태(조치 필요 5편·0편, 50분 초과 편의 완료 전후, 시각 지정, 표 첫 로딩·빈 상태·오류)를 따로 놓는다.
 */
export function OpsSection() {
  const [selectedFlightId, setSelectedFlightId] = useState<string | null>('UA892')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [drawerTarget, setDrawerTarget] = useState<LineDrawerTarget | null>(null)
  const [showAllFlights, setShowAllFlights] = useState(false)
  // 시각 제어: null = 실시간. 아래 견본은 시각 지정 상태로 시작한다
  const [pinnedAt, setPinnedAt] = useState<Ymdhm | null>(null)
  const [pinnedSample, setPinnedSample] = useState<Ymdhm | null>(demo.now)

  const openLine = (lineId: LineId, flightId?: string) => {
    // 막대·행이면 그 편을, 라인 이름이면 서랍에 보일 편(조치 필요 편 또는 다음 편)을 선택한다
    setSelectedFlightId(flightId ?? resolveFocus(lineId)?.id ?? null)
    setDrawerTarget({ lineId, flightId: flightId ?? null })
    setDrawerOpen(true)
  }

  const tableFlights = showAllFlights
    ? flights
    : flights.filter((f) => f.eta >= demo.windowStart && f.eta <= demo.windowEnd)

  return (
    <>
      <Specimen name="운영 현황 · 화면 순서 (제목 줄 → 조치 필요 → 수취대 타임라인 → 도착편 → 확장 범위)">
        <div>
          <ScreenTitleRow title="운영 현황" figures={opsFigureRow}>
            <TimeControl value={pinnedAt} onChange={setPinnedAt} now={demo.now} />
          </ScreenTitleRow>

          <ActionNeeded
            className="mt-2"
            items={actionItems}
            now={demo.now}
            nextPrediction={nextPrediction}
            onOpenLine={openLine}
          />

          <section aria-label="수취대 타임라인" className="mt-4">
            <div className="flex items-baseline justify-between gap-6">
              <h4 className="type-section-title text-ink">수취대 타임라인</h4>
              <TimelineLegend />
            </div>
            <div className="mt-1.5">
              <BaggageTimeline
                lines={lines}
                flights={flights}
                start={demo.windowStart}
                end={demo.windowEnd}
                now={demo.now}
                selectedFlightId={selectedFlightId}
                onOpenLine={openLine}
              />
            </div>
          </section>

          <section aria-label="도착편" className="mt-8 border-t border-hairline pt-8">
            <div className="flex h-[30px] items-center justify-between">
              <h4 className="type-section-title text-ink">도착편</h4>
              <Button variant="ghost" className="-mr-2.5" onClick={() => setShowAllFlights((v) => !v)}>
                {showAllFlights ? '기본 범위로' : '전체 보기'}
              </Button>
            </div>
            <div className="mt-2">
              <ArrivalsTable
                flights={tableFlights}
                selectedFlightId={selectedFlightId}
                onOpenLine={openLine}
                stickyTop={SHEET_STICKY_TOP}
              />
            </div>
          </section>

          {/* 확장 범위 — 운영 판단용이 아니라 "한 라인으로 학습 → 같은 구조로 수취장 전체로" 시스템 범위를 보이는 그림 */}
          <section aria-label="확장 범위" className="mt-8 border-t border-hairline pt-8">
            <h4 className="type-section-title text-ink">확장 범위</h4>
            {/* 범례 한 줄("학습 1 · 표시 10 · 확장 대상 27 …")은 평면도가 함께 그린다.
                표시 라인 고리도 서랍을 여는 곳이라, 열린 서랍을 닫지 않도록 표시를 붙인다 */}
            <div className="mt-3" data-line-trigger="">
              <CarouselMap
                lines={lines}
                selected={drawerOpen ? drawerTarget?.lineId : null}
                onSelect={(id) => openLine(id)}
              />
            </div>
          </section>
        </div>
      </Specimen>

      <Specimen name="조치 필요 · 5편 (목록 3행 + 외 2편)">
        <ActionNeeded items={actionItemsPeak} now={demo.now} nextPrediction={nextPrediction} />
      </Specimen>

      <Specimen name="조치 필요 · 0편">
        <ActionNeeded items={[]} now={demo.now} nextPrediction={nextPrediction} />
      </Specimen>

      <Specimen name="도착편 표 · 50분 초과 예측과 완료된 편">
        <ArrivalsTable flights={OVER_THRESHOLD_PAIR} stickyTop={SHEET_STICKY_TOP} />
      </Specimen>

      <Specimen name="시각 제어 · 시각 지정">
        <TimeControl value={pinnedSample} onChange={setPinnedSample} now={demo.now} />
      </Specimen>

      <Specimen name="도착편 표 · 첫 로딩">
        <ArrivalsTable flights={[]} state="loading" stickyTop={SHEET_STICKY_TOP} />
      </Specimen>
      <Specimen name="도착편 표 · 빈 상태">
        <ArrivalsTable flights={[]} state="empty" stickyTop={SHEET_STICKY_TOP} />
      </Specimen>
      <Specimen name="도착편 표 · 오류">
        <ArrivalsTable flights={[]} state="error" onRetry={() => undefined} stickyTop={SHEET_STICKY_TOP} />
      </Specimen>

      <LineDrawer open={drawerOpen} target={drawerTarget} onOpenChange={setDrawerOpen} />
    </>
  )
}
