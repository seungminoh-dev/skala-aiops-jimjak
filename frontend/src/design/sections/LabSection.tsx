import { useState } from 'react'

import { notify, notifyDeploy } from '@/components/app/notify'
import { DataPanel } from '@/components/lab/DataPanel'
import { DEMO_RESET_DONE, DemoResetFacts } from '@/components/lab/DemoResetFacts'
import { RunResult, RunResultEmpty } from '@/components/lab/RunResult'
import { ScenarioTable } from '@/components/lab/ScenarioTable'
import { UploadRow } from '@/components/lab/UploadRow'
import { useCsvUpload, type UploadResult } from '@/components/lab/useUpload'
import { useMockRun } from '@/components/lab/useMockRun'
import { LogView } from '@/components/monitoring/LogView'
import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import {
  demo,
  lab,
  monitoring,
  server,
  type LogLine,
  type PipelineRun,
  type PipelineStep,
  type PipelineStepKey,
  type ScenarioId,
  type StepState,
} from '@/design/mock'
import { Specimen } from '@/design/SheetSection'

/**
 * 시나리오 랩, 실제 화면 순서대로:
 * 제목 줄 → 시나리오 표 → 실행 결과(파이프라인 단계 · 게이트 검사 · 로그 꼬리) → 데이터(업로드 · 현재 데이터 · 미리보기, 접기).
 * 시나리오 표의 [실행]을 누르면 "실행 결과 · 진행 중" 견본에서 단계가 차례로 진행되고, 그동안 단계 줄 오른쪽에서
 * 마스코트가 짐을 나른다(응답이 오면 사라진다). 목업, 백엔드 없음.
 * 이 파일은 구역 안쪽만 돌려준다. 바깥 틀(제목·구분선)은 DesignPage 의 SheetSection 이 그린다.
 */

const TODAY = demo.now
const [RUN_NORMAL, RUN_CONVEYOR, RUN_RETRAIN] = lab.runs
const { running: RUN_RUNNING, gateFailed: RUN_GATE_FAILED } = lab.runStates

/* ───────────── 목업 보충: 시나리오마다 [실행]의 최종 결과 ───────────── */

const atDemo = (hhmm: string) => `${TODAY.slice(0, 8)}${hhmm}`
const log = (hhmm: string, tag: LogLine['tag'], message: string, highlight = false): LogLine => ({
  at: atDemo(hhmm),
  tag,
  message,
  highlight,
})

/** 단계 6개 중 일부만 바꾼다 */
function withSteps(base: readonly PipelineStep[], spec: Partial<Record<PipelineStepKey, [StepState, string | null]>>) {
  return base.map((step): PipelineStep => {
    const next = spec[step.key]
    return next ? { ...step, state: next[0], result: next[1] } : step
  })
}

/** 수취대·터미널 증설, 진행 중 견본의 끝: 재학습 → 게이트 3/3 → v2 배포 */
const RUN_EXPANSION: PipelineRun = {
  ...RUN_RUNNING,
  id: 'run-expansion',
  steps: withSteps(RUN_RUNNING.steps, {
    retrain: ['done', '검증 MAE 4.3'],
    gate: ['done', '3/3 통과'],
    deploy: ['done', 'v2'],
  }),
  gate: [
    { criterion: '검증 MAE ≤ 5분', value: '4.3', passed: true },
    { criterion: '단순 방법 대비 10% 개선', value: '5.6 → 4.3 (23%)', passed: true },
    { criterion: '현재 모델보다 나쁘지 않음', value: '8.0 → 4.3', passed: true },
  ],
  outcome: { kind: 'retrain_promoted', deployedVersion: 'v2' },
  matched: true,
  logTail: [
    ...RUN_RUNNING.logTail,
    log('1031', 'INFO', '재학습 완료 · 검증 MAE 4.3', true),
    log('1031', 'CHECK', '게이트 3/3 통과'),
    log('1031', 'OK', 'v2 배포', true),
  ],
}

/** 개장 초기 혼란(판단 필요), 연속 1/2 에서 멈춰 재학습까지 가지 않는다 → 기대와 결과 다름 */
const RUN_OPENING: PipelineRun = {
  ...RUN_NORMAL,
  id: 'run-opening',
  scenarioId: 'opening_chaos',
  scenarioName: '개장 초기 혼란',
  steps: withSteps(RUN_NORMAL.steps, {
    drift: ['done', 'MAE 6.8 > 5.0'],
    event: ['done', '이벤트 없음'],
    consecutive: ['done', '연속 1/2'],
  }),
  gate: null,
  expected: '주의 → 재학습',
  outcome: { kind: 'warn', consecutive: 1, consecutiveLimit: 2 },
  matched: false,
  logTail: [
    log('1030', 'CHECK', '시나리오 개장 초기 혼란 · 21편 주입'),
    log('1030', 'WARN', 'MAE 6.8 / 5.0 · 주의, 연속 초과 1/2'),
  ],
}

