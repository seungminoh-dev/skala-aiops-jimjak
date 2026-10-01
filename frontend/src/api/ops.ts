/**
 * 운영 현황 계산 — design/mock 의 도착편 37편·라인 10개를 "지금(now)" 기준으로 다시 계산한다.
 *
 * 편마다 정해 둔 사실(truth): 실제 착륙 · 예측 처리 시간 · 실제 처리 시간(→ 마지막 짐).
 * - mock 이 10:30 에 이미 착륙·완료로 둔 편은 그 값 그대로. 아직 안 온 편은 편명 씨앗으로 정한다
 *   (착륙 = ETA − 2~9분, 예측 없던 편 = 기종 좌석 수로 잡은 처리 시간 ±, 실제 = 예측 −4 ~ +5분).
 * - 그래서 10:30 에서 계산하면 /design 시트와 같은 모습이 나온다(라인 상태만 아래 규칙으로 다시 정한다).
 *
 * 규칙
 * - 편 상태: now < 착륙 → 도착 예정 · 착륙 ~ 착륙+8분 → 착륙 · ~ 마지막 짐 → 처리 중 · 그 뒤 → 완료
 * - 예측 발행: now ≥ ETA − 60분 (발행한 모델 버전 = 그 시각의 운영 버전)
 * - 조치 필요: 예측 발행됨(= 1시간 안 도착 또는 이미 착륙) + 예측 50분 초과 + 아직 완료 전
 * - 조치 문구: 근거 있는 것만 (ACTION_GUIDE, 조 이동 마감 = 착륙 예정 30분 전). 인원·벨트 번호 처방 없음
 * - 라인 상태: 조치 필요 편이 있으면 조치 필요 / 벨트 위 편이 있고 (다음 편이 30분 안 도착이거나 남은 예상 처리 20분 이상) 혼잡 / 그 밖 원활
 */
import type {
  ActionItem,
  FigureItem,
  Flight,
  FlightActual,
  FlightStatus,
  Line,
  LineDetailView,
  LineId,
  LineStatus,
  ModelVersionId,
  NextPrediction,
  OpsFigures,
  OpsView,
  Overlap,
  Prediction,
  ProductionChange,
  SequenceStep,
  TimelineBar,
  WhatIf,
  Ymdhm,
} from '@/api/types'
import { hashSeed, seededInt, seededRandom } from '@/api/random'
import {
  ACTION_GUIDE,
  CREW_DEADLINE_LEAD_MIN,
  demo,
  flights as MOCK_FLIGHTS,
  lineDetail as MOCK_LINE_DETAIL,
  lines as MOCK_LINES,
  seatTable,
  whatIfOptions,
} from '@/design/mock'
import { ACTION_THRESHOLD_MIN, addMinutes, diffMinutes, fmtDecimal, minuteOfDay } from '@/lib/format'

/** 데모 기준 시각 2026-10-01 10:30 */
export const DEMO_BASE: Ymdhm = demo.now
/** 착륙 뒤 이만큼 지나면 벨트에 짐이 나온다(처리 중) */
const LANDED_TO_BELT_MIN = 8
/** 타임라인 범위 */
const WINDOW_BEFORE_MIN = 60
const WINDOW_SPAN_MIN = 240
const TICK_MIN = 30

/* ───────────────────────── 편마다 정해 둔 사실 ───────────────────────── */

interface FlightTruth {
  /** mock 의 편 (편명·항공사·출발지·기종·라인·계획·ETA 같은 고정 값) */
  base: Flight
  landing: Ymdhm
  predictedMin: number
  actualMin: number
  lastBag: Ymdhm
}

const seatsOf = (aircraft: string): number => seatTable.find((r) => r.aircraft === aircraft)?.seats ?? 180
/** 예측 발행 전 막대 길이 / 예측이 없던 편의 예측 — 기종 좌석 수로 잡은 보통 처리 시간 (mock 과 같은 식) */
const typicalMinutes = (seats: number) => Math.round(20 + seats * 0.065)

