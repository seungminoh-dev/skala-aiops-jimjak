import type { ReactNode } from 'react'

import { ChartLegend } from '@/components/app/ChartLegend'
import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import type { Line, LineId, Terminal } from '@/design/mock'
import { cn } from '@/lib/cn'

/**
 * 수취장 평면도 = 확장 범위 — DESIGN.md "수취장 평면도 = 확장 범위".
 * 메시지는 하나: 지금은 한 라인(T1-07)으로 학습했고, 같은 구조로 수취장 전체로 확장된다.
 * 운영 판단용 그림이 아니라 시스템 범위를 보여 주는 그림이다.
 *
 * - 인천공항 실제 수취대 37개(T1 3~21번 19개, T2 2~19번 18개 — 실제 API 기준)를 위에서 본 경기장 트랙 모양 고리로.
 *   배치는 개념도(실제 위치와 다름). T1·T2 두 구역을 가로로 나란히, 구역마다 뒷벽(hairline-strong 1px)에서
 *   투입구가 내려와 고리 꼭대기에 닿는다.
 * - 세 단계
 *   · 학습 라인(T1-07): ink 1.5px + 위에 "학습 라인"(12px — 한글이라 mono 대신 label: mono 의 넓은 띄어쓰기를 피한다)
 *   · 콘솔 표시 라인(props lines): ink-muted 1.5px, 실제 상태 반영 —
 *     처리 중이면 짐(6×4px, ink-muted)이 벨트를 따라 시계 방향으로 돈다(한 바퀴 12초), 조치 필요면 벨트 면 signal
 *   · 확장 대상(나머지): hairline-strong 1px 점선, 움직임 없음
 *   학습 라인도 lines 에 있으면 표시 라인처럼 상태를 반영하고 누를 수 있다.
 * - 혼잡(busy)은 표시하지 않는다. 선택한 라인은 바깥선만 primary 2px. 표시 라인만 누를 수 있다(onSelect → 라인 상세 서랍).
 * - 범례 한 줄을 위쪽에: "학습 1 · 표시 10 · 확장 대상 27 · 수취대 37개 기준 개념도(실제 위치와 다름)" + 조치 필요·처리 중 표시.
 * - 높이 약 150px(220px 안쪽). 폭은 감싼 곳을 채운다 — 고리 간격만 늘고 고리 크기·선 굵기는 그대로(1:1 픽셀).
 *   1280px 화면(본문 약 1214px)에서 고리 간격 약 31px.
 * - 그림자·그라데이션·원근감 없음. prefers-reduced-motion 이면 짐을 멈춘 위치에 그린다.
 */
export interface CarouselMapProps {
  /** 콘솔 표시 라인 (운영 현황에 나오는 10개) */
  lines: Line[]
  selected?: LineId | null
  onSelect?: (id: LineId) => void
  className?: string
}

/* ───────────────────────── 범위 (실제 API 기준) ───────────────────────── */

/** 터미널별 실제 수취대 번호 범위 */
const CAROUSEL_RANGE: Record<Terminal, readonly [from: number, to: number]> = {
  T1: [3, 21],
  T2: [2, 19],
}
const TERMINALS: Terminal[] = ['T1', 'T2']
/** 시뮬레이션 데이터로 모델을 학습한 라인 */
const TRAINING_LINE = 'T1-07'

/* ───────────────────────── 치수 (px) ───────────────────────── */

/** 고리 바깥선(중심선) 크기 — 세로로 긴 경기장 트랙 */
const RING_W = 24
const RING_H = 64
/** 바깥선 ↔ 안쪽 섬 선 사이 (중심선 기준) = 벨트 면 폭. 짐(4px 폭)이 선에 닿지 않는다 */
const BAND = 7
/** 선 굵기(최대 2px)가 잘리지 않게 */
const PAD = 2
/** 뒷벽에서 고리 꼭대기까지 투입구 길이 · 폭 */
const FEED_H = 8
const FEED_W = 6
/** 고리 그림(svg) 크기 */
const SVG_W = RING_W + PAD * 2
const SVG_H = FEED_H + PAD + RING_H + PAD
/** 구역 이름 줄(mono-sm 12px × 1.4) · 이름 줄과 뒷벽 사이 */
const LABEL_ROW_H = 17
const LABEL_GAP = 6

const LAP_SEC = 12
const BAGS_PER_RING = 3

/* ───────────────────────── 경기장 트랙 모양 ───────────────────────── */

interface Stadium {
  cx: number
  cy: number
  /** 반지름 (= 폭의 절반) */
  r: number
  /** 위·아래 반원 중심 사이 거리의 절반 */
  s: number
}

