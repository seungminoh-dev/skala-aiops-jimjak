/**
 * /design 시트용 목업 데이터 — 백엔드 호출 없음.
 *
 * 데모 기준 시각: 2026-10-01 10:30 KST (demo.now).
 * 근거 데이터: bagtime_data/flights_real_20261001.csv (인천공항 조업사용 API, 200편, 0~12시 착륙),
 *              bagtime_data/seat_table.csv (기종 25종 대표 좌석 수).
 * - 지금 이전(완료·처리 중)은 실제 편을 그대로 쓰고, 빈 곳과 12시 이후 편은 그 라인의 실제 항공사·기종으로 채웠다.
 * - T1-03 의 KC909·7C1396 은 데모 시각(10:30)에 맞춰 착륙 시각만 당겼다. 처리 시간(46·30분)과 순서는 실제 그대로.
 * - 시각은 모두 "YYYYMMDDHHMM" 문자열 (lib/format 의 fmtClock 등으로 표기).
 * - 오차(errorMin) = 실제 − 예측 (양수 = 예측보다 늦게 끝남).
 */
import {
  ACTION_THRESHOLD_MIN,
  addMinutes,
  diffMinutes,
  type FlightStatus,
  type LineStatus,
  type LogTag,
  type ScenarioCategory,
  type ServerStatus,
  type StepState,
  type VerdictInput,
  type VerdictKind,
  type Ymdhm,
} from '@/lib/format'

export type {
  FlightStatus,
  LineStatus,
  LogTag,
  ScenarioCategory,
  ServerStatus,
  StepState,
  VerdictInput,
  VerdictKind,
  Ymdhm,
}

/* ═════════════════════════════ 공통 ═════════════════════════════ */

export type LineId = 'T1-03' | 'T1-05' | 'T1-07' | 'T1-12' | 'T1-16' | 'T1-19' | 'T2-04' | 'T2-08' | 'T2-12' | 'T2-17'
export type Terminal = 'T1' | 'T2'
/** 모델 버전 (v1, v2, v3 …). 시나리오 랩에서 재학습이 통과할 때마다 하나씩 는다 (src/api/mockServer) */
export type ModelVersionId = `v${number}`

const DAY = '20261001'
/** "1030" → "202610011030" (데모 날짜) */
const at = (hhmm: string): Ymdhm => `${DAY}${hhmm}`

export const demo = {
  /** 데모 기준 시각 (상단 바 시계, "12분 후" 계산 기준) */
  now: at('1030') as Ymdhm,
  date: '2026-10-01',
  /** 타임라인·도착편 표 기본 범위: 지금 −1시간 ~ +3시간 */
  windowStart: at('0930') as Ymdhm,
  windowEnd: at('1330') as Ymdhm,
  /** 예측 처리 시간 기준 (분) — 초과면 조치 필요 */
  thresholdMin: ACTION_THRESHOLD_MIN,
  /** 예측 발행: ETA 60분 전 */
  issueLeadMin: 60,
} as const

/** 타임라인 30분 눈금 (09:30 ~ 13:30, 9개) */
export const timelineTicks: Ymdhm[] = Array.from({ length: 9 }, (_, i) => addMinutes(demo.windowStart, i * 30))

/** 숫자 줄(figure-row) 한 칸: 이름(label) 위 / 숫자(figure-value) 아래 */
export interface FigureItem {
  label: string
  value: string
  /** 숫자 뒤 단위 (body-sm ink-subtle 로 분리) */
  unit?: string
  /** true 면 mono (버전 v2 같은 코드) */
  mono?: boolean
}

/* ═════════════════════════════ 기종 · 좌석 수 표 (25종) ═════════════════════════════ */

export interface SeatRow {
  /** IATA 기종 코드 (mono) */
  aircraft: string
  /** 기종 이름 */
  name: string
  seats: number
}

/** seat_table.csv 그대로 (좌석 수 오름차순) */
export const seatTable: SeatRow[] = [
  { aircraft: 'E95', name: 'Embraer 195', seats: 120 },
  { aircraft: '223', name: 'A220-300', seats: 140 },
  { aircraft: '319', name: 'A319', seats: 140 },
  { aircraft: '320', name: 'A320', seats: 180 },
  { aircraft: '32N', name: 'A320neo', seats: 180 },
  { aircraft: '321', name: 'A321', seats: 200 },
  { aircraft: '32Q', name: 'A321neo', seats: 200 },
  { aircraft: '738', name: 'B737-800', seats: 189 },
  { aircraft: '73H', name: 'B737-800 (윙렛)', seats: 189 },
  { aircraft: '739', name: 'B737-900', seats: 190 },
  { aircraft: '7M8', name: 'B737 MAX 8', seats: 189 },
  { aircraft: '788', name: 'B787-8', seats: 240 },
  { aircraft: '332', name: 'A330-200', seats: 250 },
  { aircraft: '763', name: 'B767-300', seats: 250 },
  { aircraft: '333', name: 'A330-300', seats: 280 },
  { aircraft: '789', name: 'B787-9', seats: 280 },
  { aircraft: '339', name: 'A330-900neo', seats: 300 },
  { aircraft: '772', name: 'B777-200', seats: 300 },
  { aircraft: '359', name: 'A350-900', seats: 310 },
  { aircraft: '781', name: 'B787-10', seats: 330 },
  { aircraft: '773', name: 'B777-300', seats: 340 },
  { aircraft: '77W', name: 'B777-300ER', seats: 340 },
  { aircraft: '351', name: 'A350-1000', seats: 350 },
  { aircraft: '748', name: 'B747-8', seats: 370 },
  { aircraft: '388', name: 'A380-800', seats: 490 },
]

const seatOf = (aircraft: string): SeatRow => {
  const row = seatTable.find((r) => r.aircraft === aircraft)
  if (!row) throw new Error(`unknown aircraft ${aircraft}`)
  return row
}

/* ═════════════════════════════ 항공사 · 출발지 ═════════════════════════════ */

export interface Airline {
  /** 편명 앞 2글자 (KE, 7C …) */
  code: string
  name: string
}

export interface Airport {
  /** IATA 공항 코드 (mono) */
  code: string
  /** 한국어 도시 이름 */
  name: string
}

const AIRLINES: Record<string, string> = {
  KE: '대한항공',
  OZ: '아시아나항공',
  '7C': '제주항공',
  LJ: '진에어',
  TW: '티웨이항공',
  ZE: '이스타항공',
  BX: '에어부산',
  RS: '에어서울',
  KC: '에어아스타나',
  UA: '유나이티드항공',
  MM: '피치항공',
  VJ: '비엣젯항공',
  MU: '중국동방항공',
  SC: '산둥항공',
  CA: '중국국제항공',
  SQ: '싱가포르항공',
  QW: '칭다오항공',
}

const AIRPORTS: Record<string, string> = {
  ALA: '알마티',
  FUK: '후쿠오카',
  SFO: '샌프란시스코',
  NRT: '도쿄 나리타',
  KIX: '오사카 간사이',
  CTS: '삿포로',
  NGO: '나고야',
  MNL: '마닐라',
  DAD: '다낭',
  HAN: '하노이',
  OKA: '오키나와',
  PVG: '상하이 푸둥',
  NKG: '난징',
  TAO: '칭다오',
  TNA: '지난',
  DLC: '다롄',
  BKK: '방콕',
  PEK: '베이징',
  SIN: '싱가포르',
  YNT: '옌타이',
  CRK: '클라크',
  HKG: '홍콩',
  JFK: '뉴욕',
  TPE: '타이베이',
  LAX: '로스앤젤레스',
  SGN: '호찌민',
  TAK: '다카마쓰',
  CEB: '세부',
}