function buildTruth(f: Flight): FlightTruth {
  const predictedMin = f.prediction?.minutes ?? typicalMinutes(f.seats) + seededInt(`${f.id}:pred`, -2, 3)

  if (f.actual && f.landing) {
    return { base: f, landing: f.landing, predictedMin, actualMin: f.actual.minutes, lastBag: f.actual.lastBag }
  }

  const landing: Ymdhm = f.landing ?? (() => {
    const t = addMinutes(f.eta, -seededInt(`${f.id}:land`, 2, 9))
    return t > DEMO_BASE ? t : addMinutes(DEMO_BASE, 1)
  })()
  let actualMin = Math.max(15, predictedMin + seededInt(`${f.id}:err`, -4, 5))
  // 10:30 에 처리 중이던 편은 10:30 뒤에 끝나야 한다 (/design 시트와 같은 모습)
  if (f.status === 'processing' || f.status === 'landed') {
    actualMin = Math.max(actualMin, diffMinutes(DEMO_BASE, landing) + 3)
  }
  return { base: f, landing, predictedMin, actualMin, lastBag: addMinutes(landing, actualMin) }
}

const TRUTHS: FlightTruth[] = MOCK_FLIGHTS.map(buildTruth)

/* ───────────────────────── 시각 ───────────────────────── */

/** 그 시각의 운영 버전 */
export function versionAt(history: readonly ProductionChange[], t: Ymdhm): ModelVersionId {
  let v = history[0]?.version ?? 'v1'
  for (const h of history) if (h.at <= t) v = h.version
  return v
}

/** (지금 − 1시간)을 30분 단위로 내린 시각 ~ +4시간 */
export function opsWindow(now: Ymdhm): { start: Ymdhm; end: Ymdhm } {
  const from = addMinutes(now, -WINDOW_BEFORE_MIN)
  const start = addMinutes(from, -(minuteOfDay(from) % TICK_MIN))
  return { start, end: addMinutes(start, WINDOW_SPAN_MIN) }
}

/* ───────────────────────── 편 ───────────────────────── */

function statusAt(t: FlightTruth, now: Ymdhm): FlightStatus {
  if (now < t.landing) return 'scheduled'
  if (now < addMinutes(t.landing, LANDED_TO_BELT_MIN)) return 'landed'
  if (now < t.lastBag) return 'processing'
  return 'completed'
}

function flightAt(t: FlightTruth, now: Ymdhm, history: readonly ProductionChange[]): Flight {
  const f = t.base
  const status = statusAt(t, now)
  const landing = status === 'scheduled' ? null : t.landing
  const issued = now >= f.predictionIssueAt

  const prediction: Prediction | null = issued
    ? {
        issuedAt: f.predictionIssueAt,
        minutes: t.predictedMin,
        overThreshold: t.predictedMin > ACTION_THRESHOLD_MIN,
        expectedLastBag: addMinutes(landing ?? f.eta, t.predictedMin),
        modelVersion: versionAt(history, f.predictionIssueAt),
      }
    : null

  const actual: FlightActual | null =
    status === 'completed' ? { lastBag: t.lastBag, minutes: t.actualMin, errorMin: t.actualMin - t.predictedMin } : null

  const start = landing ?? f.eta
  const bar: TimelineBar = actual
    ? { start, end: actual.lastBag, basis: 'actual', lane: 0 }
    : prediction
      ? { start, end: addMinutes(start, prediction.minutes), basis: 'predicted', lane: 0 }
      : { start, end: addMinutes(start, typicalMinutes(f.seats)), basis: 'typical', lane: 0 }

  return {
    ...f,
    landing,
    status,
    prediction,
    actual,
    needsAction: Boolean(prediction?.overThreshold) && status !== 'completed',
    bar,
  }
}

