import type { LineDetailView, LineId } from '@/api'
import { StatusText } from '@/components/app/StatusText'
import { LineDetailBody } from '@/components/ops/LineDetail'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { lineStatus } from '@/lib/format'

/**
 * 운영 현황의 라인 상세 서랍 — components/ops/LineDrawer 와 같은 틀(오른쪽 480px, 비모달)이지만
 * 내용은 부모가 api 의 useLine(지금·시각 지정 기준으로 다시 계산한 값)으로 받아 detail 로 넘긴다.
 * (기존 LineDrawer 는 목업 10:30 고정 값을 읽어서 여기서 같은 모양을 다시 조립한다.)
 *
 * - data-line-trigger 가 붙은 곳(타임라인 라인·막대, 표 라인, 조치 필요 행, 평면도)을 누르면 닫지 않고 내용만 바꾼다.
 * - 닫히는 동안 내용이 비지 않도록 부모는 닫을 때 target(→ detail)을 지우지 않는다.
 */
export interface OpsLineTarget {
  lineId: LineId
  /** 고른 편 (막대·행에서 열었을 때) */
  flightId: string | null
}

export function OpsLineDrawer({
  open,
  detail,
  onOpenChange,
}: {
  open: boolean
  /** useLine(target.lineId, target.flightId) — 고른 라인이 없으면 null */
  detail: LineDetailView | null
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Sheet open={open && detail !== null} onOpenChange={onOpenChange} modal={false}>
      <SheetContent
        onInteractOutside={(event) => {
          const el = event.detail.originalEvent.target
          if (el instanceof Element && el.closest('[data-line-trigger]')) event.preventDefault()
        }}
      >
        {detail && (
          <>
            <SheetHeader>
              <DrawerTitle detail={detail} />
            </SheetHeader>
            <SheetBody>
              {/* 라인·편이 바뀌면 가정 시뮬레이터 선택을 처음으로 */}
              <LineDetailBody key={`${detail.line.id}-${detail.focus?.id ?? ''}`} detail={detail} stickyHeader />
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  )
}

/** 서랍 제목 줄: 라인 ID(mono) + 라인 상태 */
function DrawerTitle({ detail }: { detail: LineDetailView }) {
  return (
    <div className="flex items-baseline gap-3">
      <SheetTitle className="font-mono">{detail.line.id}</SheetTitle>
      <StatusText status={lineStatus(detail.line.status)} />
    </div>
  )
}
