import { useId } from 'react'

import { BatchMaeChart } from '@/components/monitoring/BatchMaeChart'
import { GateHistoryTable } from '@/components/monitoring/GateHistoryTable'
import { batchVerdict } from '@/components/monitoring/helpers'
import { LogView } from '@/components/monitoring/LogView'
import { ModelVersionTable } from '@/components/monitoring/ModelVersionTable'
import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import { VerdictBlock, type VerdictBlockProps } from '@/components/monitoring/VerdictBlock'
import { VerdictHistoryTable } from '@/components/monitoring/VerdictHistoryTable'
import { WindowChart } from '@/components/monitoring/WindowChart'
import { demo, lab, monitoring, nextPrediction, type Batch } from '@/design/mock'
import { Specimen } from '@/design/SheetSection'

/**
 * 모델 모니터링 — 실제 화면 순서대로:
 * 제목 줄 → 판정 블록 → 배치별 MAE → 감시 창 → 판정 기록 → 모델 버전·게이트 → 로그.
 * 숫자 줄(figure-row)은 두지 않는다 — 판정 블록이 대신한다 (같은 수치를 두 곳에 쓰지 않는다).
 * 이 파일은 구역 안쪽만 돌려준다. 바깥 틀(제목·구분선)은 DesignPage 의 SheetSection 이 그린다.
 */

const { threshold, gateMae, consecutiveLimit, batches, verdictNow, latency } = monitoring

const batchNo = (no: number): Batch => batches.find((b) => b.no === no)!

/** 판정 블록 첫 줄 — 배치 기록 하나에서 */
function blockFromBatch(b: Batch): VerdictBlockProps {
  return {
    verdict: batchVerdict(b, consecutiveLimit),
    windowCount: b.windowCount,
    windowSize: b.windowSize,
    windowMae: b.windowMae,
    threshold: b.threshold,
    consecutive: b.consecutive,
    consecutiveLimit,
    asOf: b.at,
  }
}

const RUN_GATE_FAILED = lab.runStates.gateFailed

/**
 * 판정 블록 상태별 견본 — 배치 기록(3·4·5)과 시나리오 랩의 게이트 불합격 실행에서 가져온다.
 * 판정 보류는 첫 배치(06:50) 한 번 앞 — 창에 13편만 모였을 때.
 */
const BLOCK_STATES: Array<{ key: string; props: VerdictBlockProps }> = [
  {
    key: 'pending',
    props: {
      verdict: { kind: 'pending', windowCount: 13, windowSize: 21 },
      windowCount: 13,
      windowSize: 21,
      windowMae: 3.8,
      threshold,
      consecutive: 0,
      consecutiveLimit,
      asOf: `${demo.now.slice(0, 8)}0630`,
    },
  },
  { key: 'warn', props: blockFromBatch(batchNo(4)) },
  { key: 'alert_only', props: blockFromBatch(batchNo(3)) },
  { key: 'retrain_promoted', props: blockFromBatch(batchNo(5)) },
  {
    key: 'retrain_rejected',
    props: {
      verdict: RUN_GATE_FAILED.outcome ?? { kind: 'retrain_rejected', keptVersion: 'v1' },
      windowCount: 21,
      windowSize: 21,
      windowMae: 8.3,
      threshold,
      consecutive: 2,
      consecutiveLimit,
      asOf: RUN_GATE_FAILED.at,
    },
  },
]

export function MonitoringSection() {
  return (
    <>
      <Specimen name="제목 줄 · 판정 블록">
        <ScreenTitleRow title="모델 모니터링" />
        <VerdictBlock
          className="mt-3"
          verdict={{ kind: verdictNow.verdict }}
          windowCount={verdictNow.windowCount}
          windowSize={verdictNow.windowSize}
          windowMae={verdictNow.windowMae}
          threshold={verdictNow.threshold}
          consecutive={verdictNow.consecutive}
          consecutiveLimit={verdictNow.consecutiveLimit}
          asOf={demo.now}
          meta={{ version: verdictNow.modelVersion, p95Ms: latency.p95Ms, judgedAt: verdictNow.at }}
        />
      </Specimen>

      <Specimen name="판정 블록 · 상태별 (첫 줄)">
        <div className="flex flex-col gap-3">
          {BLOCK_STATES.map(({ key, props }) => (
            <VerdictBlock key={key} {...props} />
          ))}
        </div>
      </Specimen>

      <Specimen name="배치별 MAE 차트">
        <BatchMaeChart
          batches={batches}
          threshold={threshold}
          gateMae={gateMae}
          consecutiveLimit={consecutiveLimit}
        />
      </Specimen>

      <Specimen name="감시 창 차트 (예측 vs 실제)">
        <WindowChart points={monitoring.window} />
      </Specimen>

      <Specimen name="판정 기록 표">
        <VerdictHistoryTable batches={batches} threshold={threshold} consecutiveLimit={consecutiveLimit} />
      </Specimen>

      <Specimen name="판정 기록 표 · 빈 상태">
        <VerdictHistoryTable batches={[]} threshold={threshold} consecutiveLimit={consecutiveLimit} />
      </Specimen>

      <Specimen name="모델 버전 표">
        <ModelVersionTable versions={monitoring.versions} gateMae={gateMae} nextPrediction={nextPrediction} />
      </Specimen>

      <Specimen name="게이트 이력 표">
        <GateHistoryTable gates={monitoring.gates} />
      </Specimen>

      <Specimen name="로그 log-line">
        <MonitoringLog />
      </Specimen>
    </>
  )
}

/** 로그 — 제목 + 높이 10줄 남짓, 그 안에서 스크롤, 최신이 아래 */
function MonitoringLog() {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        로그
      </h4>
      <LogView lines={monitoring.logs} maxHeightClass="max-h-[256px]" className="mt-3" />
    </section>
  )
}