/** 한 라인 안에서 시간이 겹치는 막대를 아래 단으로 (mock 과 같은 규칙) */
function assignLanes(list: Flight[]): void {
  const byLine = new Map<LineId, Flight[]>()
  for (const f of list) byLine.set(f.lineId, [...(byLine.get(f.lineId) ?? []), f])
  for (const group of byLine.values()) {
    const laneEnds: Ymdhm[] = []
    for (const f of [...group].sort((a, b) => a.bar.start.localeCompare(b.bar.start))) {
      let lane = laneEnds.findIndex((end) => end <= f.bar.start)
      if (lane === -1) lane = laneEnds.length
      laneEnds[lane] = f.bar.end
      f.bar.lane = lane
    }
  }
}

/** now 기준 도착편 전부 (ETA 오름차순) */
export function flightsAt(now: Ymdhm, history: readonly ProductionChange[]): Flight[] {
  const list = TRUTHS.map((t) => flightAt(t, now, history))
  assignLanes(list)
  return list.sort((a, b) => (a.eta === b.eta ? a.id.localeCompare(b.id) : a.eta.localeCompare(b.eta)))
}

/* ───────────────────────── 조치 필요 ───────────────────────── */

export function actionItemFor(f: Flight, now: Ymdhm): ActionItem | null {
  if (!f.needsAction || !f.prediction) return null
  return {
    flightId: f.id,
    lineId: f.lineId,
    predictedMin: f.prediction.minutes,
    overMin: f.prediction.minutes - ACTION_THRESHOLD_MIN,
    eta: f.eta,
    minutesToEta: diffMinutes(f.eta, now),
    action: ACTION_GUIDE,
    crewDeadline: addMinutes(f.eta, -CREW_DEADLINE_LEAD_MIN),
  }
}

export function nextPredictionAt(list: readonly Flight[], now: Ymdhm): NextPrediction | null {
  const f = list
    .filter((x) => x.prediction === null && x.predictionIssueAt > now)
    .sort((a, b) => a.predictionIssueAt.localeCompare(b.predictionIssueAt))[0]
  return f ? { at: f.predictionIssueAt, flightId: f.id, lineId: f.lineId } : null
}

/* ───────────────────────── 라인 ───────────────────────── */

const isActive = (f: Flight) => f.status === 'landed' || f.status === 'processing'

function lineStatusOf(own: readonly Flight[], now: Ymdhm): LineStatus {
  if (own.some((f) => f.needsAction)) return 'critical'
  const active = own.filter(isActive)
  if (active.length === 0) return 'normal'
  const next = own.filter((f) => f.status === 'scheduled').sort((a, b) => a.eta.localeCompare(b.eta))[0]
  const nextSoon = next !== undefined && diffMinutes(next.eta, now) <= 30
  const longRemaining = active.some((f) => f.prediction && diffMinutes(f.prediction.expectedLastBag, now) >= 20)
  return nextSoon || longRemaining ? 'busy' : 'normal'
}

function linesAt(list: readonly Flight[], now: Ymdhm, start: Ymdhm, end: Ymdhm): Line[] {
  return MOCK_LINES.map((base) => {
    const own = list.filter((f) => f.lineId === base.id)
    const next = own.filter((f) => f.status === 'scheduled').sort((a, b) => a.eta.localeCompare(b.eta))[0]
    const visible = own.filter((f) => f.bar.end > start && f.bar.start < end)
    return {
      ...base,
      status: lineStatusOf(own, now),
      processingFlightIds: own.filter((f) => f.status === 'processing').map((f) => f.id),
      landedFlightIds: own.filter((f) => f.status === 'landed').map((f) => f.id),
      nextFlightId: next ? next.id : null,
      lanes: visible.length > 0 ? Math.max(...visible.map((f) => f.bar.lane)) + 1 : 1,
    }
  })
}

/* ───────────────────────── 숫자 줄 ───────────────────────── */

/** 이 37편 밖에서 오늘 0시 ~ 09시 사이 착륙한 편 (mock 숫자 줄 160편 = 147 + 10:30 까지 착륙한 13편) */
const EARLIER_ARRIVALS = 147
/** 그 편들의 예측 오차 (mock 숫자 줄 4.1분) */
const EARLIER_MAE = 4.1
const EARLIER_UNTIL_MIN = 9 * 60

