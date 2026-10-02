import type { CarouselTier } from '@/api'
import { cn } from '@/lib/cn'

/**
 * 수취대 상태 아이콘 (16px) — 지도의 고리를 그대로 줄인 모양. 색 채운 원 대신 쓴다.
 *   미사용 = 회색 선 · 운영 중 = 검은 선 · 하역 중 = 검은 선 + 짐 · 확인 필요 = 빨간 선 + 짐
 */
const STROKE: Record<CarouselTier, string> = {
  idle: 'stroke-gray-500',
  operating: 'stroke-gray-1000',
  unloading: 'stroke-gray-1000',
  alert: 'stroke-red-700',
}

export function CarouselIcon({ tier, size = 16, className }: { tier: CarouselTier; size?: number; className?: string }) {
  const bag = tier === 'unloading' || tier === 'alert'
  return (
    <svg aria-hidden width={size} height={size} viewBox="0 0 16 16" className={cn('shrink-0', className)}>
      <rect x={3.75} y={1.25} width={8.5} height={13.5} rx={4.25} className={cn('fill-none', STROKE[tier])} strokeWidth={1.5} />
      <rect x={7} y={5} width={2} height={6} rx={1} className={cn('fill-none', STROKE[tier])} strokeWidth={1.2} />
      {bag && <rect x={9.85} y={6.25} width={1.7} height={3.5} rx={0.5} className={tier === 'alert' ? 'fill-red-700' : 'fill-gray-1000'} />}
    </svg>
  )
}
