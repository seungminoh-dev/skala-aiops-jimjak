/**
 * 서버 상태 → 화면이 쓰는 모양. 순수 함수라 실제 서버로 바꿔도 그대로 쓸 수 있다.
 */
import { MIN_UPLOAD_ROWS } from '@/api/csv'
import { flightsAt, nextPredictionAt } from '@/api/ops'
import { SCENARIO_SPECS } from '@/api/scenarioData'
import type {
  BatchRecord,
  DatasetView,
  FigureItem,
  HealthView,
  ModelsView,
  MonitoringView,
  ScenariosView,
  ServerState,
  VerdictBlockData,
  VerdictInput,
} from '@/api/types'
import { csvColumns, lab as MOCK_LAB } from '@/design/mock'
import { fmtDecimal } from '@/lib/format'

/** 배치 한 번 → verdictStatus 입력 (창이 덜 찼으면 판정 보류) */
export function batchVerdictInput(b: BatchRecord, consecutiveLimit: number): VerdictInput {
  return {
    kind: b.windowCount < b.windowSize ? 'pending' : b.verdict,
    windowCount: b.windowCount,
    windowSize: b.windowSize,
    consecutive: b.consecutive,
    consecutiveLimit,
    eventName: b.eventName,
    deployedVersion: b.deployedVersion,
    keptVersion: b.keptVersion,
    needsApproval: b.needsApproval,
    held: b.held,
  }
}

export function buildMonitoringView(
  monitor: ServerState['monitor'],
  production: ServerState['models']['production'],
  latency: ServerState['health']['latency'],
  liveNow: ServerState['clock']['liveNow'],
): MonitoringView {
  const { threshold, gateMae, consecutiveLimit, windowSize, batches, consecutive } = monitor
  const lastBatch = batches[batches.length - 1] ?? null

  const verdictBlock: VerdictBlockData = lastBatch
    ? {
        verdict: batchVerdictInput(lastBatch, consecutiveLimit),
        windowCount: lastBatch.windowCount,
        windowSize: lastBatch.windowSize,
        windowMae: lastBatch.windowMae,
        threshold,
        consecutive: lastBatch.consecutive,
        consecutiveLimit,
        asOf: lastBatch.at,
        meta: { version: production, p95Ms: latency.p95Ms, judgedAt: lastBatch.at },
      }
    : {
        verdict: { kind: 'pending', windowCount: monitor.window.length, windowSize },
        windowCount: monitor.window.length,
        windowSize,
        windowMae: 0,
        threshold,
        consecutive,
        consecutiveLimit,
        asOf: liveNow,
        meta: { version: production, p95Ms: latency.p95Ms, judgedAt: liveNow },
      }

  const figureRow: FigureItem[] = [
    { label: '운영 버전', value: production, mono: true },
    {
      label: '창 MAE / 임계값',
      value: `${fmtDecimal(lastBatch?.windowMae ?? 0)} / ${fmtDecimal(threshold)}`,
      unit: '분',
    },
    { label: '연속 초과', value: `${consecutive}/${consecutiveLimit}` },
    { label: '응답 시간 p95', value: String(latency.p95Ms), unit: 'ms' },
  ]

  return {
    threshold,
    gateMae,
    consecutiveLimit,
    windowSize,
    batches,
    window: monitor.window,
    judgedWindow: monitor.judgedWindow,
    consecutive,
    lastBatch,
    verdictBlock,
    latency,
    figureRow,
    modelVersion: production,
  }
}

/** 다음 예측은 실시간 데모 시각 기준 (시각 지정과 상관없이 — 전환은 지금 일어나므로) */
export function buildModelsView(
  models: ServerState['models'],
  gateMae: number,
  liveNow: ServerState['clock']['liveNow'],
): ModelsView {
  const next = nextPredictionAt(flightsAt(liveNow, models.history), liveNow)
  return {
    production: models.production,
    versions: models.versions,
    gates: models.gates,
    gateMae,
    nextPrediction: next ? { at: next.at, flightId: next.flightId } : null,
  }
}

export function buildScenariosView(
  lab: ServerState['lab'],
  batches: readonly BatchRecord[],
  files: ServerState['scenarioFiles'],
): ScenariosView {
  const scenarios = MOCK_LAB.scenarios.map((sc) => {
    const spec = SCENARIO_SPECS[sc.id]
    const cursor = lab.cursors[sc.id] % spec.steps.length
    return {
      ...sc,
      runs: lab.runCounts[sc.id],
      serverId: spec.serverId,
      data: files[spec.serverId] ?? null,
      dataFile: spec.dataFile,
      cursor,
      cycle: spec.steps.length,
      nextExpected: spec.steps[cursor].expectText,
    }
  })
  return {
    scenarios,
    runCounts: lab.runCounts,
    runningId: lab.runningId,
    currentRun: lab.pendingRun ?? lab.runs[lab.runs.length - 1] ?? null,
    runs: lab.runs,
    totalRuns: Object.values(lab.runCounts).reduce((sum, n) => sum + n, 0),
    verdictsFromRuns: batches.filter((b) => b.scenarioId !== null).length,
  }
}

export function buildDatasetView(dataset: ServerState['dataset']): DatasetView {
  return {
    current: dataset.current,
    columns: csvColumns,
    preview: dataset.preview,
    minRows: MIN_UPLOAD_ROWS,
    uploading: dataset.uploading,
  }
}

export function buildHealthView(
  health: ServerState['health'],
  production: ServerState['models']['production'],
): HealthView {
  return {
    status: health.status,
    modelVersion: production,
    lastUpdatedAt: health.lastUpdatedAt,
    refreshSec: health.refreshSec,
    latency: health.latency,
  }
}
