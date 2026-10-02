import type { ReactNode } from 'react'

import { StatusDot } from '@/components/app/StatusDot'
import { cn } from '@/lib/cn'
import type { DotTone } from '@/lib/format'

/**
 * 범례 — 차트·타임라인 위 왼쪽(또는 제목 줄 오른쪽)에 글자로, 상자 없이 (DESIGN.md "차트").
 * caption ink-subtle 글자 + 작은 표시(mark). 표시는 그림 속 모양과 같게 넘긴다:
 *   선 → <LegendLine className="bg-chart-predicted" />, 판정 점 → <LegendDot tone="warning" />,
 *   빈 점 → <LegendHollowSubtle />, 막대 → <span className="h-3 w-5 rounded-xs bg-surface-3" />.
 * 배치별 MAE · 감시 창 · 모델 입력 20편 차트와 수취대 타임라인이 같이 쓴다.
 */
export interface LegendItem {
  label: string
  mark: ReactNode
}

export interface ChartLegendProps {
  items: readonly LegendItem[]
  className?: string
}

export function ChartLegend({ items, className }: ChartLegendProps) {
  return (
    <ul className={cn('flex flex-wrap items-center gap-x-4 gap-y-1 type-caption text-ink-subtle', className)}>
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          {item.mark}
          {item.label}
        </li>
      ))}
    </ul>
  )
}

/** 선 표시 — 차트 선과 같은 색, 1.5px */
export function LegendLine({ className }: { className: string }) {
  return <span aria-hidden className={cn('inline-block h-[1.5px] w-3.5', className)} />
}

/** 판정 점 표시 — 상태 점과 같은 6px */
export function LegendDot({ tone }: { tone: DotTone }) {
  return <StatusDot tone={tone} />
}

/** ink-subtle 빈 점 — 알림만 배치, 이벤트 편 */
export function LegendHollowSubtle() {
  return <span aria-hidden className="inline-block size-1.5 shrink-0 rounded-full border-[1.5px] border-ink-subtle" />
}
