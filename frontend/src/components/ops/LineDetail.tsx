import { useId, useState, type ReactNode } from 'react'
import { Bar, CartesianGrid, ComposedChart, Line, Tooltip, XAxis, YAxis } from 'recharts'

import { ChartLegend, LegendLine } from '@/components/app/ChartLegend'
import { ChartTooltipBox, TooltipValue } from '@/components/app/ChartTooltipBox'
import { Figure } from '@/components/app/FigureRow'
import { SignalCell } from '@/components/app/SignalCell'
import { ActionText } from '@/components/ops/ActionText'
import { BaggageTimeline } from '@/components/ops/BaggageTimeline'
import type { DrawerDetail, Overlap, WhatIf } from '@/components/ops/lineDetailData'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { WHATIF_MINUTES_PER_100_SEATS, type Flight, type SequenceStep, type WhatIfOption } from '@/design/mock'
import { cn } from '@/lib/cn'
import {
  ACTION_THRESHOLD_MIN,
  fmtClock,
  fmtSigned,
  fmtSignedMinutes,
  Minutes,
  NumUnit,
  pendingPredictionLabel,
  PENDING_PREDICTION_TEXT,
} from '@/lib/format'

/**
 * 라인 상세 서랍 내용 — 판단 → 조치 → 같은 수취대 상황 → 근거(접기, 기본 닫힘).
 * 서랍 안쪽 폭 440px(480 − 좌우 20px) 기준. 실제 서랍(LineDrawer · OpsLineDrawer)과 펼친 견본(LineDrawerPanel)이 같이 쓴다.
 * 구역은 상자 없이 section-title + hairline 으로 나눈다. 감싼 곳의 좌우 안쪽 여백은 20px 이어야 한다(표·근거가 끝까지 붙는다).
 * 읽는 순서: 예측 처리 시간(가장 강하게) → 예상 마지막 짐 → 그 밖. 세 숫자를 똑같이 강조하지 않는다.
 * 실측과 예측을 섞지 않는다: 예측 값에는 "예측", 완료 편 값에는 "실측", 가정 시뮬레이터 값에는 "가정"을 붙인다.
 */

export interface LineDetailBodyProps {
  detail: DrawerDetail
  /** 가정 시뮬레이터 처음 기종 (기본: 원래 기종) */
  initialAircraft?: string
  /** 근거를 펼친 채로 시작 (기본 닫힘) */
  evidenceOpen?: boolean
  /** 시퀀스 표 머리글을 서랍 스크롤 안에서 고정 */
  stickyHeader?: boolean
}

export function LineDetailBody({ detail, initialAircraft, evidenceOpen = false, stickyHeader = false }: LineDetailBodyProps) {
  return (
    <div>
      <NextPrediction focus={detail.focus} isNext={detail.isNext} />
      {detail.action && (
        <DetailSection title="조치">
          <ActionText item={detail.action} now={detail.now} />
        </DetailSection>
      )}
      <DetailSection title="같은 수취대 상황">
        <SameLine detail={detail} />
      </DetailSection>
      <Evidence defaultOpen={evidenceOpen}>
        <SubBlock title="모델 입력 20편">
          <ModelInputChart steps={detail.sequence} />
          <SequenceTable steps={detail.sequence} stickyHeader={stickyHeader} className="mt-4" />
        </SubBlock>
        <SubBlock title="가정 시뮬레이터">
          <WhatIfSimulator focus={detail.focus} whatIf={detail.whatIf} initialAircraft={initialAircraft} />
        </SubBlock>
      </Evidence>
    </div>
  )
}

/** 서랍 안 구역 — 제목 + 위쪽 hairline (첫 구역은 선 없음) */
export function DetailSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-hairline pt-5 not-first:mt-5 first:border-t-0 first:pt-0">
      <h3 className="type-section-title text-ink">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  )
}

/** 근거 안 작은 묶음 — 제목 body-sm 500 */
function SubBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <h4 className="mb-2 type-body-sm font-medium text-ink">{title}</h4>
      {children}
    </div>
  )
}

/* ───────────── 1. 판단 ───────────── */

/**
 * 판단 — 위에서 아래로 위계를 낮춘다.
 * 1. 편 정보: 편명(mono 14px 500 ink) · 항공사 · 출발지 · 기종 · 좌석 (13px ink-muted, 간격으로 나눈다)
 * 2. 예측 처리 시간(figure-value, 50분 초과면 노랑 칸) + 판단 이유 "기준 50분보다 7분 김" — 가장 강하게
 * 3. 예상 마지막 짐 12:05 (14px 600 ink) — 그다음
 * 4. 착륙 예정 11:08 +8분 (13px ink-muted), 데이터 기준 "10:08 발행 · 예측" · 모델 v2 (12px ink-subtle)
 */
