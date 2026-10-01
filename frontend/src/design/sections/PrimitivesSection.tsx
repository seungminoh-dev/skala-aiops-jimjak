import type { ServerStatus } from '@/lib/format'
import { useState, type CSSProperties, type ReactNode } from 'react'
import { ArrowClockwiseIcon, CheckIcon, SidebarSimpleIcon, XIcon } from '@phosphor-icons/react'

import { AppHeader } from '@/components/app/AppHeader'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { EmptyState } from '@/components/app/EmptyState'
import { ErrorState } from '@/components/app/ErrorState'
import { FigureRow } from '@/components/app/FigureRow'
import { LoadingRows } from '@/components/app/LoadingRows'
import { NavTab, NavTabs } from '@/components/app/NavTabs'
import { notify, notifyDeploy } from '@/components/app/notify'
import { Num } from '@/components/app/Num'
import { SignalCell } from '@/components/app/SignalCell'
import { SignalLabel } from '@/components/app/SignalLabel'
import { StatusDot } from '@/components/app/StatusDot'
import { StatusText } from '@/components/app/StatusText'
import { APP_TABS, type AppTab } from '@/components/app/tabs'
import { TimeControl } from '@/components/app/TimeControl'
import { VersionBadge } from '@/components/app/VersionBadge'
import {
  DEMO_RESET_CONFIRM,
  DEMO_RESET_DONE,
  DEMO_RESET_TITLE,
  DemoResetFacts,
} from '@/components/lab/DemoResetFacts'
import { productionSwitchMessage } from '@/components/monitoring/helpers'
import {
  PRODUCTION_SWITCH_CONFIRM,
  PRODUCTION_SWITCH_TITLE,
  ProductionSwitchFacts,
} from '@/components/monitoring/ProductionSwitchFacts'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import {
  demo,
  getFlight,
  lab,
  lineDetail,
  monitoring,
  nextPrediction,
  opsFigureRow,
  seatTable,
  server,
  type Ymdhm,
} from '@/design/mock'
import { Specimen } from '@/design/SheetSection'
import { cn } from '@/lib/cn'
import {
  addMinutes,
  fmtClock,
  fmtDate,
  fmtEtaLanding,
  flightStatus,
  lineStatus,
  pendingPredictionLabel,
  PENDING_PREDICTION_TEXT,
  serverStatus,
  Until,
  verdictStatus,
  type StatusDisplay,
} from '@/lib/format'

/**
 * 기본 부품 — 버튼·입력·선택 상자·세그먼트·시각 제어·상태 표시·노랑 라벨/칸·버전 배지·숫자 표기·
 * 툴팁·확인 대화상자·토스트·빈/로딩/오류·화면 탭·상단 바.
 * 이 파일은 구역 안쪽만 돌려준다. 바깥 틀(제목·구분선)은 DesignPage 의 SheetSection 이 그린다.
 *
 * 상태 견본(hover·포커스·열린 모습)은 정적으로 그린 것이고 inert 로 눌리지 않는다.
 * "동작" 열과 트리거 버튼은 실제 부품이다.
 */

/* ───────────────────────── 견본 틀 ───────────────────────── */

/** 정적 상태 견본 — 눌리지도, 포커스를 받지도 않는다 */
function Still({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div inert className={cn('pointer-events-none', className)}>
      {children}
    </div>
  )
}

/** 강제 hover·포커스 모양 */
const FOCUS_RING = 'outline-2 outline-offset-2 outline-primary'

