import { useId, useState } from 'react'

import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'
import { ACTION_THRESHOLD_MIN, fmtClock } from '@/lib/format'
import type { Ymdhm } from '@/api'

/**
 * 예측 근거 — 앞 20편 실제 처리 시간(회색 막대) → 다음 편 예측(파란 막대). 기준 50분은 빨간 점선.
 * 정보 계열: 실제 = 회색 · 예측 = 파랑 · 기준(조치 필요) = 빨강. 화면 전체에서 같다.
 * 처음 보일 때 막대가 왼쪽부터 차례로 자라고, 기준선이 그려진다(움직임 줄이기면 바로).
 */
export interface SequenceChartProps {
  sequence: Array<{ id: string; minutes: number; seats: number; at: Ymdhm }>
  next: { id: string; minutes: number | null; seats: number } | null
}

const H = 220
const PAD_T = 28
const PAD_B = 28
const PAD_L = 34
const MAX_MIN = 70

export function SequenceChart({ sequence, next }: SequenceChartProps) {
  const reduced = useReducedMotion()
  const gid = useId().replace(/:/g, '')
  const [hover, setHover] = useState<number | null>(null)
  const bars = [
    ...sequence.map((s) => ({ ...s, kind: 'actual' as const })),
    ...(next ? [{ id: next.id, minutes: next.minutes ?? 0, seats: next.seats, at: '' as Ymdhm, kind: 'predicted' as const }] : []),
  ]
  const n = bars.length
  const plotH = H - PAD_T - PAD_B
  const y = (m: number) => PAD_T + plotH * (1 - Math.min(m, MAX_MIN) / MAX_MIN)
  const ticks = [0, 25, 50]
  const avg = sequence.length ? Math.round(sequence.reduce((s, x) => s + x.minutes, 0) / sequence.length) : null

  return (
    <div className="relative">
      <svg viewBox={`0 0 1000 ${H}`} preserveAspectRatio="none" className="block h-[220px] w-full overflow-visible" role="img" aria-label={`앞 ${sequence.length}편 처리 시간과 다음 편 예측`}>
        <defs>
          <linearGradient id={`${gid}-actual`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-gray-600)" />
            <stop offset="100%" stopColor="var(--ds-gray-200)" />
          </linearGradient>
          <linearGradient id={`${gid}-pred`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ds-blue-700)" />
            <stop offset="100%" stopColor="var(--ds-blue-400)" />
          </linearGradient>
        </defs>

        {/* 눈금 */}
        {ticks.map((t) => (
          <g key={t}>
            <line x1={PAD_L} x2={1000} y1={y(t)} y2={y(t)} className="stroke-gray-alpha-200" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          </g>
        ))}

        {/* 막대 */}
        {bars.map((b, i) => {
          const slot = (1000 - PAD_L) / n
          const w = Math.min(28, slot * 0.6)
          const x = PAD_L + slot * i + (slot - w) / 2
          const top = y(b.minutes)
          const predicted = b.kind === 'predicted'
          return (
            <g key={`${b.id}-${i}`} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={PAD_L + slot * i} y={PAD_T} width={slot} height={plotH} fill="transparent" />
              <rect
                x={x}
                y={top}
                width={w}
                height={y(0) - top}
                rx={3}
                fill={`url(#${gid}-${predicted ? 'pred' : 'actual'})`}
                className={cn(!reduced && 'animate-bar-grow', hover !== null && hover !== i && 'opacity-50', 'transition-opacity')}
                style={{ transformOrigin: `${x + w / 2}px ${y(0)}px`, transformBox: 'view-box', animationDelay: `${i * 35}ms` }}
              />
            </g>
          )
        })}

        {/* 기준 50분 */}
        <line
          x1={PAD_L}
          x2={1000}
          y1={y(ACTION_THRESHOLD_MIN)}
          y2={y(ACTION_THRESHOLD_MIN)}
          className="stroke-red-700"
          strokeWidth={1.5}
          strokeDasharray="6 5"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* 축 글자 (SVG 가 늘어나도 글자는 그대로) */}
      {ticks.map((t) => (
        <span key={t} className="absolute left-0 -translate-y-1/2 type-label-12 text-gray-700 num" style={{ top: y(t) }}>
          {t}분
        </span>
      ))}
      <span className="absolute right-0 -translate-y-full pb-1 type-label-12 font-medium text-red-900" style={{ top: y(ACTION_THRESHOLD_MIN) }}>
        기준 50분
      </span>
      <div className="absolute inset-x-0 bottom-0 flex justify-between type-label-12 text-gray-900" style={{ paddingLeft: PAD_L }}>
        <span>{sequence.length}편 전</span>
        {avg !== null && <span>앞 {sequence.length}편 평균 {avg}분</span>}
        <span className="font-medium text-blue-900">다음 편</span>
      </div>

      {/* 다음 편 값 */}
      {next && next.minutes !== null && (
        <span
          className={cn('absolute -translate-x-1/2 -translate-y-full pb-1 type-label-13 font-semibold text-blue-900 num', !reduced && 'animate-fade-up')}
          style={{ left: `calc(${PAD_L / 10}% + ${((n - 0.5) / n) * (100 - PAD_L / 10)}%)`, top: y(next.minutes), animationDelay: `${n * 35 + 300}ms` }}
        >
          {next.minutes}분
        </span>
      )}

      {/* 마우스를 올린 막대 */}
      {hover !== null && bars[hover] && (
        <div
          className="pointer-events-none absolute z-10 -translate-x-1/2 material-tooltip px-2.5 py-1.5 type-label-12 whitespace-nowrap"
          style={{ left: `calc(${PAD_L / 10}% + ${((hover + 0.5) / n) * (100 - PAD_L / 10)}%)`, top: 0 }}
        >
          <span className="type-mono-12 font-medium text-gray-1000">{bars[hover].id}</span>{' '}
          {bars[hover].kind === 'predicted' ? (
            <span className="text-blue-900">예측 {bars[hover].minutes}분</span>
          ) : (
            <span className="text-gray-900">
              실제 {bars[hover].minutes}분 · 착륙 {fmtClock(bars[hover].at)}
            </span>
          )}{' '}
          <span className="text-gray-700">{bars[hover].seats}석</span>
        </div>
      )}
    </div>
  )
}
