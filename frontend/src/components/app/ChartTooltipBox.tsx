import { Fragment, type ReactNode } from 'react'

import { NumUnit } from '@/lib/format'

/**
 * 차트 툴팁 상자 — 흰 바탕 + hairline + 깊이 3단계, caption (DESIGN.md "차트" · "툴팁").
 * 제목 한 줄(편명·배치) 아래에 이름 | 값 줄. recharts Tooltip 의 content 로 쓴다.
 * 배치별 MAE · 감시 창 · 모델 입력 20편 차트가 같이 쓴다. 숫자 값은 <TooltipValue> 로 단위를 나눈다.
 */
export interface TooltipRow {
  label: string
  value: ReactNode
}

export interface ChartTooltipBoxProps {
  title: ReactNode
  rows: readonly TooltipRow[]
}

export function ChartTooltipBox({ title, rows }: ChartTooltipBoxProps) {
  return (
    <div className="min-w-40 rounded-md border border-border bg-popover px-2.5 py-2 type-caption text-popover-foreground shadow-depth-3">
      <div className="mb-1 font-medium text-ink">{title}</div>
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-3 gap-y-0.5">
        {rows.map((row) => (
          <Fragment key={row.label}>
            <dt className="text-ink-subtle">{row.label}</dt>
            <dd className="text-ink">{row.value}</dd>
          </Fragment>
        ))}
      </dl>
    </div>
  )
}

/** 툴팁 안 숫자 + 단위 — 숫자 tabular, 단위는 다른 span 에 ink-subtle (툴팁 글자 크기 caption 그대로) */
export function TooltipValue({ value, unit }: { value: number | string; unit: string }) {
  return <NumUnit value={value} unit={unit} unitClassName="type-caption" />
}
