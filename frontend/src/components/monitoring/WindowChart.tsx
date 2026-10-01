import { useId } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
  type TooltipContentProps,
} from 'recharts'

import { ChartLegend, LegendLine } from '@/components/app/ChartLegend'
import { ChartTooltipBox, TooltipValue } from '@/components/app/ChartTooltipBox'
import {
  ACTIVE_DOT_R,
  CHART_HEIGHT,
  CHART_INITIAL_WIDTH,
  CHART_MARGIN,
  HOLLOW_STROKE,
  MARK_R,
  TOOLTIP_CURSOR,
  Y_AXIS_WIDTH,
} from '@/components/monitoring/chart-config'
import { ChartMarkDot, RightEdgeLabels, XTick, YAxisUnit, YTick } from '@/components/monitoring/chart-parts'
import type { WindowPoint } from '@/design/mock'
import { ACTION_THRESHOLD_MIN, fmtClock, fmtSigned } from '@/lib/format'

/**
 * 감시 창 (예측 vs 실제) — DESIGN.md "차트".
 * x = 최근 21편(1 = 가장 오래된). 예측 chart-predicted 1.5px, 실제 chart-actual 1.5px.
 * 이벤트 편(컨베이어 고장 등)은 실제 점을 ink-subtle 빈 점으로 — 그 밖의 점은 그리지 않는다.
 * 50분 기준은 ink-subtle 1px 실선 + 오른쪽 끝 signal-label "50분".
 * 범례의 이벤트 편 점은 차트 점과 같은 4px 빈 점 (ChartMarkDot).
 * 배치별 MAE 차트와 두 칸으로 나란히 놓인다: 제목·범례·그림 영역(높이·여백·y 축 폭)을 chart-config 로 같게 둔다.
 */
export interface WindowChartProps {
  points: readonly WindowPoint[]
  /** 조치 필요 기준 (분). 기본 50 */
  thresholdMin?: number
}

export function WindowChart({ points, thresholdMin = ACTION_THRESHOLD_MIN }: WindowChartProps) {
  const titleId = useId()
  const n = points.length
  const xTicks = points.map((p) => p.no)
  const hasEvent = points.some((p) => p.eventTag)

  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        감시 창 · 최근 {n}편
      </h4>
      <ChartLegend
        className="mt-2"
        items={[
          { label: '예측', mark: <LegendLine className="bg-chart-predicted" /> },
          { label: '실제', mark: <LegendLine className="bg-chart-actual" /> },
          ...(hasEvent ? [{ label: '이벤트 편', mark: <ChartMarkDot tone="hollow-subtle" /> }] : []),
        ]}
      />
      <div className="mt-2" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: CHART_INITIAL_WIDTH, height: CHART_HEIGHT }}>
          <LineChart
            data={points as WindowPoint[]}
            margin={CHART_MARGIN}
            desc={`최근 ${n}편의 예측 처리 시간과 실제 처리 시간. 기준 ${thresholdMin}분.`}
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="no"
              type="number"
              domain={[1, n]}
              ticks={xTicks}
              allowDecimals={false}
              axisLine={false}
              tickLine={false}
              tickSize={4}
              tickMargin={4}
              height={24}
              padding={{ left: 16, right: 16 }}
              tick={XTick}
            />
            <YAxis
              type="number"
              domain={[20, 70]}
              ticks={[20, 30, 40, 50, 60, 70]}
              axisLine={false}
              tickLine={false}
              tickSize={6}
              tickMargin={2}
              width={Y_AXIS_WIDTH}
              tick={YTick}
            />
            <ReferenceLine y={thresholdMin} stroke="var(--ink-subtle)" strokeWidth={1} zIndex={300} />
            <Tooltip
              content={WindowTooltip}
              cursor={TOOLTIP_CURSOR}
              isAnimationActive={false}
              allowEscapeViewBox={{ x: false, y: true }}
            />
            <Line
              dataKey="predicted"
              name="예측"
              type="linear"
              stroke="var(--chart-predicted)"
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: ACTIVE_DOT_R, fill: 'var(--chart-predicted)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <Line
              dataKey="actual"
              name="실제"
              type="linear"
              stroke="var(--chart-actual)"
              strokeWidth={1.5}
              dot={EventDot}
              activeDot={{ r: ACTIVE_DOT_R, fill: 'var(--chart-actual)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <RightEdgeLabels labels={[{ value: thresholdMin, text: `${thresholdMin}분`, tone: 'signal' }]} />
            <YAxisUnit text="분" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/** 이벤트 편의 실제 점만 ink-subtle 빈 점으로 */
function EventDot(props: { cx?: number; cy?: number; index?: number; payload?: unknown }) {
  const { cx, cy, index, payload } = props
  const key = `event-dot-${index ?? 0}`
  const point = payload as WindowPoint | undefined
  if (cx === undefined || cy === undefined || !point?.eventTag) return <g key={key} />
  return (
    <circle
      key={key}
      cx={cx}
      cy={cy}
      r={MARK_R - HOLLOW_STROKE / 2}
      strokeWidth={HOLLOW_STROKE}
      className="fill-surface-1 stroke-ink-subtle"
    />
  )
}

function WindowTooltip({ active, payload }: TooltipContentProps) {
  const point = active ? (payload?.[0]?.payload as WindowPoint | undefined) : undefined
  if (!point) return null
  return (
    <ChartTooltipBox
      title={
        <>
          <span className="type-mono-sm">{point.flightId}</span>
          <span className="text-ink-subtle"> · </span>
          <span className="type-mono-sm">{point.lineId}</span>
        </>
      }
      rows={[
        { label: '예측', value: <TooltipValue value={point.predicted} unit="분" /> },
        { label: '실제', value: <TooltipValue value={point.actual} unit="분" /> },
        { label: '오차', value: <TooltipValue value={fmtSigned(point.errorMin)} unit="분" /> },
        { label: '마지막 짐', value: <span className="tabular-nums">{fmtClock(point.lastBag)}</span> },
        ...(point.eventTag ? [{ label: '이벤트', value: point.eventTag }] : []),
      ]}
    />
  )
}
