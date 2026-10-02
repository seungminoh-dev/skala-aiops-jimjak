import { AnimatePresence, motion } from 'motion/react'

import { cn } from '@/lib/cn'
import { FADE } from '@/lib/motion'

/** 값이 바뀌면 숫자가 위로 밀려 올라가며 바뀐다 (확인 필요 2 → 1 같은 순간) */
export function AnimatedNumber({ value, className }: { value: string | number; className?: string }) {
  return (
    <span className={cn('relative inline-flex overflow-hidden', className)}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={String(value)}
          initial={{ y: '60%', opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: '-60%', opacity: 0 }}
          transition={FADE}
          className="inline-block"
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  )
}