function figuresAt(list: readonly Flight[], now: Ymdhm): OpsFigures {
  // 목업 도착편은 2026-10-01 하루치뿐이다 — 다른 날을 지정하면 0
  const sameDay = now.slice(0, 8) === DEMO_BASE.slice(0, 8)
  const before = sameDay ? Math.round(EARLIER_ARRIVALS * Math.min(1, minuteOfDay(now) / EARLIER_UNTIL_MIN)) : 0
  const landed = sameDay ? list.filter((f) => f.status !== 'scheduled').length : 0
  const done = sameDay ? list.filter((f) => f.actual) : []
  const errSum = done.reduce((s, f) => s + Math.abs(f.actual!.errorMin), 0)
  const n = before + done.length
  return {
    todayArrivals: before + landed,
    processing: list.filter((f) => f.status === 'processing').length,
    arrivingIn3h: list.filter((f) => f.status === 'scheduled' && diffMinutes(f.eta, now) <= 180).length,
    todayErrorMin: n === 0 ? null : Math.round(((EARLIER_MAE * before + errSum) / n) * 10) / 10,
  }
}

function figureRowOf(fig: OpsFigures): FigureItem[] {
  return [
    { label: '오늘 도착', value: String(fig.todayArrivals), unit: '편' },
    { label: '처리 중', value: String(fig.processing), unit: '편' },
    { label: '3시간 안 도착', value: String(fig.arrivingIn3h), unit: '편' },
    fig.todayErrorMin === null
      ? { label: '오늘 예측 오차', value: '-' }
      : { label: '오늘 예측 오차', value: fmtDecimal(fig.todayErrorMin), unit: '분' },
  ]
}

/* ───────────────────────── 운영 현황 한 벌 ───────────────────────── */

export function computeOps(now: Ymdhm, pinned: boolean, history: readonly ProductionChange[]): OpsView {
  const { start, end } = opsWindow(now)
  const list = flightsAt(now, history)
  const figures = figuresAt(list, now)
  return {
    now,
    pinned,
    windowStart: start,
    windowEnd: end,
    flights: list,
    windowFlights: list.filter((f) => f.eta >= start && f.eta <= end),
    lines: linesAt(list, now, start, end),
    actionItems: list.map((f) => actionItemFor(f, now)).filter((a): a is ActionItem => a !== null),
    nextPrediction: nextPredictionAt(list, now),
    figures,
    figureRow: figureRowOf(figures),
  }
}

/* ───────────────────────── 라인 상세 서랍 ───────────────────────── */

const isUpcoming = (f: Flight) => f.status === 'scheduled' || f.status === 'landed'

/** 서랍에 보일 편: 고른 편(아직 처리 전) → 조치 필요 편 → 라인의 다음 편 */
export function resolveFocus(ops: OpsView, lineId: LineId, flightId?: string | null): Flight | null {
  const own = ops.flights.filter((f) => f.lineId === lineId)
  const picked = flightId ? own.find((f) => f.id === flightId) : undefined
  if (picked && isUpcoming(picked)) return picked
  const action = own.filter((f) => f.needsAction && isUpcoming(f)).sort((a, b) => a.eta.localeCompare(b.eta))[0]
  if (action) return action
  const nextId = ops.lines.find((l) => l.id === lineId)?.nextFlightId
  return nextId ? (own.find((f) => f.id === nextId) ?? null) : null
}

