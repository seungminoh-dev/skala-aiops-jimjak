import { useId, useState, type ReactNode } from 'react'

import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'

import { useWidth } from './useSize'

/**
 * 선 그래프 — Vercel Observability 차트 모양 + 그려지는 움직임.
 * - 선은 처음 보일 때 앞에서부터 그어지고(line-draw), 아래 그라데이션 면은 뒤따라 서서히 나타난다.
 * - 색은 정보 계열을 따른다: blue = 예측·모델 값, gray = 실제, red = 기준선.
 * - 표시(markers): 사건(event, 주황 번개) · 배포(deploy, 파란 세로선 + 버전).
 * - 마우스를 올리면 그 칸의 세로선과 tooltip(index) 내용을 띄운다.
 */
export interface Series {
  key: string
  values: Array<number | null>
  tone: 'blue' | 'gray' | 'amber'
  /** 아래 그라데이션 면 */
  area?: boolean
  /** 점 */
  dots?: boolean
  dashed?: boolean
}

export interface Marker {
  index: number
  kind: 'event' | 'deploy' | 'alert'
  label?: string
}

export interface LineChartProps {
  series: Series[]
  /** x 칸 수 (values 길이) */
  count: number
  yMax: number
  yMin?: number
  yTicks?: number[]
  yUnit?: string
  threshold?: { value: number; label: string }
  /** x 축 글자 (index → 글자). 없으면 그리지 않는다 */
  xLabel?: (index: number) => string | null
  markers?: Marker[]
  tooltip?: (index: number) => ReactNode
  height?: number
  className?: string
}

const TONE = {
  blue: { stroke: 'var(--ds-blue-700)', from: 'var(--ds-blue-400)', dot: 'fill-blue-700' },
  gray: { stroke: 'var(--ds-gray-1000)', from: 'var(--ds-gray-400)', dot: 'fill-gray-1000' },
  amber: { stroke: 'var(--ds-amber-800)', from: 'var(--ds-amber-400)', dot: 'fill-amber-700' },
} as const

const PAD = { t: 16, r: 12, b: 26, l: 40 }

