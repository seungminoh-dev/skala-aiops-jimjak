import { useEffect, useState } from 'react'
import { CheckCircleIcon, ClockIcon, SparkleIcon, WarningIcon } from '@phosphor-icons/react'

import type { CarouselFlight, CarouselFlightStatus } from '@/api'
import { FilterChips } from '@/components/common/FilterChips'
import { Pager } from '@/components/common/Pager'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

/**
 * 오늘 도착편 — Vercel Deployments 목록처럼 머리 줄 없이 아이콘·색으로 위계.
 *   편명(가장 진하게) + 기종 · 상태와 시각 · 예측 칩(파랑, 50분 넘으면 빨강) · 실제와 오차(회색)
 * 처음에는 다음 편이 있는 페이지를 연다.
 */
const PAGE = 8
type Filter = 'all' | CarouselFlightStatus
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: '전체' },
  { id: 'scheduled', label: '도착 예정' },
  { id: 'processing', label: '처리 중' },
  { id: 'completed', label: '완료' },
]

export function FlightList({ flights, nextId }: { flights: CarouselFlight[]; nextId: string | null }) {
  const [filter, setFilter] = useState<Filter>('all')
  const rows = flights.filter((f) => filter === 'all' || f.status === filter)
  const nextIndex = Math.max(0, rows.findIndex((f) => f.id === nextId))
  const [page, setPage] = useState(() => Math.floor(nextIndex / PAGE))

  useEffect(() => {
    setPage(filter === 'all' ? Math.floor(nextIndex / PAGE) : 0)
    // 거르기를 바꿀 때만 페이지를 다시 정한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter])

  const shown = rows.slice(page * PAGE, page * PAGE + PAGE)

  return (
    <div className="flex flex-col gap-3">
      <FilterChips
        value={filter}
        onChange={setFilter}
        items={FILTERS.map((f) => ({
          id: f.id,
          label: f.label,
          count: f.id === 'all' ? flights.length : flights.filter((x) => x.status === f.id).length,
        }))}
      />

      <ul key={`${filter}-${page}`} className="material-base divide-y divide-gray-alpha-400">
        {shown.map((f, i) => (
          <li
            key={f.id + f.eta}
            className={cn(
              'grid h-12 animate-fade-up grid-cols-[minmax(0,1fr)_190px_150px_150px] items-center gap-4 px-4',
              f.id === nextId && 'bg-blue-100',
            )}
            style={{ animationDelay: `${i * 30}ms` }}
          >
            {/* 편명 — 가장 진하게 */}
            <span className="flex min-w-0 items-center gap-2.5">
              <StatusIcon status={f.status} />
              <span className="type-mono-14 font-medium text-gray-1000">{f.id}</span>
              <span className="truncate type-label-13 text-gray-900">
                {f.aircraft} · {f.seats}석
              </span>
              {f.id === nextId && <span className="type-label-12 font-medium text-blue-900">다음 편</span>}
            </span>

            {/* 상태와 시각 */}
            <span className="flex items-center gap-1.5 type-label-14">
              {f.status === 'processing' ? (
                <>
                  <span className="font-medium text-gray-1000">처리 중</span>
                  <span className="type-label-13 text-gray-900 num">{f.elapsedMin}분째</span>
                </>
              ) : f.status === 'completed' ? (
                <>
                  <span className="font-medium text-gray-1000">완료</span>
                  <span className="type-mono-13 text-gray-900 num">{fmtClock(f.actual!.lastBag)}</span>
                </>
              ) : (
                <>
                  <span className="font-medium text-gray-1000">도착 예정</span>
                  <span className="type-mono-13 text-gray-900 num">{fmtClock(f.eta)}</span>
                </>
              )}
            </span>

            {/* 예측 칩 — 정보 계열: 예측 = 파랑, 50분 넘으면 빨강 */}
            <span>
              {f.prediction ? (
                <span
                  className={cn(
                    'inline-flex h-6 items-center gap-1 rounded-full px-2 type-label-12 font-medium num',
                    f.prediction.over ? 'bg-red-100 text-red-900' : 'bg-blue-100 text-blue-900',
                  )}
                >
                  {f.prediction.over ? <WarningIcon size={12} weight="bold" /> : <SparkleIcon size={12} weight="fill" />}
                  예측 {f.prediction.minutes}분
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 type-label-12 text-gray-700">
                  <ClockIcon size={12} />
                  {fmtClock(f.issueAt)} 발행
                </span>
              )}
            </span>

            {/* 실제와 오차 — 정보 계열: 실제 = 회색 */}
            <span className="flex items-center justify-end gap-2 type-label-13 text-gray-900">
              {f.actual ? (
                <>
                  실제 <span className="font-medium text-gray-1000 num">{f.actual.minutes}분</span>
                  <span className={cn('num', Math.abs(f.actual.errorMin) >= 5 ? 'text-amber-900' : 'text-gray-700')}>
                    {f.actual.errorMin > 0 ? '+' : ''}
                    {f.actual.errorMin}분
                  </span>
                </>
              ) : f.prediction ? (
                <>
                  마지막 짐 <span className="type-mono-13 font-medium text-gray-1000">{fmtClock(f.prediction.lastBag)}</span>
                </>
              ) : (
                <span className="text-gray-600">-</span>
              )}
            </span>
          </li>
        ))}
      </ul>

      <Pager page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
    </div>
  )
}

function StatusIcon({ status }: { status: CarouselFlightStatus }) {
  if (status === 'processing') return <CarouselIcon tier="unloading" />
  if (status === 'completed') return <CheckCircleIcon size={16} className="shrink-0 text-green-900" aria-label="완료" />
  return <ClockIcon size={16} className="shrink-0 text-gray-900" aria-label="도착 예정" />
}
