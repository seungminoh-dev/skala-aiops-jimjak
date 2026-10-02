/**
 * 서버 고르기 — 화면을 그리기 전에 한 번 (main.tsx). hooks.ts 는 이 파일만 본다.
 *
 * - 짐작 FastAPI 가 /health 로 답하면 실서버(liveServer) — FastAPI 가 serving_app/static 으로 화면을 내줄 때, 개발 서버 proxy
 * - 답이 없으면 목업(mockServer) — 백엔드 없이 화면만 열 때. 상단 바에 "목업 데이터"로 보인다
 * - 고정: 주소에 ?mock 또는 ?live, 또는 빌드 환경변수 VITE_API_MODE=mock|live
 */
import { probeServer } from '@/api/http'
import * as live from '@/api/liveServer'
import * as mock from '@/api/mockServer'

export type ApiMode = 'live' | 'mock'

let impl: typeof mock | typeof live = mock
let mode: ApiMode = 'mock'

function forcedMode(): ApiMode | null {
  const query = new URLSearchParams(window.location.search)
  if (query.has('mock')) return 'mock'
  if (query.has('live')) return 'live'
  const env = import.meta.env.VITE_API_MODE as string | undefined
  return env === 'mock' || env === 'live' ? env : null
}

/** 실서버를 쓸 수 있으면 붙이고 첫 데이터를 읽는다. 실패하면 목업 그대로 */
export async function connect(): Promise<ApiMode> {
  const forced = forcedMode()
  const wantLive = forced === 'live' || (forced === null && (await probeServer()))
  if (!wantLive) return mode
  impl = live
  mode = 'live'
  await live.start()
  return mode
}

export const apiMode = (): ApiMode => mode

export const subscribe: typeof mock.subscribe = (listener) => impl.subscribe(listener)
export const getState: typeof mock.getState = () => impl.getState()
export const runScenario: typeof mock.runScenario = (key) => impl.runScenario(key)
export const resetDemo: typeof mock.resetDemo = () => impl.resetDemo()
export const promoteVersion: typeof mock.promoteVersion = (version) => impl.promoteVersion(version)
export const approveCandidate: typeof mock.approveCandidate = (runId) => impl.approveCandidate(runId)
export const uploadCsv: typeof mock.uploadCsv = (file) => impl.uploadCsv(file)
export const setAt: typeof mock.setAt = (at) => impl.setAt(at)
export const setServerStatus: typeof mock.setServerStatus = (status) => impl.setServerStatus(status)
