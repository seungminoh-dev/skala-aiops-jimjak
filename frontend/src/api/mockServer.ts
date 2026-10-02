/**
 * 목업 서버 — 백엔드 없이 브라우저 메모리에 상태를 두고, 동작은 Promise + 약간의 지연으로 흉내 낸다.
 * 나중에 실제 서버로 바꿀 자리: hooks.ts 는 subscribe/getState/actions 만 쓴다. 이 파일을 fetch 로 바꾸면 된다.
 *
 * 상태 (types.ts ServerState)
 * - 데모 시계: 기준 2026-10-01 10:30. 실시간이면 실제로 흐른 시간만큼 간다(1분 단위). 시각 지정(at)은 화면 기준만 바꾼다.
 * - 운영 버전(처음 v1) · 버전 목록 · 게이트 이력 · 운영 버전이 바뀐 기록
 * - 감시 창(21편) · 배치 기록 · 연속 초과 · 임계값 5.0 · 마지막 판정
 * - 시나리오 실행 횟수 · 커서 · 실행 중 · 실행 기록, 로그(aiops 태그 줄), 현재 데이터, 서버 상태
 *
 * 드리프트 규칙 (기획서): 최근 21편 MAE > 5.0 →
 *   이벤트 표시 편이 있으면 알림만(연속 그대로) / 없으면 연속 +1, 2회면 재학습(v_n 에서 이어서 fine-tuning 10 epoch)
 *   → 게이트(검증 MAE ≤ 5 · 단순 방법 대비 10% 개선 · 현재 모델보다 나쁘지 않음) 통과면 새 버전 배포 + 창·연속 초기화,
 *     불합격이면 기존 버전 유지(연속만 초기화).
 *   MAE ≤ 5.0 이면 정상, 연속 0.
 */
import { parseDatasetCsv, summarizeRows } from '@/api/csv'
import { DEMO_BASE } from '@/api/ops'
import { delay, hashSeed, seededRandom } from '@/api/random'
import {
  DATA_FILES,
  DATA_SOURCE_SIM,
  SCENARIO_SPECS,
  toCsvRow,
  toScenarioId,
  type GateSpec,
} from '@/api/scenarioData'
import {
  ApiError,
  type BatchRecord,
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
  type ServerState,
  type ServerStatus,
  type StepState,
  type UploadResponse,
  type VerdictInput,
  type VerdictKind,
  type WindowPoint,
  type Ymdhm,
} from '@/api/types'
import { csvColumns, lab as MOCK_LAB, monitoring as MOCK_MONITORING } from '@/design/mock'
import { addMinutes, fmtDecimal } from '@/lib/format'

/* ───────────────────────── 상수 ───────────────────────── */

const THRESHOLD = MOCK_MONITORING.threshold // 5.0
const GATE_MAE = MOCK_MONITORING.gateMae // 5
const CONSECUTIVE_LIMIT = MOCK_MONITORING.consecutiveLimit // 2
const WINDOW_SIZE = 21
export { MIN_UPLOAD_ROWS } from '@/api/csv'
const RUN_MS = 900
const RUN_RETRAIN_MS = 2500
const ACTION_MS = 300
const UPLOAD_MS = 400
const MAX_LOGS = 300

const DAY = DEMO_BASE.slice(0, 8)
const atDay = (hhmm: string): Ymdhm => `${DAY}${hhmm}`
const round1 = (n: number) => Math.round(n * 10) / 10

const log = (at: Ymdhm, tag: LogTag, message: string, highlight = false): LogLine => ({ at, tag, message, highlight })

/* ───────────────────────── 데모 시계 ───────────────────────── */

/** 실시간 기준점: 이 실제 시각(ms)에 데모 시각이 demo 였다 */
let liveOrigin = { realMs: Date.now(), demo: DEMO_BASE }

function computeLiveNow(): Ymdhm {
  return addMinutes(liveOrigin.demo, Math.floor((Date.now() - liveOrigin.realMs) / 60_000))
}

/* ───────────────────────── 감시 창 21편 만들기 ───────────────────────── */

