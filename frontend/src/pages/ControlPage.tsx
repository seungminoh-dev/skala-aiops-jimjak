import { useNavigate } from 'react-router-dom'
import { ArrowRightIcon, CheckCircleIcon, HandPalmIcon, WarningIcon } from '@phosphor-icons/react'

import { TIER_LABEL, useControlRoom, useTerminal, type AutoAction, type CarouselTier } from '@/api'
import { LIVE_CAROUSEL, PAGE_PATH } from '@/app/routes'
import { AnimatedNumber } from '@/components/common/AnimatedNumber'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { LiveCallout } from '@/components/terminal/LiveCallout'
import { TerminalMap2D } from '@/components/terminal/TerminalMap2D'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

/**
 * Overview (터미널 관제) — DESIGN.md "5. 화면 > Overview".
 * 경영진 PT용: 그래픽 위주 · 쉬운 숫자 · 한눈에 필요한 정보만.
 * 확인 필요(주요 정보)는 두 곳에서 강조한다: 상단 배너(AppShell) · 지도 말풍선. 말풍선의 X 로 닫는다.
 * 그 아래 Vercel 팀 Overview 처럼 왼쪽 좁은 칸(숫자 · 자동 처리) + 오른쪽 넓은 칸(터미널 2D 지도).
 */
export function ControlPage() {
  const room = useControlRoom()
  const terminal = useTerminal()
  const navigate = useNavigate()

  const enter = () => navigate(PAGE_PATH.overview)
  const liveTier = terminal.carousels.find((c) => c.live)?.tier ?? 'operating'

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">Overview</h1>

      <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6">
        <div className="flex flex-col gap-6">
          <Section title="지금">
            <div className="material-base divide-y divide-gray-alpha-400">
              <FigureRow
                label="확인 필요"
                sub={terminal.alerts.length > 0 ? '지도의 빨간 표시를 확인해 주세요' : '지금은 없어요'}
                value={String(terminal.alerts.length)}
                unit="건"
                tone={terminal.alerts.length > 0 ? 'red' : 'plain'}
              />
              <FigureRow
                label="하역 중"
                sub={`수취대 ${terminal.carousels.length}곳 중`}
                value={String(terminal.counts.unloading + terminal.counts.alert)}
                unit="곳"
              />
              <FigureRow label="자동 처리" sub="오늘 AI가 혼자 끝낸 일" value={String(room.autoActions.length)} unit="건" />
            </div>
          </Section>
          <Section title="자동 처리" aside={`오늘 자동 점검 ${room.autoChecks}회`}>
            <AutoList items={room.autoActions} />
          </Section>
        </div>

        <Section title="터미널">
          <div className="material-medium overflow-hidden">
            <StatusLegend counts={terminal.counts} />
            <div className="px-6 pt-5 pb-6">
              <TerminalMap2D
                zones={terminal.zones}
                alerts={terminal.alerts}
                onEnter={enter}
                callout={<LiveCallout liveId={LIVE_CAROUSEL} tier={liveTier} nextFlight={room.nextFlight} onEnter={enter} />}
              />
            </div>
          </div>
        </Section>
      </div>
    </div>
  )
}

/* ───────────────────────── 틀 ───────────────────────── */

function Section({ title, aside, children }: { title: string; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <div className="flex h-8 items-center justify-between gap-3">
        <h2 className="type-label-14 font-medium text-gray-1000">{title}</h2>
        {typeof aside === 'string' ? <span className="type-label-13 text-gray-900">{aside}</span> : aside}
      </div>
      {children}
    </section>
  )
}

/* ───────────────────────── 숫자 ───────────────────────── */

function FigureRow({
  label,
  sub,
  value,
  unit,
  tone = 'plain',
}: {
  label: string
  sub: React.ReactNode
  value: string
  unit?: string
  tone?: 'plain' | 'red'
}) {
  const red = tone === 'red'
  return (
    <div className={cn('flex items-center justify-between gap-4 px-4 py-3 first:rounded-t-md last:rounded-b-md', red && 'bg-red-100')}>
      <div className="flex min-w-0 flex-col gap-1">
        <span className={cn('flex items-center gap-1.5 type-label-14 font-medium', red ? 'text-red-900' : 'text-gray-1000')}>
          {red && <WarningIcon size={16} weight="bold" />}
          {label}
        </span>
        <span className="truncate type-label-13 text-gray-900">{sub}</span>
      </div>
      <span className="flex shrink-0 items-baseline gap-1">
        <AnimatedNumber value={value} className={cn('type-heading-32 num', tone === 'red' ? 'text-red-900' : 'text-gray-1000')} />
        {unit && <span className="type-label-14 text-gray-900">{unit}</span>}
      </span>
    </div>
  )
}

/* ───────────────────────── 자동 처리 ───────────────────────── */

function AutoList({ items }: { items: AutoAction[] }) {
  if (items.length === 0)
    return (
      <div className="material-base px-4 py-6 text-center type-label-13 text-gray-900">아직 AI가 처리한 일이 없어요</div>
    )
  return (
    <ul className="material-base divide-y divide-gray-alpha-400">
      {items.slice(0, 4).map((item) => (
        <li key={item.id} className="flex gap-3 px-4 py-3">
          {item.handedOver ? (
            <HandPalmIcon size={16} className="mt-px shrink-0 text-amber-900" aria-label="사람에게 넘김" />
          ) : (
            <CheckCircleIcon size={16} className="mt-px shrink-0 text-green-900" aria-label="자동 완료" />
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-1">
            <span className="type-mono-12 num text-gray-900">{fmtClock(item.at)}</span>
            <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 type-label-13 leading-[18px] text-gray-900">
              {item.steps.map((step, i) => (
                <span key={step} className="inline-flex items-center gap-1.5">
                  {i > 0 && <ArrowRightIcon size={12} className="text-gray-600" aria-hidden />}
                  <span className={cn(i === item.steps.length - 1 && 'font-medium text-gray-1000')}>{step}</span>
                </span>
              ))}
            </span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/* ───────────────────────── 지도 머리 ───────────────────────── */

const LEGEND: CarouselTier[] = ['unloading', 'operating', 'alert', 'idle']

function StatusLegend({ counts }: { counts: Record<CarouselTier, number> }) {
  return (
    <div className="flex items-center gap-5 border-b border-gray-alpha-400 px-6 py-3 type-label-13 text-gray-900">
      {LEGEND.map((tier) => (
        <span key={tier} className={cn('flex items-center gap-1.5', tier === 'alert' && 'text-red-900')}>
          <CarouselIcon tier={tier} />
          {TIER_LABEL[tier]} <span className="num font-medium text-gray-1000">{counts[tier]}</span>
        </span>
      ))}
    </div>
  )
}
