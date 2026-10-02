import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * 입력 — DESIGN.md text-input + 부록 A.
 * 높이 30px, hairline-strong 1px, 둥글기 md(8px), body-sm, 그림자 없음, 포커스는 문서 포커스 링.
 * 예: 시각 제어의 날짜(2026-10-01)·시각(14:50, step 300) 입력, 데이터 업로드.
 */
function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        'h-[30px] min-w-0 rounded-md border border-input bg-surface-1 px-2.5 type-body-sm text-ink shadow-none',
        'tabular-nums transition-colors placeholder:text-ink-tertiary',
        'disabled:cursor-not-allowed disabled:bg-surface-2 disabled:text-ink-tertiary',
        'file:mr-2 file:h-full file:border-0 file:bg-transparent file:type-button file:text-ink',
        className,
      )}
      {...props}
    />
  )
}

export { Input }
