/**
 * API 층 타입 — 화면은 이 파일(또는 '@/api')에서만 타입을 가져온다. design/mock 을 직접 import 하지 않는다.
 *
 * 모양은 기존 부품(components/ops·monitoring·lab)의 props 와 그대로 맞물리도록 design/mock 의 타입을 다시 내보낸다
 * (Flight, Line, Batch, WindowPoint, ModelVersion, GateRecord, LogLine, Scenario, PipelineRun …).
 * 나중에 실제 서버로 바꿀 때도 이 모양을 유지하고, 변환은 src/api 안에서 한다.
 */
import type {
  ActionItem,
  Airline,
  Airport,
  Batch,
  CsvColumn,
  CsvRow,
  FigureItem,
  Flight,
  FlightActual,
  GateCheck,
  GateRecord,
  Line,
  LineId,
  LogLine,
  ModelVersion,
  ModelVersionId,
  PipelineRun,
  PipelineStep,
  PipelineStepKey,
  Prediction,
  Scenario,
  ScenarioId,
  SeatRow,
  SequenceStep,
  Terminal,
  TimelineBar,
  WhatIfOption,
  WindowPoint,
} from '@/design/mock'
import type {
  FlightStatus,
  LineStatus,
  LogTag,
  ScenarioCategory,
  ServerStatus,
  StepState,
  VerdictInput,
  VerdictKind,
  Ymdhm,
} from '@/lib/format'

export type {
  ActionItem,
  Airline,
  Airport,
  Batch,
  CsvColumn,
  CsvRow,
  FigureItem,
  Flight,
  FlightActual,
  FlightStatus,
  GateCheck,
  GateRecord,
  Line,
  LineId,
  LineStatus,
  LogLine,
  LogTag,
  ModelVersion,
  ModelVersionId,
  PipelineRun,
  PipelineStep,
  PipelineStepKey,
  Prediction,
  Scenario,
  ScenarioCategory,
  ScenarioId,
  SeatRow,
  SequenceStep,
  ServerStatus,
  StepState,
  Terminal,
  TimelineBar,
  VerdictInput,
  VerdictKind,
  WhatIfOption,
  WindowPoint,
  Ymdhm,
}

/* ───────────────────────── 오류 ───────────────────────── */

/** 서버 오류 모양 (FastAPI HTTPException 과 같다: status + detail) */
export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

/* ───────────────────────── 데모 시계 ───────────────────────── */

export interface DemoClock {
  /** 화면 기준 시각 = 시각 지정이면 at, 아니면 liveNow. 운영 현황 계산은 이것으로 한다 */
  now: Ymdhm
  /** 실시간 데모 시각 (기준 2026-10-01 10:30 + 실제 흐른 시간). 상단 바 시계·시각 제어 기본값·로그 시각 */
  liveNow: Ymdhm
  /** 시각 지정 (null = 실시간) — TimeControl value, AppHeader pinnedAt */
  at: Ymdhm | null
  pinned: boolean
}

/* ───────────────────────── 서버 상태 ───────────────────────── */

export interface Latency {
  p50Ms: number
  p95Ms: number
  requests: number
  /** "최근 1시간" */
  windowLabel: string
}

export interface HealthView {
  status: ServerStatus
  /** 운영 버전 (상단 바 version-badge) */
  modelVersion: ModelVersionId
  /** 마지막 갱신 — 연결 끊김일 때 "10:52 기준" */
  lastUpdatedAt: Ymdhm
  /** 갱신 주기 (초) */
  refreshSec: number
  latency: Latency
}

/* ───────────────────────── 운영 현황 ───────────────────────── */

export interface NextPrediction {
  at: Ymdhm
  flightId: string
  lineId: LineId
}

export interface OpsFigures {
  /** 오늘 도착 (편, 지금까지 착륙) */
  todayArrivals: number
  /** 처리 중 (편) */
  processing: number
  /** 3시간 안 도착 (편, 아직 도착 전) */
  arrivingIn3h: number
  /** 오늘 예측 오차 (분, MAE). 완료 편이 없으면 null */
  todayErrorMin: number | null
}

export interface OpsView {
  /** 계산 기준 시각 (시각 지정이면 그 시각) */
  now: Ymdhm
  pinned: boolean
  /** 타임라인·도착편 표 기본 범위: (지금 −1시간)을 30분 단위로 내린 시각 ~ +4시간. 10:30 이면 09:30 ~ 13:30 */
  windowStart: Ymdhm
  windowEnd: Ymdhm
  /** 모든 도착편 (ETA 오름차순) — "전체 보기" */
  flights: Flight[]
  /** ETA 가 기본 범위 안인 편 — 도착편 표 기본 */
  windowFlights: Flight[]
  /** 라인 10개 (상태·처리 중·다음 편을 지금 기준으로 다시 계산) */
  lines: Line[]
  /** 조치 필요 (ETA 오름차순) — 숫자판 값 = actionItems.length */
  actionItems: ActionItem[]
  /** 조치 필요가 없을 때 "다음 예측 10:38 OZ107". 남은 예측이 없으면 null */
  nextPrediction: NextPrediction | null
  figures: OpsFigures
  /** 숫자 줄 4개 (ScreenTitleRow figures) */
  figureRow: FigureItem[]
}

