import { ArrowRightIcon } from '@phosphor-icons/react'

import { TIER_LABEL, type CarouselTier, type NextFlight } from '@/api'
import { MascotCarry } from '@/components/mascot/Mascot'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

import { CarouselIcon } from './CarouselIcon'

/** T1-07 안내 카드 — 마스코트가 짐을 나르고, 누르면 수취대로 들어간다 (2D·3D 지도 공용) */
export function LiveCallout({
  liveId,
  tier,
  nextFlight,
  onEnter,
}: {
  liveId: string
  tier: CarouselTier
  nextFlight: NextFlight | null
  onEnter: () => void
}) {
  return (
    <button
      type="button"
      onClick={onEnter}
      className="group flex w-[340px] cursor-pointer items-center gap-3 rounded-md bg-background-100 p-3 text-left shadow-border-small transition-shadow hover:shadow-border-medium"
    >
      <MascotCarry size="sm" />
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        <span className="flex items-center gap-2">
          <span className="type-mono-14 font-medium text-gray-1000">{liveId}</span>
          <span className="type-label-14 font-medium text-gray-1000">수취대</span>
          <span className={cn('flex items-center gap-1 type-label-12', tier === 'alert' ? 'text-red-900' : 'text-gray-900')}>
            <CarouselIcon tier={tier} size={14} />
            {TIER_LABEL[tier]}
          </span>
        </span>
        <span className="type-label-13 text-gray-900">
          {nextFlight ? (
            nextFlight.lastBag ? (
              <>
                다음 편 <span className="type-mono-12 text-gray-1000">{nextFlight.id}</span> 마지막 짐{' '}
                <span className="type-mono-12 num text-gray-1000">{fmtClock(nextFlight.lastBag)}</span> 예상
              </>
            ) : (
              <>
                다음 편 <span className="type-mono-12 text-gray-1000">{nextFlight.id}</span> 예측{' '}
                <span className="type-mono-12 num">{fmtClock(nextFlight.issueAt)}</span> 발행
              </>
            )
          ) : (
            '남은 도착편이 없어요'
          )}
        </span>
      </span>
      <ArrowRightIcon size={16} className="shrink-0 text-gray-900 transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
