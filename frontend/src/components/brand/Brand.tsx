import { Wordmark } from '@/components/brand/Wordmark'
import { MascotMark } from '@/components/mascot/Mascot'
import { cn } from '@/lib/cn'

/**
 * 상단 바 브랜드 — 마스코트 전신 마크(칸 1px, 40×40px) + 워드마크 "짐작", 사이 8px, 세로 가운데 맞춤.
 * 브랜드 마크는 마스코트 하나다(DESIGN.md "마스코트"). 다른 그림 마크를 붙이지 않는다.
 * 상단 바(AppHeader)가 늘 이것을 그리므로, 상단 바 견본마다 마크가 함께 보인다.
 */
export interface BrandProps {
  className?: string
}

export function Brand({ className }: BrandProps) {
  return (
    <span className={cn('inline-flex shrink-0 items-center gap-2', className)}>
      <MascotMark />
      <Wordmark />
    </span>
  )
}