/* ═════════════════════════════ 도착편 (운영 현황) ═════════════════════════════ */

export interface Prediction {
  /** 발행 시각 (= ETA − 60분) */
  issuedAt: Ymdhm
  /** 예측 처리 시간 (착륙 → 승객용 마지막 짐 벨트 투입, 분) */
  minutes: number
  /** 50분 초과 여부 */
  overThreshold: boolean
  /** 예상 마지막 짐 = (착륙 또는 ETA) + 예측 */
  expectedLastBag: Ymdhm
  /** 발행한 모델 버전 (08:13 v2 배포 전에는 v1) */
  modelVersion: ModelVersionId
}

export interface FlightActual {
  /** 실제 마지막 짐 시각 */
  lastBag: Ymdhm
  /** 실제 처리 시간 (분) */
  minutes: number
  /** 오차 = 실제 − 예측 (분) */
  errorMin: number
}

/** 수취대 타임라인 막대 */
export interface TimelineBar {
  start: Ymdhm
  end: Ymdhm
  /**
   * actual = 완료(착륙 → 실제 마지막 짐)
   * predicted = 착륙 또는 ETA → + 예측
   * typical = 예측 발행 전이라 기종 좌석 수로 잡은 길이 (도착 예정 점선 막대로 그린다)
   */
  basis: 'actual' | 'predicted' | 'typical'
  /** 한 라인 안 단 번호 (0 = 위, 1 = 아래). 시간이 겹치는 편만 1 */
  lane: number
}

export interface Flight {
  /** 편명 (mono, 예: KE082) */
  id: string
  airline: Airline
  origin: Airport
  /** 기종 코드 (mono, 예: 77W) */
  aircraft: string
  aircraftName: string
  seats: number
  lineId: LineId
  terminal: Terminal
  /** 계획 도착 시각 */
  scheduled: Ymdhm
  /** 현재 예상 도착 시각 */
  eta: Ymdhm
  /** 지연 = ETA − 계획 (분). 0 = 정시. "+8분" 표기 */
  delayMin: number
  /** 실제 착륙 (도착 예정이면 null). ETA 와 다르면 "09:27 → 09:18" */
  landing: Ymdhm | null
  status: FlightStatus
  /** 예측 발행 (예정) 시각 = ETA − 60분. prediction 이 null 이면 "— · 10:38 발행" */
  predictionIssueAt: Ymdhm
  prediction: Prediction | null
  /** 완료한 편만 */
  actual: FlightActual | null
  /** 50분 초과 예측이고 아직 완료 전 → 조치 필요 (완료되면 노랑을 지운다) */
  needsAction: boolean
  /** 이벤트 표시 (컨베이어 고장 등) */
  eventTag: string | null
  bar: TimelineBar
}

/** 예측 발행 전 막대 길이 — 기종 좌석 수로 잡은 보통 처리 시간 */
const typicalMinutes = (seats: number) => Math.round(20 + seats * 0.065)
/** v2 배포 시각. 이보다 먼저 발행한 예측은 v1 */
const V2_DEPLOYED_AT = at('0813')

type FlightSeed = [
  id: string,
  origin: string,
  aircraft: string,
  lineId: LineId,
  scheduled: string,
  eta: string,
  landing: string | null,
  lastBag: string | null,
  predicted: number | null,
  status: FlightStatus,
]

// prettier-ignore
const FLIGHT_SEEDS: FlightSeed[] = [
  // T1-03 — KC909·7C1396 완료(데모용으로 착륙 시각만 당김), UA892 = 라인 상세 서랍의 다음 편
  ['KC909',  'ALA', '763', 'T1-03', '0923', '0923', '0910', '0956', 43,   'completed'],
  ['7C1396', 'FUK', '738', 'T1-03', '1004', '1004', '0958', '1028', 33,   'completed'],
  ['UA892',  'SFO', '789', 'T1-03', '1128', '1128', null,   null,   41,   'scheduled'],
  ['ZE612',  'NRT', '7M8', 'T1-03', '1255', '1255', null,   null,   null, 'scheduled'],
  // T1-05
  ['MM703',  'KIX', '32N', 'T1-05', '1012', '1012', '1005', null,   31,   'processing'],
  ['TW250',  'CTS', '738', 'T1-05', '1111', '1111', null,   null,   37,   'scheduled'],
  ['7C1302', 'KIX', '7M8', 'T1-05', '1157', '1157', null,   null,   null, 'scheduled'],
  ['TW272',  'NGO', '738', 'T1-05', '1310', '1310', null,   null,   null, 'scheduled'],
  // T1-07 — 7C1702 는 10분 지연
  ['7C1402', 'MNL', '738', 'T1-07', '1013', '1013', '1002', null,   34,   'processing'],
  ['7C1702', 'DAD', '738', 'T1-07', '1045', '1055', null,   null,   44,   'scheduled'],
  ['VJ974',  'HAN', '32Q', 'T1-07', '1148', '1148', null,   null,   null, 'scheduled'],
  ['TW224',  'OKA', '738', 'T1-07', '1240', '1240', null,   null,   null, 'scheduled'],
  // T1-12
  ['MU549',  'PVG', '320', 'T1-12', '1031', '1031', '1020', null,   30,   'processing'],
  ['MU579',  'NKG', '321', 'T1-12', '1116', '1116', null,   null,   32,   'scheduled'],
  ['MU5041', 'TAO', '32Q', 'T1-12', '1225', '1225', null,   null,   null, 'scheduled'],
  // T1-16 — SC8001 은 6분 전 착륙(아직 벨트에 짐이 안 나옴)
  ['SC8001', 'TNA', '738', 'T1-16', '1030', '1030', '1024', null,   33,   'landed'],
  ['CA171',  'DLC', '738', 'T1-16', '1111', '1111', null,   null,   38,   'scheduled'],
  ['7C2306', 'BKK', '7M8', 'T1-16', '1205', '1205', null,   null,   null, 'scheduled'],
  ['CA135',  'PEK', '333', 'T1-16', '1320', '1320', null,   null,   null, 'scheduled'],
  // T1-19 — QW939·SC4609 시간이 겹친다(타임라인 두 단). SC4609 52분 = 조치 필요
  ['SQ612',  'SIN', '359', 'T1-19', '0927', '0927', '0918', '1003', 47,   'completed'],
  ['QW939',  'TAO', '32N', 'T1-19', '1106', '1106', null,   null,   34,   'scheduled'],
  ['SC4609', 'YNT', '738', 'T1-19', '1118', '1118', null,   null,   52,   'scheduled'],
  ['7C6016', 'CRK', '7M8', 'T1-19', '1305', '1305', null,   null,   null, 'scheduled'],
  // T2-04
  ['KE434',  'HKG', '781', 'T2-04', '0910', '0910', '0904', '0944', 42,   'completed'],
  ['LJ264',  'FUK', '738', 'T2-04', '1022', '1022', '1014', null,   33,   'processing'],
  ['LJ262',  'CTS', '738', 'T2-04', '1125', '1125', null,   null,   39,   'scheduled'],
  ['KE714',  'NGO', '333', 'T2-04', '1245', '1245', null,   null,   null, 'scheduled'],
  // T2-08 — KE082 57분 = 조치 필요, 8분 지연
  ['LJ136',  'NRT', '738', 'T2-08', '0952', '0952', '0945', '1019', 36,   'completed'],
  ['KE082',  'JFK', '77W', 'T2-08', '1100', '1108', null,   null,   57,   'scheduled'],
  ['LJ214',  'KIX', '738', 'T2-08', '1230', '1230', null,   null,   null, 'scheduled'],
  // T2-12
  ['OZ712',  'TPE', '32Q', 'T2-12', '1008', '1008', '1000', null,   34,   'processing'],
  ['OZ107',  'NRT', '333', 'T2-12', '1138', '1138', null,   null,   null, 'scheduled'],
  ['OZ221',  'LAX', '388', 'T2-12', '1300', '1300', null,   null,   null, 'scheduled'],
  // T2-17 — OZ574 는 53분 예측(50분 초과)이었지만 완료 → 노랑 없이 실제·오차만
  ['OZ574',  'SGN', '333', 'T2-17', '0859', '0859', '0842', '0938', 53,   'completed'],
  ['RS532',  'TAK', '321', 'T2-17', '1005', '1005', '0958', null,   38,   'processing'],
  ['BX155',  'CEB', '32Q', 'T2-17', '1116', '1116', null,   null,   46,   'scheduled'],
  ['OZ578',  'HAN', '333', 'T2-17', '1235', '1235', null,   null,   null, 'scheduled'],
]