/** 상태 격자 — 흰 면 좌우 끝까지 hairline, 첫 열은 부품 이름 */
function StateGrid({
  head,
  columns,
  rows,
  template: columnsTemplate,
}: {
  head: string
  columns: readonly string[]
  rows: ReadonlyArray<{ key: string; name: ReactNode; cells: ReactNode[] }>
  /** grid-template-columns (기본: 이름 160px + 상태 열 같은 폭) */
  template?: string
}) {
  const template: CSSProperties = {
    gridTemplateColumns: columnsTemplate ?? `160px repeat(${columns.length}, minmax(0, 1fr))`,
  }
  return (
    <div className="-mx-6">
      <div className="grid h-9 items-center gap-x-6 border-b border-hairline px-6" style={template}>
        <span className="type-label text-ink-subtle">{head}</span>
        {columns.map((c) => (
          <span key={c} className="type-label text-ink-subtle">
            {c}
          </span>
        ))}
      </div>
      {rows.map((row) => (
        <div
          key={row.key}
          className="grid h-14 items-center gap-x-6 border-b border-hairline px-6 last:border-b-0"
          style={template}
        >
          {row.name}
          {row.cells.map((cell, i) => (
            <div key={i} className="flex min-w-0 items-center">
              {cell}
            </div>
          ))}
        </div>
      ))}
    </div>
  )
}

function PartName({ name, code }: { name: string; code: string }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="type-body-sm text-ink">{name}</span>
      <span className="type-mono-sm text-ink-subtle">{code}</span>
    </span>
  )
}

/** 견본 아래 작은 이름 */
function Caption({ children }: { children: ReactNode }) {
  return <span className="type-caption text-ink-subtle">{children}</span>
}

const NONE = <span className="type-body-sm text-ink-subtle">-</span>

/* ───────────────────────── 버튼 ───────────────────────── */

type ButtonVariant = 'default' | 'outline' | 'ghost' | 'destructive' | 'link'

const BUTTONS: ReadonlyArray<{ variant: ButtonVariant; name: string; label: string; hover: string }> = [
  { variant: 'default', name: '주요', label: '업로드', hover: 'bg-primary-hover' },
  { variant: 'outline', name: '보조', label: '실행', hover: 'bg-surface-2' },
  { variant: 'ghost', name: '고스트', label: '전체 보기', hover: 'bg-surface-2 text-ink' },
  { variant: 'destructive', name: '위험', label: '초기화', hover: 'bg-danger-text' },
  { variant: 'link', name: '링크', label: '시나리오 랩으로', hover: 'underline' },
]

function ButtonMatrix() {
  return (
    <StateGrid
      head="변형"
      columns={['기본', 'hover', '포커스', '비활성', '동작']}
      rows={BUTTONS.map((b) => ({
        key: b.variant,
        name: <PartName name={b.name} code={b.variant} />,
        cells: [
          <Still key="d">
            <Button variant={b.variant}>{b.label}</Button>
          </Still>,
          <Still key="h">
            <Button variant={b.variant} className={b.hover}>
              {b.label}
            </Button>
          </Still>,
          <Still key="f">
            <Button variant={b.variant} className={FOCUS_RING}>
              {b.label}
            </Button>
          </Still>,
          <Still key="x">
            <Button variant={b.variant} disabled>
              {b.label}
            </Button>
          </Still>,
          <Button
            key="live"
            variant={b.variant}
            onClick={
              b.variant === 'link'
                ? () => document.getElementById('lab')?.scrollIntoView({ block: 'start' })
                : undefined
            }
          >
            {b.label}
          </Button>,
        ],
      }))}
    />
  )
}

/* ───────────────────────── 아이콘 버튼 · 툴팁 ───────────────────────── */

const ICON_BUTTONS = [
  { label: '닫기', icon: <XIcon /> },
  { label: '새로고침', icon: <ArrowClockwiseIcon /> },
  { label: '라인 상세 열기', icon: <SidebarSimpleIcon className="-scale-x-100" /> },
] as const

