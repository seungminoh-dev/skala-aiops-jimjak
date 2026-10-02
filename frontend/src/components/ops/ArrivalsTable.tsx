import { EmptyState } from '@/components/app/EmptyState'
import { ErrorState } from '@/components/app/ErrorState'
import { LoadingRows } from '@/components/app/LoadingRows'
import { SignalCell } from '@/components/app/SignalCell'
import { StatusText } from '@/components/app/StatusText'
import { LineTrigger } from '@/components/ops/LineTrigger'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Flight, LineId } from '@/design/mock'
import { cn } from '@/lib/cn'
import {
  COMPLETED_ROW_TEXT,
  fmtClock,
  fmtSigned,
  fmtSignedMinutes,
  flightStatus,
  Minutes,
  NumUnit,
  pendingPredictionLabel,
  PENDING_PREDICTION_TEXT,
} from '@/lib/format'

/**
 * 도착편 표.
 * - 열: 편명(mono) · 출발지 · 기종(mono) · 라인(mono) · ETA → 착륙 · 상태 · 예측 처리 시간 (기준 50분) · 예상 마지막 짐 · 실제 · 오차.
 * - 1440px 보다 좁으면(1280px) 출발지와 예상 마지막 짐을 숨긴다.
 * - 행 40px, 줄무늬 없음, hover surface-2, 숫자 오른쪽 정렬. 머리글은 위에 고정(sticky).
 * - 50분 초과 예측은 예측 숫자 칸만 signal-cell (완료되면 노랑을 지우고 실제·오차를 보인다).
 * - 완료 편은 점 없이 행 글자 전체가 ink-subtle.
 * - ETA 와 착륙이 다르면 "14:50 → 14:43", 지연은 "+8분".
 * - 열 너비(DESIGN.md "표의 열 너비"·"도착편 표"): 표는 놓인 폭을 다 쓰고 열은 비율로 나눈다(table-layout fixed + %). 빈 열 없음.
 *   편명 9 · 출발지 15 · 기종 7 · 라인 8 · ETA → 착륙 14 · 상태 10 · 예측 처리 시간 13 · 예상 마지막 짐 10 · 실제 7 · 오차 7 (%).
 *   1280px 에서 두 열을 숨기면 남은 열이 같은 비율로 나머지 폭을 나눠 갖는다.
 * - 본문 흰 면 좌우 끝까지 붙는다(-mx-6). 첫 칸 pl-6 · 끝 칸 pr-6 이라 글자는 제목·타임라인과 같은 왼쪽·오른쪽 기준선에 선다.
 */
export interface ArrivalsTableProps {
  flights: Flight[]
  selectedFlightId?: string | null
  onOpenLine?: (lineId: LineId, flightId?: string) => void
  /** 머리글 고정 위치. 기본은 상단 바(52px) 바로 아래 */
  stickyTop?: string
  /** 첫 로딩 · 빈 상태 · 오류 (기본 ready) */
  state?: 'ready' | 'loading' | 'empty' | 'error'
  onRetry?: () => void
}

/** 1440px 보다 좁으면 숨기는 열 */
const WIDE_ONLY = 'max-[1440px]:hidden'

export function ArrivalsTable({
  flights,
  selectedFlightId = null,
  onOpenLine,
  stickyTop = 'top-[52px]',
  state = 'ready',
  onRetry,
}: ArrivalsTableProps) {
  return (
    <div className="-mx-6">
      <Table className="table-fixed">
        <TableHeader sticky className={stickyTop}>
          <TableRow>
            <TableHead className="w-[9%] pl-6">편명</TableHead>
            <TableHead className={cn('w-[15%]', WIDE_ONLY)}>출발지</TableHead>
            <TableHead className="w-[7%]">기종</TableHead>
            <TableHead className="w-[8%]">라인</TableHead>
            <TableHead className="w-[14%]">ETA → 착륙</TableHead>
            <TableHead className="w-[10%]">상태</TableHead>
            <TableHead className="w-[13%] text-right">예측 처리 시간 (기준 50분)</TableHead>
            <TableHead className={cn('w-[10%] text-right', WIDE_ONLY)}>예상 마지막 짐</TableHead>
            <TableHead className="w-[7%] text-right">실제</TableHead>
            <TableHead className="w-[7%] pr-6 text-right">오차</TableHead>
          </TableRow>
        </TableHeader>
        {state === 'ready' && (
          <TableBody>
            {flights.map((f) => (
              <ArrivalRow key={f.id} flight={f} selected={f.id === selectedFlightId} onOpenLine={onOpenLine} />
            ))}
          </TableBody>
        )}
      </Table>
      {/* 첫 로딩 · 빈 상태 · 오류는 머리글 아래 그 자리에 (표 칸 여백에 맞춰 px-6) */}
      {state === 'loading' && <LoadingRows label="도착편 불러오는 중" className="px-6" />}
      {state === 'empty' && <EmptyState className="px-6">이 시각 앞뒤 4시간에 도착편이 없습니다</EmptyState>}
      {state === 'error' && <ErrorState message="도착편을 불러오지 못했습니다" onRetry={onRetry} className="px-6" />}
    </div>
  )
}

