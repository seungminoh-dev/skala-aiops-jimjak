import { useState } from 'react'

import { EmptyState } from '@/components/app/EmptyState'
import { SignalCell } from '@/components/app/SignalCell'
import { FlapBoard } from '@/components/graphics/FlapBoard'
import { MascotPose } from '@/components/mascot/Mascot'
import { ActionDeadline, ActionGuide } from '@/components/ops/ActionText'
import { LineTrigger } from '@/components/ops/LineTrigger'
import { Button } from '@/components/ui/button'
import type { ActionItem, LineId, Ymdhm } from '@/design/mock'
import { cn } from '@/lib/cn'
import { ACTION_THRESHOLD_MIN, fmtClock, fmtSigned, fmtUntil, NumUnit } from '@/lib/format'

/**
 * 조치 필요 — 운영 현황 제목 줄 바로 아래.
 *
 * 왼쪽: section-title "조치 필요" · 숫자판 두 자리 + "편"(body ink-subtle) · 마스코트(칸 1px, 40px).
 *   마스코트는 숫자판보다 작게 두어 시선이 "몇 편 → 어떤 편 → 언제까지"로 이어지게 한다.
 *   0편이면 서 있는 자세, 1편 이상이면 가방을 잡으러 숙인 자세. 숫자판은 화면 전체에서 이 한 곳만.
 * 오른쪽: 목록 최대 3행. 넘으면 왼쪽 아래 고스트 버튼 "외 2편"(누르면 모두 펼침 ↔ 접기).
 *   첫 화면에 상단 바 · 조치 필요(3행) · 타임라인 10행이 스크롤 없이 함께 들어와야 해서(DESIGN.md "확인 기준"),
 *   목록을 숫자판 아래가 아니라 옆에 둔다 — 덩어리 높이 = 목록 높이(3행 145px).
 *   오른쪽 끝은 본문 내용 폭 끝(타임라인 오른쪽 끝과 같은 기준선).
 * 행: 흰 바탕, 48px, 행 구분 hairline, 둥글기·왼쪽 색 막대·연한 바탕 없음.
 * 읽는 순서(DESIGN.md "조치 필요 목록"):
 *   예측 처리 시간(signal-cell 15px 600) → 편명·라인(14px 500 ink) → 마감 "10:38까지"(14px 500 ink)
 *   → 조치 문구(13px ink-muted) → 계산 기준 "(착륙 30분 전 기준)"(12px ink-subtle, 조치 문구 아래 둘째 줄).
 *   기준 대비 "+7분"과 착륙 예정 "11:08 착륙 38분 후"는 그 사이에 낮은 위계(13px ink-muted / 12px ink-subtle)로 둔다.
 *   한 줄에 가운뎃점은 조치 문구의 낱말 나열 하나뿐이고, 칸 사이는 간격으로 나눈다.
 * 0편: 목록 자리에 한 줄 "1시간 안에 조치가 필요한 편은 없습니다 · 다음 예측 10:38 OZ107".
 */
export interface ActionNeededProps {
  items: ActionItem[]
  now: Ymdhm
  /** 0편일 때 한 줄: "다음 예측 10:38 OZ107" */
  nextPrediction: { at: Ymdhm; flightId: string }
  onOpenLine?: (lineId: LineId, flightId?: string) => void
  /** 접은 상태에서 보일 행 수 (기본 3) */
  maxRows?: number
  /** 제목 요소 (시트 안 위계에 맞춘다) */
  headingLevel?: 'h3' | 'h4'
  className?: string
}

