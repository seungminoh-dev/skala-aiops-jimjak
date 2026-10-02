/**
 * 실서버 어댑터 — 화면의 서버 상태(ServerState)를 짐작 FastAPI 로 채우고, 동작을 FastAPI 로 보낸다.
 * hooks.ts 가 subscribe · getState · 동작만 쓴다. 서버가 없으면 "연결 끊김"으로 보이고 5초마다 다시 붙는다.
 *
 * 서버에서 읽는 것 (5초마다, 동작 뒤에는 바로)
 *   /health · /logs/latency      서버 상태 · 운영 버전 · 응답 시간
 *   /models                      운영 버전 · 버전 목록 · 게이트 기록(승인 대기 포함)
 *   /monitoring/status           임계값 · 연속 초과 · 판정 기록(순번·시각·21편·재학습 결과)
 *   /logs/events                 aiops.log
 *   /data/status                 최근 업로드
 * 화면이 들고 있는 것: 데모 시계, 시나리오 실행 횟수·커서·실행 기록, 시나리오로 보낸 편 이름(판정 점 이름 붙이기)
 *
 * 시나리오 실행 = scripts/simulate_drift.py 와 같은 흐름
 *   첫 단계면 /scenarios/{id}/file 을 받아 /data/upload 로 올리고(재학습이 쓸 새 기간 데이터),
 *   그 단계의 배치(41편 = 앞 20편 + 판정 21편)를 /predict/batch-test 로 보낸다 → 판정 1회 (재학습이면 서버가 이어서 한다)
 *
 * 시각: 서버 시각(실제 시각)을 데모 시계로 옮긴다 — 데모 시계가 10:30 이던 실제 시각을 기준점으로 같은 분만큼.
 *   그래서 로그 · 판정 · 배포 시각이 상단 바 데모 시각과 한 줄로 이어진다. 기준점은 탭을 닫기 전까지 유지한다.
 */
import { parseDatasetCsv, summarizeRows } from '@/api/csv'
import { API_BASE, request, requestText } from '@/api/http'
import { DEMO_BASE } from '@/api/ops'
import { DATA_SOURCE_SIM, SCENARIO_SPECS, toScenarioId } from '@/api/scenarioData'
import {
  ApiError,
  type BatchRecord,
  type CsvRow,
  type DatasetSummary,
  type GateCheck,
  type GateRecord,
  type LogLine,
  type LogTag,
  type ModelVersion,
  type ModelVersionId,
  type PipelineRun,
  type PipelineStep,
  type PipelineStepKey,
  type ScenarioId,
  type ScenarioKey,
  type ServerScenarioId,
  type ServerState,
  type StepState,
  type UploadResponse,
  type VerdictInput,
  type VerdictKind,
  type WindowPoint,
  type Ymdhm,
} from '@/api/types'
import { LIVE_CAROUSEL } from '@/app/routes'
import { csvColumns, lab as MOCK_LAB } from '@/design/mock'
import { addMinutes, fmtDecimal } from '@/lib/format'

/* ───────────────────────── 서버 응답 모양 ───────────────────────── */

interface HealthBody {
  status: string
  model_loaded: boolean
  model_version: ModelVersionId | null
}

interface LatencyBody {
  count: number
  total: number
  p50_ms: number | null
  p95_ms: number | null
}

interface Outcome {
  promoted: boolean
  version: ModelVersionId | null
  held: boolean
  needs_approval: boolean
  mae: number | null
}

interface Verdict {
  status: 'pending' | 'ok' | 'warn' | 'alert_only' | 'retrain_triggered'
  no?: number
  at?: string
  mae?: number
  threshold: number
  consecutive: number
  limit: number
  window_size: number
  count?: number
  event_tags?: string[]
  event_count?: number
  points?: Array<{ predicted: number; actual: number; event_tag: string }>
  model_version?: ModelVersionId
  outcome?: Outcome
}

interface MonitoringBody {
  threshold: number
  min_threshold: number
  window_size: number
  window_count: number
  consecutive: number
  limit: number
  history: Verdict[]
}

interface RetrainBody {
  ok: boolean
  status?: string | null
  error?: string | null
  mae?: number | null
  baseline_mae?: number | null
  current_mae?: number | null
  needs_approval?: boolean
  run_id?: string | null
}