function ArrivalRow({
  flight: f,
  selected,
  onOpenLine,
}: {
  flight: Flight
  selected: boolean
  onOpenLine?: (lineId: LineId, flightId?: string) => void
}) {
  const completed = f.status === 'completed'
  const open = onOpenLine ? () => onOpenLine(f.lineId, f.id) : undefined

  return (
    <TableRow
      data-state={selected ? 'selected' : undefined}
      data-line-trigger={open ? '' : undefined}
      onClick={open}
      className={cn(completed && COMPLETED_ROW_TEXT, open && 'cursor-pointer')}
    >
      <TableCell className="pl-6 font-mono">{f.id}</TableCell>
      <TableCell className={WIDE_ONLY}>{f.origin.name}</TableCell>
      <TableCell className="font-mono">{f.aircraft}</TableCell>
      <TableCell>
        {open ? <LineTrigger lineId={f.lineId} onOpen={() => open()} /> : <span className="font-mono">{f.lineId}</span>}
      </TableCell>
      <TableCell className="tabular-nums">
        <EtaLanding flight={f} />
      </TableCell>
      <TableCell>
        <StatusText status={flightStatus(f.status)} alignLabel />
      </TableCell>
      <TableCell className="text-right">
        <PredictionValue flight={f} />
      </TableCell>
      <TableCell className={cn('text-right tabular-nums', WIDE_ONLY)}>
        {f.prediction ? fmtClock(f.prediction.expectedLastBag) : null}
      </TableCell>
      <TableCell className="text-right">{f.actual ? <Minutes value={f.actual.minutes} /> : null}</TableCell>
      <TableCell className="pr-6 text-right">
        {f.actual ? <NumUnit value={fmtSigned(f.actual.errorMin)} unit="분" /> : null}
      </TableCell>
    </TableRow>
  )
}

/** "14:50 → 14:43" · "11:08 +8분" (지연은 ink-subtle) */
function EtaLanding({ flight: f }: { flight: Flight }) {
  return (
    <span className="whitespace-nowrap">
      {fmtClock(f.eta)}
      {f.landing && f.landing !== f.eta && (
        <>
          <span className="mx-0.5 text-ink-subtle">→</span>
          {fmtClock(f.landing)}
        </>
      )}
      {f.delayMin !== 0 && <span className="ml-1.5 text-ink-subtle">{fmtSignedMinutes(f.delayMin)}</span>}
    </span>
  )
}

/** 예측 처리 시간 칸: 50분 초과(조치 필요) = signal-cell · 예측 전 = "10:38 발행 예정"(발행 시각이라 12px) · 그 밖 = 46분 */
function PredictionValue({ flight: f }: { flight: Flight }) {
  if (!f.prediction) {
    return (
      <span className={cn('type-caption', PENDING_PREDICTION_TEXT)}>{pendingPredictionLabel(f.predictionIssueAt)}</span>
    )
  }
  // 노랑 칸의 안쪽 여백만큼 오른쪽으로 내밀어 숫자 끝을 다른 행과 맞춘다
  if (f.needsAction) return <SignalCell value={f.prediction.minutes} className="-mr-1.5" />
  return <Minutes value={f.prediction.minutes} />
}
