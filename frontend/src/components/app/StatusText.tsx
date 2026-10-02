import { StatusDot } from '@/components/app/StatusDot'
import { SignalLabel } from '@/components/app/SignalLabel'
import { cn } from '@/lib/cn'
import type { StatusDisplay } from '@/lib/format'

/**
 * 상태 = 점 + 글자 (DESIGN.md "상태 표시 대응표"). 글자는 body-sm, 색은 status.textClass(기본 ink-muted).
 * 상태 값은 lib/format 의 헬퍼로 만든다 — 대응표와 글자가 어긋나지 않게:
 *   <StatusText status={flightStatus('processing')} />          ● 처리 중
 *   <StatusText status={verdictStatus({ kind: 'warn', consecutive: 1 })} />   ● 주의 1/2
 *   <StatusText status={lineStatus('critical')} />              [조치 필요] (signal-label, 점 없음)
 *   <StatusText status={serverStatus('disconnected')} />       ● 연결 끊김
 *
 * 점은 inline 이라 표 칸의 기준선 정렬을 그대로 따른다. 같은 정보를 색·아이콘·배지로 반복하지 않는다.
 * 글자 안 숫자(13/21, 1/2)는 tabular-nums.
 */
export interface StatusTextProps {
  status: StatusDisplay
  /**
   * 점 없는 상태(완료·원활)도 점 자리(12px)만큼 비워 글자 시작을 맞춘다.
   * 한 열에 점 있는 상태와 없는 상태가 섞이는 표에서 켠다.
   */
  alignLabel?: boolean
  className?: string
}

export function StatusText({ status, alignLabel = false, className }: StatusTextProps) {
  if (status.signalLabel) return <SignalLabel className={className}>{status.label}</SignalLabel>

  return (
    <span className={cn('type-body-sm whitespace-nowrap tabular-nums', status.textClass, className)}>
      {status.dot !== 'none' ? (
        <StatusDot tone={status.dot} className="mr-1.5" />
      ) : (
        alignLabel && <span aria-hidden className="inline-block w-3" />
      )}
      {status.label}
    </span>
  )
}