interface DriftCheck extends Verdict {
  promoted: boolean
  version?: ModelVersionId | null
  retrain?: RetrainBody
}

interface VersionBody {
  version: ModelVersionId
  stage: string
  created_at: string
  updated_at: string
  approved: boolean
  mode?: string | null
  base_version?: ModelVersionId | null
  mae?: number | null
  epochs?: number | null
  n_rows?: number | null
  n_train?: number | null
  n_validation?: number | null
}

interface GateBody {
  run_id: string
  run_name: string
  at: string
  status: string
  passed: boolean
  version: ModelVersionId | null
  needs_approval: boolean
  approved_version: ModelVersionId | null
  base_version?: ModelVersionId | null
  mae?: number | null
  baseline_mae?: number | null
  current_mae?: number | null
}

interface ModelsBody {
  production: ModelVersionId | null
  versions: VersionBody[]
  gates: GateBody[]
}

interface LogEvent {
  time: string
  tag: string
  message: string
}

interface DataStatusBody {
  exists: boolean
  filename?: string
  rows?: number
  start_date?: string
  end_date?: string
  min_wait_min?: number
  max_wait_min?: number
}

/* ───────────────────────── 상수 ───────────────────────── */

const REFRESH_SEC = 5
const MODELS_EVERY_SEC = 30
const WINDOW_SIZE = 21
const BATCH_N = 20 + WINDOW_SIZE
const BASELINE_RATIO = 0.9
const MAX_LOGS = 300
const BATCH_TIMEOUT_MS = 120_000

const EVENT_LABEL: Record<string, string> = { bhs_failure: '컨베이어 고장', terminal_open: '터미널 개장' }
const LOG_TAGS = new Set<LogTag>(['WARN', 'INFO', 'OK', 'FAIL', 'ALERT', 'CHECK'])

const round1 = (n: number) => Math.round(n * 10) / 10
const eventLabel = (tags: readonly string[] = []) => (tags.length ? tags.map((t) => EVENT_LABEL[t] ?? t).join(' · ') : null)

/* ───────────────────────── 데모 시계 ───────────────────────── */

const ORIGIN_KEY = 'jimjak.live.origin'

interface Origin {
  realMs: number
  demo: Ymdhm
}

function loadOrigin(): Origin {
  try {
    const saved = JSON.parse(sessionStorage.getItem(ORIGIN_KEY) ?? 'null') as Origin | null
    if (saved && typeof saved.realMs === 'number' && /^\d{12}$/.test(saved.demo)) return saved
  } catch {
    // 저장소를 못 쓰면 이번 탭에서만 쓴다
  }
  return { realMs: Date.now(), demo: DEMO_BASE }
}

function saveOrigin(o: Origin) {
  try {
    sessionStorage.setItem(ORIGIN_KEY, JSON.stringify(o))
  } catch {
    // 무시 — 새로고침하면 10:30 부터 다시
  }
}

let origin = loadOrigin()
saveOrigin(origin)

function computeLiveNow(): Ymdhm {
  return addMinutes(origin.demo, Math.floor((Date.now() - origin.realMs) / 60_000))
}

/** 서버 시각("2026-10-02T10:53:10+09:00" · 로그 "2026-10-02 10:53:10") → 실제 ms */
function serverMs(s: string): number {
  return Date.parse(s.includes('T') ? s : s.replace(' ', 'T'))
}

/** 서버 시각 → 데모 시각 */
function toDemo(s: string | null | undefined): Ymdhm {
  const ms = s ? serverMs(s) : NaN
  return Number.isFinite(ms) ? addMinutes(origin.demo, Math.floor((ms - origin.realMs) / 60_000)) : computeLiveNow()
}

/* ───────────────────────── 처음 상태 ───────────────────────── */

const zeroCounts = (): Record<ScenarioId, number> =>
  Object.fromEntries(MOCK_LAB.scenarios.map((s) => [s.id, 0])) as Record<ScenarioId, number>

const emptyLab = (): ServerState['lab'] => ({ runCounts: zeroCounts(), cursors: zeroCounts(), runningId: null, pendingRun: null, runs: [] })

