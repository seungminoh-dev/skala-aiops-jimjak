/**
 * 모델 모니터링 차트 공용 값 — DESIGN.md "차트".
 * 색은 CSS 변수(차트 토큰)로만 넘긴다: chart-actual · chart-predicted · chart-threshold · chart-reference,
 * 배포 세로선 primary, 50분 기준선 ink-subtle, 격자 hairline.
 */

/**
 * 배치별 MAE · 감시 창은 1280px 이상에서 두 칸으로 나란히 놓인다 (DESIGN.md "화면별 순서").
 * 둘이 한 쌍으로 읽히도록 제목(section-title) · 범례(제목 아래 8px) · 그림 영역(높이·여백·y 축 폭)을 이 값으로 같게 둔다.
 * 그러면 두 차트의 y 축이 같은 x, 같은 높이에서 시작하고 끝난다.
 */
export const CHART_HEIGHT = 220
/** 크기를 재기 전 첫 그림의 폭 — 두 칸의 한 칸 폭쯤 */
export const CHART_INITIAL_WIDTH = 640
/** 위: 배포 버전 글자·축 단위 자리 / 오른쪽: 기준선 끝 이름 자리 (두 차트가 같은 폭의 그림 영역을 갖도록 같게 둔다) */
export const CHART_MARGIN = { top: 28, right: 96, bottom: 0, left: 0 } as const
export const Y_AXIS_WIDTH = 36
/** 판정 점·이벤트 점 반지름 — DESIGN.md "배치별 MAE: 점 4px" (지름 4px). 감시 창의 이벤트 점도 같은 크기 */
export const MARK_R = 2
/** 빈 점(알림만·판정 보류·이벤트 편) 테두리 — 바깥 지름 4px 를 지키고 가운데 2px 를 비운다 (6px 상태 점의 1.5px 와 같은 비율) */
export const HOLLOW_STROKE = 1
/** 배포 세로선 위에 놓인 판정 점의 흰 테두리 — 같은 primary 선에 묻히지 않게 점을 선 위로 띄운다 */
export const MARK_RING = 1
/** hover 때 선 위에 보이는 점 반지름 (흰 테두리 2px 를 두른다) — 이전과 같은 크기 */
export const ACTIVE_DOT_R = 3.5
/** 툴팁 커서 — 세로 1px hairline-strong */
export const TOOLTIP_CURSOR = { stroke: 'var(--hairline-strong)', strokeWidth: 1 } as const
