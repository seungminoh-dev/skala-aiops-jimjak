import { useCallback, useId, useRef, useState, type ReactNode } from 'react'

import { actions, useDataset } from '@/api'
import { CsvPreviewTable, DataSummary } from '@/components/lab/DataPanel'
import { UploadRow } from '@/components/lab/UploadRow'
import { useFileDrop, type CsvUpload, type UploadResult } from '@/components/lab/useUpload'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { errorText } from '@/pages/lab/errorText'

/**
 * 데이터 (시나리오 랩 맨 아래, 접기) — 업로드 · 현재 데이터 · 미리보기.
 * 모양은 components/lab/DataPanel 과 같다. 차이는 업로드가 api(actions.uploadCsv)로 가고,
 * 현재 데이터·미리보기가 useDataset() 에서 온다는 것 — DataPanel 은 자체 업로드 훅(머리글만 검사)을 써서 그대로 못 쓴다.
 * 400 이면 서버 문장(detail) 그대로 한 줄: "x.csv · 올리지 못했습니다 · 최소 41행 이상의 데이터가 필요합니다."
 */
export function LabDataPanel({ defaultOpen = true }: { defaultOpen?: boolean }) {
  const dataset = useDataset()
  const titleId = useId()
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const upload = useApiUpload()
  const drop = useFileDrop((file) => {
    setOpen(true)
    upload.accept(file)
  })
  const { current, columns, preview } = dataset

  return (
    <section
      aria-labelledby={titleId}
      {...drop.dropProps}
      // DataPanel 과 같은 자리 잡기 — 끌어다 놓는 중 바탕이 흰 면 좌우 끝까지, 자리는 그대로
      className={cn('-mx-6 -mt-2 -mb-4 px-6 pt-2 pb-4', drop.dragging && 'bg-primary-subtle')}
    >
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-baseline gap-3">
          <h4 id={titleId} className="type-section-title text-ink">
            데이터
          </h4>
          {!open && (
            <span className="truncate type-caption text-ink-subtle">
              <span className="type-mono-sm">{current.fileName}</span>
              {' · '}
              <span className="tabular-nums">{current.rows}</span>행
            </span>
          )}
        </div>
        <Button variant="ghost" aria-expanded={open} aria-controls={bodyId} onClick={() => setOpen((v) => !v)}>
          {open ? '접기' : '펼치기'}
        </Button>
      </div>

      <div id={bodyId} hidden={!open} className="mt-4 flex flex-col gap-8">
        <SubBlock title="업로드">
          <UploadRow requiredColumns={columns} upload={upload} />
        </SubBlock>
        <SubBlock title="현재 데이터">
          <DataSummary current={current} />
        </SubBlock>
        <SubBlock
          title={
            <>
              미리보기 <span className="font-normal text-ink-subtle">· 앞 {preview.length}행</span>
            </>
          }
        >
          <CsvPreviewTable columns={columns} rows={preview} />
        </SubBlock>
      </div>
    </section>
  )
}

/** 데이터 안 작은 묶음 — 제목 body-sm 500 ink, 아래 8px */
function SubBlock({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <div>
      <h5 className="mb-2 type-body-sm font-medium text-ink">{title}</h5>
      {children}
    </div>
  )
}

/** UploadRow 가 받는 업로드 상태 — 검사는 api 가 한다. 연달아 올리면 마지막 파일 결과만 남긴다 */
function useApiUpload(): CsvUpload {
  const [result, setResult] = useState<UploadResult | null>(null)
  const latest = useRef(0)

  const accept = useCallback((file: File | undefined) => {
    if (!file) return
    latest.current += 1
    const ticket = latest.current
    setResult({ kind: 'checking', fileName: file.name })
    actions.uploadCsv(file).then(
      (res) => {
        if (ticket === latest.current) setResult({ kind: 'ok', fileName: res.filename, rows: res.rows })
      },
      (error: unknown) => {
        if (ticket === latest.current) {
          setResult({ kind: 'error', fileName: file.name, message: errorText(error, '파일을 읽지 못했습니다.') })
        }
      },
    )
  }, [])

  return { result, accept }
}