function emptySummary(at: Ymdhm): DatasetSummary {
  return {
    fileName: '아직 올린 파일이 없어요',
    source: '서버',
    rows: 0,
    columns: csvColumns.length,
    lines: 0,
    t1Rows: 0,
    t2Rows: 0,
    landingFrom: at,
    landingTo: at,
    waitMeanMin: Number.NaN,
    waitMedianMin: Number.NaN,
    waitMinMin: Number.NaN,
    waitMaxMin: Number.NaN,
    over50Rows: Number.NaN,
    eventRows: Number.NaN,
  }
}

function initialState(): ServerState {
  const liveNow = computeLiveNow()
  return {
    clock: { liveNow, at: null },
    health: {
      status: 'connected',
      lastUpdatedAt: liveNow,
      refreshSec: REFRESH_SEC,
      latency: { p50Ms: 0, p95Ms: 0, requests: 0, windowLabel: '최근 예측' },
    },
    models: { production: 'v1', versions: [], gates: [], history: [] },
    monitor: { threshold: 5, gateMae: 5, consecutiveLimit: 2, windowSize: WINDOW_SIZE, window: [], judgedWindow: [], batches: [], consecutive: 0 },
    lab: emptyLab(),
    logs: [],
    dataset: { current: emptySummary(liveNow), preview: [], uploading: false },
  }
}

/* ───────────────────────── 저장소 ───────────────────────── */

let state: ServerState = initialState()
const listeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null
let seconds = 0
let polling = false

function setState(next: ServerState) {
  state = next
  for (const listener of listeners) listener()
}

const patch = (fn: (s: ServerState) => ServerState) => setState(fn(state))

function tick() {
  const liveNow = computeLiveNow()
  if (liveNow !== state.clock.liveNow) patch((s) => ({ ...s, clock: { ...s.clock, liveNow } }))
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (ticker === null) {
    tick()
    ticker = setInterval(() => {
      tick()
      seconds += 1
      if (seconds % REFRESH_SEC === 0) void poll()
    }, 1000)
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && ticker !== null) {
      clearInterval(ticker)
      ticker = null
    }
  }
}

export function getState(): ServerState {
  return state
}

/* ───────────────────────── 서버 → 화면 모양 ───────────────────────── */

/** 시나리오로 보낸 판정 21편의 편 이름·시각 — 판정 순번(no)과 판정 시각(at)이 같을 때만 붙인다 */
interface BatchExtra {
  at: string
  scenarioId: ScenarioId
  flights: Array<{ flightId: string; lineId: string; landing: Ymdhm; lastBag: Ymdhm }>
}
const extras = new Map<number, BatchExtra>()

function verdictKind(v: Verdict): VerdictKind {
  switch (v.status) {
    case 'ok':
    case 'warn':
    case 'alert_only':
      return v.status
    case 'retrain_triggered':
      // 재학습이 끝나기 전에 읽으면 결과가 아직 없다 → 주의(2/2)로 보이다가 결과가 붙으면 바뀐다
      return v.outcome ? (v.outcome.promoted ? 'retrain_promoted' : 'retrain_rejected') : 'warn'
    default:
      return 'pending'
  }
}

function mapBatch(v: Verdict, production: ModelVersionId): BatchRecord {
  const extra = v.no !== undefined ? extras.get(v.no) : undefined
  const named = extra && extra.at === v.at ? extra : null
  const at = toDemo(v.at)
  const kind = verdictKind(v)
  const modelVersion = v.model_version ?? production
  const points: WindowPoint[] = (v.points ?? []).map((p, i) => {
    const f = named?.flights[i]
    return {
      no: i + 1,
      flightId: f?.flightId ?? `#${i + 1}`,
      lineId: f?.lineId ?? LIVE_CAROUSEL,
      landing: f?.landing ?? at,
      lastBag: f?.lastBag ?? at,
      predicted: p.predicted,
      actual: p.actual,
      errorMin: round1(p.actual - p.predicted),
      eventTag: p.event_tag ? (EVENT_LABEL[p.event_tag] ?? p.event_tag) : null,
    }
  })
  return {
    no: v.no ?? 0,
    at,
    windowSize: v.window_size,
    windowCount: points.length || v.window_size,
    windowMae: round1(v.mae ?? 0),
    threshold: v.threshold,
    consecutive: v.consecutive,
    verdict: kind,
    eventName: kind === 'alert_only' ? eventLabel(v.event_tags) : null,
    modelVersion,
    deployedVersion: v.outcome?.promoted ? v.outcome.version : null,
    keptVersion: kind === 'retrain_rejected' ? modelVersion : null,
    needsApproval: v.outcome?.needs_approval ?? false,
    held: v.outcome?.held ?? false,
    points,
    scenarioId: named?.scenarioId ?? null,
  }
}

