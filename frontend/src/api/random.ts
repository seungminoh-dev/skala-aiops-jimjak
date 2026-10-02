/** 씨앗 난수 — 같은 입력이면 언제나 같은 값 (목업 데이터를 새로 고침해도 흔들리지 않게) */

/** 문자열 → 32비트 씨앗 (FNV-1a) */
export function hashSeed(text: string): number {
  let h = 2166136261
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

/** mulberry32 — 0 이상 1 미만 */
export function seededRandom(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** 문자열 씨앗으로 lo 이상 hi 이하 정수 하나 */
export function seededInt(text: string, lo: number, hi: number): number {
  return lo + Math.floor(seededRandom(hashSeed(text))() * (hi - lo + 1))
}

/** 지정한 시간(ms) 뒤에 풀리는 Promise — 목업 응답 지연 */
export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