const AIRLINE_POOL = ['KE', 'OZ', '7C', 'LJ', 'TW', 'ZE', 'DL', 'UA', 'CX']

interface WindowSpec {
  targetMae: number
  eventCount: number
  /** 오차가 + 일 확률 */
  late: number
  eventName: string | null
  /** 마지막 편의 마지막 짐 시각 */
  end: Ymdhm
  lineId: string
}

/** 예측·실제 21쌍. MAE 가 targetMae(소수 한 자리)와 맞도록 오차 합을 먼저 정하고 나눈다 */
function genWindow(rand: () => number, spec: WindowSpec): WindowPoint[] {
  const total = Math.round(spec.targetMae * WINDOW_SIZE)
  const events = new Set<number>()
  if (spec.eventCount > 0) {
    const first = Math.min(WINDOW_SIZE - spec.eventCount, 8 + Math.floor(rand() * 6))
    for (let k = 0; k < spec.eventCount; k += 1) events.add(first + k)
  }
  // 이벤트 편이 오차 대부분을 가져간다 (컨베이어 고장 4편이면 편당 +30~40분)
  const eventWeight = spec.eventCount <= 4 ? 10 : 4
  const weights = Array.from({ length: WINDOW_SIZE }, (_, i) => (events.has(i) ? eventWeight : 1) * (0.4 + rand()))
  const wsum = weights.reduce((s, w) => s + w, 0)
  const mags = weights.map((w) => Math.floor((total * w) / wsum))
  for (let rem = total - mags.reduce((s, m) => s + m, 0); rem > 0; rem -= 1) mags[Math.floor(rand() * WINDOW_SIZE)] += 1

  const points: WindowPoint[] = []
  let lastBag = spec.end
  const lastBags: Ymdhm[] = []
  for (let i = 0; i < WINDOW_SIZE; i += 1) {
    lastBags.unshift(lastBag)
    lastBag = addMinutes(lastBag, -(45 + Math.floor(rand() * 30)))
  }
  for (let i = 0; i < WINDOW_SIZE; i += 1) {
    const predicted = 30 + Math.floor(rand() * 18)
    const isEvent = events.has(i)
    let sign = isEvent || rand() < spec.late ? 1 : -1
    if (predicted - mags[i] < 12) sign = 1
    const actual = predicted + sign * mags[i]
    points.push({
      no: i + 1,
      flightId: `${AIRLINE_POOL[Math.floor(rand() * AIRLINE_POOL.length)]}${100 + Math.floor(rand() * 900)}`,
      lineId: spec.lineId,
      landing: addMinutes(lastBags[i], -actual),
      lastBag: lastBags[i],
      predicted,
      actual,
      errorMin: actual - predicted,
      eventTag: isEvent ? spec.eventName : null,
    })
  }
  return points
}

const windowMae = (points: readonly WindowPoint[]) =>
  points.length === 0 ? 0 : round1(points.reduce((s, p) => s + Math.abs(p.errorMin), 0) / points.length)

/* ───────────────────────── 처음 상태 ───────────────────────── */

const V1: ModelVersion = (() => {
  const v1 = MOCK_MONITORING.versions.find((v) => v.version === 'v1') ?? MOCK_MONITORING.versions[0]
  return { ...v1, status: 'production', retiredAt: null }
})()

/** 처음 배치 3개 (정상) — 차트가 비지 않게. 마지막 배치의 21편은 mock 감시 창(MAE 4.2) 그대로 */
function seedBatches(): BatchRecord[] {
  const seeds: Array<[hhmm: string, mae: number]> = [
    ['0950', 3.9],
    ['1010', 4.3],
    ['1030', 4.2],
  ]
  return seeds.map(([hhmm, mae], i) => {
    const at = atDay(hhmm)
    const points =
      i === seeds.length - 1
        ? MOCK_MONITORING.window.map((p) => ({ ...p }))
        : genWindow(seededRandom(hashSeed(`seed-batch-${i}`)), {
            targetMae: mae,
            eventCount: 0,
            late: 0.5,
            eventName: null,
            end: at,
            lineId: 'T1-03',
          })
    return {
      no: i + 1,
      at,
      windowSize: WINDOW_SIZE,
      windowCount: WINDOW_SIZE,
      windowMae: mae,
      threshold: THRESHOLD,
      consecutive: 0,
      verdict: 'ok',
      eventName: null,
      modelVersion: 'v1',
      deployedVersion: null,
      keptVersion: null,
      points,
      scenarioId: null,
    }
  })
}

