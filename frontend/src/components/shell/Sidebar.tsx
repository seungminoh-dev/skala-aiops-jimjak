import { useState, type ComponentType, type ReactNode } from 'react'
import { motion } from 'motion/react'
import { NavLink, useLocation } from 'react-router-dom'
import {
  AirplaneTiltIcon,
  ArrowLeftIcon,
  BellIcon,
  ChartLineIcon,
  CubeIcon,
  FlaskIcon,
  ListBulletsIcon,
  SquaresFourIcon,
  SuitcaseRollingIcon,
} from '@phosphor-icons/react'

import { TIER_LABEL, type TerminalCarousel } from '@/api'
import { LIVE_CAROUSEL, PAGE_LABEL, PAGE_PATH, scopeOf, TENANT, type PageKey } from '@/app/routes'
import { MascotMark } from '@/components/mascot/Mascot'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { cn } from '@/lib/cn'
import { carouselName } from '@/lib/format'
import { SPRING } from '@/lib/motion'

import { Avatars } from './Avatars'

/**
 * 사이드바 255px — DESIGN.md "4. 배치". Vercel 대시보드 사이드바 실측값.
 * 맨 위: 고객사 시스템 이름 "Incheon Airport / 물류 관제 시스템". 맨 아래: 서비스 제공자 "Powered by 짐작".
 * 범위가 둘이다: 터미널 전체(Overview · 수취대 · 알림 · 로그 + 즐겨찾기) / 수취대(T1-07: 운영 · 엔지니어 묶음).
 */
type Icon = ComponentType<{ size?: number; className?: string }>

const TERMINAL_ITEMS: Array<{ page: PageKey; Icon: Icon }> = [
  { page: 'control', Icon: SquaresFourIcon },
  { page: 'carousels', Icon: SuitcaseRollingIcon },
  { page: 'alerts', Icon: BellIcon },
  { page: 'logs', Icon: ListBulletsIcon },
]

const CAROUSEL_GROUPS: Array<{ label: string; items: Array<{ page: PageKey; Icon: Icon }> }> = [
  {
    label: '운영',
    items: [
      { page: 'overview', Icon: SquaresFourIcon },
      { page: 'scenarios', Icon: FlaskIcon },
    ],
  },
  {
    label: '엔지니어',
    items: [
      { page: 'monitoring', Icon: ChartLineIcon },
      { page: 'models', Icon: CubeIcon },
    ],
  },
]

export function Sidebar({
  page,
  live,
  favorites,
  openAlerts,
}: {
  page: PageKey
  live: TerminalCarousel | undefined
  favorites: TerminalCarousel[]
  /** 터미널 전체 열린 알림 수 */
  openAlerts: number
}) {
  const scope = scopeOf(page)
  const location = useLocation()
  const focus = new URLSearchParams(location.search).get('focus')
  return (
    <aside className="fixed inset-y-0 left-0 z-30 flex w-[255px] flex-col border-r border-gray-alpha-400 bg-background-200">
      <Brand />
      <nav aria-label="화면" className="flex flex-1 flex-col gap-0.5 overflow-y-auto px-2 pt-2">
        {scope === 'terminal' ? (
          <>
            {TERMINAL_ITEMS.map(({ page: p, Icon }) => (
              <NavItem
                key={p}
                to={PAGE_PATH[p]}
                label={PAGE_LABEL[p]}
                icon={<Icon size={16} className="shrink-0" />}
                end
                trailing={p === 'alerts' && openAlerts > 0 ? <CountBadge n={openAlerts} /> : undefined}
              />
            ))}
            <GroupLabel>즐겨찾기</GroupLabel>
            {favorites.map((c) => (
              <NavItem
                key={c.id}
                to={c.live ? PAGE_PATH.overview : `${PAGE_PATH.carousels}?focus=${c.id}`}
                active={c.live ? undefined : page === 'carousels' && focus === c.id}
                layoutGroup="nav-fav"
                label={carouselName(c.id)}
                title={`${carouselName(c.id)} 수취대 ${TIER_LABEL[c.tier]}`}
                icon={<CarouselIcon tier={c.tier} />}
                trailing={<Avatars names={c.owners} size={18} />}
              />
            ))}
          </>
        ) : (
          <>
            <NavItem to={PAGE_PATH.control} label="터미널 전체" icon={<ArrowLeftIcon size={16} className="shrink-0" />} end />
            <div className="flex items-center gap-2 px-3 pt-3 pb-1">
              {live && <CarouselIcon tier={live.tier} />}
              <span className="type-label-14 font-medium text-gray-1000">{carouselName(LIVE_CAROUSEL)} 수취대</span>
            </div>
            {CAROUSEL_GROUPS.map((group) => (
              <div key={group.label} className="flex flex-col gap-0.5">
                <GroupLabel>{group.label}</GroupLabel>
                {group.items.map(({ page: p, Icon }) => (
                  <NavItem
                    key={p}
                    to={PAGE_PATH[p]}
                    label={PAGE_LABEL[p]}
                    icon={<Icon size={16} className="shrink-0" />}
                    end={p === 'overview'}
                  />
                ))}
              </div>
            ))}
          </>
        )}
      </nav>
      <ProviderMark />
    </aside>
  )
}

