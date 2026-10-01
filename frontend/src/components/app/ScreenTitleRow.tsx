import type { ReactNode } from 'react'

import { FigureRow, type FigureRowItem } from '@/components/app/FigureRow'
import { cn } from '@/lib/cn'

/**
 * 화면 제목 줄 — 왼쪽 page-title(KBO 20px), 오른쪽 숫자 줄(figure-row, 최대 4개), 그 오른쪽에 컨트롤(선택).
 * 제목과 숫자는 마지막 기준선(숫자 쪽은 figure-value 줄)으로 맞춘다. 제목 밑·옆 설명 문장 없음.
 * - 운영 현황: 제목 · 숫자 줄 · 시각 제어(children)
 * - 모델 모니터링: 제목 · 숫자 줄 (운영 버전 · 창 MAE / 임계값 · 연속 초과 n/2 · 응답 시간 p95)
 * - 시나리오 랩: 제목만
 */
export interface ScreenTitleRowProps {
  title: string
  figures?: readonly FigureRowItem[]
  /** 숫자 줄 오른쪽 컨트롤 (운영 현황의 시각 제어). 줄 아래쪽에 붙는다 */
  children?: ReactNode
  /** 제목 요소 (시트 안에서는 h3) */
  headingLevel?: 'h1' | 'h2' | 'h3'
  className?: string
}

export function ScreenTitleRow({ title, figures, children, headingLevel = 'h3', className }: ScreenTitleRowProps) {
  const Heading = headingLevel
  return (
    <div className={cn('flex min-h-[46px] items-baseline-last gap-8', className)}>
      <Heading className="mr-auto type-page-title text-ink">{title}</Heading>
      {figures && figures.length > 0 && <FigureRow items={figures} />}
      {children && <div className="ml-4 self-end">{children}</div>}
    </div>
  )
}
