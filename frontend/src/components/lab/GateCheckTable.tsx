import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { GateCheck } from '@/design/mock'
import { gateResult } from '@/lib/format'

/**
 * 게이트 검사 — 게이트 단계 아래 3줄 표: 기준 · 값(mono) · "통과"(success-text) / "불합격"(danger-text).
 * 열 너비(DESIGN.md "표의 열 너비"): 놓인 칸(실행 결과 칸)의 폭을 다 쓰고 열은 비율로 나눈다. 빈 열·최대 폭 없음.
 * 흰 면 끝까지 붙이지 않는다 — 칸 여백 12px 그대로 두면 기준 글자가 위 단계 이름(점 6px + 간격 6px 뒤)과 같은 x 에서 시작한다.
 */
export interface GateCheckTableProps {
  checks: readonly GateCheck[]
  className?: string
}

export function GateCheckTable({ checks, className }: GateCheckTableProps) {
  return (
    <Table aria-label="게이트 검사" className="table-fixed" containerClassName={className}>
      <TableHeader>
        <TableRow>
          <TableHead className="w-[45%]">게이트 기준</TableHead>
          <TableHead className="w-[35%]">값</TableHead>
          <TableHead className="w-[20%]">결과</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {checks.map((check) => {
          const result = gateResult(check.passed)
          return (
            <TableRow key={check.criterion}>
              <TableCell className="text-ink-muted">{check.criterion}</TableCell>
              <TableCell className="type-mono text-ink">{check.value}</TableCell>
              <TableCell className={result.textClass}>{result.label}</TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
