import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** 페이지 머리 — 제목(heading-24) + 한 줄 설명 + 오른쪽 동작 */
export function PageHeader({ title, sub, icon, actions }: { title: ReactNode; sub?: ReactNode; icon?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="flex items-center gap-2.5 type-heading-24 text-gray-1000">
          {icon}
          {title}
        </h1>
        {sub && <p className="type-label-13 text-gray-900">{sub}</p>}
      </div>
      {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  )
}

/** 카드 — Vercel 카드: 머리 줄(제목 + 오른쪽) · 본문 · 선택 바닥 줄 */
export function Card({
  title,
  aside,
  footer,
  children,
  className,
  bodyClassName,
}: {
  title?: ReactNode
  aside?: ReactNode
  footer?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('material-base flex min-w-0 flex-col', className)}>
      {(title || aside) && (
        <div className="flex min-h-12 items-center justify-between gap-4 border-b border-gray-alpha-400 px-5 py-2.5">
          {title && <h2 className="flex items-center gap-2 type-heading-16 text-gray-1000">{title}</h2>}
          {aside && <div className="flex items-center gap-3 type-label-13 text-gray-900">{aside}</div>}
        </div>
      )}
      <div className={cn('flex-1 p-5', bodyClassName)}>{children}</div>
      {footer && (
        <div className="flex items-center justify-between gap-4 rounded-b-md border-t border-gray-alpha-400 bg-background-200 px-5 py-3 type-label-13 text-gray-900">
          {footer}
        </div>
      )}
    </section>
  )
}

/** 숫자 칸 — Vercel Observability 의 작은 지표 카드: 이름 · 큰 값 · 보조 줄 · 오른쪽/아래 추세선 */
export function StatCard({
  label,
  icon,
  value,
  unit,
  sub,
  tone = 'plain',
  chart,
}: {
  label: string
  icon?: ReactNode
  value: ReactNode
  unit?: string
  sub?: ReactNode
  tone?: 'plain' | 'red' | 'amber' | 'blue' | 'green'
  chart?: ReactNode
}) {
  const color = { plain: 'text-gray-1000', red: 'text-red-900', amber: 'text-amber-900', blue: 'text-blue-900', green: 'text-green-900' }[tone]
  return (
    <div className="material-base flex min-w-0 flex-col gap-2 p-4">
      <span className="flex items-center gap-1.5 type-label-13 text-gray-900">
        {icon}
        {label}
      </span>
      <span className={cn('flex items-baseline gap-1', color)}>
        <span className="type-heading-32 num">{value}</span>
        {unit && <span className="type-label-14 font-medium">{unit}</span>}
      </span>
      {sub && <span className="type-label-13 text-gray-900">{sub}</span>}
      {chart && <div className="mt-1">{chart}</div>}
    </div>
  )
}
