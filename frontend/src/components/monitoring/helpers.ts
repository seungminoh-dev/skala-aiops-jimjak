/**
 * 모델 모니터링·시나리오 랩 공용 표기 헬퍼.
 * 상태 글자·점은 lib/format 의 verdictStatus 로 만든다 — 여기서는 입력 모양만 맞춘다.
 */
import type { Batch } from '@/design/mock'
import { fmtClock, type VerdictInput, type Ymdhm } from '@/lib/format'

/** "202609281430" → "09-28 14:30" (날짜가 섞이는 표: 모델 버전·게이트 이력) */
export function fmtMonthDayClock(t: Ymdhm): string {
  return `${t.slice(4, 6)}-${t.slice(6, 8)} ${fmtClock(t)}`
}

/** 기준 날짜와 같은 날이면 "10:15", 다른 날이면 "09-30 16:38" */
export function fmtClockOrDate(t: Ymdhm, today: Ymdhm): string {
  return t.slice(0, 8) === today.slice(0, 8) ? fmtClock(t) : fmtMonthDayClock(t)
}

/** 배치 한 번 → verdictStatus 입력. 창이 덜 찼으면(21편 미만) 판정 보류 */
export function batchVerdict(batch: Batch, consecutiveLimit: number): VerdictInput {
  return {
    kind: batch.windowCount < batch.windowSize ? 'pending' : batch.verdict,
    windowCount: batch.windowCount,
    windowSize: batch.windowSize,
    consecutive: batch.consecutive,
    consecutiveLimit,
    eventName: batch.eventName,
    deployedVersion: batch.deployedVersion,
    keptVersion: batch.keptVersion,
  }
}

/** 운영 버전 전환 뒤 토스트: "운영 버전 v2 → v1" */
export function productionSwitchMessage(from: string, to: string): string {
  return `운영 버전 ${from} → ${to}`
}