export function NextPrediction({ focus, isNext }: { focus: Flight | null; isNext: boolean }) {
  return (
    <DetailSection title={!focus || isNext ? '다음 편 예측' : '선택한 편 예측'}>
      {focus ? <Judgement flight={focus} /> : <p className="type-body-sm text-ink-muted">남은 도착편이 없습니다</p>}
    </DetailSection>
  )
}

/** "기준 50분보다 7분 김" · "기준 50분보다 9분 짧음" · "기준 50분과 같음" */
function judgementText(minutes: number): string {
  const d = minutes - ACTION_THRESHOLD_MIN
  if (d > 0) return `기준 ${ACTION_THRESHOLD_MIN}분보다 ${d}분 김`
  if (d < 0) return `기준 ${ACTION_THRESHOLD_MIN}분보다 ${-d}분 짧음`
  return `기준 ${ACTION_THRESHOLD_MIN}분과 같음`
}

function Judgement({ flight: f }: { flight: Flight }) {
  const p = f.prediction
  return (
    <>
      <p className="flex flex-wrap items-baseline gap-x-3 type-body-sm text-ink-muted">
        <span className="type-body font-mono font-medium text-ink">{f.id}</span>
        <span>{f.airline.name}</span>
        <span>{f.origin.name}</span>
        <span>
          <span className="font-mono">{f.aircraft}</span> {f.aircraftName}
        </span>
        <NumUnit value={f.seats} unit="석" />
      </p>

      {/* 가장 강하게: 예측 처리 시간 + 판단 이유 */}
      <dl className="mt-4">
        <div>
          <dt className="type-label text-ink-subtle">예측 처리 시간</dt>
          <dd className="mt-1 flex items-baseline gap-3">
            {p ? (
              <>
                <span className="type-figure-value whitespace-nowrap text-ink">
                  <PredictedMinutes minutes={p.minutes} needsAction={f.needsAction} />
                </span>
                <span className="type-body-sm text-ink-muted tabular-nums">{judgementText(p.minutes)}</span>
              </>
            ) : (
              <span className={cn('type-body-sm', PENDING_PREDICTION_TEXT)}>{pendingPredictionLabel(f.predictionIssueAt)}</span>
            )}
          </dd>
        </div>
      </dl>

      {/* 그다음: 예상 마지막 짐(14px 600 ink). 착륙 예정은 그보다 낮게(13px ink-muted) */}
      <dl className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1">
        {p && (
          <div className="flex items-baseline gap-2">
            <dt className="type-label text-ink-subtle">예상 마지막 짐</dt>
            <dd className="type-body font-semibold text-ink tabular-nums">{fmtClock(p.expectedLastBag)}</dd>
          </div>
        )}
        <div className="flex items-baseline gap-2">
          <dt className="type-label text-ink-subtle">{f.landing ? '착륙' : '착륙 예정'}</dt>
          <dd className="type-body-sm text-ink-muted tabular-nums">
            {fmtClock(f.landing ?? f.eta)}
            {!f.landing && f.delayMin !== 0 && (
              <span className="ml-1.5 text-ink-subtle">{fmtSignedMinutes(f.delayMin)}</span>
            )}
          </dd>
        </div>
      </dl>

      {/* 데이터 기준 — 발행 시각은 12px. 가운뎃점은 한 줄에 하나, 모델 버전은 간격으로 */}
      {p && (
        <p className="mt-2 flex flex-wrap gap-x-3 type-caption text-ink-subtle tabular-nums">
          <span>{fmtClock(p.issuedAt)} 발행 · 예측</span>
          <span>
            모델 <span className="font-mono">{p.modelVersion}</span>
          </span>
        </p>
      )}
    </>
  )
}

/**
 * figure-value 크기의 예측 숫자. 50분 초과(조치 필요)면 숫자 칸만 signal 면.
 * 노랑 칸은 안쪽 여백만큼 왼쪽으로 내밀어 숫자 시작을 이름(label)과 맞춘다.
 */
function PredictedMinutes({ minutes, needsAction }: { minutes: number; needsAction: boolean }) {
  if (!needsAction) return <Minutes value={minutes} />
  return <SignalCell value={minutes} size="figure" className="-ml-1.5" />
}