export function LineChart({
  series,
  count,
  yMax,
  yMin = 0,
  yTicks,
  yUnit = '',
  threshold,
  xLabel,
  markers = [],
  tooltip,
  height = 240,
  className,
}: LineChartProps) {
  const reduced = useReducedMotion()
  const gid = useId().replace(/:/g, '')
  const [ref, width] = useWidth<HTMLDivElement>()
  const [hover, setHover] = useState<number | null>(null)

  const w = Math.max(0, width - PAD.l - PAD.r)
  const h = height - PAD.t - PAD.b
  const x = (i: number) => PAD.l + (count <= 1 ? w / 2 : (w * i) / (count - 1))
  const y = (v: number) => PAD.t + h * (1 - (Math.min(Math.max(v, yMin), yMax) - yMin) / (yMax - yMin))
  const ticks = yTicks ?? [yMin, (yMin + yMax) / 2, yMax]

  const linePath = (values: Array<number | null>) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v === null) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)} `
      pen = true
    })
    return d.trim()
  }
  const areaPath = (values: Array<number | null>) => {
    const pts = values.map((v, i) => (v === null ? null : [x(i), y(v)] as const)).filter(Boolean) as Array<readonly [number, number]>
    if (pts.length < 2) return ''
    return `M${pts[0][0]} ${y(yMin)} ` + pts.map(([px, py]) => `L${px.toFixed(1)} ${py.toFixed(1)}`).join(' ') + ` L${pts[pts.length - 1][0]} ${y(yMin)} Z`
  }

  return (
    <div ref={ref} className={cn('relative', className)} style={{ height }} onMouseLeave={() => setHover(null)}>
      {width > 0 && (
        <svg width={width} height={height} className="block overflow-visible">
          <defs>
            {series.map((s) => (
              <linearGradient key={s.key} id={`${gid}-${s.key}`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={TONE[s.tone].from} stopOpacity={0.55} />
                <stop offset="100%" stopColor={TONE[s.tone].from} stopOpacity={0} />
              </linearGradient>
            ))}
          </defs>

          {/* 눈금 */}
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(t)} y2={y(t)} className="stroke-gray-alpha-200" />
              <text x={PAD.l - 8} y={y(t)} dy="0.32em" textAnchor="end" className="fill-gray-700 text-[11px] tabular-nums">
                {t}
                {yUnit}
              </text>
            </g>
          ))}

          {/* x 축 글자 */}
          {xLabel &&
            Array.from({ length: count }, (_, i) => {
              const label = xLabel(i)
              return label ? (
                <text key={i} x={x(i)} y={height - 6} textAnchor="middle" className="fill-gray-700 font-mono text-[11px] tabular-nums">
                  {label}
                </text>
              ) : null
            })}

          {/* 배포 표시 */}
          {markers
            .filter((m) => m.kind === 'deploy')
            .map((m) => (
              <g key={`d-${m.index}`}>
                <line x1={x(m.index)} x2={x(m.index)} y1={PAD.t} y2={PAD.t + h} className="stroke-blue-700" strokeDasharray="3 3" />
                {m.label && (
                  <text x={x(m.index) + 4} y={PAD.t + 10} className="fill-blue-900 font-mono text-[11px] font-medium">
                    {m.label}
                  </text>
                )}
              </g>
            ))}

          {/* 면 → 선 → 점 */}
          {series.map((s, si) =>
            s.area ? (
              <path
                key={`a-${s.key}`}
                d={areaPath(s.values)}
                fill={`url(#${gid}-${s.key})`}
                className={cn(!reduced && 'animate-fade-in')}
                style={{ animationDelay: `${300 + si * 120}ms`, animationFillMode: 'both' }}
              />
            ) : null,
          )}
          {series.map((s, si) => (
            <path
              key={`l-${s.key}`}
              d={linePath(s.values)}
              fill="none"
              stroke={TONE[s.tone].stroke}
              strokeWidth={s.tone === 'blue' ? 2 : 1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={s.dashed ? '0.008 0.008' : 1}
              className={cn(!reduced && !s.dashed && 'animate-line-draw')}
              style={{ ['--line-length' as string]: 1, animationDelay: `${si * 150}ms` }}
            />
          ))}
          {series
            .filter((s) => s.dots)
            .map((s) =>
              s.values.map((v, i) =>
                v === null ? null : (
                  <circle key={`p-${s.key}-${i}`} cx={x(i)} cy={y(v)} r={hover === i ? 4 : 2.5} className={cn(TONE[s.tone].dot, 'stroke-background-100 transition-[r]')} strokeWidth={1.5} />
                ),
              ),
            )}

          {/* 기준선 */}
          {threshold && (
            <g>
              <line x1={PAD.l} x2={PAD.l + w} y1={y(threshold.value)} y2={y(threshold.value)} className="stroke-red-700" strokeWidth={1.5} strokeDasharray="6 5" />
              <text x={PAD.l + w} y={y(threshold.value) - 6} textAnchor="end" className="fill-red-900 text-[11px] font-medium">
                {threshold.label}
              </text>
            </g>
          )}

          {/* 사건 표시: 번개 */}
          {markers
            .filter((m) => m.kind !== 'deploy')
            .map((m) => {
              const top = series[0]?.values[m.index]
              if (top === null || top === undefined) return null
              return (
                <g key={`e-${m.index}`} transform={`translate(${x(m.index)} ${y(top) - 14})`}>
                  <circle r={8} className={m.kind === 'alert' ? 'fill-red-100 stroke-red-700' : 'fill-amber-100 stroke-amber-700'} />
                  <path d="M1 -5 L-3 1 L0 1 L-1 5 L3 -1 L0 -1 Z" className={m.kind === 'alert' ? 'fill-red-700' : 'fill-amber-900'} />
                </g>
              )
            })}

          {/* 마우스 */}
          {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={PAD.t} y2={PAD.t + h} className="stroke-gray-alpha-500" />}
          {Array.from({ length: count }, (_, i) => {
            const half = count <= 1 ? w / 2 : w / (count - 1) / 2
            return <rect key={`h-${i}`} x={x(i) - half} y={PAD.t} width={half * 2} height={h} fill="transparent" onMouseEnter={() => setHover(i)} />
          })}
        </svg>
      )}

      {tooltip && hover !== null && (
        <div
          className="pointer-events-none absolute z-10 material-tooltip px-3 py-2 type-label-12 whitespace-nowrap"
          style={{ left: Math.min(x(hover) + 12, Math.max(0, width - 220)), top: 4 }}
        >
          {tooltip(hover)}
        </div>
      )}
    </div>
  )
}
