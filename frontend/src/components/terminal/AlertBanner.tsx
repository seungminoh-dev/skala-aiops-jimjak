import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon, WarningIcon } from '@phosphor-icons/react'

import type { TerminalAlert } from '@/api'
import { PAGE_PATH } from '@/app/routes'
import { EASE_OUT, FADE, SPRING } from '@/lib/motion'

/**
 * 상단 고정 배너 — Vercel·GitHub 장애 배너처럼 헤더 바로 아래 빨간 띠. 모든 화면에서 보인다.
 * 열린 알림이 없으면 띠가 접혀 사라진다. 알림 하나를 닫으면 그 항목만 빠지고 나머지가 자리를 메운다.
 */
export function AlertBanner({ alerts }: { alerts: TerminalAlert[] }) {
  return (
    <AnimatePresence initial={false}>
      {alerts.length > 0 && (
        <motion.div
          key="banner"
          role="alert"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="sticky top-14 z-20 overflow-hidden border-b border-red-400 bg-red-100"
        >
          <div className="mx-auto flex h-10 w-full max-w-[1448px] items-center gap-4 px-6">
            <span className="flex shrink-0 items-center gap-2 type-label-14 font-semibold text-red-900">
              <WarningIcon size={16} weight="bold" />
              확인 필요{' '}
              <AnimatePresence mode="popLayout" initial={false}>
                <motion.span
                  key={alerts.length}
                  initial={{ y: 8, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: -8, opacity: 0 }}
                  transition={FADE}
                  className="inline-block num"
                >
                  {alerts.length}
                </motion.span>
              </AnimatePresence>
              건
            </span>
            <span className="flex min-w-0 flex-1 items-center gap-4 overflow-hidden">
              <AnimatePresence initial={false}>
                {alerts.map((a) => (
                  <motion.span
                    key={a.id}
                    layout
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, scale: 0.95 }}
                    transition={SPRING}
                    className="flex shrink-0 items-center gap-1.5 type-label-13 text-red-900"
                  >
                    <span className="type-mono-13 font-medium">{a.carouselId}</span>
                    <span>{a.short}</span>
                  </motion.span>
                ))}
              </AnimatePresence>
            </span>
            <Link to={PAGE_PATH.alerts} className="flex shrink-0 items-center gap-1 type-label-13 font-medium text-red-900 hover:underline">
              모두 보기 <ArrowRightIcon size={14} />
            </Link>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
