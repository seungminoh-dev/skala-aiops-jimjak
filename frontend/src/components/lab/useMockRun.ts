import { useCallback, useEffect, useRef, useState } from 'react'

import type { PipelineRun, PipelineStep, PipelineStepKey, ScenarioId } from '@/design/mock'

/**
 * 시나리오 실행 목업 — 백엔드 없이 단계가 차례로 진행되는 것을 흉내 낸다.
 * 단계마다: 진행 중(primary 점) → 완료. 건너뛸 단계에 닿으면 남은 단계를 한 번에 "건너뜀"으로.
 * 다 끝나면 게이트 검사·기대/결과 줄·로그 꼬리를 한 번에 보인다 (DESIGN.md: 응답이 오면 결과를 한 번에).
 * 회전·맥박 같은 애니메이션은 없다 — 상태 글자만 바뀐다.
 */

/** 단계별 걸리는 시간 (목업, ms). 재학습이 가장 길다 */
const STEP_MS: Record<PipelineStepKey, number> = {
  drift: 600,
  event: 600,
  consecutive: 600,
  retrain: 1800,
  gate: 900,
  deploy: 600,
}
/** 마지막 단계가 끝나고 결과를 보이기까지 */
const SETTLE_MS = 300

interface Frame {
  atMs: number
  steps: PipelineStep[]
  /** 지금까지 보일 로그 꼬리 줄 수 */
  logCount: number
}

function buildFrames(final: PipelineRun): { frames: Frame[]; totalMs: number } {
  const frames: Frame[] = []
  let steps: PipelineStep[] = final.steps.map((s): PipelineStep => ({ ...s, state: 'waiting', result: null }))
  let t = 0
  let completed = 0
  const logCount = () => Math.min(final.logTail.length, completed + 1)

  frames.push({ atMs: 0, steps, logCount: logCount() })
  for (let i = 0; i < final.steps.length; i++) {
    const target = final.steps[i]
    if (target.state !== 'done' && target.state !== 'failed') {
      // 건너뜀 — 여기부터 끝까지 한 번에
      steps = steps.map((s, j) => (j >= i ? final.steps[j] : s))
      frames.push({ atMs: t, steps, logCount: logCount() })
      break
    }
    steps = steps.map((s, j): PipelineStep => (j === i ? { ...target, state: 'running', result: null } : s))
    frames.push({ atMs: t, steps, logCount: logCount() })
    t += STEP_MS[target.key]
    steps = steps.map((s, j) => (j === i ? target : s))
    completed += 1
    frames.push({ atMs: t, steps, logCount: logCount() })
  }
  return { frames, totalMs: t }
}

export interface MockRunState {
  /** 지금 보이는 실행 (진행 중이면 중간 모습) */
  run: PipelineRun
  /** 실행 중인 시나리오 (없으면 null) */
  runningId: ScenarioId | null
  /** 실행 시작. 끝나면 onDone(최종 결과) */
  start: (final: PipelineRun, onDone?: (run: PipelineRun) => void) => void
  /** 처음 모습으로 (데모 초기화) */
  reset: () => void
}

export function useMockRun(initial: PipelineRun): MockRunState {
  const [state, setState] = useState<{ run: PipelineRun; runningId: ScenarioId | null }>({
    run: initial,
    runningId: null,
  })
  const timers = useRef<number[]>([])

  const clear = useCallback(() => {
    for (const id of timers.current) window.clearTimeout(id)
    timers.current = []
  }, [])

  useEffect(() => clear, [clear])

  const start = useCallback(
    (final: PipelineRun, onDone?: (run: PipelineRun) => void) => {
      clear()
      const { frames, totalMs } = buildFrames(final)
      const inProgress = (frame: Frame): PipelineRun => ({
        ...final,
        steps: frame.steps,
        gate: null,
        outcome: null,
        matched: null,
        logTail: final.logTail.slice(0, frame.logCount),
      })

      setState({ run: inProgress(frames[0]), runningId: final.scenarioId })
      for (const frame of frames.slice(1)) {
        timers.current.push(
          window.setTimeout(() => setState({ run: inProgress(frame), runningId: final.scenarioId }), frame.atMs),
        )
      }
      timers.current.push(
        window.setTimeout(() => {
          setState({ run: final, runningId: null })
          onDone?.(final)
        }, totalMs + SETTLE_MS),
      )
    },
    [clear],
  )

  const reset = useCallback(() => {
    clear()
    setState({ run: initial, runningId: null })
  }, [clear, initial])

  return { run: state.run, runningId: state.runningId, start, reset }
}