export function ActionNeeded({
  items,
  now,
  nextPrediction,
  onOpenLine,
  maxRows = 3,
  headingLevel = 'h4',
  className,
}: ActionNeededProps) {
  const Heading = headingLevel
  const [expanded, setExpanded] = useState(false)
  const overflow = Math.max(0, items.length - maxRows)
  const shown = expanded ? items : items.slice(0, maxRows)
  const alert = items.length > 0

  return (
    <section aria-label="조치 필요" className={cn('flex items-start gap-10', className)}>
      <div className="flex shrink-0 flex-col items-start gap-2">
        <div className="flex items-end gap-3">
          <div className="flex items-baseline gap-4">
            <Heading className="type-section-title text-ink">조치 필요</Heading>
            <span className="inline-flex items-baseline gap-1.5">
              <FlapBoard value={items.length} />
              <span aria-hidden className="type-body text-ink-subtle">
                편
              </span>
            </span>
          </div>
          {/* 그림 아래 빈 칸(숙인 자세 1칸, 선 자세 2칸)만큼 내려 발끝을 숫자판 아래 끝에 맞춘다 */}
          <MascotPose size="sm" alert={alert} className={alert ? '-mb-px' : '-mb-0.5'} />
        </div>
        {overflow > 0 && (
          <Button
            variant="ghost"
            className="-ml-2.5"
            aria-expanded={expanded}
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? '접기' : `외 ${overflow}편`}
          </Button>
        )}
      </div>

      <div className="min-w-0 flex-1">
        {items.length > 0 ? (
          <ul className="border-t border-hairline">
            {shown.map((item) => (
              <ActionRow key={item.flightId} item={item} now={now} onOpenLine={onOpenLine} />
            ))}
          </ul>
        ) : (
          // 목록 행과 같은 48px 한 줄
          <div className="flex h-12 items-center border-y border-hairline">
            <EmptyState className="py-0">
              1시간 안에 조치가 필요한 편은 없습니다 · 다음 예측{' '}
              <span className="tabular-nums">{fmtClock(nextPrediction.at)}</span>{' '}
              <span className="font-mono">{nextPrediction.flightId}</span>
            </EmptyState>
          </div>
        )}
      </div>
    </section>
  )
}

/**
 * 열 폭: 노랑 칸 72 · 기준 대비 40 · 편명·라인 112 · 착륙 예정 120 · 마감 104 · 조치(남는 폭).
 * 칸끼리는 첫 줄 기준선으로 맞춘다 (조치 칸만 둘째 줄이 있다).
 */
const ROW_GRID = 'grid w-full grid-cols-[72px_40px_112px_120px_104px_minmax(0,1fr)] items-baseline gap-x-4'

function ActionRow({
  item,
  now,
  onOpenLine,
}: {
  item: ActionItem
  now: Ymdhm
  onOpenLine?: (lineId: LineId, flightId?: string) => void
}) {
  const open = onOpenLine ? () => onOpenLine(item.lineId, item.flightId) : undefined
  return (
    <li
      data-line-trigger={open ? '' : undefined}
      onClick={open}
      className={cn(
        'flex h-12 items-center border-b border-hairline',
        open && 'cursor-pointer transition-colors hover:bg-surface-2',
      )}
    >
      <div className={ROW_GRID}>
        {/* 1. 얼마나 — 예측 처리 시간 */}
        <SignalCell value={item.predictedMin} size="lg" />
        <span className="type-body-sm text-ink-muted">
          <span className="sr-only">기준 {ACTION_THRESHOLD_MIN}분 대비 </span>
          <NumUnit value={fmtSigned(item.overMin)} unit="분" unitClassName="text-ink-muted" />
        </span>

        {/* 2. 어떤 편 — 편명·라인 (14px 500 ink) */}
        <span className="flex items-baseline gap-1.5 type-body font-mono font-medium text-ink">
          <span className="w-[52px] shrink-0">{item.flightId}</span>
          {open ? <LineTrigger lineId={item.lineId} onOpen={() => open()} /> : <span>{item.lineId}</span>}
        </span>

        {/* 착륙 예정 — 낮은 위계 */}
        <span className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="type-body-sm text-ink-muted tabular-nums">
            <span className="sr-only">착륙 예정 </span>
            {fmtClock(item.eta)} 착륙
          </span>
          <span className="type-caption text-ink-subtle tabular-nums">{fmtUntil(item.eta, now)}</span>
        </span>

        {/* 3. 언제까지 — 조 이동 마감 (14px 500 ink) → 조치 문구 → 계산 기준 */}
        <ActionDeadline item={item} now={now} className="type-body font-medium text-ink" />
        <ActionGuide item={item} />
      </div>
    </li>
  )
}
