/**
 * 라인 상세 서랍에 넣을 값 — mock.ts 를 가공한다.
 *
 * 서랍 순서(DESIGN.md "라인 상세 서랍"): 판단 → 조치 → 같은 수취대 상황 → 근거(접기).
 * - 판단: 서랍에 보일 편(focus)의 예측과 기준 대비.
 * - 조치: focus 가 조치 필요 편일 때만 (mock.actionItemFor — 조치 문구의 근거 규칙).
 * - 같은 수취대 상황: 이 라인의 지금 −1시간 ~ +3시간 편(타임라인 한 행 조각)과, focus 와 처리 시간이 겹치는 편.
 * - 근거: 모델 입력 20편 + 가정 시뮬레이터.
 *   T1-03 + 다음 편 UA892 는 mock.lineDetail 을 그대로 쓴다 (기획서 예시 20편).
 *   다른 라인은 mock 에 모델 입력 20편이 없어서 여기서 만든다:
 *   그 라인의 완료 편(실측 처리 시간)을 맨 뒤에 두고, 그 앞은 그 라인의 항공사·기종으로 정해진 씨앗의 난수로 채운다.
 *   같은 라인이면 언제 열어도 같은 값이 나온다.
 *   가정 시뮬레이터는 mock.whatIfOptions (좌석 100석당 +4.5분 근사)로 계산한다.
 */
import {
  actionItemFor,
  demo,
  flightsOnLine,
  getFlight,
  getLine,
  lineDetail,
  seatTable,
  whatIfOptions,
  type ActionItem,
  type Flight,
  type Line,
  type LineId,
  type SequenceStep,
  type WhatIfOption,
  type Ymdhm,
} from '@/design/mock'
import { addMinutes, diffMinutes } from '@/lib/format'

export interface WhatIf {
  baseAircraft: string
  baseSeats: number
  baseMinutes: number
  options: WhatIfOption[]
}

/** focus 와 처리 시간이 겹치는 같은 라인의 편 */
export interface Overlap {
  flight: Flight
  /** focus 보다 먼저 시작하면 앞 편 */
  position: 'before' | 'after'
  start: Ymdhm
  end: Ymdhm
  minutes: number
  /** 겹친 편의 막대가 예측인가 실측인가 */
  basis: 'predicted' | 'actual'
}

export interface DrawerDetail {
  line: Line
  /** 서랍 "다음 편 예측"에 보일 편 (그 라인에 남은 편이 없으면 null) */
  focus: Flight | null
  /** focus 가 그 라인의 바로 다음 편인가 (아니면 "선택한 편 예측") */
  isNext: boolean
  /** focus 가 조치 필요 편이면 그 조치 */
  action: ActionItem | null
  /** 기준 시각과 타임라인 범위 (지금 −1시간 ~ +3시간) */
  now: Ymdhm
  windowStart: Ymdhm
  windowEnd: Ymdhm
  /** 이 라인에서 타임라인 범위에 걸리는 편 */
  lineFlights: Flight[]
  /** focus 와 처리 시간이 겹치는 편 (예측·실측 막대만. 예측 발행 전 편은 길이 근거가 없어 넣지 않는다) */
  overlaps: Overlap[]
  /** 모델 입력 20편 (1 = 가장 오래된 편, 20 = 가장 최근 편) */
  sequence: SequenceStep[]
  /** 예측이 아직 없으면 null */
  whatIf: WhatIf | null
}

const seatsOf = (aircraft: string): number => seatTable.find((r) => r.aircraft === aircraft)?.seats ?? 0

/** 아직 처리 전인 편 (서랍 예측 대상) */
const isUpcoming = (f: Flight) => f.status === 'scheduled' || f.status === 'landed'

/**
 * 서랍에 보일 편.
 * 고른 편이 그 라인의 아직 처리 전인 편이면 그 편, 아니면 조치 필요 편, 아니면 라인의 다음 편.
 */
export function resolveFocus(lineId: LineId, flightId?: string | null): Flight | null {
  const own = flightsOnLine(lineId)
  const picked = flightId ? own.find((f) => f.id === flightId) : undefined
  if (picked && isUpcoming(picked)) return picked
  const action = own.filter((f) => f.needsAction && isUpcoming(f)).sort((a, b) => a.eta.localeCompare(b.eta))[0]
  if (action) return action
  const nextId = getLine(lineId)?.nextFlightId
  return nextId ? (getFlight(nextId) ?? null) : null
}

