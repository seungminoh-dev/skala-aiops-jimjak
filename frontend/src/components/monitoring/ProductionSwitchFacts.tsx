import { ConfirmFacts } from '@/components/app/ConfirmDialog'
import { Num } from '@/components/app/Num'
import type { ModelVersion } from '@/design/mock'
import { fmtClock, fmtDecimal, type Ymdhm } from '@/lib/format'

/**
 * 운영 버전 전환(보관 버전을 다시 운영으로) 확인 대화상자의 내용 — 사실만.
 * 모델 버전 표의 "운영으로 전환"과 기본 부품의 대화상자 견본이 같이 쓴다.
 * 끝난 뒤 토스트 글자는 monitoring/helpers 의 productionSwitchMessage.
 * 화면 글자는 "운영 버전"으로 쓴다 (영문 Production 은 쓰지 않는다).
 */
export const PRODUCTION_SWITCH_TITLE = '운영 버전 전환'
export const PRODUCTION_SWITCH_CONFIRM = '전환'

export interface ProductionSwitchFactsProps {
  /** 지금 운영 버전 */
  from: ModelVersion
  /** 전환할 보관 버전 */
  to: ModelVersion
  /** 전환하면 적용되는 다음 예측 (예: 10:38 OZ107) */
  nextPrediction: { at: Ymdhm; flightId: string }
}

export function ProductionSwitchFacts({ from, to, nextPrediction }: ProductionSwitchFactsProps) {
  return (
    <ConfirmFacts
      items={[
        {
          label: '운영 버전',
          value: (
            <span className="type-mono">
              {from.version} → {to.version}
            </span>
          ),
        },
        {
          label: '검증 MAE',
          value: (
            <>
              <span className="tabular-nums">{fmtDecimal(from.valMae)}</span> →{' '}
              <Num value={to.valMae} digits={1} unit="분" />
            </>
          ),
        },
        {
          label: '적용',
          value: (
            <>
              다음 예측부터 · <span className="tabular-nums">{fmtClock(nextPrediction.at)}</span>{' '}
              <span className="type-mono">{nextPrediction.flightId}</span>
            </>
          ),
        },
      ]}
    />
  )
}
