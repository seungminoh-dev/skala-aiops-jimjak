import { SuitcaseRollingIcon } from '@phosphor-icons/react'

import type { CarouselTier } from '@/api'
import { cn } from '@/lib/cn'

/**
 * 수취대 상태 아이콘 — 짐가방(사이드바 "수취대" 메뉴와 같은 모양). 색 채운 원 대신 쓴다.
 *   미사용 = 회색 선 · 운영 중 = 검은 선 · 하역 중 = 검게 채움(짐이 나오는 중) · 확인 필요 = 빨갛게 채움
 * 예전 모양(지도의 고리를 줄인 타원)은 글자 옆에 작게 놓이면 "C" 처럼 읽혀서 바꿨다.
 */
const TONE: Record<CarouselTier, string> = {
  idle: 'text-gray-500',
  operating: 'text-gray-1000',
  unloading: 'text-gray-1000',
  alert: 'text-red-700',
}

export function CarouselIcon({ tier, size = 16, className }: { tier: CarouselTier; size?: number; className?: string }) {
  const filled = tier === 'unloading' || tier === 'alert'
  return <SuitcaseRollingIcon aria-hidden size={size} weight={filled ? 'fill' : 'regular'} className={cn('shrink-0', TONE[tier], className)} />
}
