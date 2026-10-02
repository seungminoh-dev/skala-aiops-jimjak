import { StatusDot } from '@/components/app/StatusDot'
import type { PipelineStep } from '@/design/mock'
import { cn } from '@/lib/cn'
import { stepStatus } from '@/lib/format'

/**
 * 파이프라인 단계 — DESIGN.md "파이프라인 단계".
 * 6단계를 상자 없이 가로 한 줄로 놓고 단계 사이를 1px hairline 선(16px)으로 잇는다.
 * 각 단계: 점 + 이름(body-sm), 아래에 결과 한 줄(mono-sm ink-subtle, 예: "MAE 7.9 > 6.3", "연속 2/2", "v2").
 * - 대기: ink-tertiary 빈 점 + ink-tertiary 글자
 * - 진행 중: primary 점 + ink 글자 "진행 중" (회전·맥박 애니메이션 없음)
 * - 완료: ink-subtle 점 + ink 글자. 재학습·배포 완료는 primary 점
 * - 건너뜀: 점 없이 ink-tertiary "건너뜀", 앞 연결선 점선
 * - 실패: danger 점 + danger-text, 뒤 단계는 모두 건너뜀
 * 번호 원·체크 아이콘·진행 막대·스피너 없음.
 */
export interface PipelineStepsProps {
  steps: readonly PipelineStep[]
  className?: string
}

export function PipelineSteps({ steps, className }: PipelineStepsProps) {
  return (
    <ol aria-label="파이프라인 단계" className={cn('flex flex-wrap items-start gap-y-3', className)}>
      {steps.map((step, i) => (
        <li key={step.key} className="flex items-start">
          {i > 0 && <Connector dashed={step.state === 'skipped'} />}
          <Step step={step} />
        </li>
      ))}
    </ol>
  )
}

/** 단계 사이 선 — 16px, 이름 줄 가운데 높이. 건너뛴 단계 앞은 점선 */
function Connector({ dashed }: { dashed: boolean }) {
  return (
    <span aria-hidden className="mx-2 flex h-5 w-4 items-center">
      <span className={cn('w-full border-t', dashed ? 'border-dashed border-hairline-strong' : 'border-hairline')} />
    </span>
  )
}

function Step({ step }: { step: PipelineStep }) {
  const status = stepStatus(step.state, { systemAction: step.systemAction })

  // 둘째 줄: 완료·실패는 결과(mono-sm), 그 밖은 상태 글자
  let detail: { text: string; className: string }
  switch (step.state) {
    case 'done':
      detail = { text: step.result ?? '완료', className: 'type-mono-sm text-ink-subtle' }
      break
    case 'failed':
      detail = { text: step.result ?? '실패', className: 'type-mono-sm text-danger-text' }
      break
    case 'running':
      detail = { text: '진행 중', className: 'type-caption text-ink' }
      break
    case 'waiting':
      detail = { text: '대기', className: 'type-caption text-ink-tertiary' }
      break
    case 'skipped':
      detail = { text: '건너뜀', className: 'type-caption text-ink-tertiary' }
      break
  }

  return (
    <div className="flex flex-col">
      <div className="flex h-5 items-center gap-1.5">
        {status.dot === 'none' ? (
          <span aria-hidden className="inline-block size-1.5 shrink-0" />
        ) : (
          <StatusDot tone={status.dot} />
        )}
        <span className={cn('type-body-sm whitespace-nowrap', status.textClass)}>{step.name}</span>
      </div>
      <span className={cn('pl-3 leading-[18px] whitespace-nowrap', detail.className)}>{detail.text}</span>
    </div>
  )
}