function mapMonitor(body: MonitoringBody, production: ModelVersionId): ServerState['monitor'] {
  const batches = body.history.filter((v) => v.status !== 'pending' && v.no !== undefined).map((v) => mapBatch(v, production))
  const last = batches[batches.length - 1]
  return {
    threshold: body.threshold,
    gateMae: body.min_threshold,
    consecutiveLimit: body.limit,
    windowSize: body.window_size,
    // 새 버전 적용·초기화 직후에는 감시 창이 비어 있다 (다음 판정은 새 모델 예측으로)
    window: body.window_count === 0 ? [] : (last?.points ?? []),
    judgedWindow: last?.points ?? [],
    batches,
    consecutive: body.consecutive,
  }
}

function gateChecks(mae: number, baseline: number | null | undefined, current: number | null | undefined, gateMae: number): GateCheck[] {
  const improve = baseline ? Math.round((1 - mae / baseline) * 100) : 0
  return [
    { criterion: `검증 MAE ≤ ${gateMae}분`, value: fmtDecimal(mae), passed: mae <= gateMae },
    {
      criterion: '단순 방법 대비 10% 개선',
      value: baseline ? `${fmtDecimal(baseline)} → ${fmtDecimal(mae)} (${improve}%)` : '—',
      passed: baseline ? mae <= baseline * BASELINE_RATIO : false,
    },
    {
      criterion: '현재 모델보다 나쁘지 않음',
      value: current == null ? '첫 배포' : `${fmtDecimal(current)} → ${fmtDecimal(mae)}`,
      passed: current == null || mae <= current,
    },
  ]
}

/** 버전 행·Production 카드의 "학습 데이터" (학습 방식·원본 버전은 화면이 따로 쓴다) */
function trainDataText(v: VersionBody): string {
  const split = `학습 ${v.n_train ?? '?'}편 · 검증 ${v.n_validation ?? '?'}편`
  if (v.mode === 'fine-tune') return `최근 2주 ${split}${v.approved ? ' · 운영자 승인' : ''}`
  return `${v.n_rows ?? '?'}편 (${split})`
}

function mapModels(body: ModelsBody, gateMae: number): ServerState['models'] {
  const versions: ModelVersion[] = body.versions.map((v) => {
    const production = v.stage === 'Production'
    const created = toDemo(v.created_at)
    const updated = toDemo(v.updated_at)
    return {
      version: v.version,
      method: v.mode === 'fine-tune' ? 'fine-tuning' : '처음 학습',
      base: v.base_version ?? null,
      trainedAt: created,
      valMae: v.mae ?? 0,
      epochs: v.epochs ?? 0,
      trainData: trainDataText(v),
      status: production ? 'production' : 'retired',
      deployedAt: production ? updated : created,
      retiredAt: production ? null : updated,
    }
  })
  const gates: GateRecord[] = body.gates.map((g) => {
    const mae = g.mae ?? 0
    // 불합격 후보는 버전이 없다 → 실행 id 앞자리로 부른다 (승인하면 decision 에 새 버전)
    const candidate = g.version ?? `후보 ${g.run_id.slice(0, 7)}`
    return {
      id: g.run_id,
      at: toDemo(g.at),
      trigger: g.run_name === 'base-train' ? '최초 학습' : `드리프트 2회 연속 → 재학습 (${g.base_version ?? '?'}에서 이어서)`,
      candidate,
      // 처음 학습은 이어서 학습한 원본이 없다 → 자기 버전
      base: g.base_version ?? g.version ?? 'v1',
      checks: gateChecks(mae, g.baseline_mae, g.current_mae, gateMae),
      passed: g.passed,
      decision: g.passed
        ? `${g.version} 배포`
        : g.approved_version
          ? `${g.approved_version} 승인 적용`
          : g.needs_approval
            ? '승인 대기'
            : `${g.base_version ?? '기존 모델'} 유지`,
      runId: g.run_id,
      needsApproval: g.needs_approval,
      approvedVersion: g.approved_version,
    }
  })
  const history = versions.map((v) => ({ at: v.deployedAt, version: v.version })).sort((a, b) => a.at.localeCompare(b.at))
  return { production: body.production ?? versions[versions.length - 1]?.version ?? 'v1', versions, gates, history }
}

