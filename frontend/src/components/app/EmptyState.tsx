import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/**
 * 빈 상태 — 그 자리에 한 줄 사실 (body-sm ink-subtle). 일러스트·큰 아이콘·마스코트 없음.
 *   "이 시각 앞뒤 4시간에 도착편이 없습니다"
 *   "아직 판정 기록이 없습니다. 시나리오 랩에서 실행하면 쌓입니다"
 *   "1시간 안에 조치가 필요한 편은 없습니다 · 다음 예측 14:55 KE712" (편명은 mono span 으로 넘긴다)
 * 높이는 표 행과 같은 40px(위아래 10px + 줄 20px). 글자 줄이라 mono span 과 기준선이 맞는다.
 * 표 머리글 아래에 둘 때는 칸 좌우 여백에 맞춰 px-3(전폭 표면 pl-6)을 준다.
 */
export interface EmptyStateProps {
  children: ReactNode
  className?: string
}

export function EmptyState({ children, className }: EmptyStateProps) {
  return <p className={cn('py-2.5 type-body-sm leading-5 text-ink-subtle', className)}>{children}</p>
}