function buildFlight(seed: FlightSeed): Flight {
  const [id, originCode, aircraft, lineId, scheduledHm, etaHm, landingHm, lastBagHm, predicted, status] = seed
  const seat = seatOf(aircraft)
  const airlineCode = id.slice(0, 2)
  const scheduled = at(scheduledHm)
  const eta = at(etaHm)
  const landing = landingHm ? at(landingHm) : null
  const predictionIssueAt = addMinutes(eta, -demo.issueLeadMin)

  const prediction: Prediction | null =
    predicted === null
      ? null
      : {
          issuedAt: predictionIssueAt,
          minutes: predicted,
          overThreshold: predicted > ACTION_THRESHOLD_MIN,
          expectedLastBag: addMinutes(landing ?? eta, predicted),
          modelVersion: predictionIssueAt < V2_DEPLOYED_AT ? 'v1' : 'v2',
        }

  const actual: FlightActual | null =
    status === 'completed' && landing && lastBagHm
      ? (() => {
          const minutes = diffMinutes(at(lastBagHm), landing)
          return { lastBag: at(lastBagHm), minutes, errorMin: minutes - (predicted ?? minutes) }
        })()
      : null

  const barStart = landing ?? eta
  const bar: TimelineBar = actual
    ? { start: barStart, end: actual.lastBag, basis: 'actual', lane: 0 }
    : prediction
      ? { start: barStart, end: addMinutes(barStart, prediction.minutes), basis: 'predicted', lane: 0 }
      : { start: barStart, end: addMinutes(barStart, typicalMinutes(seat.seats)), basis: 'typical', lane: 0 }

  return {
    id,
    airline: { code: airlineCode, name: AIRLINES[airlineCode] ?? airlineCode },
    origin: { code: originCode, name: AIRPORTS[originCode] ?? originCode },
    aircraft,
    aircraftName: seat.name,
    seats: seat.seats,
    lineId,
    terminal: lineId.slice(0, 2) as Terminal,
    scheduled,
    eta,
    delayMin: diffMinutes(eta, scheduled),
    landing,
    status,
    predictionIssueAt,
    prediction,
    actual,
    needsAction: Boolean(prediction?.overThreshold) && status !== 'completed',
    eventTag: null,
    bar,
  }
}

/** 한 라인 안에서 시간이 겹치는 막대를 아래 단으로 내린다 (0, 1, 2 …). 셋째 단부터는 "+1" 로 그린다 */
function assignLanes(list: Flight[]): Flight[] {
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
  return list
}

/**
 * 지금 −1시간 ~ +3시간 타임라인에 걸리는 도착편 37편, ETA 오름차순.
 * 완료 6 · 처리 중 6 · 착륙 1 · 도착 예정 24 (그중 예측 발행 10, 발행 전 14).
 * 50분 초과 예측: KE082(57), SC4609(52) — 조치 필요. OZ574(53)는 이미 완료.
 */
export const flights: Flight[] = assignLanes(FLIGHT_SEEDS.map(buildFlight)).sort((a, b) =>
  a.eta === b.eta ? a.id.localeCompare(b.id) : a.eta.localeCompare(b.eta),
)

export const getFlight = (id: string): Flight | undefined => flights.find((f) => f.id === id)
export const flightsOnLine = (lineId: LineId): Flight[] => flights.filter((f) => f.lineId === lineId)

/** 지금 이후 처음 발행될 예측 — 조치 필요가 없을 때 "다음 예측 10:38 OZ107" */
export const nextPrediction: { at: Ymdhm; flightId: string; lineId: LineId } = (() => {
  const f = flights
    .filter((x) => x.prediction === null && x.predictionIssueAt > demo.now)
    .sort((a, b) => a.predictionIssueAt.localeCompare(b.predictionIssueAt))[0]
  return { at: f.predictionIssueAt, flightId: f.id, lineId: f.lineId }
})()

/* ═════════════════════════════ 라인 (수취대) ═════════════════════════════ */

export interface Line {
  /** 터미널+수취대 (mono, 예: T1-07) */
  id: LineId
  terminal: Terminal
  /** 수취대 번호 */
  carousel: number
  status: LineStatus
  /** 지금 벨트에 짐이 도는(처리 중) 편 — 평면도에서 짐이 도는 라인 */
  processingFlightIds: string[]
  /** 착륙했지만 아직 짐이 안 나온 편 */
  landedFlightIds: string[]
  /** 다음에 도착할 편 */
  nextFlightId: string | null
  /** 타임라인 행 단수 (겹치는 편이 있으면 2 → 행 높이 40px) */
  lanes: number
}

// 남은 짐 수는 두지 않는다 — 실제 API 에 편별 짐 수가 없다 (DESIGN.md "3D는 쓰지 않는다")
const LINE_SEEDS: Array<[LineId, number, LineStatus]> = [
  ['T1-03', 3, 'normal'],
  ['T1-05', 5, 'normal'],
  ['T1-07', 7, 'busy'],
  ['T1-12', 12, 'normal'],
  ['T1-16', 16, 'busy'],
  ['T1-19', 19, 'critical'],
  ['T2-04', 4, 'normal'],
  ['T2-08', 8, 'critical'],
  ['T2-12', 12, 'normal'],
  ['T2-17', 17, 'busy'],
]

/**
 * 라인 10개 — 원활 5 · 혼잡 3(T1-07, T1-16, T2-17) · 조치 필요 2(T1-19, T2-08).
 * 겹치는 편이 있는 라인: T1-19 (lanes 2).
 */
export const lines: Line[] = LINE_SEEDS.map(([id, carousel, status]) => {
  const own = flightsOnLine(id)
  const next = own.filter((f) => f.status === 'scheduled').sort((a, b) => a.eta.localeCompare(b.eta))[0]
  return {
    id,
    terminal: id.slice(0, 2) as Terminal,
    carousel,
    status,
    processingFlightIds: own.filter((f) => f.status === 'processing').map((f) => f.id),
    landedFlightIds: own.filter((f) => f.status === 'landed').map((f) => f.id),
    nextFlightId: next ? next.id : null,
    lanes: Math.max(...own.map((f) => f.bar.lane)) + 1,
  }
})

export const getLine = (id: LineId): Line | undefined => lines.find((l) => l.id === id)