/* ───────────── 같은 수취대 상황 ───────────── */

function overlapsWith(focus: Flight, others: Flight[]): Overlap[] {
  if (focus.bar.basis === 'typical') return []
  return others
    .filter((o) => o.id !== focus.id && o.bar.basis !== 'typical')
    .filter((o) => o.bar.start < focus.bar.end && o.bar.end > focus.bar.start)
    .map((o) => {
      const start = o.bar.start > focus.bar.start ? o.bar.start : focus.bar.start
      const end = o.bar.end < focus.bar.end ? o.bar.end : focus.bar.end
      return {
        flight: o,
        position: o.bar.start <= focus.bar.start ? ('before' as const) : ('after' as const),
        start,
        end,
        minutes: diffMinutes(end, start),
        basis: o.bar.basis === 'actual' ? ('actual' as const) : ('predicted' as const),
      }
    })
    .sort((a, b) => a.start.localeCompare(b.start))
}

/* ───────────── 모델 입력 20편 ───────────── */

interface HistoryItem {
  flightId: string
  aircraft: string
  landing: Ymdhm
  waitMin: number
}

/** 문자열 → 32비트 씨앗 */
function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** 씨앗 난수 (mulberry32) — 0 이상 1 미만 */
function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const unique = <T,>(list: T[]): T[] => [...new Set(list)]

function historyFor(lineId: LineId): HistoryItem[] {
  if (lineId === lineDetail.lineId) {
    return lineDetail.sequence.map(({ flightId, aircraft, landing, waitMin }) => ({ flightId, aircraft, landing, waitMin }))
  }

  const own = flightsOnLine(lineId)
  const done: HistoryItem[] = own
    .filter((f) => f.actual && f.landing)
    .sort((a, b) => a.landing!.localeCompare(b.landing!))
    .map((f) => ({ flightId: f.id, aircraft: f.aircraft, landing: f.landing!, waitMin: f.actual!.minutes }))

  const rand = seededRandom(hashSeed(lineId))
  const pick = <T,>(list: T[]): T => list[Math.floor(rand() * list.length)]
  const aircraftPool = unique(own.map((f) => f.aircraft))
  const airlinePool = unique(own.map((f) => f.airline.code))

  const items = [...done]
  let t: Ymdhm = done[0]?.landing ?? addMinutes(demo.now, -50)
  while (items.length < 20) {
    t = addMinutes(t, -(40 + Math.floor(rand() * 60)))
    const aircraft = pick(aircraftPool)
    const waitMin = Math.round(20 + seatsOf(aircraft) * 0.065 + rand() * 10 - 4)
    items.unshift({ flightId: `${pick(airlinePool)}${100 + Math.floor(rand() * 900)}`, aircraft, landing: t, waitMin })
  }
  return items.slice(-20)
}

function toSequence(history: HistoryItem[], focusSeats: number | null): SequenceStep[] {
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

/** 서랍 내용 한 벌 */
export function buildDrawerDetail(lineId: LineId, flightId?: string | null): DrawerDetail {
  const line = getLine(lineId)!
  const focus = resolveFocus(lineId, flightId)
  const isNext = focus !== null && focus.id === line.nextFlightId
  const lineFlights = flightsOnLine(lineId).filter((f) => f.bar.end > demo.windowStart && f.bar.start < demo.windowEnd)

  const common = {
    line,
    focus,
    isNext,
    action: focus ? actionItemFor(focus) : null,
    now: demo.now,
    windowStart: demo.windowStart,
    windowEnd: demo.windowEnd,
    lineFlights,
    overlaps: focus ? overlapsWith(focus, lineFlights) : [],
  }

  // 기획서 예시 그대로
  if (focus && lineId === lineDetail.lineId && focus.id === lineDetail.next.flightId) {
    return {
      ...common,
      sequence: lineDetail.sequence,
      whatIf: { ...lineDetail.whatIf, baseSeats: lineDetail.next.seats },
    }
  }

  return {
    ...common,
    sequence: toSequence(historyFor(lineId), focus?.seats ?? null),
    whatIf: focus ? whatIfFor(focus) : null,
  }
}
