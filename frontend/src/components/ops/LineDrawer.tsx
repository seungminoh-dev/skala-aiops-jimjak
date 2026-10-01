import { useMemo, type ReactNode } from 'react'
import { XIcon } from '@phosphor-icons/react'

import { StatusText } from '@/components/app/StatusText'
import { LineDetailBody } from '@/components/ops/LineDetail'
import { buildDrawerDetail, type DrawerDetail } from '@/components/ops/lineDetailData'
import { Sheet, SheetBody, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import type { LineId } from '@/design/mock'
import { cn } from '@/lib/cn'
import { lineStatus } from '@/lib/format'

/**
 * 라인 상세 서랍 — 타임라인·표·조치 필요 목록·확장 범위 평면도에서 라인을 고르면 오른쪽에서 열린다(폭 480px, 깊이 3단계).
 * 내용 순서: 판단 → 조치(조치 필요 편만) → 같은 수취대 상황 → 근거(접기, 기본 닫힘). LineDetailBody 참고.
 *
 * 비모달로 연다: 서랍이 열린 채로 타임라인의 다른 라인·막대를 누르면 닫지 않고 내용만 바꾼다
 * (data-line-trigger 가 붙은 곳을 누를 때). 그 밖을 누르거나 Esc 면 닫힌다.
 * 닫히는 150ms 동안 내용이 비지 않도록, 연 라인은 open 과 따로 들고 있는다.
 */
export interface LineDrawerTarget {
  lineId: LineId
  /** 고른 편 (막대·행에서 열었을 때) */
  flightId?: string | null
}

export interface LineDrawerProps {
  open: boolean
  target: LineDrawerTarget | null
  onOpenChange: (open: boolean) => void
}

export function LineDrawer({ open, target, onOpenChange }: LineDrawerProps) {
  const detail = useMemo(
    () => (target ? buildDrawerDetail(target.lineId, target.flightId) : null),
    [target],
  )

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
              <LineDetailTitle detail={detail}>
                <SheetTitle className="font-mono">{detail.line.id}</SheetTitle>
              </LineDetailTitle>
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
function LineDetailTitle({ detail, children }: { detail: DrawerDetail; children: ReactNode }) {
  return (
    <div className="flex items-baseline gap-3">
      {children}
      <StatusText status={lineStatus(detail.line.status)} />
    </div>
  )
}

/**
 * 펼친 서랍 견본 — 실제 서랍과 같은 틀(480px, 둥글기 lg, 깊이 3단계, 머리 56px + hairline, 안쪽 20px)을
 * 페이지 흐름 안에 그대로 놓는다. 스크롤 없이 내용 전체를 보인다. 닫기 X 는 모양만.
 * evidenceOpen: 근거를 펼친 채로 보인다 (실제 서랍은 닫힌 채로 열린다).
 */
export function LineDrawerPanel({
  lineId,
  flightId,
  initialAircraft,
  evidenceOpen = false,
  className,
}: {
  lineId: LineId
  flightId?: string | null
  initialAircraft?: string
  evidenceOpen?: boolean
  className?: string
}) {
  const detail = useMemo(() => buildDrawerDetail(lineId, flightId), [lineId, flightId])
  return (
    <div className={cn('relative w-[480px] rounded-lg bg-surface-1 type-body text-ink shadow-depth-3', className)}>
      <div className="flex min-h-[56px] flex-col justify-center gap-1 border-b border-hairline py-3 pr-14 pl-5">
        <LineDetailTitle detail={detail}>
          <h3 className="type-section-title font-mono text-ink">{detail.line.id}</h3>
        </LineDetailTitle>
      </div>
      <span
        aria-hidden
        className="absolute top-3 right-3 inline-flex size-[30px] items-center justify-center rounded-md text-ink-muted"
      >
        <XIcon className="size-4" />
      </span>
      <div className="p-5">
        <LineDetailBody detail={detail} initialAircraft={initialAircraft} evidenceOpen={evidenceOpen} />
      </div>
    </div>
  )
}