/* ═════════════════════════════ 조치 필요 · 숫자 줄 ═════════════════════════════ */

/**
 * 조치 문구의 근거 규칙 (DESIGN.md) — 모델은 처리 시간만 예측한다.
 * 그래서 계산 근거가 없는 처방(필요 인원 "2명", 특정 벨트 번호로 재배정)은 쓰지 않고, 근거가 있는 것만 쓴다:
 * - 판단: 예측값과 기준 (기준 대비 "+7분")
 * - 조치: 기획서의 운영 기준 문장 그대로 (ACTION_GUIDE)
 * - 기한: 조 이동 마감 = 착륙 예정 30분 전 (기획서 "도착 30–60분 전에 조를 조정한다"의 늦은 끝). 화면에 계산 기준을 함께 쓴다
 */
export const ACTION_GUIDE = '인력 추가·벨트 재배정 검토'
/** 조 이동 마감 = 착륙 예정 − 30분 */
export const CREW_DEADLINE_LEAD_MIN = 30

export interface ActionItem {
  flightId: string
  lineId: LineId
  /** 예측 처리 시간 (분) — signal-cell */
  predictedMin: number
  /** 기준 대비 (분) = 예측 − 50 — "+7분" */
  overMin: number
  /** 착륙 예정 (ETA) */
  eta: Ymdhm
  /** 착륙 예정까지 (분) — "38분 후" */
  minutesToEta: number
  /** 조치 문장 (ACTION_GUIDE) */
  action: string
  /** 조 이동 마감 = 착륙 예정 − 30분 */
  crewDeadline: Ymdhm
}

function toActionItem(flightId: string, lineId: LineId, predictedMin: number, eta: Ymdhm): ActionItem {
  return {
    flightId,
    lineId,
    predictedMin,
    overMin: predictedMin - ACTION_THRESHOLD_MIN,
    eta,
    minutesToEta: diffMinutes(eta, demo.now),
    action: ACTION_GUIDE,
    crewDeadline: addMinutes(eta, -CREW_DEADLINE_LEAD_MIN),
  }
}

/** 도착편 하나의 조치 — 조치 필요 편(50분 초과 예측, 완료 전)이 아니면 null. 조치 필요 목록과 라인 상세 서랍이 같이 쓴다 */
export function actionItemFor(f: Flight): ActionItem | null {
  if (!f.needsAction || !f.prediction) return null
  return toActionItem(f.id, f.lineId, f.prediction.minutes, f.eta)
}

/** 조치 필요 2편 (ETA 오름차순) — 숫자판 값 = actionItems.length */
export const actionItems: ActionItem[] = flights
  .map(actionItemFor)
  .filter((item): item is ActionItem => item !== null)

/**
 * 견본: 조치 필요가 몰린 때 5편 → 목록은 3행 + 고스트 "외 2편".
 * KE082·SC4609 말고 3편은 도착편 목록에 없는 가상의 편이다 (견본에서는 서랍을 열지 않는다).
 * 예측은 착륙 예정 60분 전에 발행되므로 모두 11:30 전에 착륙한다.
 */
export const actionItemsPeak: ActionItem[] = [
  ...actionItems,
  toActionItem('KE012', 'T2-04', 55, at('1122')),
  toActionItem('OZ204', 'T2-17', 53, at('1126')),
  toActionItem('7C1108', 'T1-07', 51, at('1129')),
].sort((a, b) => a.eta.localeCompare(b.eta))

/** 운영 현황 숫자 줄 값 */
export const figures = {
  /** 오늘 도착 (편) */
  todayArrivals: 160,
  /** 처리 중 (편) */
  processing: 6,
  /** 3시간 안 도착 (편) */
  arrivingIn3h: 24,
  /** 오늘 예측 오차 (분, MAE) */
  todayErrorMin: 4.1,
}

/** 운영 현황 숫자 줄 (조치 필요 수는 넣지 않는다 — 숫자판에만) */
export const opsFigureRow: FigureItem[] = [
  { label: '오늘 도착', value: String(figures.todayArrivals), unit: '편' },
  { label: '처리 중', value: String(figures.processing), unit: '편' },
  { label: '3시간 안 도착', value: String(figures.arrivingIn3h), unit: '편' },
  { label: '오늘 예측 오차', value: figures.todayErrorMin.toFixed(1), unit: '분' },
]

/** 상단 바 오른쪽: 서버 상태 · 모델 버전 · 시계 */
export const server: {
  status: ServerStatus
  modelVersion: ModelVersionId
  /** 마지막 갱신 */
  lastUpdatedAt: Ymdhm
  /** 갱신 주기 (초). 마지막 갱신이 2배를 넘으면 연결 끊김으로 본다 */
  refreshSec: number
} = {
  status: 'connected',
  modelVersion: 'v2',
  lastUpdatedAt: demo.now,
  refreshSec: 30,
}

/* ═════════════════════════════ 라인 상세 서랍 (T1-03) ═════════════════════════════ */

/** 모델 입력 한 칸 — 그 편 처리 시간(wait_min) + 다음 편 좌석 수(next_seats) */
export interface SequenceStep {
  /** 1 = 가장 오래된 편, 20 = 가장 최근 편 */
  no: number
  flightId: string
  aircraft: string
  seats: number
  landing: Ymdhm
  /** 그 편 처리 시간 (분) — 차트 막대 (ink-tertiary) */
  waitMin: number
  /** 다음 편 좌석 수 — 차트 선 (chart-predicted) */
  nextSeats: number
}

export interface WhatIfOption {
  aircraft: string
  aircraftName: string
  seats: number
  /** 이 기종이면 다시 계산한 예측 (분, 가정) */
  minutes: number
  /** 원래 예측과 차이 (분, 가정) — "+3분" */
  diffMin: number
  overThreshold: boolean
}

/**
 * 가정 시뮬레이터 근사 — 좌석 100석당 +4.5분.
 * 학습 데이터를 만든 규칙의 좌석 항 그대로다 (scripts/generate_data.py: 하기 시간 = 4.0 + 좌석/100 × 4.5분,
 * 기획서의 "소형 12분, 대형 20분"). train_normal.csv 960편으로 처리 시간을 좌석 수에 회귀해도 100석당 4.4분이 나온다.
 * 모델을 다시 돌린 값이 아니므로 화면에는 "가정 · 좌석 100석당 +4.5분 근사"로 밝힌다.
 */
export const WHATIF_MINUTES_PER_100_SEATS = 4.5

/** 원래 예측(baseMinutes, baseSeats석)에서 기종만 바꿨을 때의 가정 예측 — 좌석 수 표 25종 전부 */
export function whatIfOptions(baseMinutes: number, baseSeats: number): WhatIfOption[] {
  return seatTable.map((row) => {
    const minutes = Math.round(baseMinutes + ((row.seats - baseSeats) / 100) * WHATIF_MINUTES_PER_100_SEATS)
    return {
      aircraft: row.aircraft,
      aircraftName: row.name,
      seats: row.seats,
      minutes,
      diffMin: minutes - baseMinutes,
      overThreshold: minutes > ACTION_THRESHOLD_MIN,
    }
  })
}