/** focus 와 처리 시간이 겹치는 같은 라인의 편 (components/ops/lineDetailData 의 Overlap 과 같은 모양) */
export interface Overlap {
  flight: Flight
  position: 'before' | 'after'
  start: Ymdhm
  end: Ymdhm
  minutes: number
  basis: 'predicted' | 'actual'
}

export interface WhatIf {
  baseAircraft: string
  baseSeats: number
  baseMinutes: number
  options: WhatIfOption[]
}

/**
 * 라인 상세 서랍 내용 — components/ops/lineDetailData 의 DrawerDetail 과 같은 모양이라
 * <LineDetailBody detail={…} /> 에 그대로 넘길 수 있다. 차이: 지금(now) 기준으로 다시 계산한 값이다.
 */
export interface LineDetailView {
  line: Line
  /** 서랍 "다음 편 예측"에 보일 편 (남은 편이 없으면 null) */
  focus: Flight | null
  /** focus 가 그 라인의 바로 다음 편인가 */
  isNext: boolean
  /** focus 가 조치 필요 편이면 그 조치 */
  action: ActionItem | null
  now: Ymdhm
  windowStart: Ymdhm
  windowEnd: Ymdhm
  /** 이 라인에서 타임라인 범위에 걸리는 편 */
  lineFlights: Flight[]
  overlaps: Overlap[]
  /** 모델 입력 20편 */
  sequence: SequenceStep[]
  whatIf: WhatIf | null
}

/* ───────────────────────── 모델 모니터링 ───────────────────────── */

/** 판정 블록에 그대로 펼쳐 넣는 값: <VerdictBlock {...m.verdictBlock} /> */
export interface VerdictBlockData {
  verdict: VerdictInput
  windowCount: number
  windowSize: number
  windowMae: number
  threshold: number
  consecutive: number
  consecutiveLimit: number
  /** 근거 수치의 기준 시각 (마지막 판정 시각) */
  asOf: Ymdhm
  meta: { version: string; p95Ms: number; judgedAt: Ymdhm }
}

/** 배치(판정 한 번) + 그때 판정한 21편 */
export interface BatchRecord extends Batch {
  points: WindowPoint[]
  /** 이 배치를 만든 시나리오 (처음 시드 배치는 null) */
  scenarioId: ScenarioId | null
}

export interface MonitoringView {
  /** 드리프트 임계값 5.0 (분) — 실서버는 /monitoring/status threshold */
  threshold: number
  /** 게이트 기준 5 (분) */
  gateMae: number
  /** 연속 초과 한도 2 */
  consecutiveLimit: number
  /** 창 크기 21 */
  windowSize: number
  /** 배치 기록 (오래된 것 → 최근). 차트·판정 기록 표에 그대로 */
  batches: BatchRecord[]
  /** 지금 감시 창 (다음 판정에 쓰일 편). 새 버전 배포 직후에는 비어 있다 (창 초기화) */
  window: WindowPoint[]
  /** 마지막으로 판정한 21편 — 감시 창 차트에는 보통 이것을 그린다 (배포 직후에도 비지 않는다) */
  judgedWindow: WindowPoint[]
  /** 지금 연속 초과 횟수 (배포·재학습 뒤 0) */
  consecutive: number
  /** 마지막 판정 (배치가 없으면 null) */
  lastBatch: BatchRecord | null
  verdictBlock: VerdictBlockData
  latency: Latency
  /** 운영 버전 · 창 MAE / 임계값 · 연속 초과 n/2 · 응답 시간 p95 */
  figureRow: FigureItem[]
  modelVersion: ModelVersionId
}

export interface ModelsView {
  /** 운영 버전 */
  production: ModelVersionId
  /** 모델 버전 (배포된 것만. 오래된 것 → 최근) */
  versions: ModelVersion[]
  /** 게이트 이력 (오래된 것 → 최근) */
  gates: GateRecord[]
  gateMae: number
  /** 운영 버전을 바꾸면 적용되는 다음 예측 (ModelVersionTable·ProductionSwitchFacts). 남은 예측이 없으면 null */
  nextPrediction: { at: Ymdhm; flightId: string } | null
}

/* ───────────────────────── 시나리오 랩 ───────────────────────── */

/** 서버(기획서·data/*.csv)의 시나리오 id. 화면 id(ScenarioId)와 두 개가 이름이 다르다 */
export type ServerScenarioId =
  | 'normal'
  | 'bhs_failure'
  | 'staff_shortage'
  | 'expansion'
  | 'terminal_open'
  | 'process_change'

