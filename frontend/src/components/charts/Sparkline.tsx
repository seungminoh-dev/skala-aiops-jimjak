import { useId } from 'react'

import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'

import { useWidth } from './useSize'

/** 작은 추세선 — 숫자 칸 오른쪽. 그어지는 움직임 + 아래 그라데이션 면. 기준선이 있으면 빨간 점선 */
export function Sparkline({
  values,
  tone = 'blue',
  threshold,
  max,
  height = 40,
  className,
}: {
  values: number[]
  tone?: 'blue' | 'gray' | 'red'
  threshold?: number
  max?: number
  height?: number
  className?: string
}) {
  const reduced = useReducedMotion()
  const gid = useId().replace(/:/g, '')
  const [ref, width] = useWidth<HTMLDivElement>()
  const top = Math.max(max ?? 0, ...values, threshold ?? 0) * 1.1 || 1
  const x = (i: number) => (values.length <= 1 ? width / 2 : (width * i) / (values.length - 1))
  const y = (v: number) => 3 + (height - 6) * (1 - v / top)
  const line = values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ')
  const area = values.length > 1 ? `${line} L${x(values.length - 1)} ${height} L0 ${height} Z` : ''
  const color = tone === 'blue' ? 'var(--ds-blue-700)' : tone === 'red' ? 'var(--ds-red-700)' : 'var(--ds-gray-1000)'
  const fill = tone === 'blue' ? 'var(--ds-blue-400)' : tone === 'red' ? 'var(--ds-red-400)' : 'var(--ds-gray-400)'

  return (
    <div ref={ref} className={cn('w-full', className)} style={{ height }}>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={height} className="block overflow-visible" aria-hidden>
          <defs>
            <linearGradient id={gid} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={fill} stopOpacity={0.6} />
              <stop offset="100%" stopColor={fill} stopOpacity={0} />
            </linearGradient>
          </defs>
          {threshold !== undefined && (
            <line x1={0} x2={width} y1={y(threshold)} y2={y(threshold)} className="stroke-red-700" strokeWidth={1} strokeDasharray="3 3" />
          )}
          <path d={area} fill={`url(#${gid})`} className={cn(!reduced && 'animate-fade-in')} style={{ animationDelay: '300ms', animationFillMode: 'both' }} />
          <path
            d={line}
            fill="none"
            stroke={color}
            strokeWidth={1.75}
            strokeLinejoin="round"
            strokeLinecap="round"
            pathLength={1}
            strokeDasharray={1}
            className={cn(!reduced && 'animate-line-draw')}
            style={{ ['--line-length' as string]: 1 }}
          />
          <circle cx={x(values.length - 1)} cy={y(values[values.length - 1])} r={3} fill={color} className="stroke-background-100" strokeWidth={1.5} />
        </svg>
      )}
    </div>
  )
}
