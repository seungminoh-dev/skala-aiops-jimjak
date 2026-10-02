/**
 * 실서버(FastAPI) 호출 — liveServer 만 쓴다. 화면은 hooks/actions 로만 서버를 만난다.
 *
 * 주소: 같은 출처가 기본 (FastAPI 가 serving_app/static 으로 이 화면을 내준다).
 *       개발 서버(vite)에서는 vite.config.ts 의 proxy 가 /health · /predict … 를 FastAPI 로 넘긴다.
 *       다른 곳의 서버를 보려면 VITE_API_BASE (예: http://127.0.0.1:8000).
 * 오류: FastAPI 의 {detail} 을 ApiError(status, 글자) 로. detail 이 문자열·객체·422 목록 어느 모양이든 글자 하나로 만든다.
 */
import { ApiError } from '@/api/types'

export const API_BASE: string = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/$/, '') ?? ''

/** FastAPI detail → 화면에 보일 한 줄 */
export function detailText(detail: unknown): string {
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail))
    return detail
      .map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : JSON.stringify(d)))
      .join(' · ')
  if (detail && typeof detail === 'object') {
    const o = detail as Record<string, unknown>
    if (typeof o.status === 'string') return o.status
    return JSON.stringify(detail)
  }
  return '서버 오류'
}

export interface RequestOptions {
  method?: 'GET' | 'POST'
  /** JSON 으로 보낼 값 (FormData 면 그대로) */
  body?: unknown
  /** 기본 15초. 재학습이 붙는 batch-test 는 길게 */
  timeoutMs?: number
}

export async function request<T>(path: string, { method = 'GET', body, timeoutMs = 15_000 }: RequestOptions = {}): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  const isForm = typeof FormData !== 'undefined' && body instanceof FormData
  let res: Response
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: body === undefined || isForm ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : isForm ? (body as FormData) : JSON.stringify(body),
    })
  } catch (e) {
    const aborted = e instanceof DOMException && e.name === 'AbortError'
    throw new ApiError(0, aborted ? '서버 응답이 너무 늦어요' : '서버에 연결할 수 없어요')
  } finally {
    clearTimeout(timer)
  }
  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    data = text
  }
  if (!res.ok) {
    const detail = data && typeof data === 'object' && 'detail' in data ? (data as { detail: unknown }).detail : data
    throw new ApiError(res.status, detailText(detail))
  }
  return data as T
}

/** 글자 그대로 받기 (CSV) */
export async function requestText(path: string, timeoutMs = 15_000): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}${path}`, { signal: controller.signal })
    if (!res.ok) throw new ApiError(res.status, `${path} 를 받지 못했어요`)
    return await res.text()
  } catch (e) {
    if (e instanceof ApiError) throw e
    throw new ApiError(0, '서버에 연결할 수 없어요')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 짐작 FastAPI 서버인지 확인 — /health 가 JSON 으로 답하면(200 ok · 503 not_ready 둘 다) 실서버.
 * 정적 호스팅처럼 HTML 이 오거나 연결이 안 되면 false.
 */
export async function probeServer(timeoutMs = 1_500): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${API_BASE}/health`, { signal: controller.signal })
    if (!(res.headers.get('content-type') ?? '').includes('application/json')) return false
    const body = (await res.json()) as { status?: unknown; detail?: { status?: unknown } }
    return typeof body.status === 'string' || typeof body.detail?.status === 'string'
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}
