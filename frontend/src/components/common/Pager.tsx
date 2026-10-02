import { CaretLeftIcon, CaretRightIcon } from '@phosphor-icons/react'

import { cn } from '@/lib/cn'

/** 페이지 넘김 — "1–8 / 20" + 이전·다음. 목록 아래 오른쪽 */
export function Pager({
  page,
  pageSize,
  total,
  onChange,
  className,
}: {
  page: number
  pageSize: number
  total: number
  onChange: (page: number) => void
  className?: string
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const from = total === 0 ? 0 : page * pageSize + 1
  const to = Math.min(total, (page + 1) * pageSize)
  const btn = 'flex size-8 cursor-pointer items-center justify-center rounded-md text-gray-1000 transition-colors hover:bg-gray-alpha-100 disabled:cursor-default disabled:text-gray-500 disabled:hover:bg-transparent'
  return (
    <div className={cn('flex items-center justify-end gap-3', className)}>
      <span className="type-label-13 text-gray-900 num">
        {from}–{to} / {total}
      </span>
      <div className="flex items-center gap-1">
        <button type="button" className={btn} disabled={page === 0} onClick={() => onChange(page - 1)} aria-label="이전 페이지">
          <CaretLeftIcon size={16} />
        </button>
        {Array.from({ length: pages }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            aria-current={i === page ? 'page' : undefined}
            className={cn(
              'flex h-8 min-w-8 cursor-pointer items-center justify-center rounded-md px-2 type-label-13 num transition-colors',
              i === page ? 'bg-gray-1000 font-medium text-white' : 'text-gray-900 hover:bg-gray-alpha-100 hover:text-gray-1000',
            )}
          >
            {i + 1}
          </button>
        ))}
        <button type="button" className={btn} disabled={page >= pages - 1} onClick={() => onChange(page + 1)} aria-label="다음 페이지">
          <CaretRightIcon size={16} />
        </button>
      </div>
    </div>
  )
}
