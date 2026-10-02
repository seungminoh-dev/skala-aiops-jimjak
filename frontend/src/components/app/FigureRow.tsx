import type { ReactNode } from 'react'

import { NumUnit } from '@/lib/format'
import { cn } from '@/lib/cn'

/**
 * 숫자 줄 figure-row — 제목 줄 오른쪽에 숫자 최대 4개.
 * 상자·테두리·아이콘 없이 이름(label ink-subtle) 위 / 숫자(figure-value, KBO 22px) 아래, 숫자 사이 32px.
 * 단위는 body-sm ink-subtle 로 숫자 기준선에 붙인다. 버전(v2)처럼 코드인 값은 mono.
 *
 * - 운영 현황: 오늘 도착 · 처리 중 · 3시간 안 도착 · 오늘 예측 오차 (조치 필요 수는 넣지 않는다 — 숫자판에만)
 * - 모델 모니터링: 운영 버전 · 창 MAE / 임계값 · 연속 초과 n/2 · 응답 시간 p95
 * - 시나리오 랩에는 두지 않는다.
 *
 * items 는 design/mock 의 FigureItem 과 같은 모양이다 (opsFigureRow, monitoring.figureRow).
 * 값이 글자가 아닌 숫자 칸(노랑 칸, "— · 10:38 발행")은 <Figure> 를 <dl className="flex gap-8"> 안에 직접 놓는다.
 */
export interface FigureRowItem {
  label: string
  value: string
  unit?: string
  mono?: boolean
}

export interface FigureRowProps {
  /** 최대 4개 */
  items: readonly FigureRowItem[]
  className?: string
}

export function FigureRow({ items, className }: FigureRowProps) {
  return (
    <dl className={cn('flex items-start gap-8', className)}>
      {items.slice(0, 4).map((item) => (
        <Figure key={item.label} label={item.label}>
          {item.mono ? (
            <span className="font-mono">{item.value}</span>
          ) : item.unit ? (
            <NumUnit value={item.value} unit={item.unit} />
          ) : (
            <span className="tabular-nums">{item.value}</span>
          )}
        </Figure>
      ))}
    </dl>
  )
}

/**
 * 숫자 한 칸 — 이름(label ink-subtle) 위 / 숫자(figure-value) 아래. <dl> 안에서 쓴다.
 * 숫자 줄과 라인 상세 서랍(다음 편 예측·가정 시뮬레이터)이 같이 쓴다.
 */
export interface FigureProps {
  label: string
  children: ReactNode
}

export function Figure({ label, children }: FigureProps) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="type-label whitespace-nowrap text-ink-subtle">{label}</dt>
      <dd className="type-figure-value whitespace-nowrap text-ink">{children}</dd>
    </div>
  )
}
