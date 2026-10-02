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

import { ChartLegend, LegendLine, type LegendItem } from '@/components/app/ChartLegend'
import { ChartTooltipBox, TooltipValue } from '@/components/app/ChartTooltipBox'
import { StatusText } from '@/components/app/StatusText'
import {
  ACTIVE_DOT_R,
  CHART_HEIGHT,
  CHART_INITIAL_WIDTH,
  CHART_MARGIN,
  HOLLOW_STROKE,
  MARK_R,
  MARK_RING,
  TOOLTIP_CURSOR,
  Y_AXIS_WIDTH,
} from '@/components/monitoring/chart-config'
import {
  ChartMarkDot,
  RightEdgeLabels,
  TopXLabel,
  XTick,
  YAxisUnit,
  YTick,
} from '@/components/monitoring/chart-parts'
import { batchVerdict } from '@/components/monitoring/helpers'
import type { Batch, ModelVersionId } from '@/design/mock'
import {
  fmtClock,
  fmtDecimal,
  verdictStatus,
  type VerdictInput,
  type VerdictKind,
  type Ymdhm,
} from '@/lib/format'

/**
 * 배치별 MAE — DESIGN.md "차트".
 * x = 배치 순번, y = 창 MAE(분). 선 chart-actual 1.5px.
 * 점은 판정 색: 정상은 생략 · 주의 warning · 알림만 ink-subtle 빈 점 · 재학습(배포) primary · 게이트 불합격 danger · 판정 보류 빈 점.
 * 임계값 chart-threshold 1px 점선 + 오른쪽 끝 "임계값 5.0분" · 게이트 chart-reference 1px 점선 + "게이트 5분".
 * 새 버전 배포는 그 배치에 primary 1px 세로선 + 위에 mono-sm "v2".
 * 배포 세로선 위의 점(재학습 = primary)은 같은 색 선에 묻히므로 흰 테두리 1px 를 둘러 선 위로 띄운다.
 * 범례 점은 차트 점과 같은 4px (ChartMarkDot).
 * y 축은 0부터 그리지 않고 두 기준선과 데이터 둘레로 좁힌다(maeAxis) — 4분대 배치가 납작한 선으로 보이지 않게.
 * 감시 창 차트와 두 칸으로 나란히 놓인다: 제목·범례·그림 영역(높이·여백·y 축 폭)을 chart-config 로 같게 둔다.
 */
export interface BatchMaeChartProps {
  batches: readonly Batch[]
  /** 드리프트 임계값 (분) */
  threshold: number
  /** 게이트 기준 (분) */
  gateMae: number
  consecutiveLimit: number
}

/** 판정 점 범례 — 데이터에 있는 것만 보인다 (정상은 점이 없어 범례에도 없다). 점은 차트 점과 같은 4px */
const VERDICT_LEGEND: ReadonlyArray<LegendItem & { kind: VerdictKind }> = [
  { kind: 'pending', label: '판정 보류', mark: <ChartMarkDot tone="hollow-tertiary" /> },
  { kind: 'warn', label: '주의', mark: <ChartMarkDot tone="warning" /> },
  { kind: 'alert_only', label: '알림만', mark: <ChartMarkDot tone="hollow-subtle" /> },
  { kind: 'retrain_promoted', label: '재학습', mark: <ChartMarkDot tone="primary" /> },
  { kind: 'retrain_rejected', label: '게이트 불합격', mark: <ChartMarkDot tone="danger" /> },
]

interface Datum {
  no: number
  at: Ymdhm
  mae: number
  verdict: VerdictInput
  version: ModelVersionId
  /** 이 배치에 배포 세로선이 있다 — 점에 흰 테두리 */
  onDeployLine: boolean
}

