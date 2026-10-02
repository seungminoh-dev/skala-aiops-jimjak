import { useLogs, useModels, useMonitoring, useScenarios } from '@/api'
import { ScreenTitleRow } from '@/components/app/ScreenTitleRow'
import { BatchMaeChart } from '@/components/monitoring/BatchMaeChart'
import { GateHistoryTable } from '@/components/monitoring/GateHistoryTable'
import { VerdictBlock } from '@/components/monitoring/VerdictBlock'
import { VerdictHistoryTable } from '@/components/monitoring/VerdictHistoryTable'
import { WindowChart } from '@/components/monitoring/WindowChart'
import { EmptySection, MonitoringLog, PageSection } from '@/pages/monitoring/parts'
import { VersionTable } from '@/pages/monitoring/VersionTable'

/**
 * #/monitoring 모델 모니터링 — design/sections/MonitoringSection 견본의 조립을 그대로, 데이터만 '@/api' 에서.
 * 순서(DESIGN.md "화면별 순서"): 제목 줄 → 판정 블록 → (두 칸) 배치별 MAE 차트 · 감시 창 차트 → 판정 기록 표
 * → 모델 버전·게이트 표 → 로그
 * - 판정 블록과 차트 사이는 16px 로 붙인다(구분선 없음) — 지금 상태와 그 근거를 한 시선에.
 * - 두 칸은 1280px 이상에서만, 그보다 좁으면 세로로 쌓는다. 두 차트는 제목·범례·그림 영역을 같은 값으로 맞춘다(chart-config).
 * - 표는 전폭, 열은 비율로 나눈다(빈 열 없음).
 * - 숫자 줄(figure-row)은 두지 않는다 — 판정 블록이 대신한다.
 * - 시나리오 랩에서 실행하면 같은 스토어라 이 화면이 바로 바뀐다 (배치·판정·버전·게이트·로그).
 * - 감시 창 차트는 마지막으로 판정한 21편(judgedWindow) — 새 버전 배포 직후 창이 비어도 차트는 남는다.
 * - 기록이 없으면 그 자리에 한 줄 사실 (판정 기록 표는 자체 빈 상태를 쓴다).
 */
export function MonitoringPage() {
  const m = useMonitoring()
  const models = useModels()
  const logs = useLogs()
  const { runningId } = useScenarios()
  const hasBatches = m.batches.length > 0

  return (
    <>
      <ScreenTitleRow title="모델 모니터링" headingLevel="h1" />
      <VerdictBlock className="mt-3" {...m.verdictBlock} />

      <div className="mt-4 grid grid-cols-1 gap-8 xl:grid-cols-2">
        {hasBatches ? (
          <BatchMaeChart
            batches={m.batches}
            threshold={m.threshold}
            gateMae={m.gateMae}
            consecutiveLimit={m.consecutiveLimit}
          />
        ) : (
          <EmptySection title="배치별 MAE">아직 판정 기록이 없습니다. 시나리오 랩에서 실행하면 쌓입니다</EmptySection>
        )}
        {m.judgedWindow.length > 0 ? (
          <WindowChart points={m.judgedWindow} />
        ) : (
          <EmptySection title="감시 창">
            아직 판정한 편이 없습니다 · 지금 창 {m.window.length}/{m.windowSize}편
          </EmptySection>
        )}
      </div>

      <PageSection>
        <VerdictHistoryTable batches={m.batches} threshold={m.threshold} consecutiveLimit={m.consecutiveLimit} />
      </PageSection>

      <PageSection className="flex flex-col gap-10">
        <VersionTable
          versions={models.versions}
          production={models.production}
          gateMae={models.gateMae}
          nextPrediction={models.nextPrediction}
          locked={runningId !== null}
        />
        {models.gates.length > 0 ? (
          <GateHistoryTable gates={models.gates} />
        ) : (
          <EmptySection title="게이트 이력">아직 게이트 기록이 없습니다. 재학습하면 쌓입니다</EmptySection>
        )}
      </PageSection>

      <PageSection>
        <MonitoringLog lines={logs} />
      </PageSection>
    </>
  )
}
