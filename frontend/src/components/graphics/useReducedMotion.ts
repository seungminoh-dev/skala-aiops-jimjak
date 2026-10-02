import { useSyncExternalStore } from 'react'

/**
 * prefers-reduced-motion — DESIGN.md "움직임 규칙".
 * 켜져 있으면 숫자판은 바로 바뀌고, 평면도의 짐은 멈춘 위치에 두고, 마스코트 실행 중 장면은 3번 한 장으로 둔다.
 * 사용자가 시스템 설정을 바꾸면 그 자리에서 따라간다.
 */
const QUERY = '(prefers-reduced-motion: reduce)'

function getQuery(): MediaQueryList | null {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return null
  return window.matchMedia(QUERY)
}

function subscribe(onChange: () => void): () => void {
  const mq = getQuery()
  if (!mq) return () => {}
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}

function getSnapshot(): boolean {
  return getQuery()?.matches ?? false
}

function getServerSnapshot(): boolean {
  return false
}

export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