/* ───────────── 3. 같은 수취대 상황 ───────────── */

/**
 * 이 라인의 지금 −1시간 ~ +3시간 — 수취대 타임라인 한 행 크기 조각(라인 이름 칸 없이, 눈금 글자는 1시간마다).
 * 아래에 서랍 편과 처리 시간이 겹치는 편: "앞 편 QW939 · 22분 겹침 (11:18–11:40, 예측)". 없으면 "겹치는 편 없음".
 */
export function SameLine({ detail }: { detail: DrawerDetail }) {
  return (
    <>
      <BaggageTimeline
        lines={[detail.line]}
        flights={detail.lineFlights}
        start={detail.windowStart}
        end={detail.windowEnd}
        now={detail.now}
        tickMinutes={60}
        selectedFlightId={detail.focus?.id ?? null}
        showLabels={false}
      />
      <ul className="mt-3 flex flex-col gap-1 type-body-sm text-ink-muted">
        {detail.overlaps.length > 0 ? (
          detail.overlaps.map((o) => <OverlapLine key={o.flight.id} overlap={o} />)
        ) : (
          <li className="text-ink-subtle">
            {detail.focus?.bar.basis === 'typical' ? '예측 발행 전이라 겹침을 계산하지 않았습니다' : '처리 시간이 겹치는 편 없음'}
          </li>
        )}
      </ul>
    </>
  )
}

function OverlapLine({ overlap: o }: { overlap: Overlap }) {
  return (
    <li className="tabular-nums">
      {o.position === 'before' ? '앞 편' : '뒤 편'} <span className="font-mono text-ink">{o.flight.id}</span>
      <span className="text-ink-tertiary"> · </span>
      <NumUnit value={o.minutes} unit="분" className="text-ink" unitClassName="text-ink-muted" /> 겹침{' '}
      <span className="text-ink-subtle">
        ({fmtClock(o.start)}~{fmtClock(o.end)}, {o.basis === 'actual' ? '실측' : '예측'})
      </span>
    </li>
  )
}

/* ───────────── 4. 근거 (접기) ───────────── */

/**
 * section-title "근거" + 닫혔을 때 내용 이름(caption) + 고스트 "펼치기 / 접기" (글자 버튼, 아이콘 없음).
 * 펼치기는 움직임 규칙 7: grid 행 0fr → 1fr 180ms (index.css disclosure). 누른 제목은 그 자리에 있고 아래만 열린다.
 * - 바깥(disclosure)을 서랍 안쪽 여백만큼 좌우로 넓히고(-mx-5) 안쪽에 px-5 를 줘서,
 *   끝까지 붙는 시퀀스 표와 입력의 포커스 링이 잘리지 않는다.
 * - 안쪽은 overflow-hidden 대신 overflow-clip: 스크롤 상자를 만들지 않아야 시퀀스 표 머리글(sticky)이 서랍 스크롤을 따른다.
 * - 닫힌 동안 안쪽은 inert (포커스·화면 읽기 제외).
 */
function Evidence({ defaultOpen, children }: { defaultOpen: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(defaultOpen)
  const titleId = useId()
  const bodyId = useId()
  return (
    <section aria-labelledby={titleId} className="mt-5 border-t border-hairline pt-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h3 id={titleId} className="type-section-title text-ink">
            근거
          </h3>
          {!open && <span className="truncate type-caption text-ink-subtle">모델 입력 20편 · 가정 시뮬레이터</span>}
        </div>
        <Button
          variant="ghost"
          className="-mr-2.5"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? '접기' : '펼치기'}
        </Button>
      </div>
      <div id={bodyId} className={cn('disclosure -mx-5', open && 'disclosure-open')}>
        <div className="min-h-0 overflow-clip px-5" inert={!open}>
          <div className="flex flex-col gap-6 pt-3">{children}</div>
        </div>
      </div>
    </section>
  )
}

/* ───────────── 모델 입력 20편 차트 ───────────── */

const X_TICKS = [1, 5, 10, 15, 20]
const AXIS_TICK = { fill: 'var(--ink-subtle)', fontSize: 12 }

/**
 * 막대 = 그 편 처리 시간(실측, ink-tertiary, 왼쪽 축 분), 선 = 다음 편 좌석 수(chart-predicted 1.5px, 오른쪽 축 석).
 * 격자 hairline(가로만, 0 선이 x 축 선을 겸한다), 축 caption ink-subtle, 범례는 차트 위 왼쪽 글자,
 * 채우기·그라데이션·등장 애니메이션 없음.
 * 두 축의 눈금 수를 같게 잡아 격자선 하나에 두 축 값이 함께 걸리게 한다.
 */
