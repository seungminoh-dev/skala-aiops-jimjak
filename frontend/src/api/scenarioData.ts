/**
 * 시나리오 정의 — 기획서의 기대 결과와 저장소 data/*.csv 요약(파일에서 직접 센 값)과 앞 10행.
 *
 * 화면 id(ScenarioId, design/mock) ↔ 서버 id(data 파일 이름):
 *   normal ↔ normal · conveyor_fault ↔ bhs_failure · staff_shortage ↔ staff_shortage
 *   expansion ↔ expansion · opening_chaos ↔ terminal_open · process_change ↔ process_change
 *
 * steps: 실행할 때마다 다음 단계의 데이터를 만든다(커서). 마지막 단계까지 가면 처음으로.
 * 판정 자체는 mockServer 의 드리프트 규칙(창 MAE > 임계값 → 이벤트 있으면 알림만, 없으면 연속 +1, 2회면 재학습)이 내린다 —
 * 그래서 다른 시나리오를 섞어 실행하면 기대와 결과가 다를 수 있다("결과 다름").
 */
import type { CsvColumn, CsvRow, ScenarioId, ServerScenarioId, VerdictKind, Ymdhm } from '@/api/types'
import { csvColumns } from '@/design/mock'

export interface StepSpec {
  /** 이번 21편 창 MAE 범위 (분) */
  mae: [number, number]
  /** 이벤트 표시 편 수 (0 = 없음) */
  eventCount: number
  /** 오차가 + (실제가 예측보다 늦음) 일 확률 */
  late: number
  /** 이 단계의 기대 판정 (결과 일치 비교) */
  expectKind: VerdictKind
  /** 실행 결과 맨 아래 "기대 …" 글자 */
  expectText: string
  /**
   * 실서버: 이 단계에서 보낼 배치 번호 (0부터. 배치 k = 데이터 파일의 k*21번째 편부터 41편). 없으면 단계 순번.
   * 기대 판정이 나오는 구간을 고른다 — 예: 컨베이어 고장은 사건 4편이 든 두 번째 배치.
   */
  batch?: number
}

export interface GateSpec {
  /** 재학습 후 검증 MAE */
  valMae: number
  /** 단순 방법(직전 처리 시간 평균) MAE */
  baselineMae: number
  /** 현재 운영 모델의 같은 검증 MAE */
  currentMae: number
}

export interface ScenarioSpec {
  id: ScenarioId
  serverId: ServerScenarioId
  dataFile: string
  /** 이벤트 이름 (알림만 · 컨베이어 고장) */
  eventName: string | null
  steps: StepSpec[]
  gate: GateSpec
}