export function BatchMaeChart({ batches, threshold, gateMae, consecutiveLimit }: BatchMaeChartProps) {
  const titleId = useId()
  const data: Datum[] = batches.map((b) => ({
    no: b.no,
    at: b.at,
    mae: b.windowMae,
    verdict: batchVerdict(b, consecutiveLimit),
    version: b.modelVersion,
    onDeployLine: b.deployedVersion !== null,
  }))
  const deploys = batches.filter((b) => b.deployedVersion !== null)
  const last = data[data.length - 1]?.no ?? 1
  const xTicks = data.map((d) => d.no)
  const y = maeAxis(
    data.map((d) => d.mae),
    [gateMae, threshold],
  )

  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        배치별 MAE
      </h4>
      <ChartLegend
        className="mt-2"
        items={[
          { label: '창 MAE', mark: <LegendLine className="bg-chart-actual" /> },
          ...VERDICT_LEGEND.filter((item) => data.some((d) => d.verdict.kind === item.kind)),
        ]}
      />
      <div className="mt-2" style={{ height: CHART_HEIGHT }}>
        <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: CHART_INITIAL_WIDTH, height: CHART_HEIGHT }}>
          <LineChart
            data={data}
            margin={CHART_MARGIN}
            desc={`배치 ${data.length}개의 최근 21편 MAE. 임계값 ${fmtDecimal(threshold)}분, 게이트 ${gateMae}분.`}
          >
            <CartesianGrid vertical={false} stroke="var(--hairline)" />
            <XAxis
              dataKey="no"
              type="number"
              domain={[1, last]}
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
              domain={y.domain}
              ticks={y.ticks}
              axisLine={false}
              tickLine={false}
              tickSize={6}
              tickMargin={2}
              width={Y_AXIS_WIDTH}
              tick={YTick}
            />
            <ReferenceLine y={gateMae} stroke="var(--chart-reference)" strokeWidth={1} strokeDasharray="4 3" zIndex={300} />
            <ReferenceLine y={threshold} stroke="var(--chart-threshold)" strokeWidth={1} strokeDasharray="4 3" zIndex={300} />
            {deploys.map((b) => (
              <ReferenceLine key={b.no} x={b.no} stroke="var(--primary)" strokeWidth={1} zIndex={300} />
            ))}
            <Tooltip
              content={BatchTooltip}
              cursor={TOOLTIP_CURSOR}
              isAnimationActive={false}
              allowEscapeViewBox={{ x: false, y: true }}
            />
            <Line
              dataKey="mae"
              type="linear"
              stroke="var(--chart-actual)"
              strokeWidth={1.5}
              dot={BatchDot}
              activeDot={{ r: ACTIVE_DOT_R, fill: 'var(--chart-actual)', stroke: 'var(--surface-1)', strokeWidth: 2 }}
              isAnimationActive={false}
            />
            <RightEdgeLabels
              labels={[
                { value: threshold, text: `임계값 ${fmtDecimal(threshold)}분` },
                { value: gateMae, text: `게이트 ${gateMae}분` },
              ]}
            />
            {deploys.map((b) => (
              <TopXLabel key={b.no} value={b.no} text={b.deployedVersion ?? ''} />
            ))}
            <YAxisUnit text="분" />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  )
}

/**
 * y 축 범위 — 데이터와 기준선(게이트 5분 · 임계값 5.0분)을 모두 담고 위아래로 0.5분 이상 띄운다.
 * 눈금은 1분 간격, 범위가 6분을 넘으면 2분 간격(눈금 글자 5~7개). 처음 배치 3개(3.9~4.3분)면 3~7분.
 * 컨베이어 고장처럼 MAE 가 크게 뛰면 범위가 따라 넓어진다(위 기준선은 그대로 보인다).
 */
function maeAxis(values: readonly number[], lines: readonly number[]): { domain: [number, number]; ticks: number[] } {
  const lo = Math.min(...values, ...lines) - 0.5
  const hi = Math.max(...values, ...lines) + 0.5
  const step = hi - lo > 6 ? 2 : 1
  const min = Math.max(0, Math.floor(lo / step) * step)
  const max = Math.ceil(hi / step) * step
  const ticks: number[] = []
  for (let v = min; v <= max; v += step) ticks.push(v)
  return { domain: [min, max], ticks }
}

/**
 * 판정 점 — 정상은 그리지 않는다.
 * 배포 세로선 위의 점은 흰 테두리 1px 를 바깥에 두른다: 반지름을 테두리 절반만큼 키우고 선 굵기 1 로 그리면
 * 안쪽 지름 4px 는 그대로, 바깥 1px 만 흰색이 된다.
 */
function BatchDot(props: { cx?: number; cy?: number; index?: number; payload?: unknown }) {
  const { cx, cy, index, payload } = props
  const key = `batch-dot-${index ?? 0}`
  const datum = payload as Datum | undefined
  if (cx === undefined || cy === undefined || !datum) return <g key={key} />

  const ring = datum.onDeployLine
    ? { r: MARK_R + MARK_RING / 2, stroke: 'var(--surface-1)', strokeWidth: MARK_RING }
    : { r: MARK_R }

  switch (datum.verdict.kind) {
    case 'warn':
      return <circle key={key} cx={cx} cy={cy} {...ring} className="fill-warning" />
    case 'alert_only':
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
    case 'retrain_promoted':
      return <circle key={key} cx={cx} cy={cy} {...ring} className="fill-primary" />
    case 'retrain_rejected':
      return <circle key={key} cx={cx} cy={cy} {...ring} className="fill-danger" />
    case 'pending':
      return (
        <circle
          key={key}
          cx={cx}
          cy={cy}
          r={MARK_R - HOLLOW_STROKE / 2}
          strokeWidth={HOLLOW_STROKE}
          className="fill-surface-1 stroke-ink-tertiary"
        />
      )
    case 'ok':
      return <g key={key} />
  }
}

function BatchTooltip({ active, payload }: TooltipContentProps) {
  const datum = active ? (payload?.[0]?.payload as Datum | undefined) : undefined
  if (!datum) return null
  return (
    <ChartTooltipBox
      title={
        <>
          배치 <span className="tabular-nums">{datum.no}</span>
          <span className="text-ink-subtle"> · </span>
          <span className="tabular-nums">{fmtClock(datum.at)}</span>
        </>
      }
      rows={[
        {
          label: '창 MAE',
          value: <TooltipValue value={fmtDecimal(datum.mae)} unit="분" />,
        },
        { label: '판정', value: <StatusText status={verdictStatus(datum.verdict)} className="type-caption" /> },
        { label: '운영 버전', value: <span className="type-mono-sm">{datum.version}</span> },
      ]}
    />
  )
}
