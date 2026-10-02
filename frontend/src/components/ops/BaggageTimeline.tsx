import { Fragment, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react'

import { ChartLegend } from '@/components/app/ChartLegend'
import { StatusText } from '@/components/app/StatusText'
import { LineTrigger } from '@/components/ops/LineTrigger'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import type { Flight, Line, LineId, Terminal, Ymdhm } from '@/design/mock'
import { cn } from '@/lib/cn'
import {
  addMinutes,
  diffMinutes,
  FLIGHT_STATUS_LABEL,
  fmtClock,
  fmtSignedMinutes,
  lineStatus,
  pendingPredictionLabel,
} from '@/lib/format'

/**
 * 수취대 타임라인 — 운영 현황의 주인공. 조치 필요 바로 아래, 본문 전폭.
 * - 행 = 라인(스크롤 없이), 행 높이 32px. 왼쪽 라인 이름(mono, 누르면 서랍) + 라인 상태.
 *   행 구분선은 쓰지 않는다. T1 과 T2 사이는 8px 간격 + 구역 이름(label ink-subtle). 첫 구역 이름은 축 줄 왼쪽 칸에.
 * - x축 = 지금 −1시간 ~ +3시간, 30분 눈금(hairline 50% — 막대보다 약하게), 축 글자 caption ink-subtle. 축 줄 20px.
 * - 막대 20px, 둥글기 4px, 안에 편명 mono-sm. 완료 / 처리 중 / 도착 예정(점선) / 50분 초과(signal).
 *   편명은 ink 로 또렷하게(완료 막대만 ink-subtle). 선택한 편은 primary 2px 바깥 테두리만 더한다.
 *   누를 수 있는 영역은 막대가 아니라 행 높이 전체(32px)로 잡는다.
 * - 선택한 편(또는 서랍에 연 라인)이 있는 행은 라인 이름을 ink 600 으로 강조한다.
 * - 한 라인에서 시간이 겹치면 두 단(막대 14px × 2, 행 40px, 단마다 누르는 영역 20px). 셋째 단부터는 "+1".
 * - 막대가 편명보다 좁으면(최소 48px) 편명을 막대 오른쪽 바깥에 쓴다
 *   (같은 단의 다음 막대나 오른쪽 끝에 막혀 자리가 없으면 왼쪽 바깥, 양쪽 다 막히면 쓰지 않고 툴팁·화면 읽기로만).
 * - 범위 밖으로 이어지는 막대는 잘린 쪽 모서리를 각지게 두고 테두리를 지운다.
 * - 지금 선: ink 1px 세로선, 위에 시각 caption.
 * - showLabels={false}: 라인 이름 칸 없이 막대 줄만 — 라인 상세 서랍의 "같은 수취대 상황"(한 행 조각).
 */
export interface BaggageTimelineProps {
  lines: Line[]
  flights: Flight[]
  start: Ymdhm
  end: Ymdhm
  now: Ymdhm
  /** 눈금 간격 (분) */
  tickMinutes?: number
  selectedFlightId?: string | null
  /** 서랍에 연 라인 — 그 행의 라인 이름을 강조한다 (선택한 편이 범위 밖이어도) */
  selectedLineId?: LineId | null
  /** 라인 이름·막대를 누르면 (막대면 그 편 id 도 함께) */
  onOpenLine?: (lineId: LineId, flightId?: string) => void
  /** 왼쪽 라인 이름·상태 칸 (기본 true). 서랍 안 한 행 조각에서는 끈다 */
  showLabels?: boolean
}

/** 라인 이름 + 상태 칸 폭 */
const LABEL_COL_PX = 152
/** JetBrains Mono 12px 한 글자 폭 (0.6em) */
const MONO_SM_CHAR_PX = 7.2
/** 막대 안 좌우 여백(6px × 2) + 테두리(1px × 2) */
const BAR_INSET_PX = 14
/** 이보다 좁은 막대는 편명을 바깥에 쓴다 */
const MIN_LABEL_BAR_PX = 48
/** 지금 시각 글자와 겹치는 눈금 글자는 숨긴다 (분) */
const NOW_LABEL_CLEARANCE_MIN = 15

export function BaggageTimeline({
  lines,
  flights,
  start,
  end,
  now,
  tickMinutes = 30,
  selectedFlightId = null,
  selectedLineId = null,
  onOpenLine,
  showLabels = true,
}: BaggageTimelineProps) {
  const [trackRef, trackWidth] = useElementWidth<HTMLDivElement>()
  const labelCol = showLabels ? LABEL_COL_PX : 0
  const span = diffMinutes(end, start)
  const pct = (t: Ymdhm) => (diffMinutes(t, start) / span) * 100
  const ticks = Array.from({ length: Math.floor(span / tickMinutes) + 1 }, (_, i) => addMinutes(start, i * tickMinutes))
  const lastTick = ticks.length - 1
  const nowVisible = now >= start && now <= end
  const zones = groupByTerminal(lines)

  return (
    <div className="relative type-body-sm">
      {/* 30분 눈금 — 막대 뒤. hairline 50%: 막대·지금 선보다 약하게 */}
      <div aria-hidden className="pointer-events-none absolute top-5 right-0 bottom-0" style={{ left: labelCol }}>
        {ticks.map((t, i) => (
          <span
            key={t}
            className={cn('absolute inset-y-0 w-px bg-hairline/50', i === lastTick && '-translate-x-full')}
            style={{ left: `${pct(t)}%` }}
          />
        ))}
      </div>

      <div
        className="grid"
        style={{ gridTemplateColumns: showLabels ? `${LABEL_COL_PX}px minmax(0, 1fr)` : 'minmax(0, 1fr)' }}
      >
        {/* 축 — 왼쪽 칸에 첫 구역 이름 */}
        {showLabels && (
          <div aria-hidden className="h-5 type-label text-ink-subtle">
            {zones.length > 1 ? zones[0].terminal : null}
          </div>
        )}
        <div ref={trackRef} aria-hidden className="relative h-5">
          {ticks.map((t, i) =>
            nowVisible && Math.abs(diffMinutes(t, now)) < NOW_LABEL_CLEARANCE_MIN ? null : (
              <span
                key={t}
                className={cn(
                  'absolute top-0 type-caption whitespace-nowrap text-ink-subtle tabular-nums',
                  i === 0 ? '' : i === lastTick ? '-translate-x-full' : '-translate-x-1/2',
                )}
                style={{ left: `${pct(t)}%` }}
              >
                {fmtClock(t)}
              </span>
            ),
          )}
        </div>

        {zones.map((zone, zi) => (
          <Fragment key={zone.terminal}>
            {/* T1 과 T2 사이: 8px 간격 + 구역 이름 (label ink-subtle). 이름 줄 아래 끝이 다음 행에 붙는다 */}
            {zi > 0 &&
              (showLabels ? (
                <div aria-hidden className="col-span-2 flex h-6 items-end type-label text-ink-subtle">
                  {zone.terminal}
                </div>
              ) : (
                <div aria-hidden className="h-2" />
              ))}
            {zone.lines.map((line) => (
              <TimelineRow
                key={line.id}
                line={line}
                flights={flights.filter((f) => f.lineId === line.id && f.bar.end > start && f.bar.start < end)}
                start={start}
                end={end}
                pct={pct}
                trackWidth={trackWidth}
                selectedFlightId={selectedFlightId}
                selectedLineId={selectedLineId}
                onOpenLine={onOpenLine}
                showLabel={showLabels}
              />
            ))}
          </Fragment>
        ))}
      </div>

      {/* 지금 선 — 막대 위 */}
      {nowVisible && (
        <div aria-hidden className="pointer-events-none absolute inset-y-0 right-0" style={{ left: labelCol }}>
          <span
            className="absolute top-0 -translate-x-1/2 type-caption whitespace-nowrap text-ink tabular-nums"
            style={{ left: `${pct(now)}%` }}
          >
            {fmtClock(now)}
          </span>
          <span className="absolute top-[18px] bottom-0 w-px bg-ink" style={{ left: `${pct(now)}%` }} />
        </div>
      )}
    </div>
  )
}

/* ───────────── 구역 ───────────── */

/** 이어진 같은 터미널 라인끼리 묶는다 (T1 … / T2 …) */
function groupByTerminal(lines: Line[]): Array<{ terminal: Terminal; lines: Line[] }> {
  const zones: Array<{ terminal: Terminal; lines: Line[] }> = []
  for (const line of lines) {
    const last = zones[zones.length - 1]
    if (last && last.terminal === line.terminal) last.lines.push(line)
    else zones.push({ terminal: line.terminal, lines: [line] })
  }
  return zones
}

/* ───────────── 행 ───────────── */

interface RowProps {
  line: Line
  flights: Flight[]
  start: Ymdhm
  end: Ymdhm
  pct: (t: Ymdhm) => number
  trackWidth: number
  selectedFlightId: string | null
  selectedLineId: LineId | null
  onOpenLine?: (lineId: LineId, flightId?: string) => void
  showLabel: boolean
}

function TimelineRow({
  line,
  flights,
  start,
  end,
  pct,
  trackWidth,
  selectedFlightId,
  selectedLineId,
  onOpenLine,
  showLabel,
}: RowProps) {
  const twoLane = line.lanes >= 2
  const height = twoLane ? 'h-10' : 'h-8'
  const shown = flights.filter((f) => f.bar.lane < 2)
  const overflow = flights.filter((f) => f.bar.lane >= 2).sort((a, b) => a.bar.start.localeCompare(b.bar.start))
  // 선택한 막대가 이 행에 있거나 이 라인의 서랍이 열려 있으면 라인 이름을 강조한다
  const emphasized = line.id === selectedLineId || flights.some((f) => f.id === selectedFlightId)
  const nameClass = cn('w-12 shrink-0 text-ink', emphasized && 'font-semibold')

  return (
    <>
      {showLabel && (
        <div className={cn('flex items-center pr-4', height)}>
          <div className="flex min-w-0 items-baseline gap-3">
            {onOpenLine ? (
              <LineTrigger lineId={line.id} onOpen={(id) => onOpenLine(id)} className={cn(nameClass, 'text-left')} />
            ) : (
              <span className={cn(nameClass, 'font-mono')}>{line.id}</span>
            )}
            <StatusText status={lineStatus(line.status)} alignLabel />
          </div>
        </div>
      )}

      <div role="group" aria-label={`${line.id} 도착편`} className={cn('relative', height)}>
        {shown.map((f) => (
          <TimelineBar
            key={f.id}
            flight={f}
            {...laneNeighbors(shown, f)}
            start={start}
            end={end}
            pct={pct}
            trackWidth={trackWidth}
            twoLane={twoLane}
            selected={f.id === selectedFlightId}
            onOpenLine={onOpenLine}
          />
        ))}
        {overflow.length > 0 && (
          <span
            className="pointer-events-none absolute top-[22px] flex h-3.5 items-center bg-surface-1 px-1 type-caption leading-none text-ink-subtle tabular-nums"
            style={{ left: `${pct(overflow[0].bar.start < start ? start : overflow[0].bar.start)}%` }}
          >
            +{overflow.length}
          </span>
        )}
      </div>
    </>
  )
}

/** 같은 단에서 바로 앞 막대의 끝 · 바로 뒤 막대의 시작 — 바깥 편명이 이웃 막대를 덮지 않게 */
function laneNeighbors(shown: Flight[], f: Flight): { prevEnd: Ymdhm | null; nextStart: Ymdhm | null } {
  const sameLane = shown.filter((o) => o.id !== f.id && o.bar.lane === f.bar.lane)
  const before = sameLane.filter((o) => o.bar.start < f.bar.start).sort((a, b) => b.bar.end.localeCompare(a.bar.end))[0]
  const after = sameLane.filter((o) => o.bar.start >= f.bar.start).sort((a, b) => a.bar.start.localeCompare(b.bar.start))[0]
  return { prevEnd: before?.bar.end ?? null, nextStart: after?.bar.start ?? null }
}

/* ───────────── 막대 ───────────── */

type BarKind = 'completed' | 'processing' | 'scheduled' | 'action'

function barKind(f: Flight): BarKind {
  if (f.needsAction) return 'action'
  if (f.status === 'completed') return 'completed'
  if (f.status === 'processing') return 'processing'
  return 'scheduled' // 도착 예정·착륙 — 예측(또는 보통 처리 시간) 막대
}

/** 막대 4종 — 범례(TimelineLegend)와 같은 모양. 편명은 ink(노랑 위는 on-signal), 완료만 ink-subtle */
const BAR_CLASS: Record<BarKind, string> = {
  completed: 'bg-surface-3 text-ink-subtle',
  processing: 'border border-ink bg-surface-1 text-ink',
  scheduled: 'border border-dashed border-hairline-strong bg-surface-1 text-ink',
  action: 'bg-signal text-on-signal',
}

/** 막대 바깥에 쓰는 편명 색 — 완료 막대만 ink-subtle */
const OUTSIDE_LABEL_CLASS: Record<BarKind, string> = {
  completed: 'text-ink-subtle',
  processing: 'text-ink',
  scheduled: 'text-ink',
  action: 'text-ink',
}

/**
 * 누르는 영역(hit)과 그리는 막대(bar)의 세로 위치.
 * 한 단: 행 32px 전체를 누르고, 막대 20px 은 가운데(위 6px).
 * 두 단(행 40px): 단마다 20px 를 누르고, 막대 14px 은 위 4px · 아래 4px · 사이 4px 로 놓는다.
 */
const LANE_BOX = {
  single: { hit: 'inset-y-0', bar: 'top-1.5 h-5' },
  upper: { hit: 'top-0 h-5', bar: 'top-1 h-3.5' },
  lower: { hit: 'top-5 h-5', bar: 'top-0.5 h-3.5' },
} as const

interface BarProps {
  flight: Flight
  start: Ymdhm
  end: Ymdhm
  pct: (t: Ymdhm) => number
  trackWidth: number
  twoLane: boolean
  selected: boolean
  onOpenLine?: (lineId: LineId, flightId?: string) => void
  /** 같은 단의 바로 앞 막대 끝 · 바로 뒤 막대 시작 (없으면 null) */
  prevEnd: Ymdhm | null
  nextStart: Ymdhm | null
}

function TimelineBar({
  flight,
  start,
  end,
  pct,
  trackWidth,
  twoLane,
  selected,
  onOpenLine,
  prevEnd,
  nextStart,
}: BarProps) {
  const clipStart = flight.bar.start < start
  const clipEnd = flight.bar.end > end
  const left = pct(clipStart ? start : flight.bar.start)
  const right = pct(clipEnd ? end : flight.bar.end)
  const width = right - left

  const widthPx = (width / 100) * trackWidth
  const labelPx = flight.id.length * MONO_SM_CHAR_PX
  // 재기 전(첫 그리기)에는 안쪽에 둔다
  const inside = trackWidth === 0 || widthPx >= Math.max(MIN_LABEL_BAR_PX, labelPx + BAR_INSET_PX)
  // 바깥 편명 자리: 오른쪽(다음 막대 또는 끝까지) → 왼쪽(앞 막대 또는 처음까지) → 둘 다 막히면 쓰지 않는다
  const px = (t: Ymdhm) => (pct(t) / 100) * trackWidth
  const roomOnRight = (nextStart && nextStart < end ? px(nextStart) : trackWidth) - (right / 100) * trackWidth
  const roomOnLeft = (left / 100) * trackWidth - (prevEnd && prevEnd > start ? px(prevEnd) : 0)
  const need = labelPx + 4
  const outside = roomOnRight >= need ? 'right' : roomOnLeft >= need ? 'left' : null

  const kind = barKind(flight)
  const box = twoLane ? (flight.bar.lane === 0 ? LANE_BOX.upper : LANE_BOX.lower) : LANE_BOX.single

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        {/* 버튼 = 누르는 영역(막대 폭 × 행 높이). 포커스 링은 버튼 대신 그리는 막대에 둘러 선택 테두리와 같은 자리에 보인다 */}
        <button
          type="button"
          data-line-trigger=""
          aria-label={barAriaLabel(flight)}
          onClick={onOpenLine ? () => onOpenLine(flight.lineId, flight.id) : undefined}
          className={cn('group absolute outline-none', box.hit, onOpenLine ? 'cursor-pointer' : 'cursor-default')}
          style={{ left: `${left}%`, width: `${width}%` }}
        >
          <span
            className={cn(
              'absolute inset-x-0 flex items-center rounded-xs px-1.5 type-mono-sm leading-none whitespace-nowrap',
              box.bar,
              BAR_CLASS[kind],
              clipStart && 'rounded-l-none border-l-0',
              clipEnd && 'rounded-r-none border-r-0',
              selected && 'outline-2 outline-offset-1 outline-primary',
              'group-focus-visible:outline-2 group-focus-visible:outline-offset-2 group-focus-visible:outline-primary',
            )}
          >
            {inside ? (
              <span className="overflow-clip">{flight.id}</span>
            ) : outside ? (
              <span
                className={cn(
                  'absolute top-1/2 -translate-y-1/2',
                  OUTSIDE_LABEL_CLASS[kind],
                  outside === 'right' ? 'left-full ml-1' : 'right-full mr-1',
                )}
              >
                {flight.id}
              </span>
            ) : null}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">{barTooltip(flight)}</TooltipContent>
    </Tooltip>
  )
}