export interface LineDetail {
  lineId: LineId
  terminal: Terminal
  carousel: number
  status: LineStatus
  /** 다음 편과 그 예측 (숫자는 figure-value 크기) */
  next: {
    flightId: string
    airline: Airline
    origin: Airport
    aircraft: string
    aircraftName: string
    seats: number
    eta: Ymdhm
    prediction: Prediction
  }
  /** 모델 입력 20편 (오래된 것 → 최근). 13~20번이 기획서 예시(CX426 … 7C1396) */
  sequence: SequenceStep[]
  /** 가정 시뮬레이터: 다음 편 기종을 바꾸면 예측이 어떻게 되는가 (좌석 수 표 25종 전부) */
  whatIf: {
    baseAircraft: string
    baseMinutes: number
    options: WhatIfOption[]
  }
  /** 좌석 수 표 25종 */
  seatTable: SeatRow[]
}

// prettier-ignore
const T103_HISTORY: Array<[flightId: string, aircraft: string, landing: Ymdhm, waitMin: number]> = [
  // 2026-09-30 (전날 오후·저녁)
  ['7C1384', '738', '202609301252', 31],
  ['CX416',  '333', '202609301341', 42],
  ['ZE604',  '7M8', '202609301430', 29],
  ['KC911',  '763', '202609301518', 44],
  ['TW164',  '333', '202609301620', 41],
  ['7C1398', '738', '202609301705', 33],
  ['WE274',  '332', '202609301812', 36],
  ['ZE598',  '7M8', '202609301903', 30],
  ['CX438',  '32Q', '202609302015', 34],
  ['7C8408', '738', '202609302122', 28],
  ['TW158',  '738', '202609302230', 32],
  ['ZE566',  '7M8', '202609302341', 35],
  // 2026-10-01 — flights_real_20261001.csv 의 T1-03 8편 (기획서 예시)
  ['CX426',  '32Q', '202610010052', 32],
  ['7C8406', '738', '202610010238', 30],
  ['UA805',  '789', '202610010422', 40],
  ['WE272',  '332', '202610010608', 31],
  ['ZE594',  '7M8', '202610010656', 44],
  ['ZE562',  '7M8', '202610010753', 32],
  ['KC909',  '763', '202610010910', 46],
  ['7C1396', '738', '202610010958', 30],
]

const t103Next = getFlight('UA892')!

/** 라인 상세 서랍 예시: T1-03, 다음 편 UA892 (B787-9, 280석, 예측 41분) */
export const lineDetail: LineDetail = {
  lineId: 'T1-03',
  terminal: 'T1',
  carousel: 3,
  status: getLine('T1-03')!.status,
  next: {
    flightId: t103Next.id,
    airline: t103Next.airline,
    origin: t103Next.origin,
    aircraft: t103Next.aircraft,
    aircraftName: t103Next.aircraftName,
    seats: t103Next.seats,
    eta: t103Next.eta,
    prediction: t103Next.prediction!,
  },
  sequence: T103_HISTORY.map(([flightId, aircraft, landing, waitMin], i) => ({
    no: i + 1,
    flightId,
    aircraft,
    seats: seatOf(aircraft).seats,
    landing,
    waitMin,
    nextSeats: i + 1 < T103_HISTORY.length ? seatOf(T103_HISTORY[i + 1][1]).seats : t103Next.seats,
  })),
  whatIf: {
    baseAircraft: t103Next.aircraft,
    baseMinutes: t103Next.prediction!.minutes,
    options: whatIfOptions(t103Next.prediction!.minutes, t103Next.seats),
  },
  seatTable,
}

/* ═════════════════════════════ 모델 모니터링 ═════════════════════════════ */

/** 판정 한 번 (배치). 20분마다, 최근 21편으로 */
export interface Batch {
  /** 배치 순번 1~12 (차트 x) */
  no: number
  at: Ymdhm
  windowSize: number
  /** 창에 모인 편 수 (21 미만이면 판정 보류) */
  windowCount: number
  /** 창 MAE (분) — 차트 y */
  windowMae: number
  threshold: number
  /** 연속 초과 (0~2) */
  consecutive: number
  verdict: VerdictKind
  /** 알림만일 때 이벤트 이름 */
  eventName: string | null
  /** 판정 당시 운영 버전 */
  modelVersion: ModelVersionId
  /** 이 배치에서 배포한 버전 — 차트에 primary 세로선 + "v2" */
  deployedVersion: ModelVersionId | null
  /** 게이트 불합격으로 유지한 버전 */
  keptVersion: ModelVersionId | null
  /** 게이트 불합격이지만 새 모델이 더 나아 사람 승인을 기다린다 (실서버) */
  needsApproval?: boolean
  /** 같은 데이터로 이미 불합격해 재학습을 보류했다 (실서버) */
  held?: boolean
}

/** 감시 창 한 점 (최근 21편, 완료 순) */
export interface WindowPoint {
  /** 1 = 가장 오래된, 21 = 가장 최근 */
  no: number
  flightId: string
  /** 라인 (이 10개 밖의 라인도 있다) */
  lineId: string
  landing: Ymdhm
  lastBag: Ymdhm
  predicted: number
  actual: number
  /** 실제 − 예측 */
  errorMin: number
  /** 이벤트 편이면 실제 점을 ink-subtle 빈 점으로 */
  eventTag: string | null
}

export interface ModelVersion {
  version: ModelVersionId
  method: '처음 학습' | 'fine-tuning'
  /** fine-tuning 이면 이어서 학습한 버전 */
  base: ModelVersionId | null
  trainedAt: Ymdhm
  /** 검증 MAE (분) */
  valMae: number
  epochs: number
  trainData: string
  status: 'production' | 'retired'
  deployedAt: Ymdhm
  retiredAt: Ymdhm | null
}

/** 게이트 기준 한 줄 */
export interface GateCheck {
  /** 기준 (예: "검증 MAE ≤ 5분") */
  criterion: string
  /** 값 (mono, 예: "4.1", "5.2 → 4.1 (21%)") */
  value: string
  passed: boolean
}

export interface GateRecord {
  id: string
  at: Ymdhm
  /** 무엇 때문에 재학습했나 */
  trigger: string
  /** 후보 (예: "v2") */
  candidate: string
  /** 이어서 학습한 원본 */
  base: ModelVersionId
  checks: GateCheck[]
  passed: boolean
  /** 결과 (예: "v2 배포", "v1 유지") */
  decision: string
  /** 학습 실행 id (실서버 MLflow run) — 승인할 때 쓴다 */
  runId?: string
  /** 불합격이지만 지금 모델보다 나아 사람 승인을 기다린다 */
  needsApproval?: boolean
  /** 사람이 승인해 적용한 버전 (예: "v3") */
  approvedVersion?: string | null
}

export interface LogLine {
  at: Ymdhm
  tag: LogTag
  message: string
  /** 재학습·배포 줄 — 메시지를 primary-text 로 */
  highlight: boolean
}

// 기획서 ③: 정상 21편 MAE 상위 5%(3.97분)와 배포 기준 5분 중 큰 값
const THRESHOLD = 5.0

// prettier-ignore
const BATCH_SEEDS: Array<[hhmm: string, mae: number, consecutive: number, verdict: VerdictKind, eventName: string | null, version: ModelVersionId, deployed: ModelVersionId | null]> = [
  ['0650', 3.9, 0, 'ok',               null,           'v1', null],
  ['0710', 4.3, 0, 'ok',               null,           'v1', null],
  ['0730', 7.4, 0, 'alert_only',       '컨베이어 고장', 'v1', null],
  ['0750', 6.9, 1, 'warn',             null,           'v1', null],
  ['0810', 7.9, 2, 'retrain_promoted', null,           'v1', 'v2'],
  ['0830', 4.8, 0, 'ok',               null,           'v2', null],
  ['0850', 4.6, 0, 'ok',               null,           'v2', null],
  ['0910', 4.4, 0, 'ok',               null,           'v2', null],
  ['0930', 3.8, 0, 'ok',               null,           'v2', null],
  ['0950', 4.5, 0, 'ok',               null,           'v2', null],
  ['1010', 4.0, 0, 'ok',               null,           'v2', null],
  ['1030', 4.2, 0, 'ok',               null,           'v2', null],
]

