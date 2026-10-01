import { useNavigate } from 'react-router-dom'
import { ArrowRightIcon, CheckIcon, WarningIcon, XIcon } from '@phosphor-icons/react'

import { closeAlert, useTerminal, type TerminalAlert } from '@/api'
import { PAGE_PATH } from '@/app/routes'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

/**
 * 알림 (터미널 범위) — 확인 필요 | 확인함 두 칸을 나란히. 한 알림은 두 줄:
 *   1줄: 아이콘 · 수취대 · 제목            시각
 *   2줄: 조치 문장                          기준 +13분
 */
export function AlertsPage() {
  const terminal = useTerminal()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">알림</h1>
      <div className="grid grid-cols-2 items-start gap-6">
        <AlertColumn title="확인 필요" alerts={terminal.alerts} open empty="열린 알림이 없어요" />
        <AlertColumn title="확인함" alerts={terminal.closedAlerts} open={false} empty="아직 확인한 알림이 없어요" />
      </div>
    </div>
  )
}

function AlertColumn({ title, alerts, open, empty }: { title: string; alerts: TerminalAlert[]; open: boolean; empty: string }) {
  const navigate = useNavigate()
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className={cn('flex h-8 items-center gap-2 type-label-14 font-medium', open && alerts.length > 0 ? 'text-red-900' : 'text-gray-1000')}>
        {open ? <WarningIcon size={16} weight="bold" /> : <CheckIcon size={16} weight="bold" />}
        {title} <span className="num text-gray-900">{alerts.length}</span>
      </h2>
      {alerts.length === 0 ? (
        <div className="material-base px-4 py-6 text-center type-label-13 text-gray-900">{empty}</div>
      ) : (
        <ul className="material-base divide-y divide-gray-alpha-400">
          {alerts.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-4 py-3">
              {open ? (
                <WarningIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-red-700" aria-hidden />
              ) : (
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-gray-700" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="type-mono-14 font-medium text-gray-1000">{a.carouselId}</span>
                  <span className={cn('min-w-0 flex-1 truncate type-label-14 font-medium', open ? 'text-gray-1000' : 'text-gray-900')}>
                    {a.title}
                  </span>
                  <span className="type-mono-12 num text-gray-900">{fmtClock(a.at)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate type-label-13 text-gray-900" title={a.detail}>
                    {a.detail}
                  </span>
                  {a.badge && <span className={cn('type-label-12 font-medium', open ? 'text-red-900' : 'text-gray-700')}>{a.badge}</span>}
                </div>
              </div>
              {a.to && (
                <button
                  type="button"
                  onClick={() => navigate(PAGE_PATH[a.to!])}
                  aria-label={`${a.carouselId} 자세히`}
                  title="자세히"
                  className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-gray-900 transition-colors hover:bg-gray-alpha-100 hover:text-gray-1000"
                >
                  <ArrowRightIcon size={14} />
                </button>
              )}
              {open && (
                <button
                  type="button"
                  onClick={() => closeAlert(a.id)}
                  aria-label={`${a.carouselId} 알림 확인하고 닫기`}
                  title="확인하고 닫기"
                  className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-gray-900 transition-colors hover:bg-gray-alpha-100 hover:text-gray-1000"
                >
                  <XIcon size={14} />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