/** runScenario 는 둘 다 받는다 (bhs_failure = conveyor_fault, terminal_open = opening_chaos) */
export type ScenarioKey = ScenarioId | ServerScenarioId

/** 시나리오 데이터 파일 요약 (서버 GET /scenarios) */
export interface ScenarioFileSummary {
  fileName: string
  rows: number
  eventRows: number
  /** 보낼 수 있는 배치 수 (41편씩, 21편 간격) */
  batches: number
  waitMeanMin: number | null
  over50Rows: number
}

export interface ScenarioView extends Scenario {
  /** 서버 id (bhs_failure …) */
  serverId: ServerScenarioId
  /** 데이터 파일 요약 (서버에서 읽기 전이면 null) */
  data: ScenarioFileSummary | null
  /** 데이터 파일 (staff_shortage_2w.csv …) */
  dataFile: string
  /** 다음 실행이 몇 번째 단계인가 (0부터). 재학습까지 한 바퀴 돌면 0으로 */
  cursor: number
  /** 한 바퀴 단계 수 (normal 1, staff_shortage 2, terminal_open 4 …) */
  cycle: number
  /** 다음 실행의 기대 판정 (예: "주의 1/2") */
  nextExpected: string
}

export interface ScenariosView {
  /** 시나리오 6개 (Scenario.runs = 실행 횟수) — ScenarioTable scenarios */
  scenarios: ScenarioView[]
  /** ScenarioTable runCounts */
  runCounts: Record<ScenarioId, number>
  /** 실행 중인 시나리오 — ScenarioTable runningId */
  runningId: ScenarioId | null
  /** 보일 실행 결과: 실행 중이면 진행 중 모습(matched null → 마스코트), 아니면 마지막 결과. 없으면 null */
  currentRun: PipelineRun | null
  /** 실행 기록 (오래된 것 → 최근) */
  runs: PipelineRun[]
  /** 데모 초기화 대화상자: 지울 실행 횟수 */
  totalRuns: number
  /** 데모 초기화 대화상자: 지울 판정 기록 (시나리오로 쌓인 배치 수) */
  verdictsFromRuns: number
}

/* ───────────────────────── 데이터 ───────────────────────── */

/** 현재 데이터 요약 — components/lab/DataPanel 의 CurrentData 와 같은 모양 */
export interface DatasetSummary {
  fileName: string
  source: string
  rows: number
  columns: number
  lines: number
  t1Rows: number
  t2Rows: number
  landingFrom: Ymdhm
  landingTo: Ymdhm
  waitMeanMin: number
  waitMedianMin: number
  waitMinMin: number
  waitMaxMin: number
  over50Rows: number
  eventRows: number
}

export interface DatasetView {
  current: DatasetSummary
  /** CSV 11컬럼 */
  columns: readonly CsvColumn[]
  /** 미리보기 앞 10행 */
  preview: CsvRow[]
  /** 업로드 최소 행 수 (20편 시퀀스 + 21편 창 = 41) */
  minRows: number
  /** 업로드 처리 중 */
  uploading: boolean
}

/** 업로드 성공 응답 (서버 /data/upload 와 같은 모양) */
export interface UploadResponse {
  filename: string
  rows: number
}

/* ───────────────────────── 서버 상태 전체 (liveServer) ───────────────────────── */

export interface ProductionChange {
  at: Ymdhm
  version: ModelVersionId
}

export interface ServerState {
  clock: {
    /** 실시간 데모 시각 */
    liveNow: Ymdhm
    /** 시각 지정 (null = 실시간) */
    at: Ymdhm | null
  }
  health: {
    status: ServerStatus
    lastUpdatedAt: Ymdhm
    refreshSec: number
    latency: Latency
  }
  models: {
    production: ModelVersionId
    versions: ModelVersion[]
    gates: GateRecord[]
    /** 운영 버전이 바뀐 기록 — 예측을 발행한 버전을 고를 때 쓴다 */
    history: ProductionChange[]
  }
  monitor: {
    threshold: number
    gateMae: number
    consecutiveLimit: number
    windowSize: number
    window: WindowPoint[]
    judgedWindow: WindowPoint[]
    batches: BatchRecord[]
    consecutive: number
  }
  lab: {
    runCounts: Record<ScenarioId, number>
    cursors: Record<ScenarioId, number>
    runningId: ScenarioId | null
    pendingRun: PipelineRun | null
    runs: PipelineRun[]
  }
  logs: LogLine[]
  dataset: {
    current: DatasetSummary
    preview: CsvRow[]
    uploading: boolean
  }
  /** 시나리오 데이터 파일 요약 (GET /scenarios) */
  scenarioFiles: Partial<Record<ServerScenarioId, ScenarioFileSummary>>
}