/** 배치 12개: 정상 → 정상 → 알림만(컨베이어 고장) → 주의 1/2 → 재학습·v2 배포 → 정상 ×7 */
const batches: Batch[] = BATCH_SEEDS.map(([hhmm, mae, consecutive, verdict, eventName, version, deployed], i) => ({
  no: i + 1,
  at: at(hhmm),
  windowSize: 21,
  windowCount: 21,
  windowMae: mae,
  threshold: THRESHOLD,
  consecutive,
  verdict,
  eventName,
  modelVersion: version,
  deployedVersion: deployed,
  keptVersion: null,
}))

// prettier-ignore
const WINDOW_SEEDS: Array<[flightId: string, lineId: string, landing: string, lastBag: string, predicted: number, actual: number, eventTag: string | null]> = [
  ['LJ002',  'T2-06', '0832', '0915', 39, 43, null],
  ['HY513',  'T1-21', '0807', '0916', 58, 69, null],
  ['7C2218', 'T1-05', '0845', '0917', 35, 32, null],
  ['KE646',  'T2-05', '0835', '0918', 47, 43, null],
  ['ZE536',  'T1-06', '0838', '0919', 37, 41, null],
  ['7C2504', 'T1-16', '0854', '0929', 33, 35, null],
  ['GA878',  'T2-19', '0848', '0929', 44, 41, null],
  ['VS208',  'T2-13', '0850', '0933', 48, 43, null],
  ['OZ574',  'T2-17', '0842', '0938', 53, 56, null],
  ['KE434',  'T2-04', '0904', '0944', 42, 40, null],
  ['OZ742',  'T2-15', '0902', '0949', 51, 47, null],
  ['MM701',  'T1-11', '0926', '0956', 33, 30, null],
  ['AF264',  'T2-14', '0857', '0956', 53, 59, null],
  ['KC909',  'T1-03', '0910', '0956', 43, 46, null],
  ['SQ612',  'T1-19', '0918', '1003', 47, 45, null],
  ['VJ862',  'T1-14', '0937', '1015', 36, 38, null],
  ['VZ850',  'T1-10', '0946', '1016', 34, 30, null],
  ['LJ136',  'T2-08', '0945', '1019', 36, 34, null],
  ['CZ685',  'T1-13', '0939', '1024', 39, 45, null],
  ['LH718',  'T1-17', '0934', '1027', 41, 53, '컨베이어 고장'],
  ['7C1396', 'T1-03', '0958', '1028', 33, 30, null],
]

/** 감시 창 21점 — MAE 88/21 = 4.19 → 4.2분. LH718 은 컨베이어 고장 이벤트 편 */
const windowPoints: WindowPoint[] = WINDOW_SEEDS.map(([flightId, lineId, landing, lastBag, predicted, actual, eventTag], i) => ({
  no: i + 1,
  flightId,
  lineId,
  landing: at(landing),
  lastBag: at(lastBag),
  predicted,
  actual,
  errorMin: actual - predicted,
  eventTag,
}))

const versions: ModelVersion[] = [
  {
    version: 'v1',
    method: '처음 학습',
    base: null,
    trainedAt: '202609281410',
    valMae: 3.9,
    epochs: 100,
    trainData: '2026-09 도착편 3,180편',
    status: 'retired',
    deployedAt: '202609281430',
    retiredAt: at('0813'),
  },
  {
    version: 'v2',
    method: 'fine-tuning',
    base: 'v1',
    trainedAt: at('0812'),
    valMae: 4.1,
    epochs: 10,
    trainData: 'v1에서 이어서 · 최근 21편',
    status: 'production',
    deployedAt: at('0813'),
    retiredAt: null,
  },
]

/** 게이트 이력 — 불합격 1 (어제 시나리오 랩) · 통과 1 (오늘 배치 5) */
const gates: GateRecord[] = [
  {
    id: 'gate-20260930-1640',
    at: '202609301640',
    trigger: '시나리오 랩 · 처리 방식 변경',
    candidate: 'v2 후보',
    base: 'v1',
    checks: [
      { criterion: '검증 MAE ≤ 5분', value: '5.6', passed: false },
      { criterion: '단순 방법 대비 10% 개선', value: '5.9 → 5.6 (5%)', passed: false },
      { criterion: '현재 모델보다 나쁘지 않음', value: '6.1 → 5.6', passed: true },
    ],
    passed: false,
    decision: 'v1 유지',
  },
  {
    id: 'gate-20261001-0812',
    at: at('0812'),
    trigger: '배치 5 · 연속 초과 2/2',
    candidate: 'v2',
    base: 'v1',
    checks: [
      { criterion: '검증 MAE ≤ 5분', value: '4.1', passed: true },
      { criterion: '단순 방법 대비 10% 개선', value: '5.2 → 4.1 (21%)', passed: true },
      { criterion: '현재 모델보다 나쁘지 않음', value: '7.6 → 4.1', passed: true },
    ],
    passed: true,
    decision: 'v2 배포',
  },
]

// prettier-ignore
const LOG_SEEDS: Array<[hhmm: string, tag: LogTag, message: string, highlight?: boolean]> = [
  ['0650', 'OK',    '배치 1 · 최근 21편 MAE 3.9 / 임계값 5.0 · 정상'],
  ['0710', 'OK',    '배치 2 · 최근 21편 MAE 4.3 / 임계값 5.0 · 정상'],
  ['0722', 'ALERT', '이벤트 표시 · T2-17 컨베이어 고장'],
  ['0730', 'ALERT', '배치 3 · MAE 7.4 / 5.0 · 알림만, 이벤트 표시 편 포함 · 재학습하지 않음'],
  ['0750', 'WARN',  '배치 4 · MAE 6.9 / 5.0 · 주의, 연속 초과 1/2'],
  ['0810', 'WARN',  '배치 5 · MAE 7.9 / 5.0 · 연속 초과 2/2'],
  ['0810', 'INFO',  '재학습 시작 · v1에서 이어서 fine-tuning 10 epoch', true],
  ['0812', 'INFO',  '재학습 완료 · 검증 MAE 4.1', true],
  ['0812', 'CHECK', '게이트 · 검증 MAE 4.1 ≤ 5.0 · 통과'],
  ['0812', 'CHECK', '게이트 · 단순 방법 5.2 → 4.1 (21% 개선) · 통과'],
  ['0812', 'CHECK', '게이트 · 현재 모델 v1 7.6 → 4.1 · 통과'],
  ['0813', 'OK',    'v2 배포 · 운영 버전 v1 → v2', true],
  ['0830', 'OK',    '배치 6 · MAE 4.8 / 5.0 · 정상'],
  ['0850', 'OK',    '배치 7 · MAE 4.6 / 5.0 · 정상'],
  ['0910', 'OK',    '배치 8 · MAE 4.4 / 5.0 · 정상'],
  ['0914', 'FAIL',  '도착편 API 응답 없음 · 5초 초과, 다시 시도 1/3'],
  ['0915', 'INFO',  '도착편 API 다시 연결'],
  ['0930', 'OK',    '배치 9 · MAE 3.8 / 5.0 · 정상'],
  ['0950', 'OK',    '배치 10 · MAE 4.5 / 5.0 · 정상'],
  ['0952', 'ALERT', '이벤트 표시 · T1-17 컨베이어 고장'],
  ['1008', 'INFO',  '예측 발행 · KE082 T2-08 57분 (50분 초과)'],
  ['1010', 'OK',    '배치 11 · MAE 4.0 / 5.0 · 정상'],
  ['1018', 'INFO',  '예측 발행 · SC4609 T1-19 52분 (50분 초과)'],
  ['1028', 'INFO',  '예측 발행 · UA892 T1-03 41분'],
  ['1030', 'OK',    '배치 12 · MAE 4.2 / 5.0 · 정상'],
]