function IconButtons() {
  return (
    <div className="flex items-center gap-1">
      {ICON_BUTTONS.map((b) => (
        <Tooltip key={b.label}>
          <TooltipTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={b.label}>
              {b.icon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>{b.label}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** 툴팁 열린 모습 — TooltipContent 와 같은 모양 (흰 바탕 + hairline + 깊이 3단계, caption). 기본 위치는 위, 6px 띄움 */
function TooltipStill() {
  return (
    <Still className="flex w-fit flex-col items-center gap-1.5">
      <span className="w-fit rounded-md border border-border bg-popover px-2 py-1 type-caption text-popover-foreground shadow-depth-3">
        새로고침
      </span>
      <Button variant="ghost" size="icon" className="bg-surface-2 text-ink" aria-label="새로고침">
        <ArrowClockwiseIcon />
      </Button>
    </Still>
  )
}

/* ───────────────────────── 입력 · 선택 상자 ───────────────────────── */

function SeatOption({ aircraft, name, seats }: { aircraft: string; name: string; seats: number }) {
  return (
    <span className="flex items-baseline gap-2">
      <span className="w-7 type-mono text-ink">{aircraft}</span>
      <span className="text-ink">{name}</span>
      <span className="tabular-nums text-ink-subtle">{seats}석</span>
    </span>
  )
}

/** 가정 시뮬레이터의 "다음 편 기종" 선택 상자 (좌석 수 표 25종) */
function SeatSelect({
  value,
  onValueChange,
  disabled,
  className,
}: {
  value?: string
  onValueChange?: (v: string) => void
  disabled?: boolean
  className?: string
}) {
  return (
    <Select value={value} onValueChange={onValueChange} disabled={disabled}>
      <SelectTrigger aria-label="다음 편 기종" className={cn('w-[180px]', className)}>
        <SelectValue placeholder="기종 선택" />
      </SelectTrigger>
      <SelectContent className="max-h-[320px]">
        {seatTable.map((row) => (
          <SelectItem key={row.aircraft} value={row.aircraft}>
            <SeatOption aircraft={row.aircraft} name={row.name} seats={row.seats} />
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function LiveSeatSelect() {
  const [value, setValue] = useState(lineDetail.whatIf.baseAircraft)
  return <SeatSelect value={value} onValueChange={setValue} />
}

function FieldMatrix() {
  const base = lineDetail.whatIf.baseAircraft
  return (
    <StateGrid
      head="부품"
      columns={['기본', 'hover', '포커스', '비활성', '동작']}
      rows={[
        {
          key: 'input',
          name: <PartName name="입력" code="text-input" />,
          cells: [
            <Still key="d">
              <Input aria-label="시각" defaultValue="10:30" className="w-24" />
            </Still>,
            NONE,
            <Still key="f">
              <Input aria-label="시각" defaultValue="10:30" className={cn('w-24', FOCUS_RING)} />
            </Still>,
            <Still key="x">
              <Input aria-label="시각" defaultValue="10:30" disabled className="w-24" />
            </Still>,
            <Input key="live" aria-label="시각" placeholder="HH:MM" inputMode="numeric" className="w-24" />,
          ],
        },
        {
          key: 'select',
          name: <PartName name="선택 상자" code="select" />,
          cells: [
            <Still key="d">
              <SeatSelect value={base} />
            </Still>,
            <Still key="h">
              <SeatSelect value={base} className="bg-surface-2" />
            </Still>,
            <Still key="f">
              <SeatSelect value={base} className={FOCUS_RING} />
            </Still>,
            <Still key="x">
              <SeatSelect value={base} disabled />
            </Still>,
            <LiveSeatSelect key="live" />,
          ],
        },
        {
          key: 'segmented',
          name: <PartName name="세그먼트" code="segmented" />,
          cells: [
            <Still key="d">
              <Segment />
            </Still>,
            <Still key="h">
              <Segment hover />
            </Still>,
            <Still key="f">
              <Segment focus />
            </Still>,
            <Still key="x">
              <Segment disabled />
            </Still>,
            <Segment key="live" live />,
          ],
        },
      ]}
    />
  )
}

/** 선택 상자 열린 목록 — SelectContent·SelectItem 과 같은 모양(트리거 아래 4px). 하나는 hover, 하나는 선택 */
function SelectListStill() {
  const base = lineDetail.whatIf.baseAircraft
  const at = seatTable.findIndex((r) => r.aircraft === base)
  const rows = seatTable.slice(Math.max(0, at - 2), at + 4)
  return (
    <Still className="flex flex-col items-start gap-1">
      <SeatSelect value={base} className="bg-surface-2" />
      <div className="w-fit min-w-[180px] rounded-md border border-border bg-popover p-1 shadow-depth-3">
        {rows.map((r, i) => {
          const selected = r.aircraft === base
          const hovered = i === rows.findIndex((x) => x.aircraft === base) + 1
          return (
            <div
              key={r.aircraft}
              className={cn(
                'relative flex h-[30px] items-center rounded-sm pr-8 pl-2 type-body-sm',
                hovered && 'bg-surface-2',
              )}
            >
              <SeatOption aircraft={r.aircraft} name={r.name} seats={r.seats} />
              {selected && <CheckIcon className="absolute right-2 size-4 text-ink" />}
            </div>
          )
        })}
      </div>
    </Still>
  )
}

/* ───────────────────────── 세그먼트 · 시각 제어 ───────────────────────── */

/**
 * 세그먼트 — surface-3 홈, 선택 칸은 흰 바탕 + hairline 1px. 시각 제어의 "실시간 / 시각 지정".
 * 정적 견본: hover 는 둘째 칸 글자를 ink 로, 포커스는 선택 칸에 링.
 */
function Segment({
  live = false,
  hover = false,
  focus = false,
  disabled = false,
}: {
  live?: boolean
  hover?: boolean
  focus?: boolean
  disabled?: boolean
}) {
  return (
    <Tabs {...(live ? { defaultValue: 'live' } : { value: 'live' })} className="flex-row">
      <TabsList aria-label="시각 기준">
        <TabsTrigger value="live" aria-controls={undefined} disabled={disabled} className={cn(focus && FOCUS_RING)}>
          실시간
        </TabsTrigger>
        <TabsTrigger value="pinned" aria-controls={undefined} disabled={disabled} className={cn(hover && 'text-ink')}>
          시각 지정
        </TabsTrigger>
      </TabsList>
    </Tabs>
  )
}

function TimeControlDemo({ initial }: { initial: Ymdhm | null }) {
  const [value, setValue] = useState<Ymdhm | null>(initial)
  return <TimeControl value={value} onChange={setValue} now={demo.now} />
}

/* ───────────────────────── 상태 표시 대응표 ───────────────────────── */

interface StatusRow {
  group: string
  code: string
  view: ReactNode
  rule: string
}

const text = (s: StatusDisplay) => <StatusText status={s} />

const STATUS_ROWS: StatusRow[] = [
  {
    group: '판정',
    code: 'pending',
    view: text(verdictStatus({ kind: 'pending', windowCount: 13, windowSize: 21 })),
    rule: 'ink-tertiary 빈 점 · 창 21편 미만',
  },
  { group: '판정', code: 'ok', view: text(verdictStatus({ kind: 'ok' })), rule: 'success 점' },
  {
    group: '판정',
    code: 'warn',
    view: text(verdictStatus({ kind: 'warn', consecutive: 1, consecutiveLimit: monitoring.consecutiveLimit })),
    rule: 'warning 점 · 연속 초과 n/2',
  },
  {
    group: '판정',
    code: 'alert_only',
    view: text(verdictStatus({ kind: 'alert_only', eventName: '컨베이어 고장' })),
    rule: 'ink-subtle 점 · 이벤트 이름',
  },
  {
    group: '판정',
    code: 'retrain_promoted',
    view: text(verdictStatus({ kind: 'retrain_promoted', deployedVersion: 'v2' })),
    rule: 'primary 점 · 배포한 버전',
  },
  {
    group: '판정',
    code: 'retrain_rejected',
    view: text(verdictStatus({ kind: 'retrain_rejected', keptVersion: 'v1' })),
    rule: 'danger 점 + danger-text 글자',
  },
  { group: '편', code: 'scheduled', view: text(flightStatus('scheduled')), rule: 'ink-tertiary 빈 점' },
  { group: '편', code: 'landed', view: text(flightStatus('landed')), rule: 'ink-subtle 점' },
  { group: '편', code: 'processing', view: text(flightStatus('processing')), rule: 'ink 점' },
  { group: '편', code: 'completed', view: text(flightStatus('completed')), rule: '점 없음 · 행 글자 ink-subtle' },
  {
    group: '편',
    code: 'prediction = null',
    view: (
      <span className={cn('tabular-nums', PENDING_PREDICTION_TEXT)}>{pendingPredictionLabel(nextPrediction.at)}</span>
    ),
    rule: 'ink-tertiary 글자 · 예측 발행 시각 (ETA 60분 전)',
  },
  {
    group: '편',
    code: 'prediction > 50',
    view: <SignalCell value={getFlight('KE082')?.prediction?.minutes ?? 57} />,
    rule: '예측 숫자 칸만 signal-cell · 완료되면 노랑을 지우고 실제·오차',
  },
  { group: '라인', code: 'normal', view: text(lineStatus('normal')), rule: '점 없음' },
  { group: '라인', code: 'busy', view: text(lineStatus('busy')), rule: 'ink-muted 점' },
  {
    group: '라인',
    code: 'critical',
    view: text(lineStatus('critical')),
    rule: 'signal-label, 이 콘솔의 유일한 색 라벨',
  },
  { group: '서버', code: 'connected', view: text(serverStatus('connected')), rule: 'success 점' },
  {
    group: '서버',
    code: 'disconnected',
    view: text(serverStatus('disconnected')),
    rule: 'danger 점 · 시계 옆 warning-text "10:30 기준"',
  },
]

function StatusMatrix() {
  return (
    <div className="-mx-6">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[136px]" />
          <col className="w-[208px]" />
          <col className="w-[296px]" />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">구분</TableHead>
            <TableHead>값</TableHead>
            <TableHead>표시</TableHead>
            <TableHead className="pr-6">규칙</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {STATUS_ROWS.map((row, i) => {
            const first = i === 0 || STATUS_ROWS[i - 1].group !== row.group
            return (
              <TableRow key={`${row.group}-${row.code}`}>
                <TableCell className="pl-6 text-ink">{first ? row.group : ''}</TableCell>
                <TableCell className="type-mono-sm text-ink-subtle">{row.code}</TableCell>
                <TableCell>{row.view}</TableCell>
                <TableCell className="pr-6 text-ink-muted">{row.rule}</TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

/* ───────────────────────── 노랑 라벨·칸 · 버전 배지 ───────────────────────── */

function Labeled({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <div className="flex flex-col items-start gap-2">
      <div className="flex h-6 items-center gap-2">{children}</div>
      <Caption>{caption}</Caption>
    </div>
  )
}

/* ───────────────────────── 숫자 + 단위 ───────────────────────── */

const KE082 = getFlight('KE082')!
const MM703 = getFlight('MM703')!
const C1396 = getFlight('7C1396')!
const C1302 = getFlight('7C1302')!
const WINDOW_MAE = monitoring.window.reduce((sum, p) => sum + Math.abs(p.errorMin), 0) / monitoring.window.length

const NUMBER_ROWS: ReadonlyArray<{ name: string; view: ReactNode; code: string }> = [
  { name: '처리 시간', view: <Num value={KE082.prediction!.minutes} unit="분" />, code: '<Num value={57} unit="분" />' },
  { name: '편수', view: <Num value={3} unit="편" />, code: '<Num value={3} unit="편" />' },
  {
    name: '남은 시간',
    view: <Until target={KE082.eta} now={demo.now} />,
    code: '<Until target={eta} now={now} />',
  },
  {
    name: '남은 시간 · 1시간 넘음',
    view: <Until target={C1302.eta} now={demo.now} />,
    code: '<Until target={eta} now={now} />',
  },
  { name: '지연', view: <Num value={KE082.delayMin} unit="분" signed />, code: '<Num value={8} unit="분" signed />' },
  {
    name: '오차 (실제 − 예측)',
    view: <Num value={C1396.actual!.errorMin} unit="분" signed />,
    code: '<Num value={-3} unit="분" signed />',
  },
  {
    name: '창 MAE',
    view: <Num value={WINDOW_MAE} digits={1} unit="분" />,
    code: '<Num value={4.19} digits={1} unit="분" />',
  },
  { name: '시각', view: <span className="tabular-nums">{fmtClock(demo.now)}</span>, code: 'fmtClock(t)' },
  {
    name: 'ETA → 착륙',
    view: <span className="tabular-nums">{fmtEtaLanding(MM703.eta, MM703.landing)}</span>,
    code: 'fmtEtaLanding(eta, landing)',
  },
  { name: '날짜', view: <span className="tabular-nums">{fmtDate(demo.now)}</span>, code: 'fmtDate(t)' },
  {
    name: '편명 · 라인 · 기종',
    view: (
      <span className="type-mono">
        {KE082.id} {KE082.lineId} {KE082.aircraft}
      </span>
    ),
    code: 'type-mono',
  },
]

function NumberTable() {
  return (
    <div className="-mx-6">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[200px]" />
          <col className="w-[160px]" />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">표기</TableHead>
            <TableHead className="text-right">견본</TableHead>
            <TableHead className="pr-6">쓰는 법</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {NUMBER_ROWS.map((row) => (
            <TableRow key={row.name}>
              <TableCell className="pl-6 text-ink-muted">{row.name}</TableCell>
              <TableCell className="text-right text-ink">{row.view}</TableCell>
              <TableCell className="pr-6 type-mono-sm text-ink-subtle">{row.code}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ───────────────────────── 확인 대화상자 ───────────────────────── */

const RUN_TOTAL = lab.scenarios.reduce((sum, s) => sum + s.runs, 0)
const V1 = monitoring.versions.find((v) => v.version === 'v1')!
const V2 = monitoring.versions.find((v) => v.version === 'v2')!

/** 실제 화면과 같은 대화상자 — 시나리오 표의 데모 초기화, 모델 버전 표의 Production 전환 */
interface DialogSpec {
  title: string
  confirm: string
  content: ReactNode
  done: string
}

const RESET: DialogSpec = {
  title: DEMO_RESET_TITLE,
  confirm: DEMO_RESET_CONFIRM,
  content: <DemoResetFacts runs={RUN_TOTAL} verdicts={monitoring.batches.length} from={server.modelVersion} to="v1" />,
  done: DEMO_RESET_DONE,
}

const SWITCH: DialogSpec = {
  title: PRODUCTION_SWITCH_TITLE,
  confirm: PRODUCTION_SWITCH_CONFIRM,
  content: <ProductionSwitchFacts from={V2} to={V1} nextPrediction={nextPrediction} />,
  done: productionSwitchMessage(V2.version, V1.version),
}

/** 대화상자 열린 모습 — DialogContent 와 같은 모양 (440px, p-5, 둥글기 12px, 깊이 3단계) */
function DialogStill({ spec }: { spec: DialogSpec }) {
  return (
    <Still>
      <div className="grid w-[440px] gap-4 rounded-lg bg-surface-1 p-5 type-body text-ink shadow-depth-3">
        <div className="type-section-title text-ink">{spec.title}</div>
        <div className="type-body-sm text-ink-muted">{spec.content}</div>
        <div className="flex items-center justify-end gap-2 pt-1">
          <Button variant="outline">취소</Button>
          <Button variant="destructive">{spec.confirm}</Button>
        </div>
      </div>
    </Still>
  )
}

function DialogDemo({ spec, trigger }: { spec: DialogSpec; trigger: string }) {
  return (
    <div className="flex flex-col items-start gap-4">
      <ConfirmDialog
        trigger={<Button variant="ghost">{trigger}</Button>}
        title={spec.title}
        confirmLabel={spec.confirm}
        tone="danger"
        onConfirm={() => notify(spec.done)}
      >
        {spec.content}
      </ConfirmDialog>
      <DialogStill spec={spec} />
    </div>
  )
}

/* ───────────────────────── 토스트 ───────────────────────── */

const DEPLOY_MESSAGE = `${V2.version} 배포 · 운영 버전 ${V1.version} → ${V2.version}`

/** 토스트 모양 — Toaster 의 toast 클래스와 같다 (356px, 높이 40px, 깊이 3단계) */
function ToastStill({ message, deploy = false }: { message: string; deploy?: boolean }) {
  return (
    <Still>
      <div className="flex h-10 w-[356px] items-center gap-2 rounded-md border border-border bg-surface-1 px-3 type-body-sm text-ink shadow-depth-3">
        {deploy && (
          <span className="flex size-4 shrink-0 items-center justify-center">
            <StatusDot tone="primary" />
          </span>
        )}
        <span className="truncate">{message}</span>
      </div>
    </Still>
  )
}

/* ───────────────────────── 빈 · 로딩 · 오류 ───────────────────────── */

function ArrivalHead() {
  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="pl-0">편명</TableHead>
          <TableHead>라인</TableHead>
          <TableHead>상태</TableHead>
          <TableHead className="pr-0 text-right">예측 처리 시간 (기준 50분)</TableHead>
        </TableRow>
      </TableHeader>
    </Table>
  )
}

function RetryDemo() {
  const [loading, setLoading] = useState(false)
  const retry = () => {
    setLoading(true)
    window.setTimeout(() => setLoading(false), 1200)
  }
  return (
    <div className="flex flex-col">
      <ArrivalHead />
      {loading ? (
        <LoadingRows />
      ) : (
        <ErrorState message="도착편을 불러오지 못했습니다" onRetry={retry} />
      )}
    </div>
  )
}

/* ───────────────────────── 화면 탭 · 상단 바 ───────────────────────── */

function NavTabsDemo() {
  const [tab, setTab] = useState<AppTab>('ops')
  return <NavTabs value={tab} onValueChange={setTab} />
}

function HeaderDemo(props: {
  serverStatus: ServerStatus
  now: Ymdhm
  pinnedAt?: Ymdhm
  lastUpdatedAt?: Ymdhm
}) {
  const [tab, setTab] = useState<AppTab>('ops')
  return (
    <div className="-mx-6">
      <AppHeader tab={tab} onTabChange={setTab} modelVersion={server.modelVersion} {...props} />
    </div>
  )
}

/* ───────────────────────── 구역 ───────────────────────── */

export function PrimitivesSection() {
  return (
    <>
      <Specimen name="버튼">
        <ButtonMatrix />
      </Specimen>

      <Specimen name="입력 · 선택 상자 · 세그먼트">
        <FieldMatrix />
      </Specimen>

      <div className="grid grid-cols-3 gap-12">
        <Specimen name="아이콘 버튼">
          <IconButtons />
        </Specimen>
        <Specimen name="툴팁 (열린 모습)">
          <TooltipStill />
        </Specimen>
        <Specimen name="선택 상자 (열린 목록)">
          <SelectListStill />
        </Specimen>
      </div>

      <div className="flex flex-wrap gap-x-12 gap-y-10">
        <Specimen name="시각 제어 · 실시간">
          <TimeControlDemo initial={null} />
        </Specimen>
        <Specimen name="시각 제어 · 시각 지정">
          <TimeControlDemo initial={addMinutes(demo.now, -40)} />
        </Specimen>
      </div>

      <Specimen name="상태 표시 대응표">
        <StatusMatrix />
      </Specimen>

      <div className="grid grid-cols-3 gap-12">
        <Specimen name="노랑 라벨 signal-label">
          <div className="flex gap-8">
            <Labeled caption="라인 상태">
              <SignalLabel />
            </Labeled>
            <Labeled caption="감시 창 기준선 끝">
              <SignalLabel>50분</SignalLabel>
            </Labeled>
          </div>
        </Specimen>
        <Specimen name="노랑 칸 signal-cell">
          <div className="flex gap-8">
            <Labeled caption="표 칸 · 13px">
              <span className="type-body-sm">
                <SignalCell value={KE082.prediction!.minutes} />
              </span>
            </Labeled>
            <Labeled caption="조치 필요 목록 · 15px · 폭 72px">
              <SignalCell value={KE082.prediction!.minutes} size="lg" />
            </Labeled>
          </div>
        </Specimen>
        <Specimen name="버전 배지 version-badge">
          <Labeled caption="운영 버전 · 모델 버전 표">
            <VersionBadge version="v1" />
            <VersionBadge version="v2" />
          </Labeled>
        </Specimen>
      </div>

      <Specimen name="숫자 + 단위">
        <NumberTable />
      </Specimen>

      <div className="grid grid-cols-2 gap-12">
        <Specimen name="숫자 줄 figure-row · 운영 현황">
          <FigureRow items={opsFigureRow} />
        </Specimen>
        <Specimen name="숫자 줄 figure-row · 모델 모니터링">
          <FigureRow items={monitoring.figureRow} />
        </Specimen>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <Specimen name="확인 대화상자 · 데모 초기화">
          <DialogDemo spec={RESET} trigger={DEMO_RESET_TITLE} />
        </Specimen>
        <Specimen name="확인 대화상자 · Production 전환">
          <DialogDemo spec={SWITCH} trigger="Production으로 전환" />
        </Specimen>
      </div>

      <div className="grid grid-cols-2 gap-12">
        <Specimen name="토스트 · 새 모델 배포">
          <div className="flex flex-col items-start gap-4">
            <Button variant="outline" onClick={() => notifyDeploy(DEPLOY_MESSAGE)}>
              배포 알림 띄우기
            </Button>
            <ToastStill message={DEPLOY_MESSAGE} deploy />
          </div>
        </Specimen>
        <Specimen name="토스트 · 일반">
          <div className="flex flex-col items-start gap-4">
            <Button variant="outline" onClick={() => notify(DEMO_RESET_DONE)}>
              일반 알림 띄우기
            </Button>
            <ToastStill message={DEMO_RESET_DONE} />
          </div>
        </Specimen>
      </div>

      <Specimen name="빈 상태">
        <div className="flex flex-col">
          <EmptyState>이 시각 앞뒤 4시간에 도착편이 없습니다</EmptyState>
          <EmptyState>아직 판정 기록이 없습니다. 시나리오 랩에서 실행하면 쌓입니다</EmptyState>
          <EmptyState>
            1시간 안에 조치가 필요한 편은 없습니다 · 다음 예측{' '}
            <span className="tabular-nums">{fmtClock(nextPrediction.at)}</span>{' '}
            <span className="type-mono">{nextPrediction.flightId}</span>
          </EmptyState>
        </div>
      </Specimen>

      <div className="grid grid-cols-2 gap-12">
        <Specimen name="첫 로딩">
          <div className="flex flex-col">
            <ArrivalHead />
            <LoadingRows />
          </div>
        </Specimen>
        <Specimen name="오류">
          <RetryDemo />
        </Specimen>
      </div>

      <Specimen name="화면 탭">
        <StateGrid
          head="부품"
          columns={['기본', 'hover', '선택', '동작']}
          template="160px 160px 160px 160px minmax(0, 1fr)"
          rows={[
            {
              key: 'nav',
              name: <PartName name="탭" code="nav-tab" />,
              cells: [
                <Still key="d">
                  <NavTab tab={APP_TABS[0]} />
                </Still>,
                <Still key="h">
                  <NavTab tab={APP_TABS[0]} className="bg-surface-2 text-ink" />
                </Still>,
                <Still key="s">
                  <NavTab tab={APP_TABS[0]} selected />
                </Still>,
                <NavTabsDemo key="live" />,
              ],
            },
          ]}
        />
      </Specimen>

      <Specimen name="상단 바 app-header · 정상">
        <HeaderDemo serverStatus={server.status} now={demo.now} />
      </Specimen>
      <Specimen name="상단 바 app-header · 시각 지정 중">
        <HeaderDemo serverStatus={server.status} now={demo.now} pinnedAt={addMinutes(demo.now, -40)} />
      </Specimen>
      <Specimen name="상단 바 app-header · 연결 끊김">
        <HeaderDemo serverStatus="disconnected" now={addMinutes(demo.now, 2)} lastUpdatedAt={server.lastUpdatedAt} />
      </Specimen>
    </>
  )
}
