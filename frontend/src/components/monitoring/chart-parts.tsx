import { useLayoutEffect, useRef, useState } from 'react'
import { DefaultZIndexes, usePlotArea, useXAxisScale, useYAxisScale, ZIndexLayer } from 'recharts'

/**
 * 모델 모니터링 차트 공용 조각 — DESIGN.md "차트". recharts 그림 영역 안에 그리는 것만 여기 둔다.
 * 격자 hairline · 축 caption ink-subtle · 채우기·그라데이션·등장 애니메이션 없음.
 * 색은 차트 토큰(chart-actual · chart-predicted · chart-threshold · chart-reference)과 판정 점 색만 쓴다.
 * 범례(ChartLegend)와 툴팁 상자(ChartTooltipBox)는 다른 화면과 같이 쓰므로 components/app 에 있다.
 * 범례의 점 표시만 여기 둔다(ChartMarkDot) — 차트 점과 같은 4px 라서 6px 상태 점(LegendDot)과 다르다.
 */

/* ───────────── 범례 점 (차트 점과 같은 4px) ───────────── */

export type ChartMarkTone = 'warning' | 'primary' | 'danger' | 'hollow-subtle' | 'hollow-tertiary'

const MARK_TONE_CLASS: Record<ChartMarkTone, string> = {
  warning: 'bg-warning',
  primary: 'bg-primary',
  danger: 'bg-danger',
  // 빈 점: 바깥 지름 4px, 테두리 1px — 차트의 r 1.5 + 선 1 과 같은 모양
  'hollow-subtle': 'border border-ink-subtle bg-surface-1',
  'hollow-tertiary': 'border border-ink-tertiary bg-surface-1',
}

/** 범례 점 — 차트 점(MARK_R 2 = 지름 4px)과 같은 크기·모양 */
export function ChartMarkDot({ tone }: { tone: ChartMarkTone }) {
  return <span aria-hidden className={`inline-block size-1 shrink-0 rounded-full ${MARK_TONE_CLASS[tone]}`} />
}

/* ───────────── 축 눈금 글자 (caption ink-subtle, 숫자는 tabular) ───────────── */

interface TickProps {
  x?: number | string
  y?: number | string
  payload?: { value?: unknown }
}

export function XTick({ x, y, payload }: TickProps) {
  return (
    <text x={x} y={y} dy="0.71em" textAnchor="middle" className="type-caption fill-ink-subtle tabular-nums">
      {String(payload?.value ?? '')}
    </text>
  )
}

export function YTick({ x, y, payload }: TickProps) {
  return (
    <text x={x} y={y} dominantBaseline="central" textAnchor="end" className="type-caption fill-ink-subtle tabular-nums">
      {String(payload?.value ?? '')}
    </text>
  )
}

/* ───────────── 기준선 이름 (그림 영역 오른쪽 끝 바깥) ───────────── */

export interface EdgeLabel {
  /** y 값 (분) */
  value: number
  text: string
  /** signal = 노랑 라벨 signal-label (감시 창 "50분" 하나뿐) */
  tone?: 'subtle' | 'signal'
}

/** 수평 기준선의 오른쪽 끝에 이름을 단다: "임계값 6.3분", "게이트 5분", [50분] */
export function RightEdgeLabels({ labels }: { labels: readonly EdgeLabel[] }) {
  const plot = usePlotArea()
  const yScale = useYAxisScale()
  if (!plot || !yScale) return null
  const x = plot.x + plot.width + 8

  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label}>
      <g aria-hidden>
        {labels.map((label) => {
          const y = yScale(label.value)
          if (y === undefined) return null
          return label.tone === 'signal' ? (
            <SignalTag key={label.text} x={x} y={y} text={label.text} />
          ) : (
            <text
              key={label.text}
              x={x}
              y={y}
              dominantBaseline="central"
              className="type-caption fill-ink-subtle tabular-nums"
            >
              {label.text}
            </text>
          )
        })}
      </g>
    </ZIndexLayer>
  )
}

/**
 * SVG 안의 signal-label — signal 면 + on-signal 글자(label 12px 500), 높이 20px, 둥글기 4px, 안쪽 6px.
 * 글자 폭을 재서 면 폭을 맞춘다 (웹 글꼴이 늦게 와도 다시 잰다).
 */
function SignalTag({ x, y, text }: { x: number; y: number; text: string }) {
  const textRef = useRef<SVGTextElement>(null)
  const [textWidth, setTextWidth] = useState(0)

  useLayoutEffect(() => {
    let alive = true
    const measure = () => {
      if (alive && textRef.current) setTextWidth(textRef.current.getComputedTextLength())
    }
    measure()
    void document.fonts?.ready.then(measure)
    return () => {
      alive = false
    }
  }, [text])

  const padX = 6
  return (
    <g>
      <rect x={x} y={y - 10} width={textWidth + padX * 2} height={20} rx={4} className="fill-signal" />
      <text
        ref={textRef}
        x={x + padX}
        y={y}
        dominantBaseline="central"
        className="type-label fill-on-signal tabular-nums"
      >
        {text}
      </text>
    </g>
  )
}

/** 세로 기준선 위 글자 — 배포 세로선 위 mono-sm "v2" (primary-text) */
export function TopXLabel({ value, text }: { value: number; text: string }) {
  const plot = usePlotArea()
  const xScale = useXAxisScale()
  if (!plot || !xScale) return null
  const x = xScale(value)
  if (x === undefined) return null
  return (
    <ZIndexLayer zIndex={DefaultZIndexes.label}>
      <text aria-hidden x={x} y={plot.y - 8} textAnchor="middle" className="type-mono-sm fill-primary-text">
        {text}
      </text>
    </ZIndexLayer>
  )
}

/** y 축 단위 — 눈금 글자 위, 오른쪽 맞춤 ("분") */
export function YAxisUnit({ text }: { text: string }) {
  const plot = usePlotArea()
  if (!plot) return null
  return (
    <text aria-hidden x={plot.x - 8} y={plot.y - 12} textAnchor="end" className="type-caption fill-ink-subtle">
      {text}
    </text>
  )
}
