/**
 * T1-03 수취대 (실제로 모델이 도는 곳) — 팀 데이터셋(api/data/t103.ts) 기준.
 * 데모 시각으로 편마다 상태를 다시 계산한다: 도착 예정 → 처리 중(착륙 ~ 마지막 짐) → 완료.
 * 예측은 도착 예정 1시간 전에 발행된다. 예측값은 목업이다(실제 처리 시간 ± 몇 분, 편마다 고정).
 */
import { useMemo } from 'react'

import { T103_ROWS } from '@/api/data/t103'
import { useDemoClock, useModels } from '@/api/hooks'
import type { ModelVersionId, Ymdhm } from '@/api/types'
import { ACTION_GUIDE, CREW_DEADLINE_LEAD_MIN } from '@/design/mock'
import { ACTION_THRESHOLD_MIN, addMinutes, diffMinutes } from '@/lib/format'

export const AIRCRAFT_NAME: Record<string, string> = {
  E95: 'E195', '223': 'A220-300', '319': 'A319', '320': 'A320', '32N': 'A320neo',
  '321': 'A321', '32Q': 'A321neo', '738': 'B737-800', '73H': 'B737-800', '7M8': 'B737 MAX 8',
  '739': 'B737-900', '788': 'B787-8', '332': 'A330-200', '763': 'B767-300', '333': 'A330-300',
  '789': 'B787-9', '339': 'A330-900neo', '772': 'B777-200', '359': 'A350-900', '781': 'B787-10',
  '773': 'B777-300', '77W': 'B777-300ER', '351': 'A350-1000', '748': 'B747-8', '388': 'A380',
}

export type CarouselFlightStatus = 'scheduled' | 'processing' | 'completed'

export interface CarouselFlight {
  id: string
  subtype: string
  aircraft: string
  seats: number
  eta: Ymdhm
  landing: Ymdhm
  status: CarouselFlightStatus
  /** 발행된 예측 (도착 예정 1시간 전부터). 아직이면 null */
  prediction: { minutes: number; lastBag: Ymdhm; issuedAt: Ymdhm; over: boolean; version: ModelVersionId } | null
  /** 예측 발행 시각 (= 도착 예정 − 60분) */
  issueAt: Ymdhm
  /** 완료한 편만 */
  actual: { minutes: number; lastBag: Ymdhm; errorMin: number } | null
  /** 처리 중이면 착륙 뒤 지난 분 */
  elapsedMin: number | null
}

export interface CarouselAction {
  flight: CarouselFlight
  predictedMin: number
  overMin: number
  /** 조 이동 마감 = 도착 예정 − 30분 */
  deadline: Ymdhm
  guide: string
}

export interface CarouselView {
  now: Ymdhm
  /** 오늘 편 (도착 예정 순) */
  today: CarouselFlight[]
  processing: CarouselFlight | null
  /** 아직 짐이 안 나온 편 중 가장 먼저 도착하는 편 */
  next: CarouselFlight | null
  /** 모델 입력: 최근 완료한 20편 (오래된 것 → 최근) */
  sequence: Array<{ id: string; minutes: number; seats: number; at: Ymdhm }>
  actions: CarouselAction[]
  stats: {
    completedToday: number
    /** 오늘 완료한 편의 평균 처리 시간 (분) */
    meanMin: number | null
    /** 오늘 완료한 편의 평균 오차 (분, 절댓값) */
    mae: number | null
  }
  production: ModelVersionId
}

function hash01(s: string): number {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return ((h >>> 0) % 10000) / 10000
}

/** 편마다 고정된 예측 오차 (−6 ~ +6분, 0 근처가 많다) */
function predictionError(id: string, eta: string): number {
  const a = hash01(`a-${id}-${eta}`)
  const b = hash01(`b-${id}-${eta}`)
  return Math.round((a + b - 1) * 6)
}

export function useCarousel(): CarouselView {
  const clock = useDemoClock()
  const models = useModels()

  return useMemo(() => {
    const now = clock.now
    const day = now.slice(0, 8)
    const all: CarouselFlight[] = T103_ROWS.map(([id, subtype, seats, eta, landing, lastBag, waitMin]) => {
      const e = eta as Ymdhm
      const l = landing as Ymdhm
      const b = lastBag as Ymdhm
      const issueAt = addMinutes(e, -60)
      const predicted = Math.max(15, waitMin - predictionError(id, eta))
      const status: CarouselFlightStatus = now >= b ? 'completed' : now >= l ? 'processing' : 'scheduled'
      return {
        id,
        subtype,
        aircraft: AIRCRAFT_NAME[subtype] ?? subtype,
        seats,
        eta: e,
        landing: l,
        status,
        issueAt,
        prediction:
          now >= issueAt
            ? {
                minutes: predicted,
                lastBag: addMinutes(l < e ? e : l, predicted),
                issuedAt: issueAt,
                over: predicted > ACTION_THRESHOLD_MIN,
                version: models.production,
              }
            : null,
        actual: status === 'completed' ? { minutes: waitMin, lastBag: b, errorMin: waitMin - predicted } : null,
        elapsedMin: status === 'processing' ? diffMinutes(now, l) : null,
      }
    })

    const today = all.filter((f) => f.eta.startsWith(day)).sort((a, b) => a.eta.localeCompare(b.eta))
    const processing = all.find((f) => f.status === 'processing') ?? null
    const next = all.filter((f) => f.status === 'scheduled').sort((a, b) => a.eta.localeCompare(b.eta))[0] ?? null
    const done = all.filter((f) => f.status === 'completed').sort((a, b) => a.actual!.lastBag.localeCompare(b.actual!.lastBag))
    const sequence = done.slice(-20).map((f) => ({ id: f.id, minutes: f.actual!.minutes, seats: f.seats, at: f.landing }))

    const actions = all
      .filter((f) => f.status !== 'completed' && f.prediction?.over)
      .map((f) => ({
        flight: f,
        predictedMin: f.prediction!.minutes,
        overMin: f.prediction!.minutes - ACTION_THRESHOLD_MIN,
        deadline: addMinutes(f.eta, -CREW_DEADLINE_LEAD_MIN),
        guide: ACTION_GUIDE,
      }))

    const doneToday = today.filter((f) => f.status === 'completed')
    const mean = (xs: number[]) => (xs.length ? Math.round((xs.reduce((s, x) => s + x, 0) / xs.length) * 10) / 10 : null)

    return {
      now,
      today,
      processing,
      next,
      sequence,
      actions,
      stats: {
        completedToday: doneToday.length,
        meanMin: mean(doneToday.map((f) => f.actual!.minutes)),
        mae: mean(doneToday.map((f) => Math.abs(f.actual!.errorMin))),
      },
      production: models.production,
    }
  }, [clock.now, models.production])
}
