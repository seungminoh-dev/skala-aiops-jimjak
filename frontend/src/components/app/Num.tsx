import { cn } from '@/lib/cn'
import { fmtDecimal, fmtSigned, NumUnit } from '@/lib/format'

/**
 * 숫자 + 단위 — DESIGN.md "글자": 숫자는 Pretendard + tabular-nums, 단위(분·편·후)는
 * 숫자와 다른 span 에 body-sm ink-subtle 로 붙인다. 기준선으로 맞춘다(inline-flex items-baseline).
 *
 *   <Num value={46} unit="분" />                 46분
 *   <Num value={3} unit="편" />                  3편
 *   <Num value={8} unit="분" signed />           +8분   (지연·오차·가정 차이)
 *   <Num value={-3} unit="분" signed />          −3분
 *   <Num value={4.15} digits={1} unit="분" />    4.2분
 *   <Num value={160} unit="편" className="type-figure-value" />   숫자 줄
 *
 * 글꼴·크기·색은 감싼 요소를 따른다 (className 으로 숫자 span 에 더한다).
 * 남은 시간("12분 후")은 lib/format 의 <Until>, 시각("14:50")은 fmtClock + tabular-nums 를 쓴다.
 */
export interface NumProps {
  value: number | string
  /** 단위. 없으면 숫자만 */
  unit?: string
  /** 소수 자릿수 (MAE·오차는 1) */
  digits?: number
  /** 부호를 붙인다: +8 / −3 / 0 (빼기는 숫자 폭의 − 기호) */
  signed?: boolean
  className?: string
  /** 단위 span 에 더할 클래스 (기본 body-sm ink-subtle) */
  unitClassName?: string
}

export function Num({ value, unit, digits, signed = false, className, unitClassName }: NumProps) {
  let text = typeof value === 'number' && digits !== undefined ? fmtDecimal(value, digits) : String(value)
  if (signed) text = fmtSigned(text)
  if (!unit) return <span className={cn('tabular-nums', className)}>{text}</span>
  return <NumUnit value={text} unit={unit} className={className} unitClassName={unitClassName} />
}
