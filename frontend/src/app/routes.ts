/**
 * 경로 — DESIGN.md "5. 화면". HashRouter.
 * 터미널 범위: #/ (Overview) · #/carousels · #/alerts · #/logs
 * 수취대 범위: #/t1-03 (개요) · #/t1-03/scenarios · #/t1-03/monitoring · #/t1-03/models
 */

/** 고객사 (B2B) — 사이드바 맨 위·헤더 첫 칸. 로고는 쓰지 않고 이름만 */
export const TENANT = 'Incheon Airport'

/** 실제로 모델이 돌아가는 수취대 (기획서: 한 라인). 팀 데이터셋(data/*.csv, line_id)과 같다 */
export const LIVE_CAROUSEL = 'T1-03'
export const LIVE_BASE = '/t1-03'

export type PageKey = 'control' | 'carousels' | 'alerts' | 'logs' | 'overview' | 'scenarios' | 'monitoring' | 'models'

export const PAGE_PATH: Record<PageKey, string> = {
  control: '/',
  carousels: '/carousels',
  alerts: '/alerts',
  logs: '/logs',
  overview: LIVE_BASE,
  scenarios: `${LIVE_BASE}/scenarios`,
  monitoring: `${LIVE_BASE}/monitoring`,
  models: `${LIVE_BASE}/models`,
}

export const PAGE_LABEL: Record<PageKey, string> = {
  control: 'Overview',
  carousels: '수취대',
  alerts: '알림',
  logs: '로그',
  overview: '개요',
  scenarios: '시나리오',
  monitoring: '모니터링',
  models: '모델',
}

/** 지금 경로의 화면 */
export function pageOf(pathname: string): PageKey {
  if (pathname.startsWith(`${LIVE_BASE}/scenarios`)) return 'scenarios'
  if (pathname.startsWith(`${LIVE_BASE}/monitoring`)) return 'monitoring'
  if (pathname.startsWith(`${LIVE_BASE}/models`)) return 'models'
  if (pathname.startsWith(LIVE_BASE)) return 'overview'
  if (pathname.startsWith('/carousels')) return 'carousels'
  if (pathname.startsWith('/alerts')) return 'alerts'
  if (pathname.startsWith('/logs')) return 'logs'
  return 'control'
}

/** 범위: 터미널 전체 / 수취대 */
export const scopeOf = (page: PageKey): 'terminal' | 'carousel' =>
  page === 'control' || page === 'carousels' || page === 'alerts' || page === 'logs' ? 'terminal' : 'carousel'

/** 헤더 높이 — 화면 안 sticky 요소는 이 아래(top-14)에 붙인다 */
export const APP_HEADER_PX = 56