function overlapsWith(focus: Flight, others: readonly Flight[]): Overlap[] {
  if (focus.bar.basis === 'typical') return []
  return others
    .filter((o) => o.id !== focus.id && o.bar.basis !== 'typical')
    .filter((o) => o.bar.start < focus.bar.end && o.bar.end > focus.bar.start)
    .map((o): Overlap => {
      const start = o.bar.start > focus.bar.start ? o.bar.start : focus.bar.start
      const end = o.bar.end < focus.bar.end ? o.bar.end : focus.bar.end
      return {
        flight: o,
        position: o.bar.start <= focus.bar.start ? 'before' : 'after',
        start,
        end,
        minutes: diffMinutes(end, start),
        basis: o.bar.basis === 'actual' ? 'actual' : 'predicted',
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

interface HistoryItem {
  flightId: string
  aircraft: string
  landing: Ymdhm
  waitMin: number
}

/**
 * 모델 입력 20편 — 그 라인에서 지금까지 끝난 편(실측)을 맨 뒤에 두고, 앞은 채운다.
 * T1-03 은 기획서 예시(mock.lineDetail 20편)로, 다른 라인은 라인 씨앗 난수로 채운다 (같은 라인이면 늘 같은 값).
 */
function historyFor(lineId: LineId, own: readonly Flight[]): HistoryItem[] {
  const done: HistoryItem[] = own
    .filter((f) => f.actual && f.landing)
    .sort((a, b) => a.landing!.localeCompare(b.landing!))
    .map((f) => ({ flightId: f.id, aircraft: f.aircraft, landing: f.landing!, waitMin: f.actual!.minutes }))
  const doneIds = new Set(own.map((f) => f.id))

  const prefix: HistoryItem[] =
    lineId === MOCK_LINE_DETAIL.lineId
      ? MOCK_LINE_DETAIL.sequence
          .filter((s) => !doneIds.has(s.flightId))
          .map(({ flightId, aircraft, landing, waitMin }) => ({ flightId, aircraft, landing, waitMin }))
      : []

  const items = [...prefix, ...done]
  const rand = seededRandom(hashSeed(lineId))
  const aircraftPool = [...new Set(own.map((f) => f.aircraft))]
  const airlinePool = [...new Set(own.map((f) => f.airline.code))]
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]
  let t: Ymdhm = items[0]?.landing ?? addMinutes(DEMO_BASE, -50)
  while (items.length < 20) {
    t = addMinutes(t, -(40 + Math.floor(rand() * 60)))
    const aircraft = pick(aircraftPool)
    const waitMin = Math.round(20 + seatsOf(aircraft) * 0.065 + rand() * 10 - 4)
    items.unshift({ flightId: `${pick(airlinePool)}${100 + Math.floor(rand() * 900)}`, aircraft, landing: t, waitMin })
  }
  return items.slice(-20)
}

function toSequence(history: readonly HistoryItem[], focusSeats: number | null): SequenceStep[] {
  return history.map((h, i) => ({
    no: i + 1,
    flightId: h.flightId,
    aircraft: h.aircraft,
    seats: seatsOf(h.aircraft),
    landing: h.landing,
    waitMin: h.waitMin,
    nextSeats: i + 1 < history.length ? seatsOf(history[i + 1].aircraft) : (focusSeats ?? seatsOf(h.aircraft)),
  }))
}

function whatIfFor(focus: Flight): WhatIf | null {
  if (!focus.prediction) return null
  return {
    baseAircraft: focus.aircraft,
    baseSeats: focus.seats,
    baseMinutes: focus.prediction.minutes,
    options: whatIfOptions(focus.prediction.minutes, focus.seats),
  }
}

export function buildLineDetail(ops: OpsView, lineId: LineId, flightId?: string | null): LineDetailView | null {
  const line = ops.lines.find((l) => l.id === lineId)
  if (!line) return null
  const own = ops.flights.filter((f) => f.lineId === lineId)
  const focus = resolveFocus(ops, lineId, flightId)
  const lineFlights = own.filter((f) => f.bar.end > ops.windowStart && f.bar.start < ops.windowEnd)
  return {
    line,
    focus,
    isNext: focus !== null && focus.id === line.nextFlightId,
    action: focus ? actionItemFor(focus, ops.now) : null,
    now: ops.now,
    windowStart: ops.windowStart,
    windowEnd: ops.windowEnd,
    lineFlights,
    overlaps: focus ? overlapsWith(focus, lineFlights) : [],
    sequence: toSequence(historyFor(lineId, own), focus?.seats ?? null),
    whatIf: focus ? whatIfFor(focus) : null,
  }
}
