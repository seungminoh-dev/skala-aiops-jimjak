import { useLayoutEffect, useRef, useState, type CSSProperties, type Ref } from 'react'

import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'

/**
 * 숫자판 flap-tile — 운영 현황 "조치 필요" 옆, 화면 전체에서 이 한 곳만 쓴다.
 * - 판: board 바탕, 칸마다 둥글기 xs(4px), 안쪽 6px 8px, 칸 가운데 가로 1px board-line(플랩 이음매).
 * - 숫자: KBO hero-value(48px 700). 0 이면 on-board 흰색, 1 이상이면 signal 노랑.
 * - 값이 바뀌면 바뀐 자리만 위 반쪽이 아래로 넘어간다. 자리당 260ms, 바뀐 자리끼리 60ms 씩 늦게 출발.
 *   (앞 130ms: 옛 숫자의 위 반쪽이 이음매까지 접힘 → 뒤 130ms: 새 숫자의 아래 반쪽이 이음매에서 펴짐)
 * - 처음 그릴 때는 넘기지 않는다. prefers-reduced-motion 이면 바로 바뀐다.
 * - 회전은 Web Animations API 로만 한다 (전역 keyframes 를 만들지 않는다).
 */
export interface FlapBoardProps {
  /** 표시할 값 (음수는 0, 자릿수를 넘으면 99 처럼 최댓값) */
  value: number
  /** 자릿수 (기본 2 → "02") */
  digits?: number
  className?: string
}

const FLIP_MS = 260
const STAGGER_MS = 60
/** 칸 높이(60px)의 10배 — 넘어가는 반쪽이 칸 밖으로 1px 남짓만 나오도록 원근을 약하게 준다 */
const PERSPECTIVE: CSSProperties = { perspective: '600px' }
/** 접힐 때는 빨라지고(ease-in) 펴질 때는 느려진다(ease-out) — 실제 플랩이 떨어지는 느낌 */
const EASE_IN = 'cubic-bezier(0.5, 0, 1, 0.6)'
const EASE_OUT = 'cubic-bezier(0, 0.4, 0.5, 1)'

type Tone = 'board' | 'signal'
const TONE_CLASS: Record<Tone, string> = {
  board: 'text-on-board',
  signal: 'text-signal',
}

export function FlapBoard({ value, digits = 2, className }: FlapBoardProps) {
  const safe = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0
  const max = 10 ** digits - 1
  const text = String(Math.min(safe, max)).padStart(digits, '0')
  const tone: Tone = safe > 0 ? 'signal' : 'board'
  const reduced = useReducedMotion()

  // 바뀐 자리끼리만 60ms 씩 늦춘다 (한 자리만 바뀌면 지연 없음). 이전 글자는 렌더 중 상태 보정으로 기억한다.
  const [seen, setSeen] = useState(() => ({ text, delays: Array.from({ length: text.length }, () => 0) }))
  if (seen.text !== text) {
    let order = 0
    const delays = text.split('').map((d, i) => (d !== seen.text[i] ? STAGGER_MS * order++ : 0))
    setSeen({ text, delays })
  }

  return (
    <span role="img" aria-label={`${safe}`} className={cn('inline-flex gap-1', className)}>
      {text.split('').map((digit, i) => (
        <FlapDigit
          key={text.length - i}
          digit={digit}
          tone={tone}
          delay={seen.delays[i] ?? 0}
          animate={!reduced}
        />
      ))}
    </span>
  )
}

/* ───────────────────────── 한 자리 ───────────────────────── */

interface Face {
  digit: string
  tone: Tone
}

interface Flip {
  /** 넘어가기 전 숫자 (옛 위 반쪽 · 옛 아래 반쪽) */
  from: Face
  delay: number
  /** 같은 자리에서 넘김이 겹칠 때 마지막 것만 끝맺는다 */
  key: number
}

