import { Link } from 'react-router-dom'
import { ArrowRightIcon, WarningIcon } from '@phosphor-icons/react'

import type { TerminalAlert } from '@/api'
import { PAGE_PATH } from '@/app/routes'

/**
 * 상단 고정 배너 — Vercel·GitHub 장애 배너처럼 헤더 바로 아래 빨간 띠. 모든 화면에서 보인다.
 * 열린 알림이 없으면 그리지 않는다. 누르면 알림 화면으로 간다.
 */
export function AlertBanner({ alerts }: { alerts: TerminalAlert[] }) {
  if (alerts.length === 0) return null
  return (
    <div role="alert" className="sticky top-14 z-20 border-b border-red-400 bg-red-100">
      <div className="mx-auto flex h-10 w-full max-w-[1448px] items-center gap-4 px-6">
        <span className="flex shrink-0 items-center gap-2 type-label-14 font-semibold text-red-900">
          <WarningIcon size={16} weight="bold" />
          확인 필요 <span className="num">{alerts.length}</span>건
        </span>
        <span className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
          {alerts.map((a) => (
            <span key={a.id} className="flex shrink-0 items-center gap-1.5 type-label-13 text-red-900">
              <span className="type-mono-13 font-medium">{a.carouselId}</span>
              <span>{a.short}</span>
            </span>
          ))}
        </span>
        <Link
          to={PAGE_PATH.alerts}
          className="flex shrink-0 items-center gap-1 type-label-13 font-medium text-red-900 hover:underline"
        >
          모두 보기 <ArrowRightIcon size={14} />
        </Link>
      </div>
    </div>
  )
}
