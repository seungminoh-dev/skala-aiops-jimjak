import { useId, useState, type ReactNode } from 'react'

import { Num } from '@/components/app/Num'
import { UploadRow } from '@/components/lab/UploadRow'
import { useCsvUpload, useFileDrop, type UploadResult } from '@/components/lab/useUpload'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { CsvColumn, CsvRow, Ymdhm } from '@/design/mock'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

/**
 * 데이터 (시나리오 랩 맨 아래, 접기) — 업로드 · 현재 데이터 · 미리보기.
 * 머리: section-title "데이터" (+ 접었을 때만 지금 파일 이름·행 수 caption) + 고스트 "접기 / 펼치기"(글자 버튼, 아이콘 없음).
 * 상자 없이 제목·여백·선으로만 나눈다. 미리보기 표는 본문 흰 면 좌우 끝까지.
 * 섹션 전체가 CSV 를 놓는 곳이다. 끌어다 놓는 중에만 섹션 바탕(흰 면 좌우 끝까지)을 primary-subtle 로 —
 * 둥근 상자·테두리 없음, 전환 애니메이션 없음. 접힌 채로 놓으면 펼쳐서 결과 줄을 보인다.
 */

export interface CurrentData {
  fileName: string
  source: string
  rows: number
  columns: number
  lines: number
  t1Rows: number
  t2Rows: number
  landingFrom: Ymdhm
  landingTo: Ymdhm
  waitMeanMin: number
  waitMedianMin: number
  waitMinMin: number
  waitMaxMin: number
  over50Rows: number
  eventRows: number
}

export interface DataPanelProps {
  current: CurrentData
  columns: readonly CsvColumn[]
  preview: readonly CsvRow[]
  /** 처음에 펼쳐 둘지 (기본 펼침) */
  defaultOpen?: boolean
  /** 견본용: 끌어다 놓는 중 모양으로 고정 */
  previewDragOver?: boolean
  /** 견본용: 처음 업로드 결과 (예: 400 오류) */
  initialUpload?: UploadResult | null
}

export function DataPanel({
  current,
  columns,
  preview,
  defaultOpen = true,
  previewDragOver = false,
  initialUpload = null,
}: DataPanelProps) {
  const titleId = useId()
  const bodyId = useId()
  const [open, setOpen] = useState(defaultOpen)
  const upload = useCsvUpload(columns, initialUpload)
  const drop = useFileDrop((file) => {
    setOpen(true)
    upload.accept(file)
  })
  const dragging = drop.dragging || previewDragOver

  return (
    <section
      aria-labelledby={titleId}
      {...drop.dropProps}
      // 바탕이 제목에 붙지 않도록 위 8px · 아래 16px 여유를 두되, 음수 여백으로 자리는 그대로 (끌 때 흔들리지 않게)
      className={cn('-mx-6 -mt-2 -mb-4 px-6 pt-2 pb-4', dragging && 'bg-primary-subtle')}
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

/* ───────────── 현재 데이터 요약 ───────────── */

/** 이름(label ink-subtle) 위 / 값(body-sm ink) 아래, 5열. 상자·아이콘 없음 */
export function DataSummary({ current, className }: { current: CurrentData; className?: string }) {
  const items: Array<{ label: string; value: ReactNode; wide?: boolean }> = [
    {
      label: '파일',
      wide: true,
      value: (
        <>
          <span className="type-mono">{current.fileName}</span>
          <span className="block type-caption text-ink-subtle">{current.source}</span>
        </>
      ),
    },
    {
      label: '행 · 컬럼',
      value: (
        <>
          <Num value={current.rows} unit="행" />
          <span className="text-ink-subtle"> · </span>
          <Num value={current.columns} unit="컬럼" />
        </>
      ),
    },
    {
      label: '라인',
      value: (
        <>
          <Num value={current.lines} unit="개" />
          <span className="block type-caption text-ink-subtle">
            <span className="type-mono-sm">T1</span> <span className="tabular-nums">{current.t1Rows}</span>행 ·{' '}
            <span className="type-mono-sm">T2</span> <span className="tabular-nums">{current.t2Rows}</span>행
          </span>
        </>
      ),
    },
    {
      label: '착륙 시각',
      value: (
        <span className="tabular-nums">
          {fmtClock(current.landingFrom)} ~ {fmtClock(current.landingTo)}
        </span>
      ),
    },
    { label: '처리 시간 평균', value: <Num value={current.waitMeanMin} digits={1} unit="분" /> },
    { label: '처리 시간 중앙값', value: <Num value={current.waitMedianMin} unit="분" /> },
    {
      label: '처리 시간 범위',
      value: (
        <>
          <span className="tabular-nums">{current.waitMinMin}</span>
          <span className="text-ink-subtle"> ~ </span>
          <Num value={current.waitMaxMin} unit="분" />
        </>
      ),
    },
    { label: '50분 초과', value: <Num value={current.over50Rows} unit="행" /> },
    { label: '이벤트 표시', value: <Num value={current.eventRows} unit="행" /> },
  ]

  return (
    <dl className={cn('grid grid-cols-5 gap-x-8 gap-y-4', className)}>
      {items.map((item) => (
        <div key={item.label} className={cn('flex min-w-0 flex-col gap-1', item.wide && 'col-span-2')}>
          <dt className="type-label text-ink-subtle">{item.label}</dt>
          <dd className="type-body-sm text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/* ───────────── CSV 미리보기 ───────────── */

/** 코드 값(편명·라인·기종)은 mono, 숫자는 오른쪽 정렬 */
const MONO_COLUMNS: ReadonlySet<CsvColumn> = new Set(['flightId', 'line_id', 'aircraftSubtype'])
const NUMERIC_COLUMNS: ReadonlySet<CsvColumn> = new Set(['bagCarouselId', 'seats', 'wait_min'])

/** 파일 글자 그대로 보인다 (머리글은 CSV 컬럼 이름 mono-sm). 본문 흰 면 좌우 끝까지 */
export function CsvPreviewTable({ columns, rows }: { columns: readonly CsvColumn[]; rows: readonly CsvRow[] }) {
  const last = columns.length - 1
  return (
    <div className="-mx-6">
      <Table aria-label="CSV 미리보기" containerClassName="overflow-x-auto">
        <TableHeader>
          <TableRow>
            {columns.map((col, i) => (
              <TableHead
                key={col}
                className={cn(
                  // 머리글 흰 바탕을 지운다 — 끌어다 놓는 중 섹션 바탕(primary-subtle)이 표 머리까지 이어지게 (sticky 아님)
                  'bg-transparent type-mono-sm',
                  NUMERIC_COLUMNS.has(col) && 'text-right',
                  i === 0 && 'pl-6',
                  i === last && 'pr-6',
                )}
              >
                {col}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row, r) => (
            <TableRow key={`${row.flightId}-${r}`}>
              {columns.map((col, i) => (
                <TableCell
                  key={col}
                  className={cn(
                    MONO_COLUMNS.has(col) ? 'type-mono' : 'tabular-nums',
                    NUMERIC_COLUMNS.has(col) && 'text-right',
                    i === 0 && 'pl-6',
                    i === last && 'pr-6',
                  )}
                >
                  {row[col]}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}
