import { ArrowCounterClockwiseIcon, DatabaseIcon, PlugsConnectedIcon, PlugsIcon } from '@phosphor-icons/react'

import { LIVE_CAROUSEL, PAGE_LABEL, scopeOf, TENANT, type PageKey } from '@/app/routes'
import { actions, reopenAllAlerts, useDemoClock, useHealth } from '@/api'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { Button } from '@/components/ui/button'
import { fmtClock } from '@/lib/format'

/**
 * 헤더 56px — DESIGN.md "4. 배치" · "6. 데모 조작".
 * 왼쪽: 위치. 오른쪽: 데모 시각 · 초기화 · 데이터 상태.
 */
export function Header({ page }: { page: PageKey }) {
  const clock = useDemoClock()
  const health = useHealth()
  const scope = scopeOf(page)

  return (
    <header className="sticky top-0 z-20 flex h-14 items-center justify-between gap-4 border-b border-gray-100 bg-background-200 px-6">
      <nav aria-label="위치" className="flex min-w-0 items-center gap-2 type-label-14">
        <span className="text-gray-900">{TENANT}</span>
        <Slash />
        {scope === 'carousel' && (
          <>
            <span className="flex items-center gap-1.5 text-gray-900">
              <span className="type-mono-14">{LIVE_CAROUSEL}</span> 수취대
            </span>
            <Slash />
          </>
        )}
        <span className="font-medium text-gray-1000">{PAGE_LABEL[page]}</span>
      </nav>

      <div className="flex items-center gap-3">
        <span className="type-label-13 text-gray-900">
          데모 시각 <span className="type-mono-14 num text-gray-1000">{fmtClock(clock.now)}</span>
        </span>
        <ConfirmDialog
          trigger={
            <Button variant="outline" size="sm">
              <ArrowCounterClockwiseIcon />
              초기화
            </Button>
          }
          title="데모 초기화"
          confirmLabel="초기화"
          tone="danger"
          onConfirm={() => {
            reopenAllAlerts()
            void actions.resetDemo()
          }}
        >
          <p className="type-copy-14 text-gray-900">시나리오로 쌓인 기록과 닫은 알림을 되돌리고 처음 상태로 돌아갑니다.</p>
        </ConfirmDialog>
        <DataStatus status={health.status} />
      </div>
    </header>
  )
}

function Slash() {
  return (
    <span aria-hidden className="text-gray-500">
      /
    </span>
  )
}

function DataStatus({ status }: { status: 'connected' | 'disconnected' | 'mock' }) {
  if (status === 'connected')
    return (
      <span className="flex items-center gap-1.5 type-label-13 text-gray-900">
        <PlugsConnectedIcon size={16} className="text-green-900" />
        API 연결됨
      </span>
    )
  if (status === 'disconnected')
    return (
      <span className="flex items-center gap-1.5 type-label-13 text-red-900">
        <PlugsIcon size={16} />
        연결 끊김
      </span>
    )
  return (
    <span className="flex items-center gap-1.5 type-label-13 text-gray-900">
      <DatabaseIcon size={16} />
      목업 데이터
    </span>
  )
}