function mapLogs(events: readonly LogEvent[]): LogLine[] {
  return events.map((e) => ({
    at: toDemo(e.time),
    tag: LOG_TAGS.has(e.tag as LogTag) ? (e.tag as LogTag) : 'INFO',
    message: e.message,
    highlight: e.tag === 'OK' || /재학습 시작|승격|승인|되돌림/.test(e.message),
  }))
}

/* ───────────────────────── 읽기 ───────────────────────── */

/** 서버 파일명(jimjak_….csv) → 화면이 올리며 계산해 둔 요약 */
const datasetCache = new Map<string, { summary: DatasetSummary; preview: CsvRow[] }>()
let modelsReadAt = 0

/** /health · /logs/latency. 연결이 안 되면 false (화면 데이터는 마지막 값을 둔다) */
async function refreshHealth(): Promise<boolean> {
  let health: HealthBody | null = null
  try {
    health = await request<HealthBody>('/health', { timeoutMs: 5_000 })
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 503) {
      patch((s) => ({ ...s, health: { ...s.health, status: 'disconnected' } }))
      return false
    }
    // 503 = 서버는 살아 있고 모델만 아직 없다 (lazy 첫 예측 전)
  }
  const latency = await request<LatencyBody>('/logs/latency', { timeoutMs: 5_000 }).catch(() => null)
  patch((s) => ({
    ...s,
    health: {
      ...s.health,
      status: 'connected',
      lastUpdatedAt: s.clock.liveNow,
      latency: latency
        ? { p50Ms: Math.round(latency.p50_ms ?? 0), p95Ms: Math.round(latency.p95_ms ?? 0), requests: latency.total, windowLabel: `최근 ${latency.count}건` }
        : s.health.latency,
    },
  }))
  if (health?.model_version && health.model_version !== state.models.production) modelsReadAt = 0
  return true
}

async function refreshModels() {
  const body = await request<ModelsBody>('/models')
  modelsReadAt = Date.now()
  patch((s) => ({ ...s, models: mapModels(body, s.monitor.gateMae) }))
}

async function refreshMonitor() {
  const body = await request<MonitoringBody>('/monitoring/status')
  patch((s) => ({ ...s, monitor: mapMonitor(body, s.models.production) }))
}

async function refreshLogs() {
  const events = await request<LogEvent[]>(`/logs/events?limit=${MAX_LOGS}`)
  patch((s) => ({ ...s, logs: mapLogs(events) }))
}

async function refreshDataset() {
  const body = await request<DataStatusBody>('/data/status')
  patch((s) => {
    if (!body.exists || !body.filename) return { ...s, dataset: { ...s.dataset, current: emptySummary(s.clock.liveNow), preview: [] } }
    const known = datasetCache.get(body.filename)
    if (known) return { ...s, dataset: { ...s.dataset, current: known.summary, preview: known.preview } }
    const from = (body.start_date ?? s.clock.liveNow) as Ymdhm
    return {
      ...s,
      dataset: {
        ...s.dataset,
        preview: [],
        current: {
          ...emptySummary(s.clock.liveNow),
          fileName: body.filename,
          source: '서버 최근 업로드',
          rows: body.rows ?? 0,
          landingFrom: from,
          landingTo: (body.end_date ?? from) as Ymdhm,
          waitMinMin: body.min_wait_min ?? Number.NaN,
          waitMaxMin: body.max_wait_min ?? Number.NaN,
        },
      },
    }
  })
}

/** 전부 다시 읽기 — 모델 먼저(판정 기록이 운영 버전을 쓴다) */
async function refreshAll(): Promise<void> {
  if (!(await refreshHealth())) return
  await refreshModels().catch(() => undefined)
  await Promise.allSettled([refreshMonitor(), refreshLogs(), refreshDataset()])
}

