/**
 * 터미널 전체 (경영진 PT용 프로토타입) — DESIGN.md "2. 짐작만의 것 > 터미널 지도".
 *
 * - T1-03 은 팀 데이터셋(api/carousel)과 목업 서버의 흐름을 따른다: 확인 필요 · 하역 중 · 운영 중.
 * - 나머지 36곳은 보기용 목업이다. 데모 시각 10분마다 하역 중 / 운영 중이 바뀌고, 미사용은 고정이다.
 *   T1-19 · T2-08 은 처음부터 확인 필요 알림이 하나씩 있다(닫으면 사라진다).
 * - 알림을 닫으면(확인) 그 알림은 목록과 지도에서 빠지고, 수취대는 원래 상태로 돌아간다. 데모 초기화로 되살린다.
 */
import { useMemo, useSyncExternalStore } from 'react'

import { useControlRoom, type Intervention } from '@/api/control'
import { useCarousel } from '@/api/carousel'
import { useDemoClock } from '@/api/hooks'
import type { Ymdhm } from '@/api/types'
import { LIVE_CAROUSEL, type PageKey } from '@/app/routes'
import { buildTerminals, type CarouselSlot } from '@/components/terminal/geometry'
import { addMinutes } from '@/lib/format'

export type CarouselTier = 'idle' | 'operating' | 'unloading' | 'alert'

export const TIER_LABEL: Record<CarouselTier, string> = {
  unloading: '하역 중',
  operating: '운영 중',
  alert: '확인 필요',
  idle: '미사용',
}

export interface TerminalCarousel extends CarouselSlot {
  tier: CarouselTier
  /** 하역 중이면 지금 편, 운영 중이면 다음 편. 미사용이면 null */
  flight: { id: string; origin: string; role: 'now' | 'next'; at: Ymdhm } | null
  /** 담당 관제사 (목업, 이름) */
  owners: string[]
  /** 즐겨찾기 */
  favorite: boolean
}

export interface TerminalAlert {
  id: string
  carouselId: string
  title: string
  detail: string
  /** 알림 머리의 짧은 표시 (예: "기준 +13분"). 없으면 "확인 필요" */
  badge?: string
  /** 지도 말풍선 · 배너용 아주 짧은 표시 (예: "KE908 +13분") */
  short: string
  at: Ymdhm
  /** 누르면 갈 화면 (T1-07 만). 목업 수취대는 null */
  to: PageKey | null
}

export interface TerminalView {
  zones: Array<{ terminal: 'T1' | 'T2'; carousels: TerminalCarousel[] }>
  carousels: TerminalCarousel[]
  counts: Record<CarouselTier, number>
  /** 닫지 않은 알림 (최근 것 먼저) */
  alerts: TerminalAlert[]
  /** 닫은 알림 (알림 화면 기록용) */
  closedAlerts: TerminalAlert[]
}

/* ───────────────────────── 닫은 알림 (데모 동안만) ───────────────────────── */

let closed = new Set<string>()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((l) => l())

export function closeAlert(id: string) {
  closed = new Set(closed).add(id)
  emit()
}

/** 데모 초기화 때 닫은 알림을 되살린다 */
export function reopenAllAlerts() {
  closed = new Set()
  emit()
}

function useClosed(): Set<string> {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => closed,
  )
}

/* ───────────────────────── 목업 ───────────────────────── */

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** 미사용으로 고정된 수취대 (전체의 약 20%) */
const isIdle = (id: string) => id !== LIVE_CAROUSEL && hash01(`idle-${id}`) < 0.2

const AIRLINES = ['KE', 'OZ', '7C', 'LJ', 'TW', 'ZE', 'BX', 'RS', 'DL', 'CX', 'JL', 'VJ']
const ORIGINS = ['NRT', 'KIX', 'PVG', 'HKG', 'BKK', 'SGN', 'MNL', 'DAD', 'TPE', 'LAX', 'SIN', 'FUK', 'CEB', 'HAN']
const pick = <T,>(list: readonly T[], r: number) => list[Math.floor(r * list.length) % list.length]

/** 관제사 (목업). 즐겨찾기 · 수취대 목록에 담당으로 나온다 */
const OPERATORS = ['김하늘', '이도윤', '박서준', '최지아', '정민재']

/** 즐겨찾기: 내 담당(T1-07) + 자주 문제가 생기는 곳 */
export const FAVORITES = [LIVE_CAROUSEL, 'T1-19', 'T2-08', 'T2-12'] as const

function mockFlight(id: string, slot: number, role: 'now' | 'next', now: Ymdhm): TerminalCarousel['flight'] {
  const r = hash01(`flight-${id}-${slot}`)
  const num = 100 + Math.floor(hash01(`num-${id}-${slot}`) * 899)
  const at = role === 'now' ? addMinutes(now, -(5 + Math.floor(r * 30))) : addMinutes(now, 8 + Math.floor(r * 40))
  return { id: `${pick(AIRLINES, r)}${num}`, origin: pick(ORIGINS, hash01(`org-${id}-${slot}`)), role, at }
}

