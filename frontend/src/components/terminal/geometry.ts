/**
 * 수취대 고리(경기장 트랙 모양) 기하 — 2D 지도와 3D 지도가 같이 쓴다.
 * 위 꼭짓점에서 시작해 시계 방향으로 한 바퀴 돈다.
 */
export interface Stadium {
  cx: number
  cy: number
  /** 반지름 (= 폭의 절반) */
  r: number
  /** 위·아래 반원 중심 사이 거리의 절반 */
  s: number
}

export function stadium(cx: number, cy: number, w: number, h: number): Stadium {
  const r = w / 2
  return { cx, cy, r, s: h / 2 - r }
}

export function stadiumPath({ cx, cy, r, s }: Stadium): string {
  return [
    `M${cx} ${cy - s - r}`,
    `A${r} ${r} 0 0 1 ${cx + r} ${cy - s}`,
    `L${cx + r} ${cy + s}`,
    `A${r} ${r} 0 0 1 ${cx - r} ${cy + s}`,
    `L${cx - r} ${cy - s}`,
    `A${r} ${r} 0 0 1 ${cx} ${cy - s - r}`,
    'Z',
  ].join(' ')
}

/** 길 위의 점과 진행 방향(도). t 는 0~1 */
export function pointOnStadium({ cx, cy, r, s }: Stadium, t: number): { x: number; y: number; angle: number } {
  const quarter = (Math.PI * r) / 2
  const straight = 2 * s
  const half = Math.PI * r
  const total = 2 * straight + 2 * half
  let d = (((t % 1) + 1) % 1) * total
  const onArc = (ox: number, oy: number, from: number, len: number) => {
    const a = from + len / r
    return { x: ox + r * Math.cos(a), y: oy + r * Math.sin(a), angle: (a * 180) / Math.PI + 90 }
  }
  if (d < quarter) return onArc(cx, cy - s, -Math.PI / 2, d)
  d -= quarter
  if (d < straight) return { x: cx + r, y: cy - s + d, angle: 90 }
  d -= straight
  if (d < half) return onArc(cx, cy + s, 0, d)
  d -= half
  if (d < straight) return { x: cx - r, y: cy + s - d, angle: -90 }
  d -= straight
  return onArc(cx, cy - s, Math.PI, d)
}

/* ───────────────────────── 터미널 배치 (실제 API 기준 번호, 위치는 개념도) ───────────────────────── */

export type TerminalId = 'T1' | 'T2'

export interface CarouselSlot {
  /** "T1-07" */
  id: string
  terminal: TerminalId
  number: number
  /** 실제로 모델이 도는 수취대 (T1-07) */
  live: boolean
}

export const TERMINAL_NAME: Record<TerminalId, string> = {
  T1: '제1여객터미널',
  T2: '제2여객터미널',
}

const RANGE: Record<TerminalId, readonly [number, number]> = { T1: [3, 21], T2: [2, 19] }

const pad2 = (n: number) => String(n).padStart(2, '0')

export function buildTerminals(liveId: string): Array<{ terminal: TerminalId; slots: CarouselSlot[] }> {
  return (['T1', 'T2'] as const).map((terminal) => {
    const [from, to] = RANGE[terminal]
    const slots: CarouselSlot[] = []
    for (let n = from; n <= to; n++) {
      const id = `${terminal}-${pad2(n)}`
      slots.push({ id, terminal, number: n, live: id === liveId })
    }
    return { terminal, slots }
  })
}