/** 5초마다 — 서버 상태·판정·로그, 모델은 버전이 바뀌었거나 30초마다 */
async function poll() {
  if (polling) return
  polling = true
  try {
    if (!(await refreshHealth())) return
    const jobs: Array<Promise<unknown>> = [refreshMonitor(), refreshLogs()]
    if (Date.now() - modelsReadAt > MODELS_EVERY_SEC * 1000) jobs.push(refreshModels())
    await Promise.allSettled(jobs)
  } finally {
    polling = false
  }
}

/** 화면을 그리기 전에 한 번 다 읽는다 (main.tsx) */
export async function start(): Promise<void> {
  await refreshAll()
}

/* ───────────────────────── 시나리오 실행 ───────────────────────── */

interface ScenarioFile {
  text: string
  rows: CsvRow[]
}
const scenarioFiles = new Map<ServerScenarioId, ScenarioFile>()
/** 지금 서버의 "최근 업로드"가 어느 시나리오 파일인가 (재학습이 그 데이터를 쓰도록) */
let uploadedScenario: ServerScenarioId | null = null

async function scenarioFile(id: ServerScenarioId): Promise<ScenarioFile> {
  const cached = scenarioFiles.get(id)
  if (cached) return cached
  const text = await requestText(`/scenarios/${id}/file`)
  // simulate_drift.py 처럼 착륙 시각 순서로
  const rows = parseDatasetCsv(text).sort((a, b) => a.landingDatetime.localeCompare(b.landingDatetime))
  const file = { text, rows }
  scenarioFiles.set(id, file)
  return file
}

async function uploadText(text: string, fileName: string, rows: readonly CsvRow[], source: string): Promise<UploadResponse> {
  const form = new FormData()
  form.append('file', new Blob([text], { type: 'text/csv' }), fileName)
  const res = await request<UploadResponse>('/data/upload', { method: 'POST', body: form, timeoutMs: 30_000 })
  const summary = summarizeRows(rows, fileName, source, state.clock.liveNow)
  datasetCache.set(res.filename, { summary, preview: rows.slice(0, 10) })
  patch((s) => ({ ...s, dataset: { ...s.dataset, current: summary, preview: rows.slice(0, 10) } }))
  return res
}

const STEP_TEMPLATE: PipelineStep[] = MOCK_LAB.runs[0].steps.map((s) => ({ ...s, state: 'waiting', result: null }))

function buildSteps(spec: Partial<Record<PipelineStepKey, [StepState, string | null]>>): PipelineStep[] {
  return STEP_TEMPLATE.map((s) => {
    const [stepState, result] = spec[s.key] ?? ['skipped', null]
    return { ...s, state: stepState, result }
  })
}

/** batch-test 응답 → 실행 결과 (여섯 단계 · 게이트 표 · 판정) */
function buildRun(id: ScenarioId, d: DriftCheck, at: Ymdhm, expectKind: VerdictKind, expectText: string, logTail: LogLine[], runNo: number): PipelineRun {
  const scenario = MOCK_LAB.scenarios.find((x) => x.id === id)!
  const r = d.retrain
  const retrained = d.status === 'retrain_triggered'
  const held = r?.error === 'awaiting_new_data'
  const evaluated = retrained && !held && r?.mae != null
  const kind: VerdictKind = d.status === 'retrain_triggered' ? (d.promoted ? 'retrain_promoted' : 'retrain_rejected') : d.status
  const eventName = (d.event_count ?? 0) > 0 ? eventLabel(d.event_tags) : null
  const prod = d.model_version ?? state.models.production
  const checks = evaluated ? gateChecks(r!.mae!, r!.baseline_mae, r!.current_mae, state.monitor.gateMae) : null
  const mae = d.mae ?? 0

  const steps = buildSteps({
    drift: ['done', `MAE ${fmtDecimal(mae)} ${mae > d.threshold ? '>' : '≤'} ${fmtDecimal(d.threshold)}`],
    event: ['done', eventName ? `${eventName} ${d.event_count}편` : '이벤트 없음'],
    consecutive: d.status === 'alert_only' ? ['skipped', null] : ['done', `연속 ${d.consecutive}/${d.limit}`],
    retrain: !retrained
      ? ['skipped', null]
      : held
        ? ['skipped', '같은 데이터 보류']
        : evaluated
          ? ['done', `검증 MAE ${fmtDecimal(r!.mae!)}`]
          : ['failed', r?.error ?? '재학습 실패'],
    gate: evaluated ? (d.promoted ? ['done', `${checks!.length}/${checks!.length} 통과`] : ['failed', `${checks!.filter((c) => !c.passed).length}/${checks!.length} 불합격`]) : ['skipped', null],
    deploy: d.promoted ? ['done', d.version ?? null] : r?.needs_approval ? ['waiting', '사람 승인 대기'] : ['skipped', null],
  })

  const outcome: VerdictInput = {
    kind,
    windowCount: WINDOW_SIZE,
    windowSize: WINDOW_SIZE,
    consecutive: d.consecutive,
    consecutiveLimit: d.limit,
    eventName: kind === 'alert_only' ? eventName : null,
    deployedVersion: d.promoted ? (d.version ?? null) : null,
    keptVersion: kind === 'retrain_rejected' ? prod : null,
    needsApproval: r?.needs_approval ?? false,
    held,
  }

  return {
    id: `run-${runNo}`,
    scenarioId: id,
    scenarioName: scenario.name,
    at,
    steps,
    gate: checks,
    expected: expectText,
    outcome,
    matched: kind === expectKind,
    logTail,
  }
}

