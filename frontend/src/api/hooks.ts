/**
 * 화면용 훅 — useSyncExternalStore 로 서버 상태를 읽는다. 서버는 api/server.ts 가 고른다:
 * 짐작 FastAPI 가 답하면 실서버 어댑터(liveServer), 아니면 목업(mockServer). 화면은 이 훅과 actions 만 쓴다.
 *
 * 읽기는 동기(첫 로딩 없음). 쓰기(actions)는 Promise — 실패하면 ApiError(status, detail)로 거부한다.
 */
import { useMemo, useSyncExternalStore } from 'react'

import * as server from '@/api/server'
import { buildLineDetail, computeOps } from '@/api/ops'
import type {
  DatasetView,
  DemoClock,
  HealthView,
  LineDetailView,
  LineId,
  LogLine,
  ModelsView,
  MonitoringView,
  OpsView,
  ProductionChange,
  ScenariosView,
  ServerState,
  Ymdhm,
} from '@/api/types'
import {
  buildDatasetView,
  buildHealthView,
  buildModelsView,
  buildMonitoringView,
  buildScenariosView,
} from '@/api/views'

/** 상태의 한 조각을 읽는다. selector 는 상태 안의 객체를 그대로 돌려줘야 한다(새 객체를 만들면 매번 다시 그린다) */
function useServer<T>(selector: (s: ServerState) => T): T {
  return useSyncExternalStore(server.subscribe, () => selector(server.getState()))
}

/* ───────────────────────── 시계 · 서버 ───────────────────────── */

/** 데모 시계: now(화면 기준) · liveNow(상단 바 시계) · at(시각 지정) */
export function useDemoClock(): DemoClock {
  const clock = useServer((s) => s.clock)
  return useMemo(
    () => ({ now: clock.at ?? clock.liveNow, liveNow: clock.liveNow, at: clock.at, pinned: clock.at !== null }),
    [clock],
  )
}

/** 서버 상태 · 운영 버전 · 마지막 갱신 · 응답 시간 (상단 바) */
export function useHealth(): HealthView {
  const health = useServer((s) => s.health)
  const production = useServer((s) => s.models.production)
  return useMemo(() => buildHealthView(health, production), [health, production])
}

/* ───────────────────────── 운영 현황 ───────────────────────── */

/** 같은 시각·같은 버전 기록이면 화면 여러 곳이 같은 계산 결과를 나눠 쓴다 */
let opsCache: { now: Ymdhm; pinned: boolean; history: readonly ProductionChange[]; view: OpsView } | null = null

function opsFor(now: Ymdhm, pinned: boolean, history: readonly ProductionChange[]): OpsView {
  if (opsCache && opsCache.now === now && opsCache.pinned === pinned && opsCache.history === history) return opsCache.view
  const view = computeOps(now, pinned, history)
  opsCache = { now, pinned, history, view }
  return view
}

/** 운영 현황 전부 — 지금(시각 지정이면 그 시각) 기준으로 다시 계산한 도착편·라인·조치 필요·숫자 줄 */
export function useOps(): OpsView {
  const clock = useServer((s) => s.clock)
  const history = useServer((s) => s.models.history)
  return opsFor(clock.at ?? clock.liveNow, clock.at !== null, history)
}

/** 라인 상세 서랍 내용. lineId 가 null 이면 null. flightId 를 주면 그 편(아직 처리 전이면)을 판단 대상으로 */
export function useLine(lineId: LineId | null, flightId?: string | null): LineDetailView | null {
  const ops = useOps()
  return useMemo(() => (lineId ? buildLineDetail(ops, lineId, flightId) : null), [ops, lineId, flightId])
}

/* ───────────────────────── 모델 모니터링 ───────────────────────── */

/** 판정 블록 · 배치별 MAE · 감시 창 · 판정 기록 */
export function useMonitoring(): MonitoringView {
  const monitor = useServer((s) => s.monitor)
  const production = useServer((s) => s.models.production)
  const latency = useServer((s) => s.health.latency)
  const liveNow = useServer((s) => s.clock.liveNow)
  return useMemo(
    () => buildMonitoringView(monitor, production, latency, liveNow),
    [monitor, production, latency, liveNow],
  )
}

/** 모델 버전 · 게이트 이력 · 운영 버전 */
export function useModels(): ModelsView {
  const models = useServer((s) => s.models)
  const gateMae = useServer((s) => s.monitor.gateMae)
  const liveNow = useServer((s) => s.clock.liveNow)
  return useMemo(() => buildModelsView(models, gateMae, liveNow), [models, gateMae, liveNow])
}

/** 로그 (오래된 것 → 최신, 최신이 아래) */
export function useLogs(): LogLine[] {
  return useServer((s) => s.logs)
}

/* ───────────────────────── 시나리오 랩 ───────────────────────── */

/** 시나리오 표 · 실행 중 · 실행 결과 */
export function useScenarios(): ScenariosView {
  const lab = useServer((s) => s.lab)
  const batches = useServer((s) => s.monitor.batches)
  return useMemo(() => buildScenariosView(lab, batches), [lab, batches])
}

/** 현재 데이터 · 미리보기 · 업로드 중 */
export function useDataset(): DatasetView {
  const dataset = useServer((s) => s.dataset)
  return useMemo(() => buildDatasetView(dataset), [dataset])
}

/* ───────────────────────── 동작 ───────────────────────── */

/**
 * 동작 — 고른 서버(실서버 또는 목업)로 간다.
 * - runScenario(id): Promise<PipelineRun>. id 는 화면 id(conveyor_fault) · 서버 id(bhs_failure) 둘 다
 * - resetDemo(): Promise<void>. 시계까지 처음(10:30 실시간 · v1)으로
 * - promoteVersion(v): Promise<void>. 운영 버전 전환 (실서버: 보관 버전 되돌림 /models/rollback)
 * - approveCandidate(runId): Promise<{ version }>. 승인 대기 후보 적용 (게이트 불합격이지만 지금 모델보다 나은 새 모델)
 * - uploadCsv(file): Promise<{ filename, rows }>. 실패 ApiError(400, detail)
 * - setAt(at | null): 시각 지정 / 실시간 (동기)
 * - setServerStatus(status): 데모용 연결 끊김 흉내 (동기)
 */
export const actions = {
  runScenario: server.runScenario,
  resetDemo: server.resetDemo,
  promoteVersion: server.promoteVersion,
  approveCandidate: server.approveCandidate,
  uploadCsv: server.uploadCsv,
  setAt: server.setAt,
  setServerStatus: server.setServerStatus,
} as const
