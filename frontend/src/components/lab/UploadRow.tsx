import { useRef } from 'react'

import { ErrorState } from '@/components/app/ErrorState'
import type { CsvUpload } from '@/components/lab/useUpload'
import { Button } from '@/components/ui/button'

/**
 * 업로드 — 둥근 점선 상자를 두지 않는다.
 * - 한 줄: [파일 고르기](보조 버튼) + "또는 CSV 파일을 이 영역으로 끌어다 놓으세요" (+ 형식 caption)
 * - 놓는 곳은 데이터 섹션 전체다(useFileDrop 을 섹션에 건다). 끌어다 놓는 중에만 섹션 바탕을 primary-subtle 로 —
 *   둥근 상자·테두리 없이 면만 바뀐다.
 * 결과는 그 줄 아래 한 줄:
 * - 오류(400): ink-muted 한 줄 + 고스트 "다른 파일 고르기" (빨강 상자·아이콘 없음)
 * - 통과: ink-muted 한 줄 "flights_real_20261002.csv · 200행 올림"
 * 상태(useCsvUpload)와 놓는 곳(useFileDrop)은 useUpload.ts 에 있다.
 */
export interface UploadRowProps {
  /** 필수 컬럼 (CSV 첫 줄에 모두 있어야 한다) */
  requiredColumns: readonly string[]
  upload: CsvUpload
  className?: string
}

export function UploadRow({ requiredColumns, upload, className }: UploadRowProps) {
  const inputRef = useRef<HTMLInputElement>(null)
  const { result } = upload
  const pick = () => inputRef.current?.click()

  return (
    <div className={className}>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={pick}>
          파일 고르기
        </Button>
        <p className="flex flex-col type-body-sm text-ink-muted">
          또는 CSV 파일을 이 영역으로 끌어다 놓으세요
          <span className="type-caption text-ink-subtle">
            필수 컬럼 <span className="tabular-nums">{requiredColumns.length}</span>개, 41행 이상
          </span>
        </p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv,text/csv"
          tabIndex={-1}
          aria-hidden
          className="sr-only"
          onChange={(e) => {
            upload.accept(e.target.files?.[0])
            e.target.value = ''
          }}
        />
      </div>

      <div aria-live="polite">
        {result?.kind === 'error' && (
          <ErrorState
            className="mt-1"
            message={`${result.fileName}을(를) 올리지 못했습니다. ${result.message}`}
            onRetry={pick}
            retryLabel="다른 파일 고르기"
          />
        )}
        {result?.kind === 'checking' && (
          <p className="mt-1 flex min-h-10 items-center type-body-sm text-ink-muted">{result.fileName} 확인 중…</p>
        )}
        {result?.kind === 'ok' && (
          <p className="mt-1 flex min-h-10 items-center type-body-sm text-ink-muted">
            <span>
              {result.fileName} · <span className="tabular-nums">{result.rows}</span>행 올림
            </span>
          </p>
        )}
      </div>
    </div>
  )
}
