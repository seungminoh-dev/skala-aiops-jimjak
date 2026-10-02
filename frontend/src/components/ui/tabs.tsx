import * as React from 'react'
import { Tabs as TabsPrimitive } from 'radix-ui'

import { cn } from '@/lib/cn'

/**
 * 세그먼트(segmented) — DESIGN.md "입력과 세그먼트" + 부록 A.
 * - 홈: surface-3, 높이 30px, 둥글기 md(8px), 안쪽 2px.
 * - 선택 칸: 흰 바탕(surface-1) + hairline 1px, 둥글기 sm(6px), 그림자 없음.
 * - 예: 시각 제어 "실시간 / 시각 지정".
 * 상단 바의 화면 탭(nav-tab)은 이것이 아니다 — 그건 글자 버튼 모양(투명 → hover surface-2 → 선택 surface-3).
 */
function Tabs({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
  return <TabsPrimitive.Root data-slot="tabs" className={cn('flex flex-col gap-3', className)} {...props} />
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn('inline-flex h-[30px] w-fit items-stretch rounded-md bg-surface-3 p-0.5 text-ink-subtle', className)}
      {...props}
    />
  )
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'inline-flex items-center justify-center gap-1.5 rounded-sm border border-transparent px-2.5',
        'type-button whitespace-nowrap text-ink-subtle shadow-none transition-colors',
        'hover:text-ink disabled:pointer-events-none disabled:text-ink-tertiary',
        'data-[state=active]:border-border data-[state=active]:bg-background data-[state=active]:text-ink',
        "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
  return <TabsPrimitive.Content data-slot="tabs-content" className={cn('flex-1', className)} {...props} />
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
