/**
 * T1-03 편 기록 — 서버의 팀 데이터셋 data/normal_2w.csv (GET /scenarios/normal/file) 를 데모 날로 옮겨 쓴다.
 * 시각만 옮긴다(10일 18분 앞으로): 데이터의 10/11 이 데모 날(2026-10-01)이 되고, 그 앞 열흘이 지난 기록이 된다.
 * 18분은 데모 시작(10:30)에 하역 중인 편이 중간쯤이고 다음 편 예측이 이미 나와 있게 맞춘 값이다.
 *
 * 서버에서 읽기 전(연결 끊김)이면 빈 목록이다 — 화면은 편이 없는 것으로 보이고, 다시 붙으면 읽는다.
 * 데이터를 다시 만들면(scripts/generate_data.py) 화면도 그대로 따라간다.
 */
import { useSyncExternalStore } from 'react'

import { parseDatasetCsv } from '@/api/csv'
import { requestText } from '@/api/http'
import type { Ymdhm } from '@/api/types'
import { addMinutes } from '@/lib/format'

/** [편명, 기종 코드, 좌석, 도착 예정(ETA), 착륙, 마지막 짐, 처리 시간(분)] — 파일 순서 그대로 */
export type T103Row = [flightId: string, subtype: string, seats: number, eta: Ymdhm, landing: Ymdhm, lastBag: Ymdhm, waitMin: number]

const SOURCE = '/scenarios/normal/file'
const SHIFT_MIN = -(10 * 24 * 60 + 18)

let rows: readonly T103Row[] = []
let loading: Promise<void> | null = null
const listeners = new Set<() => void>()

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function getLineRows(): readonly T103Row[] {
  return rows
}

export function useLineRows(): readonly T103Row[] {
  return useSyncExternalStore(subscribe, getLineRows)
}

/** 서버에서 한 번 읽는다 (이미 읽었으면 그대로). 실패하면 다음에 부를 때 다시 */
export function loadLineRows(): Promise<void> {
  if (rows.length > 0) return Promise.resolve()
  loading ??= requestText(SOURCE)
    .then((text) => {
      const shift = (t: string) => addMinutes(t, SHIFT_MIN)
      rows = parseDatasetCsv(text).map(
        (r): T103Row => [
          r.flightId,
          r.aircraftSubtype,
          Number(r.seats),
          shift(r.estimatedDatetime),
          shift(r.landingDatetime),
          shift(r.bagLastTime),
          Math.round(Number(r.wait_min)),
        ],
      )
      for (const listener of listeners) listener()
    })
    .finally(() => {
      loading = null
    })
  return loading
}
