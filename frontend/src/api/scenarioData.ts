/**
 * 시나리오 정의 — 기획서의 기대 결과와 단계마다 서버에 보낼 배치. 데이터 파일 자체와 그 요약은 서버에서 읽는다
 * (GET /scenarios · /scenarios/{id}/file).
 *
 * 화면 id(ScenarioId, design/mock) ↔ 서버 id(data 파일 이름):
 *   normal ↔ normal · conveyor_fault ↔ bhs_failure · staff_shortage ↔ staff_shortage
 *   expansion ↔ expansion · opening_chaos ↔ terminal_open · process_change ↔ process_change
 *
 * steps: 실행할 때마다 다음 단계로 간다(커서). 마지막 단계까지 가면 처음으로.
 * 판정은 서버가 내리므로(운영 모델·임계값·연속 횟수에 따라) 다른 시나리오를 섞어 실행하면
 * 기대와 결과가 다를 수 있다("예상과 달라요").
 */
import type { CsvColumn, CsvRow, ScenarioId, ServerScenarioId, VerdictKind } from '@/api/types'
import { csvColumns } from '@/design/mock'

export interface StepSpec {
  /** 이 단계의 기대 판정 (결과 일치 비교) */
  expectKind: VerdictKind
  /** 실행 결과 맨 아래 "기대 …" 글자 */
  expectText: string
  /**
   * 이 단계에서 보낼 배치 번호 (0부터. 배치 k = 데이터 파일의 k*21번째 편부터 41편). 없으면 단계 순번.
   * 기대 판정이 나오는 구간을 고른다 — 예: 컨베이어 고장은 사건 4편이 든 두 번째 배치.
   */
  batch?: number
}

export interface ScenarioSpec {
  id: ScenarioId
  serverId: ServerScenarioId
  dataFile: string
  /** 이벤트 이름 (알림만 · 컨베이어 고장) */
  eventName: string | null
  steps: StepSpec[]
}

const ok: StepSpec = { expectKind: 'ok', expectText: '정상' }
const warn: StepSpec = { expectKind: 'warn', expectText: '주의 1/2' }
const retrain: StepSpec = { expectKind: 'retrain_promoted', expectText: '주의 → 재학습' }
const alertOnly: StepSpec = { expectKind: 'alert_only', expectText: '알림만' }
/** 재학습했지만 게이트 불합격 (기획서: 처리 방식 변경은 불합격 가능) */
const retrainRejected: StepSpec = { expectKind: 'retrain_rejected', expectText: '주의 → 재학습 → 게이트 불합격' }
/** 같은 단계를 다른 배치로 보낸다 */
const at = (step: StepSpec, batch: number): StepSpec => ({ ...step, batch })

export const SCENARIO_SPECS: Record<ScenarioId, ScenarioSpec> = {
  normal: { id: 'normal', serverId: 'normal', dataFile: 'normal_2w.csv', eventName: null, steps: [ok] },
  conveyor_fault: {
    id: 'conveyor_fault',
    serverId: 'bhs_failure',
    dataFile: 'bhs_failure_2w.csv',
    eventName: '컨베이어 고장',
    // 사건 4편은 두 번째 배치(편 21~61)에 들어 있다
    steps: [at(alertOnly, 1)],
  },
  staff_shortage: {
    id: 'staff_shortage',
    serverId: 'staff_shortage',
    dataFile: 'staff_shortage_2w.csv',
    eventName: null,
    steps: [warn, retrain],
  },
  expansion: {
    id: 'expansion',
    serverId: 'expansion',
    dataFile: 'expansion_2w.csv',
    eventName: null,
    steps: [warn, retrain],
  },
  opening_chaos: {
    id: 'opening_chaos',
    serverId: 'terminal_open',
    dataFile: 'terminal_open_4w.csv',
    eventName: '터미널 개장',
    // 개장 2주(배치 0~9)는 사건 표시 → 알림만, 표시가 끝난 배치 11부터 새 수준 → 주의 → 재학습
    steps: [at(alertOnly, 0), at(alertOnly, 5), at(warn, 11), at(retrain, 12)],
  },
  process_change: {
    id: 'process_change',
    serverId: 'process_change',
    dataFile: 'process_change_2w.csv',
    eventName: null,
    steps: [warn, retrainRejected],
  },
}

const SERVER_TO_UI: Record<ServerScenarioId, ScenarioId> = {
  normal: 'normal',
  bhs_failure: 'conveyor_fault',
  staff_shortage: 'staff_shortage',
  expansion: 'expansion',
  terminal_open: 'opening_chaos',
  process_change: 'process_change',
}

/** 서버 id·화면 id 어느 쪽이든 화면 id 로 (모르는 id 면 null) */
export function toScenarioId(key: string): ScenarioId | null {
  if (key in SCENARIO_SPECS) return key as ScenarioId
  if (key in SERVER_TO_UI) return SERVER_TO_UI[key as ServerScenarioId]
  return null
}

/** 파일 행(11칸) → CsvRow */
export function toCsvRow(cells: readonly string[]): CsvRow {
  return Object.fromEntries(csvColumns.map((c: CsvColumn, i) => [c, cells[i] ?? ''])) as CsvRow
}

export const DATA_SOURCE_SIM = '시뮬레이션 데이터 (scripts/generate_data.py)'
