import { createElement } from 'react'
import { toast } from 'sonner'
import { RocketLaunchIcon, WarningIcon } from '@phosphor-icons/react'

/**
 * 토스트 — 한 줄, 3초 (Toaster 는 App 루트에 이미 있다). 상태는 점 대신 아이콘으로.
 */

/** 일반 알림: notify('데모를 초기화했습니다') */
export function notify(message: string) {
  toast(message)
}

/** 새 모델 배포·승격 알림 (파란 로켓) */
export function notifyDeploy(message: string) {
  toast(message, { icon: createElement(RocketLaunchIcon, { size: 16, weight: 'fill', className: 'text-blue-700' }) })
}

/** 실패 알림 (빨간 경고) */
export function notifyError(message: string) {
  toast(message, { icon: createElement(WarningIcon, { size: 16, weight: 'bold', className: 'text-red-700' }) })
}