function stadium(w: number, h: number): Stadium {
  const r = w / 2
  return { cx: SVG_W / 2, cy: FEED_H + PAD + RING_H / 2, r, s: h / 2 - r }
}

/** 위 꼭짓점에서 시작해 시계 방향으로 한 바퀴 도는 닫힌 길 */
function stadiumPath({ cx, cy, r, s }: Stadium): string {
  return [
    `M${cx} ${cy - s - r}`,
    `A${r} ${r} 0 0 1 ${cx + r} ${cy - s}`,
    `L${cx + r} ${cy + s}`,
    `A${r} ${r} 0 0 1 ${cx - r} ${cy + s}`,
    `L${cx - r} ${cy - s}`,
    `A${r} ${r} 0 0 1 ${cx} ${cy - s - r}`,
    'Z',
  ].join(' ')
}

/** 길 위의 점과 진행 방향(도). t 는 0~1, stadiumPath 와 같은 시작점·방향 */
function pointOnStadium({ cx, cy, r, s }: Stadium, t: number): { x: number; y: number; angle: number } {
  const quarter = (Math.PI * r) / 2
  const straight = 2 * s
  const half = Math.PI * r
  const total = 2 * straight + 2 * half
  let d = (((t % 1) + 1) % 1) * total
  const onArc = (ox: number, oy: number, from: number, len: number) => {
    const a = from + len / r
    return { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a), angle: (a * 180) / Math.PI + 90 }
  }
  if (d < quarter) return onArc(cx, cy - s, -Math.PI / 2, d)
  d -= quarter
  if (d < straight) return { x: cx + r, y: cy - s + d, angle: 90 }
  d -= straight
  if (d < half) return onArc(cx, cy + s, 0, d)
  d -= half
  if (d < straight) return { x: cx - r, y: cy + s - d, angle: -90 }
  d -= straight
  return onArc(cx, cy - s, Math.PI, d)
}

const OUTER = stadium(RING_W, RING_H)
const INNER = stadium(RING_W - BAND * 2, RING_H - BAND * 2)
const TRACK = stadium(RING_W - BAND, RING_H - BAND)
const OUTER_PATH = stadiumPath(OUTER)
const INNER_PATH = stadiumPath(INNER)
const TRACK_PATH = stadiumPath(TRACK)

/* ───────────────────────── 배치 ───────────────────────── */

type Tier = 'training' | 'displayed' | 'expansion'

interface Slot {
  /** "T1-07" */
  id: string
  carousel: number
  /** 콘솔 표시 라인이면 그 라인 */
  line: Line | null
  training: boolean
}

interface Zone {
  terminal: Terminal
  slots: Slot[]
}

const pad2 = (n: number) => String(n).padStart(2, '0')

/** 터미널마다 실제 범위의 수취대 + (범위 밖 번호가 lines 에 있으면 그것도) 번호 순으로 */
function buildZones(lines: Line[]): Zone[] {
  return TERMINALS.map((terminal) => {
    const own = lines.filter((l) => l.terminal === terminal)
    const [from, to] = CAROUSEL_RANGE[terminal]
    const numbers = new Set<number>()
    for (let n = from; n <= to; n++) numbers.add(n)
    own.forEach((l) => numbers.add(l.carousel))
    const slots = [...numbers]
      .sort((a, b) => a - b)
      .map((carousel): Slot => {
        const line = own.find((l) => l.carousel === carousel) ?? null
        const id = line?.id ?? `${terminal}-${pad2(carousel)}`
        return { id, carousel, line, training: id === TRAINING_LINE }
      })
    return { terminal, slots }
  })
}

function tierOf(slot: Slot): Tier {
  if (slot.training) return 'training'
  return slot.line ? 'displayed' : 'expansion'
}

interface Counts {
  training: number
  displayed: number
  expansion: number
  total: number
}

function countSlots(zones: Zone[]): Counts {
  const all = zones.flatMap((z) => z.slots)
  return {
    training: all.filter((s) => s.training).length,
    displayed: all.filter((s) => s.line).length,
    expansion: all.filter((s) => !s.line && !s.training).length,
    total: all.length,
  }
}

/* ───────────────────────── 그림 ───────────────────────── */