export function ModelInputChart({ steps }: { steps: SequenceStep[] }) {
  const maxWait = Math.max(...steps.map((s) => s.waitMin))
  const minuteMax = Math.max(60, Math.ceil(maxWait / 20) * 20)
  const minuteTicks = Array.from({ length: minuteMax / 20 + 1 }, (_, i) => i * 20)
  const seatTicks = minuteTicks.map((_, i) => i * 200)
  const seatMax = seatTicks[seatTicks.length - 1]

  return (
    <div>
      <ChartLegend
        items={[
          { label: '처리 시간 (분, 실측)', mark: <span aria-hidden className="size-2 bg-ink-tertiary" /> },
          { label: '다음 편 좌석 (석)', mark: <LegendLine className="bg-chart-predicted" /> },
        ]}
      />
      <div className="mt-2 tabular-nums">
        {/* 폭은 감싼 칸을 따른다 (서랍에 세로 스크롤 막대가 생겨도 넘치지 않게) */}
        <ComposedChart
          responsive
          style={{ width: '100%', height: 168 }}
          data={steps}
          margin={{ top: 6, right: 0, bottom: 0, left: 0 }}
          barCategoryGap="35%"
          aria-label={`모델 입력 ${steps.length}편: 처리 시간과 다음 편 좌석 수`}
        >
          <CartesianGrid yAxisId="minutes" vertical={false} stroke="var(--hairline)" />
          <XAxis
            dataKey="no"
            interval={0}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            tickFormatter={(v: number) => (X_TICKS.includes(v) ? String(v) : '')}
            height={22}
          />
          <YAxis
            yAxisId="minutes"
            domain={[0, minuteMax]}
            ticks={minuteTicks}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={28}
          />
          <YAxis
            yAxisId="seats"
            orientation="right"
            domain={[0, seatMax]}
            ticks={seatTicks}
            tickLine={false}
            axisLine={false}
            tick={AXIS_TICK}
            width={34}
          />
          <Tooltip
            isAnimationActive={false}
            cursor={{ fill: 'var(--surface-2)' }}
            content={(props) => <InputTooltip active={props.active} payload={props.payload} />}
          />
          <Bar yAxisId="minutes" dataKey="waitMin" fill="var(--ink-tertiary)" maxBarSize={12} isAnimationActive={false} />
          <Line
            yAxisId="seats"
            dataKey="nextSeats"
            type="linear"
            stroke="var(--chart-predicted)"
            strokeWidth={1.5}
            dot={false}
            activeDot={{ r: 3, fill: 'var(--chart-predicted)', stroke: 'var(--surface-1)', strokeWidth: 1.5 }}
            isAnimationActive={false}
          />
        </ComposedChart>
      </div>
    </div>
  )
}

function InputTooltip({ active, payload }: { active?: boolean; payload?: ReadonlyArray<{ payload?: unknown }> }) {
  if (!active || !payload?.length) return null
  const step = payload[0].payload as SequenceStep | undefined
  if (!step) return null
  return (
    <ChartTooltipBox
      title={
        <>
          <span className="tabular-nums text-ink-subtle">{step.no}</span> <span className="type-mono-sm">{step.flightId}</span>
          <span className="text-ink-subtle"> · </span>
          <span className="type-mono-sm">{step.aircraft}</span>
        </>
      }
      rows={[
        { label: '처리 시간 (실측)', value: <TooltipValue value={step.waitMin} unit="분" /> },
        { label: '다음 편 좌석', value: <TooltipValue value={step.nextSeats} unit="석" /> },
      ]}
    />
  )
}

/* ───────────── 20칸 시퀀스 표 ───────────── */

/** "202609301252" → 날짜 "09-30" + 시각 "12:52" */
const monthDay = (t: string) => `${t.slice(4, 6)}-${t.slice(6, 8)}`

/**
 * 모델 입력 20편 — 순서(차트 x 와 같다, 1 = 가장 오래된 편) · 편명 · 기종 · 착륙 · 처리 시간(실측) · 다음 편 좌석.
 * 고정 폭 열(table-layout fixed), 서랍 좌우 끝까지 붙는다(-mx-5, 첫·끝 칸 pl-5 / pr-5).
 */