/**
 * 시나리오 실행 — 화면 id(conveyor_fault)와 서버 id(bhs_failure) 둘 다 받는다.
 * 실패: 404 모르는 시나리오 · 409 다른 실행 중 · 서버 오류는 ApiError 그대로.
 */
export async function runScenario(key: ScenarioKey): Promise<PipelineRun> {
  const id = toScenarioId(key)
  if (!id) throw new ApiError(404, `알 수 없는 시나리오입니다: ${key}`)
  if (state.lab.runningId) throw new ApiError(409, '다른 시나리오가 실행 중입니다.')
  const spec = SCENARIO_SPECS[id]
  const cursor = state.lab.cursors[id] % spec.steps.length
  const step = spec.steps[cursor]
  const batch = step.batch ?? cursor
  const runNo = state.lab.runs.length + 1
  const t = computeLiveNow()
  const startedMs = Date.now() - 1_000
  const scenario = MOCK_LAB.scenarios.find((x) => x.id === id)!
  const pending: PipelineRun = {
    id: `run-${runNo}`,
    scenarioId: id,
    scenarioName: scenario.name,
    at: t,
    steps: STEP_TEMPLATE.map((st, i) => ({ ...st, state: i === 0 ? 'running' : 'waiting', result: null })),
    gate: null,
    expected: step.expectText,
    outcome: null,
    matched: null,
    logTail: [],
  }
  patch((s) => ({ ...s, lab: { ...s.lab, runningId: id, pendingRun: pending } }))

  try {
    const file = await scenarioFile(spec.serverId)
    if (cursor === 0 || uploadedScenario !== spec.serverId) {
      await uploadText(file.text, spec.dataFile, file.rows, DATA_SOURCE_SIM)
      uploadedScenario = spec.serverId
    }
    const flights = file.rows.slice(batch * WINDOW_SIZE, batch * WINDOW_SIZE + BATCH_N)
    if (flights.length < BATCH_N) throw new ApiError(409, `${spec.dataFile}에 ${batch + 1}번째 배치가 없습니다.`)
    const body = {
      flights: flights.map((r) => ({ wait_min: Number(r.wait_min), seats: Number(r.seats), event_tag: r.event_tag.trim() })),
    }
    const res = await request<{ predictions: number[]; drift_check: DriftCheck }>('/predict/batch-test', {
      method: 'POST',
      body,
      timeoutMs: BATCH_TIMEOUT_MS,
    })
    const d = res.drift_check
    if (d.no !== undefined && d.at) {
      extras.set(d.no, {
        at: d.at,
        scenarioId: id,
        flights: flights.slice(BATCH_N - WINDOW_SIZE).map((r) => ({
          flightId: r.flightId,
          lineId: r.line_id || LIVE_CAROUSEL,
          landing: r.landingDatetime as Ymdhm,
          lastBag: r.bagLastTime as Ymdhm,
        })),
      })
    }
    if (d.promoted) uploadedScenario = null // 새 모델은 새 데이터부터 다시
    modelsReadAt = 0
    await refreshAll()
    const tail = await request<LogEvent[]>('/logs/events?limit=40')
      .then((events) => mapLogs(events.filter((e) => serverMs(e.time) >= startedMs)))
      .catch(() => [] as LogLine[])
    const run = buildRun(id, d, t, step.expectKind, step.expectText, tail, runNo)
    patch((s) => ({
      ...s,
      lab: {
        ...s.lab,
        runCounts: { ...s.lab.runCounts, [id]: s.lab.runCounts[id] + 1 },
        cursors: { ...s.lab.cursors, [id]: (cursor + 1) % spec.steps.length },
        runningId: null,
        pendingRun: null,
        runs: [...s.lab.runs, run],
      },
    }))
    return run
  } catch (error) {
    patch((s) => ({ ...s, lab: { ...s.lab, runningId: null, pendingRun: null } }))
    throw error instanceof ApiError ? error : new ApiError(500, '실행하지 못했어요')
  }
}