const SEED_LOGS: LogLine[] = [
  log(atDay('0930'), 'INFO', 'serving started - production v1 (BagTime_Predictor)'),
  log(atDay('0950'), 'OK', 'batch=1 status=ok mae=3.9 threshold=5.0 consecutive=0/2'),
  log(atDay('0952'), 'ALERT', 'event window - line=T1-17 event_tag=bhs_failure'),
  log(atDay('1008'), 'INFO', 'prediction issued - KE082 line=T2-08 wait=57min over_threshold=true'),
  log(atDay('1010'), 'OK', 'batch=2 status=ok mae=4.3 threshold=5.0 consecutive=0/2'),
  log(atDay('1018'), 'INFO', 'prediction issued - SC4609 line=T1-19 wait=52min over_threshold=true'),
  log(atDay('1028'), 'INFO', 'prediction issued - UA892 line=T1-03 wait=41min over_threshold=false'),
  log(atDay('1030'), 'OK', 'batch=3 status=ok mae=4.2 threshold=5.0 consecutive=0/2'),
]

const zeroCounts = (): Record<ScenarioId, number> =>
  Object.fromEntries(MOCK_LAB.scenarios.map((s) => [s.id, 0])) as Record<ScenarioId, number>

function initialState(): ServerState {
  const batches = seedBatches()
  const last = batches[batches.length - 1]
  return {
    clock: { liveNow: DEMO_BASE, at: null },
    health: {
      // 서버 없이 목업으로 도는 동안은 "연결됨"이 아니라 "목업 데이터"로 보인다 (실제 API를 붙이면 connected)
      status: 'mock',
      lastUpdatedAt: DEMO_BASE,
      refreshSec: 30,
      latency: { ...MOCK_MONITORING.latency },
    },
    models: {
      production: 'v1',
      versions: [V1],
      // 어제 시나리오 랩의 게이트 불합격 한 건만 (v1 유지). "v2 배포됨" 시드는 넣지 않는다
      gates: MOCK_MONITORING.gates.filter((g) => !g.passed),
      history: [{ at: V1.deployedAt, version: 'v1' }],
    },
    monitor: {
      threshold: THRESHOLD,
      gateMae: GATE_MAE,
      consecutiveLimit: CONSECUTIVE_LIMIT,
      windowSize: WINDOW_SIZE,
      window: last.points,
      judgedWindow: last.points,
      batches,
      consecutive: 0,
    },
    lab: {
      runCounts: zeroCounts(),
      cursors: zeroCounts(),
      runningId: null,
      pendingRun: null,
      runs: [],
    },
    logs: SEED_LOGS,
    dataset: {
      current: { ...MOCK_LAB.currentData },
      preview: MOCK_LAB.preview.map((r) => ({ ...r })),
      uploading: false,
    },
  }
}

/* ───────────────────────── 저장소 ───────────────────────── */

let state: ServerState = initialState()
/** 데모 초기화마다 늘린다 — 초기화 전에 시작한 실행 결과는 버린다 */
let epoch = 0
const listeners = new Set<() => void>()
let ticker: ReturnType<typeof setInterval> | null = null

function setState(next: ServerState) {
  state = next
  for (const listener of listeners) listener()
}

