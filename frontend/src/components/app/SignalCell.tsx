import { cn } from '@/lib/cn'
import { SIGNAL_CELL_CLASS } from '@/lib/format'

/**
 * 노랑 숫자 칸 signal-cell — 50분 초과 예측의 예측 숫자 칸 하나에만 쓴다 (한 편당 노랑은 칸 하나, 막대 하나).
 * signal 면 + on-signal 글자(단위도 on-signal — 노랑 위 글자는 항상 on-signal), 둥글기 xs, 안쪽 2px 6px.
 *
 * size
 * - default: 표 안. 글자 크기는 감싼 칸(body-sm 13px)을 따르고, 높이 20px 이라 40px 행에 맞는다.
 * - lg: 조치 필요 목록. Pretendard 15px 600, 폭 72px, 숫자는 오른쪽 정렬, 단위 13px 400. 높이 24px.
 * - figure: 라인 상세 서랍의 큰 숫자(figure-value). 숫자는 감싼 figure-value 를 따르고 단위는 body-sm. 줄 높이 24px.
 *
 * 완료된 편은 노랑을 지우고 실제·오차를 보인다 — 그때는 이 칸 대신 <Num> 을 쓴다.
 */
export interface SignalCellProps {
  /** 예측 처리 시간 (분) */
  value: number | string
  /** 기본 "분". null 이면 단위 없이 */
  unit?: string | null
  size?: 'default' | 'lg' | 'figure'
  className?: string
}

export function SignalCell({ value, unit = '분', size = 'default', className }: SignalCellProps) {
  const lg = size === 'lg'
  const figure = size === 'figure'
  return (
    <span
      className={cn(
        SIGNAL_CELL_CLASS,
        lg && 'w-[72px] text-right text-[15px] leading-5 font-semibold',
        figure && 'leading-6',
        className,
      )}
    >
      <span className="tabular-nums">{value}</span>
      {unit && <span className={cn('ml-0.5', lg && 'text-[13px] font-normal', figure && 'type-body-sm')}>{unit}</span>}
    </span>
  )
}