/* ───────────────────────── 그 밖의 동작 ───────────────────────── */

/**
 * 데모 초기화 — 서버의 판정 기록·감시 창을 비우고(/monitoring/reset), 운영 모델을 처음 버전으로 되돌린 뒤
 * 데모 시계를 10:30 으로. 시나리오 실행 기록도 비운다.
 */
export async function resetDemo(): Promise<void> {
  if (state.lab.runningId) throw new ApiError(409, '시나리오 실행 중에는 초기화할 수 없어요.')
  await request('/monitoring/reset', { method: 'POST' })
  const first = state.models.versions[0]?.version
  if (first && state.models.production !== first) {
    await request('/models/rollback', { method: 'POST', body: { version: first } })
  }
  extras.clear()
  uploadedScenario = null
  origin = { realMs: Date.now(), demo: DEMO_BASE }
  saveOrigin(origin)
  patch((s) => ({ ...s, clock: { liveNow: DEMO_BASE, at: null }, lab: emptyLab() }))
  modelsReadAt = 0
  await refreshAll()
}

/** 운영 버전 전환 (보관된 버전을 Production 으로) — 409 이미 운영 중 · 404 없는 버전 */
export async function promoteVersion(version: ModelVersionId): Promise<void> {
  if (state.lab.runningId) throw new ApiError(409, '시나리오 실행 중에는 운영 버전을 바꿀 수 없습니다.')
  await request('/models/rollback', { method: 'POST', body: { version } })
  uploadedScenario = null
  modelsReadAt = 0
  await refreshAll()
}

/** 승인 대기 후보 적용 (게이트 불합격이지만 지금 모델보다 나은 새 모델). runId = GateRecord.runId */
export async function approveCandidate(runId: string): Promise<{ version: ModelVersionId }> {
  if (state.lab.runningId) throw new ApiError(409, '시나리오 실행 중에는 승인할 수 없습니다.')
  const res = await request<{ version: ModelVersionId }>('/models/approve', { method: 'POST', body: { run_id: runId }, timeoutMs: 60_000 })
  uploadedScenario = null
  modelsReadAt = 0
  await refreshAll()
  return res
}

/** CSV 업로드 — 브라우저에서 먼저 같은 검사를 하고(api/csv.ts) 서버 /data/upload 로 */
export async function uploadCsv(file: File): Promise<UploadResponse> {
  patch((s) => ({ ...s, dataset: { ...s.dataset, uploading: true } }))
  try {
    let text: string
    try {
      text = await file.text()
    } catch {
      throw new ApiError(400, 'UTF-8로 인코딩된 CSV 파일만 업로드할 수 있습니다.')
    }
    const rows = parseDatasetCsv(text)
    const res = await uploadText(text, file.name, rows, '업로드한 파일')
    uploadedScenario = null
    void refreshLogs().catch(() => undefined)
    return { filename: file.name, rows: res.rows }
  } finally {
    patch((s) => ({ ...s, dataset: { ...s.dataset, uploading: false } }))
  }
}

/** 시각 지정 (null = 실시간). 화면 기준만 바꾼다 */
export function setAt(at: Ymdhm | null): void {
  if (at !== null && !/^\d{12}$/.test(at)) return
  if (at === state.clock.at) return
  patch((s) => ({ ...s, clock: { ...s.clock, at } }))
}

/** 실서버 주소 (화면 하단 표기 등) */
export const serverBase = API_BASE || window.location.origin
