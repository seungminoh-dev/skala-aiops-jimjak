import { useEffect, useState } from 'react'

import calm from '@/assets/mascot/01_idle_calm.svg'
import reach from '@/assets/mascot/02_reach_for_bag.svg'
import lift from '@/assets/mascot/03_lift_to_chest.svg'
import overhead from '@/assets/mascot/04_lift_overhead.svg'
import walk from '@/assets/mascot/05_overhead_walk.svg'
import carry from '@/assets/mascot/06_carry_overhead.svg'
import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'

/**
 * 조업 인력 마스코트 — DESIGN.md "2. 짐작만의 것 > 마스코트".
 * 원본은 artifacts/jimjak_svg_scenes/ (40×40 칸, 칸 12 단위). 정수 배율로만 그린다: 칸 1px = 40px, 2px = 80px.
 * 쓰는 곳: 사이드바 브랜드 자리(마우스를 올리면 움직임) · 터미널 지도의 T1-07 옆(계속 움직임) · 모델 화면 재학습 중.
 * 그림은 모두 읽지 않는 장식(alt="")이다. 뜻은 옆 글자가 전한다.
 * 원본 1번 장면의 「!」 표시는 작은 크기에서 얼룩처럼 보여 쓰지 않는다(「!」를 지운 평소 자세만 쓴다).
 */

const SCENE_PX = 80
const MARK_PX = 40
const CARRY_FRAMES = [calm, reach, lift, overhead, walk, carry]
const FRAME_MS = 150

/** 사이드바 브랜드 마크 — 칸 1px (40×40px). 평소에는 서 있고, active(마우스 올림)면 짐을 나른다 */
export function MascotMark({ active = false, className }: { active?: boolean; className?: string }) {
  if (active) return <MascotCarry size="sm" className={className} />
  return <img src={calm} width={MARK_PX} height={MARK_PX} alt="" aria-hidden className={cn('pixelated shrink-0', className)} />
}

/** 정수 배율 두 가지: sm = 칸 1px(40px), md = 칸 2px(80px) */
export type MascotSize = 'sm' | 'md'
const SIZE_PX: Record<MascotSize, number> = { sm: MARK_PX, md: SCENE_PX }

/**
 * 조치 필요 숫자판 오른쪽 (운영 현황은 sm 40px).
 * 0편이면 평소 자세(서 있음), 1편 이상이면 가방을 잡으러 몸을 숙인 자세(이제 움직일 때).
 * 시나리오 랩에서는 실행이 끝난 뒤 멈춘 자세로도 쓴다(alert=false).
 */
export function MascotPose({ alert, size = 'md', className }: { alert: boolean; size?: MascotSize; className?: string }) {
  const px = SIZE_PX[size]
  return (
    <img
      src={alert ? reach : calm}
      width={px}
      height={px}
      alt=""
      aria-hidden
      className={cn('pixelated shrink-0', className)}
    />
  )
}

/** 시나리오 랩 실행 중 — 짐을 들어 나르는 6장면 (장면당 150ms). 움직임 줄이기 설정이면 3번 장면 한 장. 끝나면 MascotPose(alert=false)로 멈춘다 */
export function MascotCarry({ size = 'md', className }: { size?: MascotSize; className?: string }) {
  const reduced = useReducedMotion()
  const [frame, setFrame] = useState(0)

  useEffect(() => {
    // 깜빡임 없이 넘기도록 장면을 미리 불러 둔다
    CARRY_FRAMES.forEach((src) => {
      const img = new Image()
      img.src = src
    })
  }, [])

  useEffect(() => {
    if (reduced) return
    const id = window.setInterval(() => setFrame((f) => (f + 1) % CARRY_FRAMES.length), FRAME_MS)
    return () => window.clearInterval(id)
  }, [reduced])

  return (
    <img
      src={reduced ? lift : CARRY_FRAMES[frame]}
      width={SIZE_PX[size]}
      height={SIZE_PX[size]}
      alt=""
      aria-hidden
      className={cn('pixelated shrink-0', className)}
    />
  )
}
