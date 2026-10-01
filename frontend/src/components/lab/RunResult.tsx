import { useId, type ReactNode } from 'react'

import { EmptyState } from '@/components/app/EmptyState'
import { GateCheckTable } from '@/components/lab/GateCheckTable'
import { PipelineSteps } from '@/components/lab/PipelineSteps'
import { MascotCarry, MascotPose } from '@/components/mascot/Mascot'
import { fmtClockOrDate } from '@/components/monitoring/helpers'
import type { PipelineRun, Ymdhm } from '@/design/mock'
import { cn } from '@/lib/cn'
import { matchResult } from '@/lib/format'

/**
 * 실행 결과 (시나리오 랩) — 제목 줄(실행 결과 · 시나리오 이름 · 시각) → 파이프라인 단계 → 게이트 검사(게이트까지 갔을 때)
 * → 맨 아래 한 줄 "기대 주의 → 재학습 · 결과 일치" (다르면 danger-text "결과 다름").
 * 제목 줄은 높이 30px — 두 칸 배치에서 왼쪽 "시나리오" 제목 줄(고스트 버튼 30px)과 같은 줄에 선다.
 * 마스코트(80px)는 단계 줄 오른쪽 끝 한 자리에 둔다(DESIGN.md "움직임 규칙" 8):
 * - 실행 중(결과가 아직 없음 = matched null): 짐을 들어 나르는 6장면 애니메이션 (결과 부분 없이 "기대 …"만)
 * - 끝나면: 같은 자리·같은 크기에서 평소 자세로 멈춘다. 응답이 오면 결과를 한 번에 보인다.
 * 자리는 칸 오른쪽 끝에 붙여 두어 단계 글자 폭이 바뀌어도 움직이지 않는다. 단계 줄 높이(38px)만 차지하고
 * 나머지 42px 는 위(제목 줄 오른쪽 빈자리)로 올린다 — 나타나고 바뀔 때 아래 내용이 흔들리지 않게.
 * 로그 꼬리는 따로(LogView) 붙인다.
 */
export interface RunResultProps {
  run: PipelineRun
  /** 기준 날짜 (같은 날이면 시각만, 다르면 "09-30 16:38") */
  today: Ymdhm
  className?: string
}

/** 80px − 단계 줄 38px = 42px 를 위로 — 줄 높이를 늘리지 않는다 */
const MASCOT_SLOT = '-mt-[42px]'

export function RunResult({ run, today, className }: RunResultProps) {
  const titleId = useId()
  const running = run.matched === null
  const match = run.matched === null ? null : matchResult(run.matched)

  return (
    <section aria-labelledby={titleId} className={cn('flex flex-col gap-4', className)}>
      <RunTitleRow titleId={titleId}>
        <span className="type-body-sm whitespace-nowrap text-ink-subtle">
          {run.scenarioName}
          {' · '}
          <span className="tabular-nums">{fmtClockOrDate(run.at, today)}</span>
        </span>
      </RunTitleRow>

      <div className="flex items-start gap-6">
        <PipelineSteps steps={run.steps} className="min-w-0 flex-1" />
        {running ? <MascotCarry className={MASCOT_SLOT} /> : <MascotPose alert={false} className={MASCOT_SLOT} />}
      </div>

      {run.gate && <GateCheckTable checks={run.gate} />}

      <p className="type-body-sm text-ink-muted" aria-live="polite">
        <span className="text-ink-subtle">기대</span> {run.expected}
        {match && (
          <>
            {' · '}
            <span className={match.textClass}>{match.label}</span>
          </>
        )}
      </p>
    </section>
  )
}

/** 실행 결과 빈 상태 — 제목 아래 한 줄 사실. 일러스트·마스코트 없음 */
export function RunResultEmpty({ className }: { className?: string }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={className}>
      <RunTitleRow titleId={titleId} />
      <EmptyState className="mt-2">아직 실행한 시나리오가 없습니다. 시나리오를 실행하면 단계가 여기에 보입니다</EmptyState>
    </section>
  )
}

/** 제목 줄 — 높이 30px, 제목과 곁글자는 기준선으로 맞춘다 */
function RunTitleRow({ titleId, children }: { titleId: string; children?: ReactNode }) {
  return (
    <div className="flex h-[30px] items-center">
      <div className="flex min-w-0 items-baseline gap-3">
        <h4 id={titleId} className="shrink-0 type-section-title text-ink">
          실행 결과
        </h4>
        {children}
      </div>
    </div>
  )
}
