import type { ComponentType } from 'react'
import { ChartLineIcon, FlaskIcon, SuitcaseRollingIcon } from '@phosphor-icons/react'

/** 화면 3개 (DESIGN.md "범위") */
export type AppTab = 'ops' | 'monitoring' | 'lab'

/**
 * 탭 아이콘 — Phosphor Regular 18px, 색은 글자색(currentColor).
 * 읽지 않는 장식이다(NavTab 이 aria-hidden 으로 감싼다 — 옆 글자가 이름).
 */
export type TabIcon = ComponentType<{ size?: 18; className?: string }>

export interface AppTabItem {
  id: AppTab
  label: string
  Icon: TabIcon
}

/** 상단 바 탭 순서 — 운영 현황(수하물) · 모델 모니터링(오차 추이) · 시나리오 랩(실험) */
export const APP_TABS: readonly AppTabItem[] = [
  { id: 'ops', label: '운영 현황', Icon: SuitcaseRollingIcon },
  { id: 'monitoring', label: '모델 모니터링', Icon: ChartLineIcon },
  { id: 'lab', label: '시나리오 랩', Icon: FlaskIcon },
]
