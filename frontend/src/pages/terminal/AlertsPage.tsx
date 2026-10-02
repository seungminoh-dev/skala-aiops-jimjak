import { AnimatePresence, LayoutGroup, motion } from 'motion/react'
import { useNavigate } from 'react-router-dom'
import { ArrowRightIcon, CheckIcon, WarningIcon, XIcon } from '@phosphor-icons/react'

import { closeAlert, useTerminal, type TerminalAlert } from '@/api'
import { PAGE_PATH } from '@/app/routes'
import { AnimatedNumber } from '@/components/common/AnimatedNumber'
import { cn } from '@/lib/cn'
import { carouselName, fmtClock } from '@/lib/format'
import { FADE, SPRING } from '@/lib/motion'

/**
 * 알림 (터미널 범위) — 확인 필요 | 확인함 두 칸을 나란히. 한 알림은 두 줄:
 *   1줄: 아이콘 · 수취대 · 제목            시각
 *   2줄: 조치 문장                          기준 +13분
 * X 로 닫으면 그 알림이 오른쪽 "확인함" 칸으로 날아가 자리를 잡는다(같은 layoutId).
 */
export function AlertsPage() {
  const terminal = useTerminal()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">알림</h1>
      <LayoutGroup>
        <div className="grid grid-cols-2 items-start gap-6">
          <AlertColumn title="확인 필요" alerts={terminal.alerts} open empty="열린 알림이 없어요" />
          <AlertColumn title="확인함" alerts={terminal.closedAlerts} open={false} empty="아직 확인한 알림이 없어요" />
        </div>
      </LayoutGroup>
    </div>
  )
}

function AlertColumn({ title, alerts, open, empty }: { title: string; alerts: TerminalAlert[]; open: boolean; empty: string }) {
  const navigate = useNavigate()
  return (
    <section className="flex min-w-0 flex-col gap-2">
      <h2 className={cn('flex h-8 items-center gap-2 type-label-14 font-medium', open && alerts.length > 0 ? 'text-red-900' : 'text-gray-1000')}>
        {open ? <WarningIcon size={16} weight="bold" /> : <CheckIcon size={16} weight="bold" />}
        {title} <AnimatedNumber value={alerts.length} className="num text-gray-900" />
      </h2>
      <motion.ul layout transition={SPRING} className="material-base flex flex-col overflow-hidden">
        <AnimatePresence initial={false} mode="popLayout">
          {alerts.length === 0 && (
            <motion.li key="empty" layout initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="px-4 py-6 text-center type-label-13 text-gray-900">
              {empty}
            </motion.li>
          )}
          {alerts.map((a) => (
            <motion.li
              key={a.id}
              layoutId={a.id}
              layout
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={SPRING}
              className="flex items-start gap-3 border-b border-gray-alpha-400 bg-background-100 px-4 py-3 last:border-b-0"
            >
              {open ? (
                <WarningIcon size={16} weight="bold" className="mt-0.5 shrink-0 text-red-700" aria-hidden />
              ) : (
                <CheckIcon size={16} className="mt-0.5 shrink-0 text-gray-700" aria-hidden />
              )}
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <div className="flex items-center gap-2">
                  <span className="type-label-14 font-semibold text-gray-1000">{carouselName(a.carouselId)}</span>
                  <span className={cn('min-w-0 flex-1 truncate type-label-14 font-medium', open ? 'text-gray-1000' : 'text-gray-900')}>{a.title}</span>
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
                  aria-label={`${carouselName(a.carouselId)} 자세히`}
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
                  aria-label={`${carouselName(a.carouselId)} 알림 확인하고 닫기`}
                  title="확인하고 닫기"
                  className="flex size-6 cursor-pointer items-center justify-center rounded-sm text-gray-900 transition-colors hover:bg-gray-alpha-100 hover:text-gray-1000"
                >
                  <XIcon size={14} />
                </button>
              )}
            </motion.li>
          ))}
        </AnimatePresence>
      </motion.ul>
    </section>
  )
}