export function CarouselMap({ lines, selected = null, onSelect, className }: CarouselMapProps) {
  const reduced = useReducedMotion()
  const zones = buildZones(lines)
  const counts = countSlots(zones)

  return (
    <div role="group" aria-label="수취장 평면도" className={cn('flex w-full min-w-0 flex-col gap-3', className)}>
      <MapLegend counts={counts} />

      <div className="flex min-w-0 gap-10">
        {zones.map((zone) => (
          <div key={zone.terminal} className="flex min-w-0 flex-col" style={{ flex: `${zone.slots.length} 1 0` }}>
            <div className="type-mono-sm text-ink-subtle" style={{ height: LABEL_ROW_H, marginBottom: LABEL_GAP }}>
              {zone.terminal}
            </div>
            {/* 뒷벽 = 윗선 */}
            <ul className="flex min-w-0 border-t border-hairline-strong">
              {zone.slots.map((slot) => (
                <SlotView
                  key={slot.id}
                  slot={slot}
                  selected={slot.line !== null && slot.line.id === selected}
                  reduced={reduced}
                  onSelect={onSelect}
                />
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}

/** 스크린 리더용 (", 학습 라인, 조치 필요, 처리 중") */
function statusText(slot: Slot): string {
  const parts: string[] = []
  if (slot.training) parts.push('학습 라인')
  if (slot.line?.status === 'critical') parts.push('조치 필요')
  if (slot.line && slot.line.processingFlightIds.length > 0) parts.push('처리 중')
  return parts.map((p) => `, ${p}`).join('')
}

function SlotView({
  slot,
  selected,
  reduced,
  onSelect,
}: {
  slot: Slot
  selected: boolean
  reduced: boolean
  onSelect?: (id: LineId) => void
}) {
  const tier = tierOf(slot)
  const { line } = slot
  const interactive = Boolean(onSelect && line)

  const content = (
    <>
      <Ring
        tier={tier}
        critical={line?.status === 'critical'}
        processing={Boolean(line && line.processingFlightIds.length > 0)}
        selected={selected}
        reduced={reduced}
        interactive={interactive}
      />
      <span
        aria-hidden
        className={cn(
          'mt-1 type-mono-sm tabular-nums transition-colors',
          selected || tier === 'training' ? 'text-ink' : tier === 'displayed' ? 'text-ink-muted' : 'text-ink-tertiary',
          interactive && 'group-hover:text-ink',
        )}
      >
        {pad2(slot.carousel)}
      </span>
    </>
  )

  return (
    <li className="relative flex min-w-0 flex-1 justify-center">
      {slot.training && (
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 type-label whitespace-nowrap text-ink"
          style={{ top: -(LABEL_ROW_H + LABEL_GAP + 1) }}
        >
          학습 라인
        </span>
      )}
      {interactive && line && onSelect ? (
        <button
          type="button"
          aria-pressed={selected}
          aria-label={`${line.id} 라인 상세 열기${statusText(slot)}`}
          onClick={() => onSelect(line.id)}
          className="group flex w-full cursor-pointer flex-col items-center rounded-md pb-0.5"
        >
          {content}
        </button>
      ) : (
        <div className="flex w-full flex-col items-center pb-0.5">
          {content}
          {/* 확장 대상은 범례의 숫자로 읽히므로 하나씩 읽지 않는다 */}
          {tier !== 'expansion' && <span className="sr-only">{`${slot.id}${statusText(slot)}`}</span>}
        </div>
      )}
    </li>
  )
}

const TIER_STROKE: Record<Tier, { className: string; width: number; dash?: string }> = {
  training: { className: 'stroke-ink', width: 1.5 },
  displayed: { className: 'stroke-ink-muted', width: 1.5 },
  expansion: { className: 'stroke-hairline-strong', width: 1, dash: '3 2' },
}

/** 고리 하나: 투입구 · 벨트 면 · 안쪽 섬 · 바깥선 · 짐 */
function Ring({
  tier,
  critical,
  processing,
  selected,
  reduced,
  interactive,
}: {
  tier: Tier
  critical: boolean
  processing: boolean
  selected: boolean
  reduced: boolean
  interactive: boolean
}) {
  const stroke = TIER_STROKE[tier]
  const live = tier !== 'expansion'
  const feedL = SVG_W / 2 - FEED_W / 2 + 0.5
  const feedR = SVG_W / 2 + FEED_W / 2 - 0.5

  return (
    <svg aria-hidden width={SVG_W} height={SVG_H} className="block shrink-0 overflow-visible">
      {/* 투입구 (뒷벽 → 고리 꼭대기) */}
      <g className="stroke-hairline-strong" strokeWidth={1}>
        <line x1={feedL} x2={feedL} y1={0} y2={FEED_H + PAD + 0.5} />
        <line x1={feedR} x2={feedR} y1={0} y2={FEED_H + PAD + 0.5} />
      </g>
      {/* 벨트 면 (바깥선 안 − 섬). 조치 필요면 signal. 확장 대상은 비운다 */}
      {live && (
        <path
          d={`${OUTER_PATH} ${INNER_PATH}`}
          fillRule="evenodd"
          className={cn(
            'transition-colors',
            critical ? 'fill-signal' : 'fill-surface-1',
            interactive && !critical && 'group-hover:fill-surface-2',
          )}
        />
      )}
      {/* 안쪽 섬 */}
      <path
        d={INNER_PATH}
        className={cn(
          stroke.className,
          live ? 'fill-surface-1 transition-colors' : 'fill-none',
          interactive && 'group-hover:fill-surface-2',
        )}
        strokeWidth={stroke.width}
        strokeDasharray={stroke.dash}
      />
      {/* 바깥선 — 선택하면 primary 2px */}
      <path
        d={OUTER_PATH}
        className={cn('fill-none', selected ? 'stroke-primary' : stroke.className)}
        strokeWidth={selected ? 2 : stroke.width}
        strokeDasharray={selected ? undefined : stroke.dash}
      />
      {live &&
        processing &&
        Array.from({ length: BAGS_PER_RING }, (_, i) => {
          const phase = i / BAGS_PER_RING
          if (reduced) {
            const p = pointOnStadium(TRACK, phase)
            return <Bag key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} />
          }
          return (
            <Bag key={i}>
              <animateMotion
                dur={`${LAP_SEC}s`}
                begin={`${-phase * LAP_SEC}s`}
                repeatCount="indefinite"
                rotate="auto"
                path={TRACK_PATH}
              />
            </Bag>
          )
        })}
    </svg>
  )
}

/** 짐 6×4px, ink-muted. 긴 변이 진행 방향 */
function Bag({ transform, children }: { transform?: string; children?: ReactNode }) {
  return (
    <rect x={-3} y={-2} width={6} height={4} rx={1} transform={transform} className="fill-ink-muted">
      {children}
    </rect>
  )
}

/* ───────────────────────── 범례 ───────────────────────── */

/** 단계 견본 — 고리를 가로로 눕힌 작은 모양(숫자 0 처럼 보이지 않게), 그림과 같은 선 */
function TierSwatch({ tier }: { tier: Tier }) {
  const stroke = TIER_STROKE[tier]
  return (
    <svg aria-hidden width={18} height={10} className="block shrink-0">
      <rect
        x={1}
        y={1}
        width={16}
        height={8}
        rx={4}
        className={cn('fill-none', stroke.className)}
        strokeWidth={stroke.width}
        strokeDasharray={stroke.dash}
      />
    </svg>
  )
}

/** 범례 한 줄 — 상자 없이 caption ink-subtle. 왼쪽 범위(세 단계), 오른쪽 상태(표시 라인에만 나온다) */
function MapLegend({ counts }: { counts: Counts }) {
  const tiers: Array<{ tier: Tier; label: string; count: number }> = [
    { tier: 'training', label: '학습', count: counts.training },
    { tier: 'displayed', label: '표시', count: counts.displayed },
    { tier: 'expansion', label: '확장 대상', count: counts.expansion },
  ]
  return (
    <div className="flex min-w-0 items-center justify-between gap-6 type-caption text-ink-subtle">
      <p className="flex min-w-0 items-center whitespace-nowrap">
        {tiers.map(({ tier, label, count }) => (
          <span key={tier} className="inline-flex items-center">
            <TierSwatch tier={tier} />
            <span className="ml-1.5">
              {label} <span className="tabular-nums">{count}</span>
            </span>
            <span className="px-1.5">·</span>
          </span>
        ))}
        <span>
          수취대 <span className="tabular-nums">{counts.total}</span>개 기준 개념도(실제 위치와 다름)
        </span>
      </p>
      <ChartLegend
        className="shrink-0 flex-nowrap"
        items={[
          {
            label: '조치 필요',
            mark: (
              <svg aria-hidden width={18} height={10} className="block shrink-0">
                <rect x={1} y={1} width={16} height={8} rx={4} className="fill-signal stroke-ink-muted" strokeWidth={1.5} />
              </svg>
            ),
          },
          {
            label: '처리 중',
            mark: (
              <svg aria-hidden width={6} height={10} className="block shrink-0">
                <rect x={0} y={3} width={6} height={4} rx={1} className="fill-ink-muted" />
              </svg>
            ),
          },
        ]}
      />
    </div>
  )
}
