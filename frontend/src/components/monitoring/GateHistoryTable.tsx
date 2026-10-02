import { useId } from 'react'

import { StatusText } from '@/components/app/StatusText'
import { fmtMonthDayClock } from '@/components/monitoring/helpers'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { GateCheck, GateRecord } from '@/design/mock'
import { gateResult, verdictStatus } from '@/lib/format'

/**
 * 게이트 이력 표 — 재학습 후보마다 한 줄, 최신이 위.
 * 열: 시각 · 계기 · 후보 · 게이트 3검사(검증 MAE ≤ 5분 / 단순 방법 대비 10% 개선 / 현재 모델보다 나쁘지 않음) · 결과.
 * 검사 칸은 값(mono) + "통과"(success-text) / "불합격"(danger-text). 결과는 판정 대응표 그대로
 * (재학습 · v2 배포 = primary 점, 재학습 · 게이트 불합격, v1 유지 = danger 점 + danger-text).
 * 열 너비(DESIGN.md "표의 열 너비"): 놓인 칸의 폭을 다 쓰고 열은 비율로 나눈다(table-fixed + %, 합 100). 빈 열 없음.
 * 흰 면 좌우 끝까지 붙인다(-mx-6, 첫 칸 pl-6 · 끝 칸 pr-6). 비율은 1280px 에서도 가장 긴 계기·결과 글자가 들어가게 잡았다.
 */

/** 게이트 3검사 열 너비 — 기준 글자(머리글)와 값 + 통과/불합격이 들어가는 비율 */
const CHECK_COL_W = ['w-[11%]', 'w-[16%]', 'w-[14%]']
export interface GateHistoryTableProps {
  gates: readonly GateRecord[]
}

export function GateHistoryTable({ gates }: GateHistoryTableProps) {
  const titleId = useId()
  const rows = [...gates].sort((a, b) => b.at.localeCompare(a.at))
  const criteria = rows[0]?.checks.map((c) => c.criterion) ?? []

  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        게이트 이력
      </h4>
      <div className="-mx-6 mt-3">
        <Table aria-labelledby={titleId} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[10%] pl-6">시각</TableHead>
              <TableHead className="w-[20%]">계기</TableHead>
              <TableHead className="w-[8%]">후보</TableHead>
              {criteria.map((c, i) => (
                <TableHead key={c} className={CHECK_COL_W[i]}>
                  {c}
                </TableHead>
              ))}
              <TableHead className="w-[21%] pr-6">결과</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((g) => (
              <TableRow key={g.id}>
                <TableCell className="pl-6 tabular-nums">{fmtMonthDayClock(g.at)}</TableCell>
                <TableCell className="text-ink-muted">{g.trigger}</TableCell>
                <TableCell>
                  <Candidate value={g.candidate} />
                </TableCell>
                {g.checks.map((check) => (
                  <TableCell key={check.criterion}>
                    <CheckValue check={check} />
                  </TableCell>
                ))}
                <TableCell className="pr-6">
                  <StatusText
                    status={verdictStatus(
                      g.passed
                        ? { kind: 'retrain_promoted', deployedVersion: g.candidate }
                        : { kind: 'retrain_rejected', keptVersion: g.base },
                    )}
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}

/** "v2 후보" → mono v2 + 글자 "후보" */
function Candidate({ value }: { value: string }) {
  const [code, ...rest] = value.split(' ')
  return (
    <>
      <span className="type-mono">{code}</span>
      {rest.length > 0 && <span className="text-ink-subtle"> {rest.join(' ')}</span>}
    </>
  )
}

/** 값(mono) + 통과/불합격 */
export function CheckValue({ check }: { check: GateCheck }) {
  const result = gateResult(check.passed)
  return (
    <>
      <span className="type-mono text-ink">{check.value}</span>
      <span className={`ml-2 ${result.textClass}`}>{result.label}</span>
    </>
  )
}
