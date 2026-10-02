/**
 * 움직임 공통값 — DESIGN.md "움직임". motion/react 와 함께 쓴다.
 * 움직임 줄이기 설정은 App 의 <MotionConfig reducedMotion="user"> 가 한 번에 처리한다.
 */
import type { Transition } from 'motion/react'

/** 빠르게 시작해 부드럽게 멈추는 곡선 (Geist 대화상자·서랍과 같은 결) */
export const EASE_OUT = [0.16, 1, 0.3, 1] as const

/** 자리를 옮기는 움직임 (목록 줄이 빠진 자리 메우기, 활성 표시 미끄러짐) */
export const SPRING: Transition = { type: 'spring', stiffness: 520, damping: 40, mass: 0.8 }

/** 나타나기·사라지기 */
export const FADE: Transition = { duration: 0.22, ease: EASE_OUT }
