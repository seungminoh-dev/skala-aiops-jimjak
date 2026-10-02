import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** /design 위에 고정된 띠 높이 — 상단 바 52px + 시트 목차 32px */
export const SHEET_CHROME_PX = 84
/** 고정 띠 바로 아래에 붙는 sticky 위치 (도착편 표 머리글). Tailwind 가 읽도록 글자 그대로 둔다 */
export const SHEET_STICKY_TOP = 'top-[84px]'

/**
 * /design 시트의 구역 틀.
 * - 구역 제목은 page-title(KBO 20px) — 구역 = 화면(운영 현황 등) 단위라서.
 * - 구역 사이는 여백 32px + 가로 hairline 1px + 여백 32px (DESIGN.md "배치"). 상자 없음.
 * - DesignPage 가 SheetSection 으로 감싸므로, 구역 파일은 안쪽(Specimen 들)만 돌려준다.
 * - 목차로 옮기면 고정 띠(84px) 아래 16px 에 제목이 오도록 scroll-margin 100px.
 */
export interface SheetSectionProps {
  /** 앵커 id (상단 바 바로가기) */
  id: string
  title: string
  children: ReactNode
}

export function SheetSection({ id, title, children }: SheetSectionProps) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="scroll-mt-[100px] border-t border-hairline pt-8 not-first:mt-8 first:border-t-0 first:pt-0"
    >
      <h2 id={`${id}-title`} className="type-page-title text-ink">
        {title}
      </h2>
      <div className="mt-6 flex flex-col gap-10">{children}</div>
    </section>
  )
}

/**
 * 부품 하나 + 이름표. 이름표는 caption ink-subtle 한 줄, 부품 바로 위.
 * 설명 문장은 달지 않는다 (이름만).
 */
export interface SpecimenProps {
  /** 부품 이름 (예: "숫자판 flap-tile", "도착편 표") */
  name: string
  children: ReactNode
  className?: string
}

export function Specimen({ name, children, className }: SpecimenProps) {
  return (
    <div className={cn('flex min-w-0 flex-col gap-2', className)}>
      <div className="type-caption text-ink-subtle">{name}</div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}
