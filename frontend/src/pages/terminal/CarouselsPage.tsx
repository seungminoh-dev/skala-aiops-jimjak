import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { AirplaneLandingIcon, ArrowRightIcon, ClockIcon, SparkleIcon } from '@phosphor-icons/react'

import { TIER_LABEL, useDemoClock, useTerminal, type CarouselTier, type TerminalCarousel } from '@/api'
import { PAGE_PATH } from '@/app/routes'
import { FilterChips } from '@/components/common/FilterChips'
import { Avatars } from '@/components/shell/Avatars'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { TERMINAL_NAME, type TerminalId } from '@/components/terminal/geometry'
import { cn } from '@/lib/cn'
import { carouselName, diffMinutes, fmtClock } from '@/lib/format'
import type { Ymdhm } from '@/api'

/**
 * 수취대 목록 (터미널 범위) — Vercel Deployments 목록처럼 머리 줄 없이 아이콘과 색으로 위계를 준다.
 *   수취대(가장 진하게) · 상태 + 경과 · 지금/다음 편 · AI 예측 칩(T1-07) · 담당
 * 들어갈 수 있는 곳은 T1-07 하나다(나머지는 목업). ?focus=T1-19 면 그 줄을 밝히고 보이게 한다.
 */
const FILTERS: Array<CarouselTier | 'all'> = ['all', 'unloading', 'operating', 'alert', 'idle']

export function CarouselsPage() {
  const terminal = useTerminal()
  const clock = useDemoClock()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const focus = params.get('focus')
  const [filter, setFilter] = useState<CarouselTier | 'all'>('all')
  const rows = terminal.carousels.filter((c) => filter === 'all' || c.tier === filter || c.id === focus)
  const focusRef = useRef<HTMLLIElement>(null)

  useEffect(() => {
    focusRef.current?.scrollIntoView({ block: 'center' })
  }, [focus])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">수취대</h1>

      <FilterChips
        value={filter}
        onChange={setFilter}
        items={FILTERS.map((f) => ({
          id: f,
          label: f === 'all' ? '전체' : TIER_LABEL[f],
          count: f === 'all' ? terminal.carousels.length : terminal.counts[f],
          icon: f === 'all' ? undefined : (active: boolean) => <CarouselIcon tier={f} size={14} className={active && f !== 'alert' ? 'invert' : undefined} />,
        }))}
      />

      <ul className="material-base divide-y divide-gray-alpha-400">
        {rows.map((c) => (
          <Row
            key={c.id}
            c={c}
            now={clock.now}
            focused={c.id === focus}
            rowRef={c.id === focus ? focusRef : undefined}
            onEnter={c.live ? () => navigate(PAGE_PATH.overview) : undefined}
          />
        ))}
      </ul>
    </div>
  )
}

function Row({
  c,
  now,
  focused,
  rowRef,
  onEnter,
}: {
  c: TerminalCarousel
  now: Ymdhm
  focused: boolean
  rowRef?: React.Ref<HTMLLIElement>
  onEnter?: () => void
}) {
  const busy = c.tier === 'unloading' || c.tier === 'alert'
  const elapsed = busy && c.flight ? Math.max(1, diffMinutes(now, c.flight.at)) : null

  return (
    <li
      ref={rowRef}
      onClick={onEnter}
      className={cn(
        'grid h-12 grid-cols-[280px_160px_230px_minmax(0,1fr)_80px_24px] items-center gap-4 px-4 first:rounded-t-md last:rounded-b-md',
        onEnter && 'cursor-pointer transition-colors hover:bg-gray-100',
        focused && 'bg-blue-100',
      )}
    >
      {/* 수취대 — 가장 진하게 */}
      <span className="flex min-w-0 items-center gap-2.5">
        <CarouselIcon tier={c.tier} />
        <span className="type-label-14 font-semibold text-gray-1000">{carouselName(c.id)}</span>
        <span className="truncate type-label-13 text-gray-900">{TERMINAL_NAME[c.terminal as TerminalId]}</span>
      </span>

      {/* 상태 + 경과 (Vercel "Ready 8s" 자리) */}
      <span className={cn('flex items-center gap-1.5 type-label-14 font-medium', c.tier === 'alert' ? 'text-red-900' : c.tier === 'idle' ? 'text-gray-700' : 'text-gray-1000')}>
        {TIER_LABEL[c.tier]}
        {elapsed !== null && <span className="type-label-13 font-normal text-gray-900 num">{elapsed}분째</span>}
      </span>

      {/* 지금 편 / 다음 편 (Vercel 커밋 해시 자리) */}
      <span className="flex min-w-0 items-center gap-1.5 type-label-13 text-gray-900">
        {c.flight ? (
          c.flight.role === 'now' ? (
            <>
              <AirplaneLandingIcon size={16} className="shrink-0" />
              <span className="type-mono-13 text-gray-1000">{c.flight.id}</span>
              <span className="type-mono-12">{c.flight.origin}</span>
            </>
          ) : (
            <>
              <ClockIcon size={16} className="shrink-0" />
              다음 <span className="type-mono-13 text-gray-1000">{c.flight.id}</span>
              <span className="type-mono-12 num">{fmtClock(c.flight.at)}</span>
            </>
          )
        ) : (
          <span className="text-gray-600">-</span>
        )}
      </span>

      {/* AI 예측 칩 (Vercel Production 칩 자리) */}
      <span>
        {c.live && (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-700 px-2 type-label-12 font-medium text-white">
            <SparkleIcon size={12} weight="fill" />
            AI 예측
          </span>
        )}
      </span>

      {/* 담당 (Vercel 작성자 아바타 자리) */}
      <span className="flex justify-end">
        <Avatars names={c.owners} size={20} />
      </span>

      <span className="flex justify-end text-gray-900">{onEnter && <ArrowRightIcon size={16} />}</span>
    </li>
  )
}