const toLog = ([hhmm, tag, message, highlight]: [string, LogTag, string, boolean?]): LogLine => ({
  at: at(hhmm),
  tag,
  message,
  highlight: Boolean(highlight),
})

/** 모델 모니터링 화면 전부 */
export const monitoring = {
  /** 드리프트 임계값 (분) — 차트 주황 점선 "임계값 5.0분" */
  threshold: THRESHOLD,
  /** 게이트 기준 (분) — 차트 회색 점선 "게이트 5분" */
  gateMae: 5,
  /** 연속 초과 한도 */
  consecutiveLimit: 2,
  /** 배치별 MAE 12개 */
  batches,
  /** 감시 창 21점 (예측 vs 실제) */
  window: windowPoints,
  /** 지금 판정 문장: "최근 21편 오차 4.2분 · 임계값 5.0분 · 연속 초과 0/2 · 판정 정상(점)" */
  verdictNow: {
    at: at('1030'),
    windowSize: 21,
    windowCount: 21,
    windowMae: 4.2,
    threshold: THRESHOLD,
    consecutive: 0,
    consecutiveLimit: 2,
    verdict: 'ok' as VerdictKind,
    modelVersion: 'v2' as ModelVersionId,
  },
  /** 응답 시간 (예측 API, 최근 1시간) */
  latency: { p50Ms: 64, p95Ms: 182, requests: 412, windowLabel: '최근 1시간' },
  /** 숫자 줄: 운영 버전 · 창 MAE / 임계값 · 연속 초과 n/2 · 응답 시간 p95 */
  figureRow: [
    { label: '운영 버전', value: 'v2', mono: true },
    { label: '창 MAE / 임계값', value: '4.2 / 5.0', unit: '분' },
    { label: '연속 초과', value: '0/2' },
    { label: '응답 시간 p95', value: '182', unit: 'ms' },
  ] as FigureItem[],
  /** 모델 버전 (v1 처음 학습 MAE 3.9, v2 fine-tuning MAE 4.1) */
  versions,
  /** 게이트 이력 (불합격 1 · 통과 1) */
  gates,
  /** 로그 25줄 (최신이 아래) */
  logs: LOG_SEEDS.map(toLog),
}

/* ═════════════════════════════ 시나리오 랩 ═════════════════════════════ */

export type ScenarioId =
  | 'normal'
  | 'staff_shortage'
  | 'conveyor_fault'
  | 'expansion'
  | 'opening_chaos'
  | 'process_change'

export interface Scenario {
  id: ScenarioId
  name: string
  /** 분류 — 글자만 (SCENARIO_CATEGORY_LABEL) */
  category: ScenarioCategory
  /** 기대 판정 (예: "주의 → 재학습") */
  expected: string
  /** 실행 횟수 (mono) */
  runs: number
}

export type PipelineStepKey = 'drift' | 'event' | 'consecutive' | 'retrain' | 'gate' | 'deploy'

export interface PipelineStep {
  key: PipelineStepKey
  /** 단계 이름 (body-sm) */
  name: string
  state: StepState
  /** 결과 한 줄 (mono-sm ink-subtle, 예: "MAE 7.9 > 5.0", "연속 2/2", "v2"). 대기·건너뜀·진행 중이면 null */
  result: string | null
  /** 재학습·배포 단계 — 완료 점을 primary 로 */
  systemAction: boolean
}

export interface PipelineRun {
  id: string
  scenarioId: ScenarioId
  scenarioName: string
  at: Ymdhm
  /** 6단계: 드리프트 검사 → 이벤트 확인 → 연속 확인 → 재학습 → 게이트 → 배포 */
  steps: PipelineStep[]
  /** 게이트 단계 아래 3줄 표 (게이트까지 안 갔으면 null) */
  gate: GateCheck[] | null
  /** 기대 판정 */
  expected: string
  /** 실제 판정 — verdictStatus() 로 글자·점을 만든다 (진행 중이면 null) */
  outcome: VerdictInput | null
  /** "기대 주의 → 재학습 · 결과 일치" / "결과 다름" (진행 중이면 null) */
  matched: boolean | null
  /** 로그 꼬리 */
  logTail: LogLine[]
}

const STEP_NAMES: Record<PipelineStepKey, string> = {
  drift: '드리프트 검사',
  event: '이벤트 확인',
  consecutive: '연속 확인',
  retrain: '재학습',
  gate: '게이트',
  deploy: '배포',
}
const STEP_ORDER: PipelineStepKey[] = ['drift', 'event', 'consecutive', 'retrain', 'gate', 'deploy']

function steps(spec: Partial<Record<PipelineStepKey, [StepState, string | null]>>): PipelineStep[] {
  return STEP_ORDER.map((key) => {
    const [state, result] = spec[key] ?? ['waiting', null]
    return { key, name: STEP_NAMES[key], state, result, systemAction: key === 'retrain' || key === 'deploy' }
  })
}

const scenarios: Scenario[] = [
  { id: 'normal', name: '정상', category: 'normal', expected: '정상', runs: 5 },
  { id: 'staff_shortage', name: '인력 부족 장기화', category: 'retrain', expected: '주의 → 재학습', runs: 3 },
  { id: 'conveyor_fault', name: '컨베이어 고장', category: 'alert_only', expected: '알림만', runs: 4 },
  { id: 'expansion', name: '수취대·터미널 증설', category: 'retrain', expected: '주의 → 재학습', runs: 1 },
  { id: 'opening_chaos', name: '개장 초기 혼란', category: 'judgement', expected: '주의 → 재학습', runs: 1 },
  { id: 'process_change', name: '처리 방식 변경', category: 'retrain', expected: '주의 → 재학습 → 게이트 불합격', runs: 2 },
]

const PASSED_GATE: GateCheck[] = gates[1].checks
const FAILED_GATE: GateCheck[] = gates[0].checks