export interface DataFileSpec {
  summary: {
    fileName: string
    rows: number
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
  preview: string[][]
}

/** 재학습 통과 (기획서: 검증 MAE 4.3 · 단순 6.4 · 현재 모델 8.7) */
export const GATE_PASS: GateSpec = { valMae: 4.3, baselineMae: 6.4, currentMae: 8.7 }
/** 재학습 불합격 (처리 방식 변경: 검증 MAE 5.6 > 5) */
export const GATE_FAIL: GateSpec = { valMae: 5.6, baselineMae: 5.9, currentMae: 6.1 }

const ok: StepSpec = { mae: [3.5, 4.5], eventCount: 0, late: 0.5, expectKind: 'ok', expectText: '정상' }
const warn = (mae: [number, number], late: number): StepSpec => ({ mae, eventCount: 0, late, expectKind: 'warn', expectText: '주의 1/2' })
const retrain = (mae: [number, number], late: number): StepSpec => ({
  mae,
  eventCount: 0,
  late,
  expectKind: 'retrain_promoted',
  expectText: '주의 → 재학습',
})
const alertOnly = (mae: [number, number], eventCount: number): StepSpec => ({
  mae,
  eventCount,
  late: 0.6,
  expectKind: 'alert_only',
  expectText: '알림만',
})
/** 재학습했지만 게이트 불합격 (기획서: 처리 방식 변경은 불합격 가능) */
const retrainRejected = (mae: [number, number], late: number): StepSpec => ({
  mae,
  eventCount: 0,
  late,
  expectKind: 'retrain_rejected',
  expectText: '주의 → 재학습 → 게이트 불합격',
})
/** 같은 단계를 실서버에서는 다른 배치로 보낸다 */
const at = (step: StepSpec, batch: number): StepSpec => ({ ...step, batch })

export const SCENARIO_SPECS: Record<ScenarioId, ScenarioSpec> = {
  normal: { id: 'normal', serverId: 'normal', dataFile: 'normal_2w.csv', eventName: null, steps: [ok], gate: GATE_PASS },
  conveyor_fault: {
    id: 'conveyor_fault',
    serverId: 'bhs_failure',
    dataFile: 'bhs_failure_2w.csv',
    eventName: '컨베이어 고장',
    // 실서버: 사건 4편은 두 번째 배치(편 21~61)에 들어 있다
    steps: [at(alertOnly([9, 12], 4), 1)],
    gate: GATE_PASS,
  },
  staff_shortage: {
    id: 'staff_shortage',
    serverId: 'staff_shortage',
    dataFile: 'staff_shortage_2w.csv',
    eventName: null,
    steps: [warn([8, 9], 0.9), retrain([8, 9], 0.9)],
    gate: GATE_PASS,
  },
  expansion: {
    id: 'expansion',
    serverId: 'expansion',
    dataFile: 'expansion_2w.csv',
    eventName: null,
    // 증설로 빨라졌다 → 실제가 예측보다 이르다(오차 −)
    steps: [warn([7, 8], 0.15), retrain([7, 8], 0.15)],
    gate: GATE_PASS,
  },
  opening_chaos: {
    id: 'opening_chaos',
    serverId: 'terminal_open',
    dataFile: 'terminal_open_4w.csv',
    eventName: '터미널 개장',
    // 개장 2주는 이벤트 표시(알림만) → 표시가 끝난 뒤에도 느리면 주의 → 재학습
    // 실서버: 개장 2주(배치 0~9)는 사건 표시, 표시가 끝난 배치 11부터 새 수준
    steps: [at(alertOnly([9, 11], 8), 0), at(alertOnly([9, 11], 8), 5), at(warn([7, 8], 0.85), 11), at(retrain([7, 8], 0.85), 12)],
    gate: GATE_PASS,
  },
  process_change: {
    id: 'process_change',
    serverId: 'process_change',
    dataFile: 'process_change_2w.csv',
    eventName: null,
    // 변동폭이 커졌다 → 오차 부호가 섞인다
    steps: [warn([7.5, 8.5], 0.55), retrainRejected([7.5, 8.5], 0.55)],
    gate: GATE_FAIL,
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

// prettier-ignore
export const DATA_FILES: Record<ScenarioId, DataFileSpec> = {
  normal: {
    summary: { fileName: 'normal_2w.csv', rows: 220, lines: 1, t1Rows: 220, t2Rows: 0, landingFrom: '202610010043', landingTo: '202610111857', waitMeanMin: 35.2, waitMedianMin: 35, waitMinMin: 22, waitMaxMin: 53, over50Rows: 1, eventRows: 0 },
    preview: [
      ['LJ690', 'P01', '3', 'T1-03', '738', '189', '202610010050', '202610010043', '202610010117', '34', ''],
      ['DL872', 'P01', '3', 'T1-03', '32Q', '200', '202610010148', '202610010139', '202610010206', '27', ''],
      ['DL487', 'P01', '3', 'T1-03', '359', '310', '202610010256', '202610010309', '202610010346', '37', ''],
      ['DL258', 'P01', '3', 'T1-03', '7M8', '189', '202610010413', '202610010413', '202610010443', '30', ''],
      ['LJ998', 'P01', '3', 'T1-03', '789', '280', '202610010528', '202610010520', '202610010552', '32', ''],
      ['LJ665', 'P01', '3', 'T1-03', '32Q', '200', '202610010625', '202610010622', '202610010652', '30', ''],
      ['KE783', 'P01', '3', 'T1-03', '738', '189', '202610010740', '202610010747', '202610010820', '33', ''],
      ['OZ895', 'P01', '3', 'T1-03', '32Q', '200', '202610010902', '202610010905', '202610010935', '30', ''],
      ['ZE176', 'P01', '3', 'T1-03', '333', '280', '202610011006', '202610011001', '202610011035', '34', ''],
      ['OZ794', 'P01', '3', 'T1-03', '748', '370', '202610011058', '202610011103', '202610011144', '41', ''],
    ],
  },
  conveyor_fault: {
    summary: { fileName: 'bhs_failure_2w.csv', rows: 220, lines: 1, t1Rows: 220, t2Rows: 0, landingFrom: '202610010105', landingTo: '202610120352', waitMeanMin: 36.0, waitMedianMin: 35, waitMinMin: 26, waitMaxMin: 74, over50Rows: 4, eventRows: 4 },
    preview: [
      ['LJ447', 'P01', '3', 'T1-03', '32N', '180', '202610010057', '202610010105', '202610010139', '34', ''],
      ['DL624', 'P01', '3', 'T1-03', '359', '310', '202610010230', '202610010228', '202610010311', '43', ''],
      ['UA625', 'P01', '3', 'T1-03', '32Q', '200', '202610010346', '202610010358', '202610010429', '31', ''],
      ['KE709', 'P01', '3', 'T1-03', '321', '200', '202610010513', '202610010508', '202610010543', '35', ''],
      ['LJ652', 'P01', '3', 'T1-03', '321', '200', '202610010608', '202610010604', '202610010640', '36', ''],
      ['DL812', 'P01', '3', 'T1-03', '32N', '180', '202610010715', '202610010715', '202610010748', '33', ''],
      ['OZ828', 'P01', '3', 'T1-03', '773', '340', '202610010826', '202610010816', '202610010855', '39', ''],
      ['ZE217', 'P01', '3', 'T1-03', '333', '280', '202610010952', '202610010951', '202610011029', '38', ''],
      ['UA773', 'P01', '3', 'T1-03', '332', '250', '202610011056', '202610011052', '202610011135', '43', ''],
      ['7C468', 'P01', '3', 'T1-03', '738', '189', '202610011230', '202610011232', '202610011311', '39', ''],
    ],
  },
  staff_shortage: {
    summary: { fileName: 'staff_shortage_2w.csv', rows: 220, lines: 1, t1Rows: 220, t2Rows: 0, landingFrom: '202610010044', landingTo: '202610111958', waitMeanMin: 46.7, waitMedianMin: 45, waitMinMin: 33, waitMaxMin: 75, over50Rows: 60, eventRows: 0 },
    preview: [
      ['OZ829', 'P01', '3', 'T1-03', '789', '280', '202610010055', '202610010044', '202610010124', '40', ''],
      ['DL637', 'P01', '3', 'T1-03', '388', '490', '202610010220', '202610010208', '202610010303', '55', ''],
      ['CX498', 'P01', '3', 'T1-03', '739', '190', '202610010310', '202610010310', '202610010353', '43', ''],
      ['7C730', 'P01', '3', 'T1-03', '32N', '180', '202610010437', '202610010423', '202610010512', '49', ''],
      ['LJ931', 'P01', '3', 'T1-03', '320', '180', '202610010533', '202610010530', '202610010609', '39', ''],
      ['7C176', 'P01', '3', 'T1-03', '32N', '180', '202610010635', '202610010636', '202610010720', '44', ''],
      ['CX832', 'P01', '3', 'T1-03', '738', '189', '202610010803', '202610010749', '202610010838', '49', ''],
      ['ZE225', 'P01', '3', 'T1-03', '788', '240', '202610010910', '202610010910', '202610010959', '49', ''],
      ['TW645', 'P01', '3', 'T1-03', '32Q', '200', '202610011037', '202610011026', '202610011107', '41', ''],
      ['OZ285', 'P01', '3', 'T1-03', '320', '180', '202610011131', '202610011122', '202610011201', '39', ''],
    ],
  },
  expansion: {
    summary: { fileName: 'expansion_2w.csv', rows: 220, lines: 1, t1Rows: 220, t2Rows: 0, landingFrom: '202610010039', landingTo: '202610120211', waitMeanMin: 28.2, waitMedianMin: 28, waitMinMin: 21, waitMaxMin: 42, over50Rows: 0, eventRows: 0 },
    preview: [
      ['ZE890', 'P01', '3', 'T1-03', '339', '300', '202610010050', '202610010039', '202610010112', '33', ''],
      ['UA403', 'P01', '3', 'T1-03', 'E95', '120', '202610010141', '202610010141', '202610010206', '25', ''],
      ['LJ128', 'P01', '3', 'T1-03', '223', '140', '202610010301', '202610010311', '202610010339', '28', ''],
      ['7C930', 'P01', '3', 'T1-03', '788', '240', '202610010411', '202610010416', '202610010445', '29', ''],
      ['OZ880', 'P01', '3', 'T1-03', '32N', '180', '202610010518', '202610010525', '202610010553', '28', ''],
      ['7C441', 'P01', '3', 'T1-03', '32Q', '200', '202610010617', '202610010602', '202610010628', '26', ''],
      ['UA992', 'P01', '3', 'T1-03', '7M8', '189', '202610010725', '202610010735', '202610010805', '30', ''],
      ['OZ920', 'P01', '3', 'T1-03', '73H', '189', '202610010834', '202610010843', '202610010911', '28', ''],
      ['KE678', 'P01', '3', 'T1-03', '332', '250', '202610010941', '202610010942', '202610011011', '29', ''],
      ['7C242', 'P01', '3', 'T1-03', '738', '189', '202610011109', '202610011112', '202610011141', '29', ''],
    ],
  },
  opening_chaos: {
    summary: { fileName: 'terminal_open_4w.csv', rows: 450, lines: 1, t1Rows: 450, t2Rows: 0, landingFrom: '202610010103', landingTo: '202610230856', waitMeanMin: 46.1, waitMedianMin: 41, waitMinMin: 21, waitMaxMin: 87, over50Rows: 202, eventRows: 220 },
    preview: [
      ['DL547', 'P01', '3', 'T1-03', '738', '189', '202610010116', '202610010103', '202610010207', '64', 'terminal_open'],
      ['KE784', 'P01', '3', 'T1-03', '32N', '180', '202610010227', '202610010217', '202610010310', '53', 'terminal_open'],
      ['TW875', 'P01', '3', 'T1-03', '359', '310', '202610010323', '202610010310', '202610010419', '69', 'terminal_open'],
      ['ZE728', 'P01', '3', 'T1-03', '7M8', '189', '202610010431', '202610010432', '202610010525', '53', 'terminal_open'],
      ['KE929', 'P01', '3', 'T1-03', '789', '280', '202610010529', '202610010523', '202610010625', '62', 'terminal_open'],
      ['OZ575', 'P01', '3', 'T1-03', '32N', '180', '202610010640', '202610010642', '202610010738', '56', 'terminal_open'],
      ['OZ318', 'P01', '3', 'T1-03', '320', '180', '202610010743', '202610010736', '202610010834', '58', 'terminal_open'],
      ['7C386', 'P01', '3', 'T1-03', '32Q', '200', '202610010847', '202610010837', '202610010940', '63', 'terminal_open'],
      ['KE246', 'P01', '3', 'T1-03', '773', '340', '202610010949', '202610010941', '202610011048', '67', 'terminal_open'],
      ['TW518', 'P01', '3', 'T1-03', '223', '140', '202610011048', '202610011057', '202610011151', '54', 'terminal_open'],
    ],
  },
  process_change: {
    summary: { fileName: 'process_change_2w.csv', rows: 220, lines: 1, t1Rows: 220, t2Rows: 0, landingFrom: '202610010116', landingTo: '202610112131', waitMeanMin: 41.1, waitMedianMin: 41, waitMinMin: 20, waitMaxMin: 65, over50Rows: 26, eventRows: 0 },
    preview: [
      ['UA754', 'P01', '3', 'T1-03', '320', '180', '202610010115', '202610010116', '202610010158', '42', ''],
      ['7C249', 'P01', '3', 'T1-03', '32Q', '200', '202610010223', '202610010216', '202610010308', '52', ''],
      ['LJ780', 'P01', '3', 'T1-03', '763', '250', '202610010317', '202610010324', '202610010402', '38', ''],
      ['DL106', 'P01', '3', 'T1-03', '763', '250', '202610010416', '202610010418', '202610010457', '39', ''],
      ['TW959', 'P01', '3', 'T1-03', '32Q', '200', '202610010534', '202610010521', '202610010548', '27', ''],
      ['CX970', 'P01', '3', 'T1-03', '351', '350', '202610010637', '202610010623', '202610010714', '51', ''],
      ['OZ875', 'P01', '3', 'T1-03', '388', '490', '202610010810', '202610010803', '202610010855', '52', ''],
      ['TW175', 'P01', '3', 'T1-03', '223', '140', '202610010900', '202610010909', '202610010949', '40', ''],
      ['DL824', 'P01', '3', 'T1-03', '320', '180', '202610010956', '202610011005', '202610011041', '36', ''],
      ['7C107', 'P01', '3', 'T1-03', 'E95', '120', '202610011048', '202610011055', '202610011128', '33', ''],
    ],
  },
}
