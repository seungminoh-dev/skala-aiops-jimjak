import { AnimatePresence, motion } from 'motion/react'
import { CircleNotchIcon, WarningIcon } from '@phosphor-icons/react'

import { useHealth } from '@/api'
import { EASE_OUT } from '@/lib/motion'

/**
 * 첫 실행 안내 띠 — 운영 모델이 아직 없어 서버가 기본 모델(v1)을 학습하는 동안(약 30초) 본문 위에 뜬다.
 * 학습이 끝나면 접혀 사라지고 예측이 바로 나온다. 학습이 실패하면 다시 학습하는 명령을 알려 준다.
 */
export function ModelBanner() {
  const { status, model } = useHealth()
  const show = status === 'connected' && (model === 'training' || model === 'failed')
  return (
    <AnimatePresence initial={false}>
      {show && (
        <motion.div
          key={model}
          role="status"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.3, ease: EASE_OUT }}
          className="overflow-hidden"
        >
          {model === 'training' ? (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-amber-400 bg-amber-100 px-4 py-3 type-label-14 text-amber-900">
              <CircleNotchIcon size={16} className="shrink-0 animate-spin" />
              <span className="font-semibold">기본 모델 학습 중</span>
              <span>처음 실행이라 운영 모델이 없어요. 서버가 기본 데이터로 v1 을 학습하고 있어요 (30초쯤). 끝나면 예측이 바로 나와요.</span>
            </div>
          ) : (
            <div className="mb-4 flex items-center gap-3 rounded-md border border-red-400 bg-red-100 px-4 py-3 type-label-14 text-red-900">
              <WarningIcon size={16} className="shrink-0" />
              <span className="font-semibold">기본 모델 학습 실패</span>
              <span>
                서버 터미널에서 <code className="type-mono-13">python -m serving_app.initialize_model</code> 로 다시 학습한 뒤 서버를 다시 띄워 주세요.
              </span>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  )
}
