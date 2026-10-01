import { ApiError } from '@/api'

/** 실패 사유 한 줄 — 서버가 준 detail 문장 그대로, 그 밖의 오류는 기본 문장 */
export function errorText(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.detail : fallback
}