export function SequenceTable({
  steps,
  stickyHeader = false,
  className,
}: {
  steps: SequenceStep[]
  stickyHeader?: boolean
  className?: string
}) {
  return (
    <div className={cn('-mx-5', className)}>
      <Table className="table-fixed">
        <TableHeader sticky={stickyHeader}>
          <TableRow>
            <TableHead className="w-[56px] pl-5 text-right">순서</TableHead>
            <TableHead className="w-[76px]">편명</TableHead>
            <TableHead className="w-[52px]">기종</TableHead>
            <TableHead className="w-[100px]">착륙</TableHead>
            <TableHead className="w-[84px] text-right">처리 시간 (실측)</TableHead>
            <TableHead className="pr-5 text-right">다음 편 좌석</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {steps.map((s) => (
            <TableRow key={s.no}>
              <TableCell className="pl-5 text-right text-ink-subtle tabular-nums">{s.no}</TableCell>
              <TableCell className="font-mono">{s.flightId}</TableCell>
              <TableCell className="font-mono">{s.aircraft}</TableCell>
              <TableCell className="tabular-nums">
                <span className="text-ink-subtle">{monthDay(s.landing)}</span> {fmtClock(s.landing)}
              </TableCell>
              <TableCell className="text-right">
                <Minutes value={s.waitMin} />
              </TableCell>
              <TableCell className="pr-5 text-right">
                <NumUnit value={s.nextSeats} unit="석" />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ───────────── 가정 시뮬레이터 ───────────── */

/**
 * 다음 편 기종을 바꾸면 예측을 다시 계산해 원래 예측과의 차이("+3분")를 보인다. 기종은 좌석 수 표 25종.
 * 모델을 다시 돌린 값이 아니라 근사다 — 숫자 이름에 "가정"을 붙이고 아래 caption 으로 계산 규칙을 밝힌다
 * ("가정 · 좌석 100석당 +4.5분 근사"). 다시 계산한 값이 50분을 넘으면 그 숫자 칸만 signal 면.
 */
export function WhatIfSimulator({
  focus,
  whatIf,
  initialAircraft,
}: {
  focus: Flight | null
  whatIf: WhatIf | null
  initialAircraft?: string
}) {
  const labelId = useId()
  const start =
    initialAircraft && whatIf?.options.some((o) => o.aircraft === initialAircraft)
      ? initialAircraft
      : (whatIf?.baseAircraft ?? '')
  const [aircraft, setAircraft] = useState(start)

  if (!focus) return <p className="type-body-sm text-ink-muted">남은 도착편이 없습니다</p>
  if (!whatIf) {
    return (
      <p className="type-body-sm text-ink-muted">
        <span className="tabular-nums">{fmtClock(focus.predictionIssueAt)}</span>에 예측이 발행되면 계산할 수 있습니다
      </p>
    )
  }

  const option = whatIf.options.find((o) => o.aircraft === aircraft) ?? whatIf.options[0]

  return (
    <>
      <div className="flex flex-col gap-1.5">
        <span id={labelId} className="type-label text-ink-subtle">
          다음 편 기종
        </span>
        <Select value={aircraft} onValueChange={setAircraft}>
          <SelectTrigger aria-labelledby={labelId} className="w-[264px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {whatIf.options.map((o) => (
              <SelectItem key={o.aircraft} value={o.aircraft}>
                <AircraftOption option={o} />
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <dl className="mt-4 flex items-baseline-last gap-8">
        <Figure label="가정 예측">
          <PredictedMinutes minutes={option.minutes} needsAction={option.overThreshold} />
        </Figure>
        <Figure label="원래 예측과 차이">
          <NumUnit value={fmtSigned(option.diffMin)} unit="분" />
        </Figure>
      </dl>

      {/* 가운뎃점은 한 줄에 하나 — 계산 규칙과 원래 예측은 간격으로 나눈다 */}
      <p className="mt-3 flex flex-wrap gap-x-3 type-caption text-ink-subtle tabular-nums">
        <span>가정 · 좌석 100석당 +{WHATIF_MINUTES_PER_100_SEATS}분 근사</span>
        <span>
          원래 예측 {whatIf.baseMinutes}분 (<span className="type-mono-sm">{whatIf.baseAircraft}</span> {whatIf.baseSeats}석)
        </span>
      </p>
    </>
  )
}

function AircraftOption({ option: o }: { option: WhatIfOption }) {
  return (
    <span className="inline-flex items-baseline gap-2">
      <span className="w-8 shrink-0 font-mono">{o.aircraft}</span>
      <span>{o.aircraftName}</span>
      <span className="text-ink-subtle">
        <span className="tabular-nums">{o.seats}</span>석
      </span>
    </span>
  )
}
