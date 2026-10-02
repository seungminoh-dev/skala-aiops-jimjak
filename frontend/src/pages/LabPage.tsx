import { useState } from 'react'

import { actions, useDemoClock, useHealth, useScenarios, type ScenarioId } from '@/api'
import { notify, notifyDeploy } from '@/components/app/notify'
import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import { DEMO_RESET_DONE, DemoResetFacts } from '@/components/lab/DemoResetFacts'
import { RunResult, RunResultEmpty } from '@/components/lab/RunResult'
import { ScenarioTable } from '@/components/lab/ScenarioTable'
import { LogView } from '@/components/monitoring/LogView'
import { errorText } from '@/pages/lab/errorText'
import { LabDataPanel } from '@/pages/lab/LabDataPanel'

/**
 * #/lab 시나리오 랩 — DESIGN.md "화면별 순서": 제목 줄 → (두 칸) 왼쪽 시나리오 목록 · 오른쪽 실행 결과 → 아래 데이터(접기).
 * 실행과 결과가 한 시선에 들어온다. 두 칸은 1280px 이상에서만, 그보다 좁으면 세로로 쌓는다.
 * - 왼쪽: 시나리오 표(실행 · 데모 초기화). 오른쪽: 실행 결과(파이프라인 단계 · 게이트 검사 · 기대/결과 · 로그 꼬리).
 *   단계 줄(6단계 + 마스코트)이 한 줄에 들어가도록 오른쪽 칸을 넓게 둔다(5:7).
 * - 실행 결과 자리는 높이를 미리 잡아 둔다(RUN_AREA): 대기(빈 상태 한 줄) → 진행 → 완료가 그 안에서 바뀌고
 *   아래 데이터 섹션이 밀리지 않는다 (DESIGN.md "움직임 규칙" 8). 로그 꼬리는 최근 7줄 높이까지, 넘으면 그 안에서 스크롤.
 * - 데이터 섹션은 처음에 접어 둔다(파일 이름·행 수만). 파일을 끌어다 놓으면 펼쳐진다.
 * 데이터는 '@/api' 에서만: useScenarios · useDataset · actions.runScenario / resetDemo / uploadCsv.
 * 실행 중에는 서버 상태(runningId · 진행 중 run)를 그대로 그린다 — 버튼 "실행 중…", 단계 줄 오른쪽 마스코트.
 * 새 버전이 배포되면 토스트(primary 점). 시연 순서(평상시 → 컨베이어 고장 → 인력 부족 2회 → 나머지)가 이 화면만으로 끝까지 간다.
 */

/**
 * 실행 결과 자리의 높이 — 가장 긴 결과(재학습 · 게이트 3줄 · 로그 꼬리 7줄)가 들어가는 높이.
 * 제목 줄 30 + 16 + 단계 줄 38 + 16 + 게이트 표 156 + 16 + 기대 줄 20 + 16 + 로그 꼬리 186 = 494
 */
const RUN_AREA = 'min-h-[496px]'
/** 로그 꼬리 — 7줄(24px) + 위아래 여백 8px·선 1px. 넘으면 그 안에서 스크롤하고 최신(아래)을 보인다 */
const LOG_TAIL_MAX_H = 'max-h-[186px]'

export function LabPage() {
  const clock = useDemoClock()
  const health = useHealth()
  const lab = useScenarios()
  // 초기화하면 데이터 섹션(업로드 결과 줄·접힘)도 처음으로
  const [resetCount, setResetCount] = useState(0)

  const run = (id: ScenarioId) => {
    const from = health.modelVersion
    actions.runScenario(id).then(
      (done) => {
        if (done.outcome?.kind === 'retrain_promoted' && done.outcome.deployedVersion) {
          const to = done.outcome.deployedVersion
          notifyDeploy(`새 모델 ${to} 배포 · 운영 버전 ${from} → ${to}`)
        }
      },
      (error: unknown) => notify(errorText(error, '시나리오를 실행하지 못했습니다')),
    )
  }

  const reset = () => {
    actions.resetDemo().then(
      () => {
        setResetCount((n) => n + 1)
        notify(DEMO_RESET_DONE)
      },
      (error: unknown) => notify(errorText(error, '데모를 초기화하지 못했습니다')),
    )
  }

  return (
    <div className="flex flex-col">
      <ScreenTitleRow title="시나리오 랩" headingLevel="h1" />

      <div className="mt-6 grid grid-cols-1 gap-8 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <ScenarioTable
          scenarios={lab.scenarios}
          runCounts={lab.runCounts}
          runningId={lab.runningId}
          onRun={run}
          onReset={reset}
          resetContent={
            <DemoResetFacts runs={lab.totalRuns} verdicts={lab.verdictsFromRuns} from={health.modelVersion} to="v1" />
          }
        />

        <div className={RUN_AREA}>
          {lab.currentRun ? (
            <div className="flex flex-col gap-4">
              <RunResult run={lab.currentRun} today={clock.liveNow} />
              <LogView lines={lab.currentRun.logTail} label="실행 로그" maxHeightClass={LOG_TAIL_MAX_H} />
            </div>
          ) : (
            <RunResultEmpty />
          )}
        </div>
      </div>

      {/* 섹션 사이 — 여백 32px + 가로 hairline 1px (상자 없음) */}
      <div className="mt-8 border-t border-hairline pt-8">
        <LabDataPanel key={resetCount} defaultOpen={false} />
      </div>
    </div>
  )
}
