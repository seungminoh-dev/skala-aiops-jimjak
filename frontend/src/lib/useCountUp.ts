import { useEffect, useRef, useState } from 'react'

import { useReducedMotion } from '@/components/graphics/useReducedMotion'

/**
 * 숫자가 0(또는 이전 값)에서 목표 값까지 올라가는 움직임 — 큰 숫자 하나에만 쓴다.
 * 움직임 줄이기면 바로 목표 값.
 */
export function useCountUp(target: number | null, durationMs = 700): number | null {
  const reduced = useReducedMotion()
  const [value, setValue] = useState<number | null>(reduced ? target : target === null ? null : 0)
  const from = useRef(0)

  useEffect(() => {
    if (target === null) {
      setValue(null)
      return
    }
    if (reduced) {
      setValue(target)
      return
    }
    const start = performance.now()
    const begin = from.current
    let raf = 0
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / durationMs)
      const eased = 1 - Math.pow(1 - p, 3)
      setValue(Math.round(begin + (target - begin) * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = target
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target, durationMs, reduced])

  return value
}