/** 맨 아래: 서비스 제공자 표시 — 고객사 시스템 안에 들어간 우리 서비스. 마우스를 올리면 마스코트가 짐을 나른다 */
function ProviderMark() {
  const [hover, setHover] = useState(false)
  return (
    <div
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      className="flex shrink-0 items-center gap-2 border-t border-gray-alpha-400 px-4 py-3"
      aria-label="Powered by 짐작"
    >
      <MascotMark active={hover} />
      <span className="flex flex-col">
        <span className="type-label-12 text-gray-700">Powered by</span>
        <span className="type-heading-14 text-gray-1000">짐작</span>
      </span>
    </div>
  )
}

/** 맨 위 56px (헤더와 같은 높이): 고객사 시스템 이름 */
function Brand() {
  return (
    <NavLink to={PAGE_PATH.control} className="flex h-14 shrink-0 items-center gap-2.5 px-4" aria-label={`${TENANT} 물류 관제 시스템 Overview로`}>
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-gray-1000 text-white">
        <AirplaneTiltIcon size={18} weight="fill" />
      </span>
      <span className="flex min-w-0 flex-col">
        <span className="truncate type-heading-14 text-gray-1000">{TENANT}</span>
        <span className="type-label-12 text-gray-900">물류 관제 시스템</span>
      </span>
    </NavLink>
  )
}

function GroupLabel({ children }: { children: string }) {
  return <div className="mt-3 border-t border-gray-alpha-400 px-3 pt-3 pb-1 type-label-12 text-gray-900">{children}</div>
}

function NavItem({
  to,
  label,
  icon,
  end,
  mono,
  title,
  trailing,
  active,
  layoutGroup = 'nav-main',
}: {
  /** 경로만으로 고를 수 없을 때(즐겨찾기 ?focus=) 직접 정한다 */
  active?: boolean
  /** 활성 바탕이 함께 미끄러지는 묶음 (메뉴 / 즐겨찾기) */
  layoutGroup?: string
  to: string
  label: string
  icon: ReactNode
  end?: boolean
  mono?: boolean
  title?: string
  trailing?: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={end}
      title={title}
      className={({ isActive }) =>
        cn(
          'relative flex h-9 items-center gap-2.5 rounded-md px-3 transition-colors',
          (active ?? isActive) ? 'text-gray-1000' : 'text-gray-900 hover:bg-gray-alpha-100 hover:text-gray-1000',
        )
      }
    >
      {({ isActive }) => (
        <>
          {/* 활성 표시 — 메뉴를 옮기면 바탕이 미끄러져 따라간다 */}
          {(active ?? isActive) && (
            <motion.span layoutId={layoutGroup} transition={SPRING} className="absolute inset-0 rounded-md bg-gray-200" aria-hidden />
          )}
          <span className="relative flex shrink-0">{icon}</span>
          <span className={cn('relative flex-1 truncate font-medium', mono ? 'type-mono-14' : 'type-label-14')}>{label}</span>
          {trailing && <span className="relative flex">{trailing}</span>}
        </>
      )}
    </NavLink>
  )
}

function CountBadge({ n }: { n: number }) {
  return (
    <span className="rounded-full bg-red-700 px-1.5 type-label-12 font-medium text-white num" aria-label={`열린 알림 ${n}건`}>
      {n}
    </span>
  )
}
