import { useCallback, useState, type DragEvent } from 'react'

/**
 * 업로드 상태와 놓는 곳 — 업로드 한 줄(UploadRow)과 데이터 섹션(DataPanel)이 같이 쓴다.
 * 백엔드가 없어서 필수 컬럼 검사는 브라우저에서 첫 줄만 읽어 흉내 낸다.
 */
export type UploadResult =
  | { kind: 'checking'; fileName: string }
  | { kind: 'ok'; fileName: string; rows: number }
  | { kind: 'error'; fileName: string; message: string }

async function checkFile(file: File, required: readonly string[]): Promise<UploadResult> {
  const fileName = file.name
  if (!/\.csv$/i.test(fileName)) return { kind: 'error', fileName, message: 'CSV 파일이 아닙니다 (400)' }
  const text = await file.slice(0, 2_000_000).text()
  const lines = text.split(/\r?\n/).filter((line) => line.trim() !== '')
  const header = (lines[0] ?? '')
    .replace(/^\uFEFF/, '')
    .split(',')
    .map((cell) => cell.trim().replace(/^"|"$/g, ''))
  const missing = required.filter((col) => !header.includes(col))
  if (missing.length > 0) return { kind: 'error', fileName, message: `필수 컬럼 없음: ${missing.join(', ')} (400)` }
  return { kind: 'ok', fileName, rows: Math.max(0, lines.length - 1) }
}

/* ───────────── 업로드 상태 ───────────── */

export interface CsvUpload {
  result: UploadResult | null
  /** 파일 하나를 받아 검사한다 */
  accept: (file: File | undefined) => void
}

/** 업로드 결과 상태 — initialResult 는 견본용(예: 400 오류) */
export function useCsvUpload(requiredColumns: readonly string[], initialResult: UploadResult | null = null): CsvUpload {
  const [result, setResult] = useState<UploadResult | null>(initialResult)
  const accept = useCallback(
    (file: File | undefined) => {
      if (!file) return
      setResult({ kind: 'checking', fileName: file.name })
      void checkFile(file, requiredColumns).then(setResult)
    },
    [requiredColumns],
  )
  return { result, accept }
}

/* ───────────── 놓는 곳 (데이터 섹션 전체) ───────────── */

export interface FileDrop {
  /** 파일을 끌고 이 영역 위에 있는 중 */
  dragging: boolean
  /** 놓는 곳이 될 요소에 펼쳐 넣는다 */
  dropProps: {
    onDragEnter: (e: DragEvent<HTMLElement>) => void
    onDragOver: (e: DragEvent<HTMLElement>) => void
    onDragLeave: (e: DragEvent<HTMLElement>) => void
    onDrop: (e: DragEvent<HTMLElement>) => void
  }
}

const hasFiles = (e: DragEvent<HTMLElement>) => Array.from(e.dataTransfer.types).includes('Files')

/** 요소 하나를 파일 놓는 곳으로 — 안쪽 요소 위를 지날 때 깜빡이지 않도록 relatedTarget 으로 판단한다 */
export function useFileDrop(onFile: (file: File) => void): FileDrop {
  const [dragging, setDragging] = useState(false)
  return {
    dragging,
    dropProps: {
      onDragEnter: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(true)
      },
      onDragOver: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        e.dataTransfer.dropEffect = 'copy'
        if (!dragging) setDragging(true)
      },
      onDragLeave: (e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false)
      },
      onDrop: (e) => {
        if (!hasFiles(e)) return
        e.preventDefault()
        setDragging(false)
        const file = e.dataTransfer.files[0]
        if (file) onFile(file)
      },
    },
  }
}
