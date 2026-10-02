import { useId, type ReactNode } from 'react'
import { motion } from 'motion/react'

import { cn } from '@/lib/cn'
import { SPRING } from '@/lib/motion'

/** 거르기 칩 — 고른 칩의 검은 바탕이 다른 칩으로 미끄러져 옮겨 간다 */
export function FilterChips<T extends string>({
  items,
  value,
  onChange,
}: {
  items: Array<{ id: T; label: ReactNode; count?: number; icon?: (active: boolean) => ReactNode }>
  value: T
  onChange: (id: T) => void
}) {
  const group = useId()
  return (
    <div className="flex flex-wrap items-center gap-2" role="group">
      {items.map((f) => {
        const active = f.id === value
        return (
          <button
            key={f.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(f.id)}
            className={cn(
              'relative flex h-8 cursor-pointer items-center gap-1.5 rounded-full px-3 type-label-13 transition-colors',
              active ? 'text-white' : 'bg-background-100 text-gray-900 shadow-border hover:text-gray-1000',
            )}
          >
            {active && <motion.span layoutId={`chip-${group}`} transition={SPRING} className="absolute inset-0 rounded-full bg-gray-1000" aria-hidden />}
            <span className="relative flex items-center gap-1.5">
              {f.icon?.(active)}
              {f.label}
              {f.count !== undefined && <span className="num opacity-80">{f.count}</span>}
            </span>
          </button>
        )
      })}
    </div>
  )
}
