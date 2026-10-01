import { ConfirmFacts } from '@/components/app/ConfirmDialog'
import { Num } from '@/components/app/Num'

/**
 * 데모 초기화 확인 대화상자의 내용 — 지우는 것과 바뀌는 운영 버전, 사실만.
 * 시나리오 표의 "데모 초기화"와 기본 부품의 대화상자 견본이 같이 쓴다.
 */
export const DEMO_RESET_TITLE = '데모 초기화'
export const DEMO_RESET_CONFIRM = '초기화'
export const DEMO_RESET_DONE = '데모를 초기화했습니다'

export interface DemoResetFactsProps {
  /** 지울 시나리오 실행 기록 (회) */
  runs: number
  /** 지울 판정 기록 (건) */
  verdicts: number
  /** 지금 운영 버전 → 초기화 뒤 운영 버전 */
  from: string
  to: string
}

export function DemoResetFacts({ runs, verdicts, from, to }: DemoResetFactsProps) {
  return (
    <ConfirmFacts
      items={[
        {
          label: '실행 기록',
          value: (
            <>
              <Num value={runs} unit="회" /> 지움
            </>
          ),
        },
        {
          label: '판정 기록',
          value: (
            <>
              <Num value={verdicts} unit="건" /> 지움
            </>
          ),
        },
        {
          label: '운영 버전',
          value: (
            <span className="type-mono">
              {from} → {to}
            </span>
          ),
        },
      ]}
    />
  )
}