function ownersOf(id: string): string[] {
  if (id === LIVE_CAROUSEL) return ['김하늘', '이도윤']
  if (isIdle(id)) return []
  const a = pick(OPERATORS, hash01(`own-${id}`))
  return hash01(`own2-${id}`) < 0.25 ? [a, pick(OPERATORS, hash01(`own3-${id}`))].filter((v, i, arr) => arr.indexOf(v) === i) : [a]
}

/** 목업 알림 — 처음부터 떠 있다 */
function mockAlerts(day: string): TerminalAlert[] {
  return [
    {
      id: 'mock-T2-08',
      carouselId: 'T2-08',
      title: 'KE908 짐이 63분 걸릴 것 같아요',
      detail: '10:50까지 인력 추가·벨트 재배정 검토',
      badge: '기준 +13분',
      short: 'KE908 +13분',
      at: `${day}1022` as Ymdhm,
      to: null,
    },
    {
      id: 'mock-T1-19',
      carouselId: 'T1-19',
      title: 'OZ752 짐이 58분 걸릴 것 같아요',
      detail: '11:05까지 인력 추가·벨트 재배정 검토',
      badge: '기준 +8분',
      short: 'OZ752 +8분',
      at: `${day}1027` as Ymdhm,
      to: null,
    },
  ]
}

const fromIntervention = (i: Intervention): TerminalAlert => ({
  id: i.id,
  carouselId: LIVE_CAROUSEL,
  title: i.title,
  detail: i.detail,
  badge: i.badge,
  short: i.short,
  at: i.at,
  to: i.to,
})

/** 목업 알림 수취대의 지금 편 (알림 문장과 맞춘다) */
const MOCK_ALERT_FLIGHT: Record<string, { id: string; origin: string }> = {
  'T2-08': { id: 'KE908', origin: 'LAX' },
  'T1-19': { id: 'OZ752', origin: 'PVG' },
}

export function useTerminal(): TerminalView {
  const clock = useDemoClock()
  const room = useControlRoom()
  const live = useCarousel()
  const closedIds = useClosed()

  return useMemo(() => {
    const day = clock.now.slice(0, 8)
    const minutes = Number(clock.now.slice(8, 10)) * 60 + Number(clock.now.slice(10, 12))
    const slot = Math.floor(minutes / 10)

    const all = [...room.interventions.map(fromIntervention), ...mockAlerts(day)]
    const alerts = all.filter((a) => !closedIds.has(a.id)).sort((a, b) => b.at.localeCompare(a.at))
    const closedAlerts = all.filter((a) => closedIds.has(a.id))
    const alerting = new Set(alerts.map((a) => a.carouselId))

    const tierOf = (slotInfo: CarouselSlot): CarouselTier => {
      if (alerting.has(slotInfo.id)) return 'alert'
      if (slotInfo.live) return room.carousel.processing ? 'unloading' : 'operating'
      if (isIdle(slotInfo.id)) return 'idle'
      return hash01(`${slotInfo.id}-${slot}`) < 0.55 ? 'unloading' : 'operating'
    }

    const liveNow = live.processing
    const liveNext = live.next

    const flightOf = (c: CarouselSlot, tier: CarouselTier): TerminalCarousel['flight'] => {
      if (tier === 'idle') return null
      const busy = tier === 'unloading' || tier === 'alert'
      if (c.live) {
        const f = busy ? liveNow : liveNext
        return f ? { id: f.id, origin: f.aircraft, role: busy ? 'now' : 'next', at: busy ? f.landing : f.eta } : null
      }
      const fixed = MOCK_ALERT_FLIGHT[c.id]
      if (fixed && busy) return { ...fixed, role: 'now', at: addMinutes(clock.now, -18) }
      return mockFlight(c.id, slot, busy ? 'now' : 'next', clock.now)
    }

    const zones = buildTerminals(LIVE_CAROUSEL).map((z) => ({
      terminal: z.terminal,
      carousels: z.slots.map((s): TerminalCarousel => {
        const tier = tierOf(s)
        return {
          ...s,
          tier,
          flight: flightOf(s, tier),
          owners: ownersOf(s.id),
          favorite: (FAVORITES as readonly string[]).includes(s.id),
        }
      }),
    }))
    const carousels = zones.flatMap((z) => z.carousels)
    const counts: Record<CarouselTier, number> = { unloading: 0, operating: 0, alert: 0, idle: 0 }
    carousels.forEach((c) => (counts[c.tier] += 1))

    return { zones, carousels, counts, alerts, closedAlerts }
  }, [clock.now, room, live, closedIds])
}
