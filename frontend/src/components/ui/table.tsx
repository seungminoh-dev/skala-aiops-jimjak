import * as React from 'react'

import { cn } from '@/lib/cn'

/**
 * 표 — DESIGN.md table-header / table-row + 부록 A.
 * - 머리글: 높이 36px(h-9), label(12px 500) ink-subtle, 흰 바탕. sticky 를 주면 위에 고정된다.
 * - 행: 높이 40px(h-10), body-sm, 행 구분 hairline, hover surface-2(100ms), 줄무늬 없음.
 * - 칸은 기준선 정렬(align-baseline) — mono(편명·라인)와 Pretendard 가 한 줄에 섞여도 맞는다.
 *   위아래 여백 9px + 글자 19.5px + 선 1px 로 40px 안에 든다. 칸 안 요소는 높이 20px 이하로 둔다
 *   (버튼처럼 30px 인 것을 넣으면 그 칸에 py-[4px] 를 준다).
 * - 숫자 칸은 오른쪽 정렬(text-right) + tabular-nums.
 * - 표를 흰 면 좌우 끝까지 붙일 때는 바깥에서 -mx-6 으로 감싸고 첫·끝 칸에 pl-6 / pr-6 을 준다.
 * - 선은 칸(th·td) 아래에 그린다(border-separate) — sticky 머리글이 선을 끌고 올라간다.
 */
function Table({
  className,
  containerClassName,
  ...props
}: React.ComponentProps<'table'> & { containerClassName?: string }) {
  return (
    <div data-slot="table-container" className={cn('relative w-full', containerClassName)}>
      <table
        data-slot="table"
        className={cn('w-full caption-bottom border-separate border-spacing-0 type-body-sm text-ink', className)}
        {...props}
      />
    </div>
  )
}

function TableHeader({ className, sticky = false, ...props }: React.ComponentProps<'thead'> & { sticky?: boolean }) {
  return (
    <thead
      data-slot="table-header"
      className={cn('[&_tr]:hover:bg-transparent', sticky && 'sticky top-0 z-10', className)}
      {...props}
    />
  )
}

function TableBody({ className, ...props }: React.ComponentProps<'tbody'>) {
  return (
    <tbody
      data-slot="table-body"
      className={cn('[&_tr:last-child>td]:border-b-0', className)}
      {...props}
    />
  )
}

function TableFooter({ className, ...props }: React.ComponentProps<'tfoot'>) {
  return (
    <tfoot
      data-slot="table-footer"
      className={cn('[&_td]:border-t [&_td]:border-b-0 [&_td]:border-hairline', className)}
      {...props}
    />
  )
}

function TableRow({ className, ...props }: React.ComponentProps<'tr'>) {
  return (
    <tr
      data-slot="table-row"
      className={cn('transition-colors hover:bg-surface-2 data-[state=selected]:bg-surface-3', className)}
      {...props}
    />
  )
}

function TableHead({ className, ...props }: React.ComponentProps<'th'>) {
  return (
    <th
      data-slot="table-head"
      className={cn(
        'h-9 border-b border-hairline bg-surface-1 px-3 py-0 text-left align-middle type-label whitespace-nowrap text-ink-subtle',
        className,
      )}
      {...props}
    />
  )
}

function TableCell({ className, ...props }: React.ComponentProps<'td'>) {
  return (
    <td
      data-slot="table-cell"
      className={cn('h-10 border-b border-hairline px-3 py-[9px] align-baseline whitespace-nowrap', className)}
      {...props}
    />
  )
}

function TableCaption({ className, ...props }: React.ComponentProps<'caption'>) {
  return (
    <caption data-slot="table-caption" className={cn('mt-3 type-caption text-ink-subtle', className)} {...props} />
  )
}

export { Table, TableHeader, TableBody, TableFooter, TableHead, TableRow, TableCell, TableCaption }
