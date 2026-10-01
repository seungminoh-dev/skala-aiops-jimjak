import { cn } from '@/lib/cn'
import { dotClass, type DotTone } from '@/lib/format'

/**
 * 상태 점 — 6px, 빈 점(hollow)은 1.5px 테두리만 (DESIGN.md "상태 표시 대응표").
 *
 * 글자 줄 안에 놓는 inline-block 이다. 표의 기준선 정렬을 깨지 않도록 flex 로 감싸지 않고,
 * 점의 가운데를 글자(한글·숫자)의 가운데 높이에 맞춘다:
 *   vertical-align = 0.36em(글자 가운데 높이) − 3px(점 반지름)
 * flex 안에 놓으면 vertical-align 은 무시되고 부모의 items-center 를 따른다.
 *
 * tone 'none' 이면 아무것도 그리지 않는다 (완료·원활처럼 점 없는 상태).
 */
export interface StatusDotProps {
  tone: DotTone
  className?: string
}

export function StatusDot({ tone, className }: StatusDotProps) {
  if (tone === 'none') return null
  return <span aria-hidden className={cn(dotClass(tone), 'align-[calc(0.36em-3px)]', className)} />
}
