import { useId } from 'react'

import { EmptyState } from '@/components/app/EmptyState'
import { StatusText } from '@/components/app/StatusText'
import { batchVerdict } from '@/components/monitoring/helpers'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Batch } from '@/design/mock'
import { fmtClock, fmtDecimal, verdictStatus } from '@/lib/format'

/**
 * 판정 기록 표 — 배치마다 한 줄, 최신이 위.
 * 열: 시각 · 배치 · 창 · 창 MAE (임계값 5.0분) · 연속 초과 · 판정 · 운영 버전.
 * 판단 기준은 머리글에 숫자로 넣는다. 숫자는 오른쪽 정렬 + tabular. 판정은 상태 표시 대응표 그대로.
 * 열 너비(DESIGN.md "표의 열 너비"): 놓인 칸의 폭을 다 쓰고 열은 비율로 나눈다(table-fixed + %, 합 100). 빈 열 없음.
 * 흰 면 좌우 끝까지 붙인다(-mx-6, 첫 칸 pl-6 · 끝 칸 pr-6). 비율은 1280px 에서도 가장 긴 판정 글자가 들어가게 잡았다.
 */
export interface VerdictHistoryTableProps {
  batches: readonly Batch[]
  threshold: number
  consecutiveLimit: number
}

export function VerdictHistoryTable({ batches, threshold, consecutiveLimit }: VerdictHistoryTableProps) {
  const titleId = useId()
  const rows = [...batches].sort((a, b) => b.no - a.no)

  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        판정 기록
      </h4>
      <div className="-mx-6 mt-3">
        <Table aria-labelledby={titleId} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%] pl-6">시각</TableHead>
              <TableHead className="w-[7%] text-right">배치</TableHead>
              <TableHead className="w-[9%] text-right">창 편수</TableHead>
              <TableHead className="w-[16%] text-right">창 MAE (임계값 {fmtDecimal(threshold)}분)</TableHead>
              <TableHead className="w-[10%] text-right">연속 초과</TableHead>
              <TableHead className="w-[34%] pl-6">판정</TableHead>
              <TableHead className="w-[14%] pr-6">운영 버전</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={7} className="py-0 px-6">
                  <EmptyState>아직 판정 기록이 없습니다. 시나리오 랩에서 실행하면 쌓입니다</EmptyState>
                </TableCell>
              </TableRow>
            ) : (
              rows.map((b) => (
                <TableRow key={b.no}>
                  <TableCell className="pl-6 tabular-nums">{fmtClock(b.at)}</TableCell>
                  <TableCell className="text-right tabular-nums">{b.no}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.windowCount}/{b.windowSize}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{fmtDecimal(b.windowMae)}</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {b.consecutive}/{consecutiveLimit}
                  </TableCell>
                  <TableCell className="pl-6">
                    <StatusText status={verdictStatus(batchVerdict(b, consecutiveLimit))} />
                  </TableCell>
                  <TableCell className="pr-6 type-mono">{b.modelVersion}</TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
