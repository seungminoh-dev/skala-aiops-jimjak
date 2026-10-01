import { cn } from '@/lib/cn'

/**
 * 서비스 이름 "짐작" — wordmark(Pretendard Variable 16px 600, 자간 −0.3px, 줄 높이 1), ink 단색.
 * - KBO 다이아고딕은 로고에 쓰지 않는다(라이선스상 BI/CI 사용 불가).
 * - 이 글자에는 그림 마크를 붙이지 않는다: DESIGN.md "브랜드 마크는 마스코트 얼굴 하나"이고,
 *   얼굴 마크 + 이 글자 묶음은 brand/Brand.tsx(상단 바가 쓴다).
 *   수하물 태그·비행기·여행가방 같은 장식 마크, 그라데이션 사각형은 만들지 않는다.
 * - 기준선 정렬: 감싼 줄이 items-baseline 이면 글자 기준선에 맞는다.
 */
export interface WordmarkProps {
  className?: string
}

export function Wordmark({ className }: WordmarkProps) {
  return (
    <span translate="no" className={cn('inline-block type-wordmark whitespace-nowrap text-ink', className)}>
      짐작
    </span>
  )
}
