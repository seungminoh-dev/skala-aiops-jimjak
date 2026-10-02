/**
 * T1-03 실제 예측 — 실서버일 때 오늘 편의 예측을 운영 모델(/predict)에서 받는다. 목업이면 쓰지 않는다.
 *
 * 입력은 기획서 ② 예측 흐름 그대로: 예측 시점(도착 예정 1시간 전)까지 마지막 짐 처리가 끝난 편 중 최근 20편.
 * 각 칸은 (그 편 처리 시간, 다음 편 좌석 수) — 마지막 칸의 좌석 수는 예측할 편의 것이다. 아직 처리 중인 편은 넣지 않는다.
 *
 * 받은 값은 (운영 버전, 편)마다 기억한다. 운영 버전이 바뀌면(재학습·승인·되돌림) 새 모델로 다시 받는다.
 * 요청은 한 번에 하나씩 차례로 보낸다 (/predict 응답 시간이 /logs/latency 에 그대로 쌓인다).
 */
import { useSyncExternalStore } from 'react'

import { T103_ROWS, type T103Row } from '@/api/data/t103'
import { request } from '@/api/http'
import type { ModelVersionId, Ymdhm } from '@/api/types'
import { addMinutes } from '@/lib/format'

const SEQ_LEN = 20
const ISSUE_LEAD_MIN = 60

/** 착륙 순서 */
const BY_LANDING = [...T103_ROWS].sort((a, b) => a[4].localeCompare(b[4]))

const cache = new Map<string, number>()
const queued = new Set<string>()
const queue: Array<{ key: string; row: T103Row }> = []
const listeners = new Set<() => void>()
let revision = 0
let working = false

const keyOf = (version: ModelVersionId, row: T103Row) => `${version}|${row[0]}|${row[3]}`

function emit() {
  revision += 1
  for (const listener of listeners) listener()
}

/** 예측 시점에 끝난 편 20칸 (모자라면 null) */
export function sequenceAtIssue(target: T103Row): Array<{ wait_min: number; next_seats: number }> | null {
  const issueAt = addMinutes(target[3] as Ymdhm, -ISSUE_LEAD_MIN)
  const done = BY_LANDING.filter((r) => r[4] < target[4] && r[5] <= issueAt)
  const history = done.slice(-SEQ_LEN)
  if (history.length < SEQ_LEN) return null
  return history.map((h, k) => ({ wait_min: h[6], next_seats: (history[k + 1] ?? target)[2] }))
}

async function work() {
  if (working) return
  working = true
  try {
    while (queue.length > 0) {
      const { key, row } = queue.shift()!
      const sequence = sequenceAtIssue(row)
      if (!sequence) continue
      try {
        const res = await request<{ predicted_wait_min: number }>('/predict', { method: 'POST', body: { sequence } })
        cache.set(key, Math.round(res.predicted_wait_min))
        emit()
      } catch {
        queued.delete(key) // 다음 갱신 때 다시 시도
      }
    }
  } finally {
    working = false
  }
}

/** 오늘(now 의 날짜) 편 중 예측 시점이 지난 편을 받아 둔다 */
export function requestPredictions(now: Ymdhm, version: ModelVersionId) {
  const day = now.slice(0, 8)
  for (const row of T103_ROWS) {
    if (!row[3].startsWith(day) || addMinutes(row[3] as Ymdhm, -ISSUE_LEAD_MIN) > now) continue
    const key = keyOf(version, row)
    if (cache.has(key) || queued.has(key)) continue
    queued.add(key)
    queue.push({ key, row })
  }
  void work()
}

/** 받아 둔 예측 (분). 아직이면 null */
export function livePrediction(version: ModelVersionId, row: T103Row): number | null {
  return cache.get(keyOf(version, row)) ?? null
}

/** 새 예측이 올 때마다 바뀌는 번호 — 화면이 다시 계산하게 */
export function useLivePredictionRevision(): number {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => revision,
  )
}
