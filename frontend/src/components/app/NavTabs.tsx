import type { ComponentProps } from 'react'

import { APP_TABS, type AppTab, type AppTabItem } from '@/components/app/tabs'
import { cn } from '@/lib/cn'

/**
 * 화면 탭 nav-tab — 상단 바 왼쪽, 워드마크 옆.
 * 높이 30px, 안쪽 0 10px, 둥글기 sm(6px), 글자 button(13px 500).
 * 기본 ink-subtle → hover surface-2 + ink → 선택 surface-3 + ink. 아이콘은 18px, 글자색을 따른다
 * (운영 현황 = 직접 그린 벨트, 모델 모니터링 = 직접 그린 드리프트, 시나리오 랩 = Phosphor Flask — app/tabs).
 * 세그먼트(ui/tabs)와 다르다 — 화면을 옮기는 링크 줄이다 (aria-current="page").
 */
export interface NavTabProps extends Omit<ComponentProps<'button'>, 'children'> {
  tab: AppTabItem
  selected?: boolean
}

export function NavTab({ tab, selected = false, className, ...props }: NavTabProps) {
  const { Icon, label } = tab
  return (
    <button
      type="button"
      aria-current={selected ? 'page' : undefined}
      className={cn(
        'inline-flex h-[30px] shrink-0 items-center gap-1.5 rounded-sm px-2.5 type-button whitespace-nowrap',
        'text-ink-subtle transition-colors duration-[120ms] hover:bg-surface-2 hover:text-ink',
        selected && 'bg-surface-3 text-ink hover:bg-surface-3',
        className,
      )}
      {...props}
    >
      <span aria-hidden className="inline-flex shrink-0">
        <Icon size={18} />
      </span>
      {label}
    </button>
  )
}

export interface NavTabsProps {
  /** 지금 화면. null 이면 고른 탭 없음 (디자인 시트에서 화면 밖 구역을 볼 때) */
  value: AppTab | null
  onValueChange?: (tab: AppTab) => void
  className?: string
}

export function NavTabs({ value, onValueChange, className }: NavTabsProps) {
  return (
    <nav aria-label="화면" className={cn('flex items-center gap-0.5', className)}>
      {APP_TABS.map((tab) => (
        <NavTab key={tab.id} tab={tab} selected={tab.id === value} onClick={() => onValueChange?.(tab.id)} />
      ))}
    </nav>
  )
}
