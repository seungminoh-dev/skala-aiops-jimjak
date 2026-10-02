/**
 * 데이터셋 틀 CSV(11컬럼) 읽기 · 요약 — 목업 서버와 실서버 어댑터가 같이 쓴다.
 * 서버(/data/upload)와 같은 검사: 11컬럼(대소문자 무시)이 다 있어야 하고, 41행 이상이어야 한다.
 */
import { toCsvRow } from '@/api/scenarioData'
import { ApiError, type CsvRow, type DatasetSummary, type Ymdhm } from '@/api/types'
import { csvColumns } from '@/design/mock'

/** 업로드 최소 행 수 = 시퀀스 20 + 창 21 (서버 MIN_ROWS 와 같다) */
export const MIN_UPLOAD_ROWS = 20 + 21

const round1 = (n: number) => Math.round(n * 10) / 10

function splitCsvLine(line: string): string[] {
  return line.split(',').map((cell) => cell.trim().replace(/^"|"$/g, ''))
}

function median(sorted: readonly number[]): number {
  if (sorted.length === 0) return 0
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : round1((sorted[mid - 1] + sorted[mid]) / 2)
}

/** CSV 글자 → 행 (11컬럼 순서로). 컬럼이 빠졌거나 41행 미만이면 ApiError(400) */
export function parseDatasetCsv(text: string): CsvRow[] {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/).filter((line) => line.trim() !== '')
  const header = splitCsvLine(lines[0] ?? '')
  const index = new Map(header.map((h, i) => [h.toLowerCase(), i]))
  const missing = csvColumns.filter((c) => !index.has(c.toLowerCase()))
  if (missing.length > 0) {
    throw new ApiError(400, `CSV에 [${csvColumns.map((c) => `'${c}'`).join(', ')}] 컬럼이 모두 있어야 합니다.`)
  }
  const body = lines.slice(1).map(splitCsvLine)
  if (body.length < MIN_UPLOAD_ROWS) throw new ApiError(400, `최소 ${MIN_UPLOAD_ROWS}행 이상의 데이터가 필요합니다.`)
  return body.map((cells) => toCsvRow(csvColumns.map((c) => cells[index.get(c.toLowerCase())!] ?? '')))
}

/** 행 → 현재 데이터 요약 (학습 데이터 카드) */
export function summarizeRows(rows: readonly CsvRow[], fileName: string, source: string, fallbackAt: Ymdhm): DatasetSummary {
  const waits = rows.map((r) => Number(r.wait_min)).filter((n) => Number.isFinite(n)).sort((a, b) => a - b)
  const landings = rows.map((r) => r.landingDatetime).filter((v) => /^\d{12}$/.test(v)).sort()
  const lineIds = new Set(rows.map((r) => r.line_id).filter(Boolean))
  return {
    fileName,
    source,
    rows: rows.length,
    columns: csvColumns.length,
    lines: lineIds.size,
    t1Rows: rows.filter((r) => r.line_id.startsWith('T1')).length,
    t2Rows: rows.filter((r) => r.line_id.startsWith('T2')).length,
    landingFrom: landings[0] ?? fallbackAt,
    landingTo: landings[landings.length - 1] ?? fallbackAt,
    waitMeanMin: waits.length ? round1(waits.reduce((s, n) => s + n, 0) / waits.length) : 0,
    waitMedianMin: median(waits),
    waitMinMin: waits[0] ?? 0,
    waitMaxMin: waits[waits.length - 1] ?? 0,
    over50Rows: waits.filter((n) => n > 50).length,
    eventRows: rows.filter((r) => r.event_tag.trim() !== '').length,
  }
}