/** 실행 결과 예시 3종 */
const runs: PipelineRun[] = [
  {
    id: 'run-normal',
    scenarioId: 'normal',
    scenarioName: '정상',
    at: at('1002'),
    steps: steps({
      drift: ['done', 'MAE 4.0 ≤ 5.0'],
      event: ['done', '이벤트 없음'],
      consecutive: ['done', '연속 0/2'],
      retrain: ['skipped', null],
      gate: ['skipped', null],
      deploy: ['skipped', null],
    }),
    gate: null,
    expected: '정상',
    outcome: { kind: 'ok' },
    matched: true,
    logTail: [
      toLog(['1002', 'CHECK', '시나리오 정상 · 21편 주입']),
      toLog(['1002', 'OK', 'MAE 4.0 / 5.0 · 정상']),
    ],
  },
  {
    id: 'run-conveyor',
    scenarioId: 'conveyor_fault',
    scenarioName: '컨베이어 고장',
    at: at('1008'),
    steps: steps({
      drift: ['done', 'MAE 7.4 > 5.0'],
      event: ['done', '컨베이어 고장 6편'],
      consecutive: ['skipped', null],
      retrain: ['skipped', null],
      gate: ['skipped', null],
      deploy: ['skipped', null],
    }),
    gate: null,
    expected: '알림만',
    outcome: { kind: 'alert_only', eventName: '컨베이어 고장' },
    matched: true,
    logTail: [
      toLog(['1008', 'CHECK', '시나리오 컨베이어 고장 · 21편 주입']),
      toLog(['1008', 'ALERT', '이벤트 표시 6편 · 컨베이어 고장']),
      toLog(['1008', 'ALERT', 'MAE 7.4 / 5.0 · 알림만, 재학습하지 않음']),
    ],
  },
  {
    id: 'run-retrain',
    scenarioId: 'staff_shortage',
    scenarioName: '인력 부족 장기화',
    at: at('1015'),
    steps: steps({
      drift: ['done', 'MAE 7.9 > 5.0'],
      event: ['done', '이벤트 없음'],
      consecutive: ['done', '연속 2/2'],
      retrain: ['done', '검증 MAE 4.1'],
      gate: ['done', '3/3 통과'],
      deploy: ['done', 'v2'],
    }),
    gate: PASSED_GATE,
    expected: '주의 → 재학습',
    outcome: { kind: 'retrain_promoted', deployedVersion: 'v2' },
    matched: true,
    logTail: [
      toLog(['1015', 'WARN', 'MAE 7.9 / 5.0 · 연속 초과 2/2']),
      toLog(['1015', 'INFO', '재학습 시작 · v1에서 이어서 fine-tuning 10 epoch', true]),
      toLog(['1017', 'INFO', '재학습 완료 · 검증 MAE 4.1', true]),
      toLog(['1017', 'CHECK', '게이트 3/3 통과']),
      toLog(['1017', 'OK', 'v2 배포', true]),
    ],
  },
]

/** 상태 견본용 실행 2개 — 진행 중(재학습 단계) / 게이트 불합격(v1 유지, 결과 다름) */
const runStates: { running: PipelineRun; gateFailed: PipelineRun } = {
  running: {
    id: 'run-running',
    scenarioId: 'expansion',
    scenarioName: '수취대·터미널 증설',
    at: at('1029'),
    steps: steps({
      drift: ['done', 'MAE 8.1 > 5.0'],
      event: ['done', '이벤트 없음'],
      consecutive: ['done', '연속 2/2'],
      retrain: ['running', null],
    }),
    gate: null,
    expected: '주의 → 재학습',
    outcome: null,
    matched: null,
    logTail: [
      toLog(['1029', 'WARN', 'MAE 8.1 / 5.0 · 연속 초과 2/2']),
      toLog(['1029', 'INFO', '재학습 시작 · v1에서 이어서 fine-tuning 10 epoch', true]),
    ],
  },
  gateFailed: {
    id: 'run-gate-failed',
    scenarioId: 'process_change',
    scenarioName: '처리 방식 변경',
    at: '202609301638',
    steps: steps({
      drift: ['done', 'MAE 8.3 > 5.0'],
      event: ['done', '이벤트 없음'],
      consecutive: ['done', '연속 2/2'],
      retrain: ['done', '검증 MAE 5.6'],
      gate: ['failed', '2/3 불합격'],
      deploy: ['skipped', null],
    }),
    gate: FAILED_GATE,
    expected: '주의 → 재학습',
    outcome: { kind: 'retrain_rejected', keptVersion: 'v1' },
    matched: false,
    logTail: [
      { at: '202609301638', tag: 'INFO', message: '재학습 시작 · v1에서 이어서 fine-tuning 10 epoch', highlight: true },
      { at: '202609301640', tag: 'INFO', message: '재학습 완료 · 검증 MAE 5.6', highlight: true },
      { at: '202609301640', tag: 'FAIL', message: '게이트 불합격 · 검증 MAE 5.6 > 5.0, 개선 5%', highlight: false },
      { at: '202609301640', tag: 'INFO', message: 'v1 유지', highlight: false },
    ],
  },
}

/** CSV 11컬럼 (flights_real_YYYYMMDD.csv 형식) */
export const csvColumns = [
  'flightId',
  'terminalId',
  'bagCarouselId',
  'line_id',
  'aircraftSubtype',
  'seats',
  'estimatedDatetime',
  'landingDatetime',
  'bagLastTime',
  'wait_min',
  'event_tag',
] as const

export type CsvColumn = (typeof csvColumns)[number]

/** CSV 한 행 — 값은 파일 글자 그대로 (빈 event_tag 는 "") */
export type CsvRow = Record<CsvColumn, string>

// prettier-ignore
const PREVIEW_SEEDS: string[][] = [
  ['CX426',  'P01', '3', 'T1-03', '32Q', '200', '202610010100', '202610010052', '202610010124', '32', ''],
  ['7C8406', 'P01', '3', 'T1-03', '738', '189', '202610010245', '202610010238', '202610010308', '30', ''],
  ['UA805',  'P01', '3', 'T1-03', '789', '280', '202610010431', '202610010422', '202610010502', '40', ''],
  ['WE272',  'P01', '3', 'T1-03', '332', '250', '202610010619', '202610010608', '202610010639', '31', ''],
  ['ZE594',  'P01', '3', 'T1-03', '7M8', '189', '202610010704', '202610010656', '202610010740', '44', ''],
  ['ZE562',  'P01', '3', 'T1-03', '7M8', '189', '202610010802', '202610010753', '202610010825', '32', ''],
  ['KC909',  'P01', '3', 'T1-03', '763', '250', '202610010933', '202610010920', '202610011006', '46', ''],
  ['7C1396', 'P01', '3', 'T1-03', '738', '189', '202610011046', '202610011036', '202610011106', '30', ''],
  ['TW162',  'P01', '4', 'T1-04', '333', '280', '202610010633', '202610010623', '202610010709', '46', ''],
  ['TW014',  'P01', '4', 'T1-04', '738', '189', '202610010818', '202610010810', '202610010830', '20', ''],
]

/** 시나리오 랩 화면 전부 */
export const lab = {
  /** 시나리오 6개 */
  scenarios,
  /** 실행 결과 예시 3종: [정상(재학습~배포 건너뜀), 알림만(컨베이어 고장), 재학습 성공 v2] */
  runs,
  /** 상태 견본: 진행 중 / 게이트 불합격 */
  runStates,
  /** 게이트 3줄 (재학습 성공 예시의 것) */
  gateChecks: PASSED_GATE,
  /** 현재 데이터 요약 (flights_real_20261001.csv 기준) */
  currentData: {
    fileName: 'flights_real_20261001.csv',
    source: '인천공항 항공기 수하물 정보(조업사용) API',
    rows: 200,
    columns: 11,
    lines: 35,
    t1Rows: 106,
    t2Rows: 94,
    landingFrom: at('0012'),
    landingTo: at('1153'),
    waitMeanMin: 38.5,
    waitMedianMin: 37,
    waitMinMin: 20,
    waitMaxMin: 69,
    over50Rows: 24,
    eventRows: 0,
  },
  /** CSV 컬럼 11개 */
  columns: csvColumns,
  /** 미리보기 10행 (파일 앞 10행 그대로) */
  preview: PREVIEW_SEEDS.map(
    (cells) => Object.fromEntries(csvColumns.map((c, i) => [c, cells[i]])) as CsvRow,
  ),
}