function FlapDigit({ digit, tone, delay, animate }: Face & { delay: number; animate: boolean }) {
  const [face, setFace] = useState<Face>({ digit, tone })
  const [flip, setFlip] = useState<Flip | null>(null)
  const topRef = useRef<HTMLSpanElement>(null)
  const bottomRef = useRef<HTMLSpanElement>(null)

  // props 가 바뀌면 렌더 중에 상태를 맞춘다: 숫자가 바뀌었을 때만 넘기고, 색만 바뀌면 그대로 바꾼다.
  if (face.digit !== digit || face.tone !== tone) {
    if (face.digit !== digit) {
      setFlip(animate ? { from: face, delay, key: (flip?.key ?? 0) + 1 } : null)
    }
    setFace({ digit, tone })
  }

  useLayoutEffect(() => {
    if (!flip) return
    const top = topRef.current
    const bottom = bottomRef.current
    if (!top || !bottom || typeof top.animate !== 'function') {
      setFlip(null)
      return
    }
    const half = FLIP_MS / 2
    const fold = top.animate([{ transform: 'rotateX(0deg)' }, { transform: 'rotateX(-90deg)' }], {
      duration: half,
      delay: flip.delay,
      easing: EASE_IN,
      fill: 'forwards',
    })
    const unfold = bottom.animate([{ transform: 'rotateX(90deg)' }, { transform: 'rotateX(0deg)' }], {
      duration: half,
      delay: flip.delay + half,
      easing: EASE_OUT,
      fill: 'both',
    })
    const key = flip.key
    unfold.onfinish = () => setFlip((f) => (f && f.key === key ? null : f))
    return () => {
      fold.cancel()
      unfold.cancel()
    }
  }, [flip])

  return (
    <span className="relative inline-block rounded-xs bg-board" style={PERSPECTIVE}>
      {/* 칸 크기를 정하는 보이지 않는 숫자. KBO 숫자 폭은 0~9 모두 같다 */}
      <span aria-hidden className="invisible block px-2 py-1.5 type-hero-value tabular-nums">
        {face.digit}
      </span>
      {/* 고정된 위 반쪽: 새 숫자 (옛 위 반쪽이 접히면서 드러난다) */}
      <Half pos="top" face={face} />
      {/* 고정된 아래 반쪽: 넘기는 동안은 옛 숫자, 끝나면 새 숫자 */}
      <Half pos="bottom" face={flip ? flip.from : face} />
      {flip && (
        <>
          <Half pos="top" face={flip.from} innerRef={topRef} style={{ transform: 'rotateX(0deg)' }} />
          <Half pos="bottom" face={face} innerRef={bottomRef} style={{ transform: 'rotateX(90deg)' }} />
        </>
      )}
      {/* 플랩 이음매 */}
      <span aria-hidden className="pointer-events-none absolute inset-x-0 top-1/2 z-10 h-px -translate-y-1/2 bg-board-line" />
    </span>
  )
}

/** 숫자의 위 또는 아래 반쪽. 칸 높이의 절반만 보이게 자르고, 안의 숫자는 보이지 않는 숫자와 같은 자리에 둔다 */
function Half({
  pos,
  face,
  innerRef,
  style,
}: {
  pos: 'top' | 'bottom'
  face: Face
  innerRef?: Ref<HTMLSpanElement>
  style?: CSSProperties
}) {
  const isTop = pos === 'top'
  return (
    <span
      ref={innerRef}
      aria-hidden
      style={style}
      className={cn(
        'absolute inset-x-0 h-1/2 overflow-hidden bg-board',
        isTop ? 'top-0 origin-bottom rounded-t-xs' : 'bottom-0 origin-top rounded-b-xs',
      )}
    >
      <span
        className={cn(
          'absolute inset-x-0 block h-[200%] px-2 py-1.5 text-center type-hero-value tabular-nums',
          isTop ? 'top-0' : 'bottom-0',
          TONE_CLASS[face.tone],
        )}
      >
        {face.digit}
      </span>
    </span>
  )
}