/** 실시간 데모 시각이 1분 넘어가면 반영 (서버 마지막 갱신도 같이) */
function tick() {
  const liveNow = computeLiveNow()
  if (liveNow === state.clock.liveNow) return
  setState({
    ...state,
    clock: { ...state.clock, liveNow },
    health: state.health.status !== 'disconnected' ? { ...state.health, lastUpdatedAt: liveNow } : state.health,
  })
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  if (ticker === null) {
    tick()
    ticker = setInterval(tick, 1000)
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

function pushLogs(logs: readonly LogLine[], lines: readonly LogLine[]): LogLine[] {
  return [...logs, ...lines].slice(-MAX_LOGS)
}

/* ───────────────────────── 게이트 ───────────────────────── */

function gateChecks(g: GateSpec): GateCheck[] {
  const improve = Math.round((1 - g.valMae / g.baselineMae) * 100)
  return [
    { criterion: `검증 MAE ≤ ${GATE_MAE}분`, value: fmtDecimal(g.valMae), passed: g.valMae <= GATE_MAE },
    {
      criterion: '단순 방법 대비 10% 개선',
      value: `${fmtDecimal(g.baselineMae)} → ${fmtDecimal(g.valMae)} (${improve}%)`,
      passed: improve >= 10,
    },
    {
      criterion: '현재 모델보다 나쁘지 않음',
      value: `${fmtDecimal(g.currentMae)} → ${fmtDecimal(g.valMae)}`,
      passed: g.valMae <= g.currentMae,
    },
  ]
}

function nextVersionId(versions: readonly ModelVersion[]): ModelVersionId {
  const max = Math.max(0, ...versions.map((v) => Number(v.version.slice(1)) || 0))
  return `v${max + 1}`
}

/* ───────────────────────── 시나리오 실행 ───────────────────────── */

/** 단계 이름은 mock 의 실행 예시에서 가져온다 (드리프트 검사 · 이벤트 확인 · 연속 확인 · 재학습 · 게이트 · 배포) */
const STEP_TEMPLATE: PipelineStep[] = MOCK_LAB.runs[0].steps.map((s) => ({ ...s, state: 'waiting', result: null }))

function buildSteps(spec: Partial<Record<PipelineStepKey, [StepState, string | null]>>): PipelineStep[] {
  return STEP_TEMPLATE.map((s) => {
    const [stepState, result] = spec[s.key] ?? ['skipped', null]
    return { ...s, state: stepState, result }
  })
}

interface RunPlan {
  id: ScenarioId
  retrain: boolean
  run: PipelineRun
  pending: PipelineRun
  /** 결과를 반영한 다음 상태 (반영할 때의 상태 위에 다시 만든다) */
  apply: (s: ServerState) => ServerState
}

function planRun(s: ServerState, id: ScenarioId): RunPlan {
  const spec = SCENARIO_SPECS[id]
  const scenario = MOCK_LAB.scenarios.find((x) => x.id === id)!
  const cursor = s.lab.cursors[id] % spec.steps.length
  const step = spec.steps[cursor]
  const runNo = s.lab.runs.length + 1
  const t = s.clock.liveNow
  const rand = seededRandom(hashSeed(`${id}:${s.lab.runCounts[id]}:${runNo}`))

  // 1) 21쌍 주입
  const targetMae = round1(step.mae[0] + rand() * (step.mae[1] - step.mae[0]))
  const points = genWindow(rand, {
    targetMae,
    eventCount: step.eventCount,
    late: step.late,
    eventName: spec.eventName,
    end: t,
    lineId: 'T1-03',
  })
  const mae = windowMae(points)
  const eventPoints = points.filter((p) => p.eventTag).length
  const maeText = fmtDecimal(mae)
  const thText = fmtDecimal(THRESHOLD)

  // 2) 드리프트 판정
  const prod = s.models.production
  let consecutive = s.monitor.consecutive
  let verdict: VerdictKind
  let retrain = false
  if (mae <= THRESHOLD) {
    verdict = 'ok'
    consecutive = 0
  } else if (eventPoints > 0) {
    verdict = 'alert_only'
  } else {
    consecutive += 1
    retrain = consecutive >= CONSECUTIVE_LIMIT
    verdict = retrain ? 'retrain_promoted' : 'warn'
  }

  // 3) 재학습 → 게이트
  const checks = retrain ? gateChecks(spec.gate) : null
  const passed = checks ? checks.every((c) => c.passed) : false
  const newVersion = nextVersionId(s.models.versions)
  if (retrain && !passed) verdict = 'retrain_rejected'
  const deployed: ModelVersionId | null = retrain && passed ? newVersion : null
  const kept: ModelVersionId | null = retrain && !passed ? prod : null
  // 불합격이지만 지금 모델보다 나으면 사람 승인을 기다린다 (기획서 ③ 재학습 "불합격 시")
  const needsApproval = retrain && !passed && spec.gate.valMae < spec.gate.currentMae

  const batchNo = (s.monitor.batches[s.monitor.batches.length - 1]?.no ?? 0) + 1
  const batch: BatchRecord = {
    no: batchNo,
    at: t,
    windowSize: WINDOW_SIZE,
    windowCount: WINDOW_SIZE,
    windowMae: mae,
    threshold: THRESHOLD,
    consecutive,
    verdict,
    eventName: verdict === 'alert_only' ? spec.eventName : null,
    modelVersion: prod,
    deployedVersion: deployed,
    keptVersion: kept,
    needsApproval,
    points,
    scenarioId: id,
  }

  // 4) 로그 (aiops 태그 줄)
  const logs: LogLine[] = [log(t, 'CHECK', `scenario=${spec.serverId} file=${spec.dataFile} batch_size=${WINDOW_SIZE}`)]
  const judged = `batch=${batchNo} mae=${maeText} threshold=${thText}`
  if (verdict === 'ok') logs.push(log(t, 'OK', `${judged} status=ok consecutive=0/${CONSECUTIVE_LIMIT}`))
  if (verdict === 'alert_only') {
    logs.push(log(t, 'ALERT', `event window - ${eventPoints} flights tagged (${spec.serverId})`))
    logs.push(log(t, 'ALERT', `${judged} status=alert_only - event in window, no retrain`))
  }
  if (verdict === 'warn') logs.push(log(t, 'WARN', `drift suspected (${consecutive}/${CONSECUTIVE_LIMIT}) - ${judged}`))
  if (retrain && checks) {
    const g = spec.gate
    logs.push(log(t, 'WARN', `drift detected (${consecutive}/${CONSECUTIVE_LIMIT}) - ${judged} - triggering retrain`))
    logs.push(log(t, 'INFO', `retrain triggered - fine-tune from ${prod}, window=last_14_days, events excluded, epochs=10`, true))
    logs.push(log(t, 'INFO', `fine-tune done - val_mae=${fmtDecimal(g.valMae)}`, true))
    const pf = (ok: boolean) => (ok ? 'pass' : 'fail')
    logs.push(log(t, 'CHECK', `gate mae=${fmtDecimal(g.valMae)} limit=${fmtDecimal(GATE_MAE)} ${pf(checks[0].passed)}`))
    logs.push(log(t, 'CHECK', `gate baseline ${checks[1].value.replace(/ → /g, ' -> ').replace(/\((\d+)%\)/, '(improved $1%)')} ${pf(checks[1].passed)}`))
    logs.push(log(t, 'CHECK', `gate regression current=${prod} ${checks[2].value.replace(/ → /g, ' -> ')} ${pf(checks[2].passed)}`))
    if (passed) {
      logs.push(log(t, 'OK', `new_mae=${fmtDecimal(g.valMae)} - production promoted: BagTime_Predictor ${newVersion} (was ${prod})`, true))
      logs.push(log(t, 'INFO', 'monitor window and consecutive counter reset'))
    } else {
      const improve = checks[1].value.match(/\((\d+)%\)/)?.[1] ?? '0'
      logs.push(log(t, 'FAIL', `gate failed - val_mae=${fmtDecimal(g.valMae)} > ${fmtDecimal(GATE_MAE)}, improved ${improve}% - keep ${prod}`))
      logs.push(log(t, 'INFO', `production unchanged: ${prod}`))
    }
  }

  // 5) 파이프라인 단계
  const failedChecks = checks ? checks.filter((c) => !c.passed).length : 0
  const steps = buildSteps({
    drift: ['done', `MAE ${maeText} ${mae > THRESHOLD ? '>' : '≤'} ${thText}`],
    event: ['done', eventPoints > 0 ? `${spec.eventName ?? '이벤트'} ${eventPoints}편` : '이벤트 없음'],
    consecutive: verdict === 'alert_only' ? ['skipped', null] : ['done', `연속 ${consecutive}/${CONSECUTIVE_LIMIT}`],
    retrain: retrain ? ['done', `검증 MAE ${fmtDecimal(spec.gate.valMae)}`] : ['skipped', null],
    gate: retrain ? (passed ? ['done', `${checks!.length}/${checks!.length} 통과`] : ['failed', `${failedChecks}/${checks!.length} 불합격`]) : ['skipped', null],
    deploy: deployed ? ['done', deployed] : needsApproval ? ['waiting', '사람 승인 대기'] : ['skipped', null],
  })

  const outcome: VerdictInput = {
    kind: verdict,
    windowCount: WINDOW_SIZE,
    windowSize: WINDOW_SIZE,
    consecutive,
    consecutiveLimit: CONSECUTIVE_LIMIT,
    eventName: batch.eventName,
    deployedVersion: deployed,
    keptVersion: kept,
    needsApproval,
  }

  const run: PipelineRun = {
    id: `run-${runNo}`,
    scenarioId: id,
    scenarioName: scenario.name,
    at: t,
    steps,
    gate: checks,
    expected: step.expectText,
    outcome,
    matched: verdict === step.expectKind,
    logTail: logs,
  }

  const pending: PipelineRun = {
    ...run,
    steps: STEP_TEMPLATE.map((st, i) => ({ ...st, state: i === 0 ? 'running' : 'waiting', result: null })),
    gate: null,
    outcome: null,
    matched: null,
    logTail: logs.slice(0, 1),
  }

  const file = DATA_FILES[id]

  const apply = (cur: ServerState): ServerState => {
    let models = cur.models
    if (deployed) {
      const versions = models.versions.map((v) =>
        v.version === prod ? { ...v, status: 'retired' as const, retiredAt: t } : v,
      )
      versions.push({
        version: deployed,
        method: 'fine-tuning',
        base: prod,
        trainedAt: t,
        valMae: spec.gate.valMae,
        epochs: 10,
        trainData: `${prod}에서 이어서 · 최근 ${WINDOW_SIZE}편`,
        status: 'production',
        deployedAt: t,
        retiredAt: null,
      })
      models = { ...models, production: deployed, versions, history: [...models.history, { at: t, version: deployed }] }
    }
    if (checks) {
      const gate: GateRecord = {
        id: `gate-${t}-${runNo}`,
        at: t,
        trigger: `${scenario.name} · 연속 초과 ${consecutive}/${CONSECUTIVE_LIMIT}`,
        candidate: deployed ?? `${newVersion} 후보`,
        base: prod,
        checks,
        passed,
        decision: deployed ? `${deployed} 배포` : needsApproval ? '승인 대기' : `${prod} 유지`,
        runId: `gate-${t}-${runNo}`,
        needsApproval,
        approvedVersion: null,
      }
      // 새 게이트가 생기면 앞의 승인 대기는 지난 것이 된다
      const settled = models.gates.map((g) => (g.needsApproval ? { ...g, needsApproval: false, decision: `${g.base} 유지` } : g))
      models = { ...models, gates: [...settled, gate] }
    }

    return {
      ...cur,
      health: {
        ...cur.health,
        lastUpdatedAt: t,
        latency: { ...cur.health.latency, requests: cur.health.latency.requests + WINDOW_SIZE },
      },
      models,
      monitor: {
        ...cur.monitor,
        // 새 버전 배포면 창을 비운다 (다음 판정은 새 모델 예측으로). 재학습했으면 연속도 0
        window: deployed ? [] : points,
        judgedWindow: points,
        batches: [...cur.monitor.batches, batch],
        consecutive: retrain ? 0 : consecutive,
      },
      lab: {
        ...cur.lab,
        runCounts: { ...cur.lab.runCounts, [id]: cur.lab.runCounts[id] + 1 },
        cursors: { ...cur.lab.cursors, [id]: (cursor + 1) % spec.steps.length },
        runningId: null,
        pendingRun: null,
        runs: [...cur.lab.runs, run],
      },
      logs: pushLogs(cur.logs, logs),
      dataset: {
        ...cur.dataset,
        current: { ...file.summary, source: DATA_SOURCE_SIM, columns: csvColumns.length },
        preview: file.preview.map(toCsvRow),
      },
    }
  }

  return { id, retrain, run, pending, apply }
}

/**
 * 시나리오 실행 — 화면 id(conveyor_fault)와 서버 id(bhs_failure) 둘 다 받는다.
 * 지연: 보통 0.9초, 재학습이 있으면 2.5초. 그동안 useScenarios().runningId · currentRun(진행 중 모습)이 보인다.
 * 실패: 404 모르는 시나리오 · 409 다른 실행 중 / 실행 중 데모 초기화.
 */
export async function runScenario(key: ScenarioKey): Promise<PipelineRun> {
  const id = toScenarioId(key)
  if (!id) throw new ApiError(404, `알 수 없는 시나리오입니다: ${key}`)
  if (state.lab.runningId) throw new ApiError(409, '다른 시나리오가 실행 중입니다.')
  tick()
  const startedEpoch = epoch
  const plan = planRun(state, id)
  setState({ ...state, lab: { ...state.lab, runningId: id, pendingRun: plan.pending } })
  await delay(plan.retrain ? RUN_RETRAIN_MS : RUN_MS)
  if (startedEpoch !== epoch) throw new ApiError(409, '데모를 초기화해서 실행을 멈췄습니다.')
  setState(plan.apply(state))
  return plan.run
}

/** 데모 초기화 — 시계(10:30 실시간)까지 처음 상태로. 실행 중이던 시나리오 결과는 버린다 */
export async function resetDemo(): Promise<void> {
  await delay(ACTION_MS)
  epoch += 1
  liveOrigin = { realMs: Date.now(), demo: DEMO_BASE }
  setState(initialState())
}

/** 운영 버전 전환 (모델 버전 표 "운영으로 전환"). 404 없는 버전 · 409 이미 운영 버전 · 409 시나리오 실행 중 */
export async function promoteVersion(version: ModelVersionId): Promise<void> {
  await delay(ACTION_MS)
  const s = state
  if (s.lab.runningId) throw new ApiError(409, '시나리오 실행 중에는 운영 버전을 바꿀 수 없습니다.')
  if (!s.models.versions.some((v) => v.version === version)) throw new ApiError(404, `${version} 버전이 없습니다.`)
  if (s.models.production === version) throw new ApiError(409, `${version}은 이미 운영 버전입니다.`)
  const t = s.clock.liveNow
  const from = s.models.production
  const versions = s.models.versions.map((v): ModelVersion => {
    if (v.version === version) return { ...v, status: 'production', deployedAt: t, retiredAt: null }
    if (v.version === from) return { ...v, status: 'retired', retiredAt: t }
    return v
  })
  setState({
    ...s,
    models: { ...s.models, production: version, versions, history: [...s.models.history, { at: t, version }] },
    logs: pushLogs(s.logs, [log(t, 'INFO', `manual promote - production ${from} -> ${version}`, true)]),
  })
}

/**
 * 승인 대기 후보 적용 (게이트 불합격이지만 지금 모델보다 나은 새 모델) — 실서버 POST /models/approve 와 같은 결과.
 * 404 모르는 후보 · 409 승인 대기가 아님 / 시나리오 실행 중
 */
export async function approveCandidate(runId: string): Promise<{ version: ModelVersionId }> {
  await delay(ACTION_MS)
  const s = state
  if (s.lab.runningId) throw new ApiError(409, '시나리오 실행 중에는 승인할 수 없습니다.')
  const gate = s.models.gates.find((g) => g.runId === runId)
  if (!gate) throw new ApiError(404, '학습 기록을 찾을 수 없습니다.')
  if (!gate.needsApproval) throw new ApiError(409, '승인을 기다리는 후보가 아닙니다.')
  const t = s.clock.liveNow
  const from = s.models.production
  const version = nextVersionId(s.models.versions)
  const valMae = Number(gate.checks[0]?.value) || 0
  const versions: ModelVersion[] = [
    ...s.models.versions.map((v) => (v.version === from ? { ...v, status: 'retired' as const, retiredAt: t } : v)),
    {
      version,
      method: 'fine-tuning',
      base: gate.base,
      trainedAt: gate.at,
      valMae,
      epochs: 10,
      trainData: `${gate.base}에서 이어서 · 운영자 승인`,
      status: 'production',
      deployedAt: t,
      retiredAt: null,
    },
  ]
  const gates = s.models.gates.map((g) =>
    g.runId === runId ? { ...g, candidate: version, needsApproval: false, approvedVersion: version, decision: `${version} 승인 적용` } : g,
  )
  setState({
    ...s,
    models: { ...s.models, production: version, versions, gates, history: [...s.models.history, { at: t, version }] },
    monitor: { ...s.monitor, window: [], consecutive: 0 },
    logs: pushLogs(s.logs, [log(t, 'OK', `운영자 승인: 배포 기준 미달 후보를 Production ${version} 로 적용 (이전 ${from})`, true)]),
  })
  return { version }
}

/* ───────────────────────── 데이터 업로드 ───────────────────────── */

/**
 * CSV 업로드 — 브라우저에서 읽어 서버와 같은 검사를 한다 (api/csv.ts).
 * 400: 11컬럼(flightId … event_tag, 대소문자 무시)이 다 없으면 / 41행 미만이면. 성공이면 현재 데이터·미리보기를 바꾼다.
 */
export async function uploadCsv(file: File): Promise<UploadResponse> {
  setState({ ...state, dataset: { ...state.dataset, uploading: true } })
  const t = state.clock.liveNow
  try {
    await delay(UPLOAD_MS)
    let text: string
    try {
      text = await file.text()
    } catch {
      throw new ApiError(400, 'UTF-8로 인코딩된 CSV 파일만 업로드할 수 있습니다.')
    }
    const rows = parseDatasetCsv(text)
    const current: DatasetSummary = summarizeRows(rows, file.name, '업로드한 파일', t)
    setState({
      ...state,
      dataset: { current, preview: rows.slice(0, 10), uploading: false },
      logs: pushLogs(state.logs, [log(t, 'INFO', `data uploaded - ${file.name} rows=${rows.length}`)]),
    })
    return { filename: file.name, rows: rows.length }
  } catch (error) {
    const detail = error instanceof ApiError ? error.detail : '파일을 읽지 못했습니다.'
    setState({
      ...state,
      dataset: { ...state.dataset, uploading: false },
      logs: pushLogs(state.logs, [log(t, 'FAIL', `upload rejected (400) - ${file.name}: ${detail}`)]),
    })
    throw error instanceof ApiError ? error : new ApiError(400, detail)
  }
}

/* ───────────────────────── 화면 상태 (서버 호출 아님) ───────────────────────── */

/** 시각 지정 (null = 실시간). 화면을 옮겨도 유지된다 */
export function setAt(at: Ymdhm | null): void {
  if (at !== null && !/^\d{12}$/.test(at)) return
  if (at === state.clock.at) return
  setState({ ...state, clock: { ...state.clock, at } })
}

/** 데모용: 서버 연결 상태 바꾸기 (연결 끊김 모양 확인) */
export function setServerStatus(status: ServerStatus): void {
  if (status === state.health.status) return
  setState({
    ...state,
    health: { ...state.health, status, lastUpdatedAt: status !== 'disconnected' ? state.clock.liveNow : state.health.lastUpdatedAt },
  })
}