const FINAL_RUNS: Record<ScenarioId, PipelineRun> = {
  normal: RUN_NORMAL,
  staff_shortage: RUN_RETRAIN,
  conveyor_fault: RUN_CONVEYOR,
  expansion: RUN_EXPANSION,
  opening_chaos: RUN_OPENING,
  process_change: RUN_GATE_FAILED,
}

/** 지금 실행한 것처럼, 실행 시각과 로그 시각을 데모 시각(10:30)으로 */
function asLiveRun(run: PipelineRun): PipelineRun {
  return { ...run, at: TODAY, logTail: run.logTail.map((line) => ({ ...line, at: TODAY })) }
}

const INITIAL_COUNTS = Object.fromEntries(lab.scenarios.map((s) => [s.id, s.runs])) as Record<ScenarioId, number>

/** 400 오류 견본, 필수 컬럼 두 개가 빠진 파일 */
const UPLOAD_400: UploadResult = {
  kind: 'error',
  fileName: 'flights_20261002.csv',
  message: '필수 컬럼 없음: bagLastTime, wait_min (400)',
}

/** 업로드 한 줄 + 400 오류 결과 (데이터 섹션 안의 그 줄만) */
function Upload400Sample() {
  const upload = useCsvUpload(lab.columns, UPLOAD_400)
  return <UploadRow requiredColumns={lab.columns} upload={upload} />
}

export function LabSection() {
  const [counts, setCounts] = useState<Record<ScenarioId, number>>(INITIAL_COUNTS)
  const live = useMockRun(RUN_RUNNING)
  const totalRuns = Object.values(counts).reduce((sum, n) => sum + n, 0)

  const run = (id: ScenarioId) => {
    live.start(asLiveRun(FINAL_RUNS[id]), (done) => {
      setCounts((prev) => ({ ...prev, [id]: prev[id] + 1 }))
      if (done.outcome?.kind === 'retrain_promoted') {
        const v = done.outcome.deployedVersion ?? 'v2'
        notifyDeploy(`${v} 배포 · 운영 버전 v1 → ${v}`)
      }
    })
  }

  const reset = () => {
    live.reset()
    setCounts(INITIAL_COUNTS)
    notify(DEMO_RESET_DONE)
  }

  return (
    <>
      <Specimen name="제목 줄">
        <ScreenTitleRow title="시나리오 랩" />
      </Specimen>

      <Specimen name="시나리오 표">
        <ScenarioTable
          scenarios={lab.scenarios}
          runCounts={counts}
          runningId={live.runningId}
          onRun={run}
          onReset={reset}
          resetContent={
            <DemoResetFacts runs={totalRuns} verdicts={monitoring.batches.length} from={server.modelVersion} to="v1" />
          }
        />
      </Specimen>

      <Specimen name="실행 결과 · 진행 중">
        <RunResult run={live.run} today={TODAY} />
      </Specimen>

      <Specimen name="로그 꼬리">
        <LogView lines={live.run.logTail} label="실행 로그" />
      </Specimen>

      <Specimen name="실행 결과 · 정상, 재학습~배포 건너뜀">
        <RunResult run={RUN_NORMAL} today={TODAY} />
      </Specimen>

      <Specimen name="실행 결과 · 알림만, 컨베이어 고장">
        <RunResult run={RUN_CONVEYOR} today={TODAY} />
      </Specimen>

      <Specimen name="실행 결과 · 재학습 성공, v2 배포, 게이트 3줄">
        <RunResult run={RUN_RETRAIN} today={TODAY} />
      </Specimen>

      <Specimen name="실행 결과 · 게이트 불합격, v1 유지, 결과 다름">
        <RunResult run={RUN_GATE_FAILED} today={TODAY} />
      </Specimen>

      <Specimen name="실행 결과 · 빈 상태">
        <RunResultEmpty />
      </Specimen>

      <Specimen name="데이터 (접기)">
        <DataPanel current={lab.currentData} columns={lab.columns} preview={lab.preview} />
      </Specimen>

      <Specimen name="데이터 · 끌어다 놓는 중, 섹션 전체 바탕 primary-subtle">
        <DataPanel current={lab.currentData} columns={lab.columns} preview={lab.preview} previewDragOver />
      </Specimen>

      <Specimen name="업로드 · 400 오류">
        <Upload400Sample />
      </Specimen>
    </>
  )
}
