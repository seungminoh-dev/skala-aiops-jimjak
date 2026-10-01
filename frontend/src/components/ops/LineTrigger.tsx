import type { LineId } from '@/design/mock'
import { cn } from '@/lib/cn'

/**
 * 라인 ID 버튼 (T1-07) — 누르면 라인 상세 서랍이 열린다.
 * 글자는 mono, 색은 감싼 줄을 따른다(완료 행에서는 ink-subtle). hover 에 밑줄만.
 *
 * data-line-trigger: 서랍이 열린 채로 다른 라인을 누르면 서랍을 닫지 않고 내용만 바꾼다
 * (LineDrawer 의 onInteractOutside 가 이 표시를 본다). 행·막대처럼 서랍을 여는 다른 요소에도 붙인다.
 */
export interface LineTriggerProps {
  lineId: LineId
  onOpen: (lineId: LineId) => void
  className?: string
}

export function LineTrigger({ lineId, onOpen, className }: LineTriggerProps) {
  return (
    <button
      type="button"
      data-line-trigger=""
      aria-haspopup="dialog"
      aria-label={`${lineId} 라인 상세 열기`}
      onClick={(event) => {
        event.stopPropagation()
        onOpen(lineId)
      }}
      className={cn(
        'cursor-pointer rounded-xs font-mono underline-offset-[3px] hover:underline',
        className,
      )}
    >
      {lineId}
    </button>
  )
}