function barAriaLabel(f: Flight): string {
  const parts = [`${f.id} ${FLIGHT_STATUS_LABEL[f.status]}`, `ETA ${fmtClock(f.eta)}`]
  if (f.actual) parts.push(`실제 ${f.actual.minutes}분`)
  else if (f.prediction) parts.push(`예측 ${f.prediction.minutes}분`)
  else parts.push(`예측 ${fmtClock(f.predictionIssueAt)} 발행`)
  return parts.join(', ')
}

function barTooltip(f: Flight): ReactNode {
  const timing = f.landing ? (
    <>
      ETA {fmtClock(f.eta)} → 착륙 {fmtClock(f.landing)}
    </>
  ) : (
    <>
      ETA {fmtClock(f.eta)}
      {f.delayMin > 0 && <> {fmtSignedMinutes(f.delayMin)}</>}
    </>
  )
  const result = f.actual
    ? `예측 ${f.prediction?.minutes ?? '-'}분, 실제 ${f.actual.minutes}분`
    : f.prediction
      ? `예측 ${f.prediction.minutes}분`
      : pendingPredictionLabel(f.predictionIssueAt)

  // 한 줄에 가운뎃점은 하나까지 — 편명·출발지·기종은 간격으로, 상태 앞에만 점
  return (
    <span className="flex flex-col tabular-nums">
      <span>
        <span className="font-mono">{f.id}</span> {f.origin.name} <span className="font-mono">{f.aircraft}</span> ·{' '}
        {FLIGHT_STATUS_LABEL[f.status]}
      </span>
      <span className="text-ink-muted">
        {timing} · {result}
      </span>
    </span>
  )
}

/* ───────────── 범례 ───────────── */

const LEGEND: Array<{ kind: BarKind; label: string }> = [
  { kind: 'completed', label: '완료' },
  { kind: 'processing', label: '처리 중' },
  { kind: 'scheduled', label: '도착 예정' },
  { kind: 'action', label: '50분 초과' },
]

/** 타임라인 범례 — 상자 없이 글자와 작은 막대 견본만 (공용 ChartLegend) */
export function TimelineLegend({ className }: { className?: string }) {
  return (
    <ChartLegend
      className={className}
      items={LEGEND.map(({ kind, label }) => ({
        label,
        mark: <span aria-hidden className={cn('h-3 w-5 rounded-xs', BAR_CLASS[kind])} />,
      }))}
    />
  )
}

/* ───────────── 폭 재기 ───────────── */

/** 요소 폭(px). 첫 그리기 전에 한 번 재고, 그 뒤로는 ResizeObserver 로 따라간다 */
function useElementWidth<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setWidth(el.getBoundingClientRect().width)
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (entry) setWidth(entry.contentRect.width)
    })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])
  return [ref, width]
}
