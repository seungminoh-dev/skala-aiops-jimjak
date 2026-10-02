import { useId, type ReactNode } from 'react'

import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { DEMO_RESET_CONFIRM, DEMO_RESET_TITLE } from '@/components/lab/DemoResetFacts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { Scenario, ScenarioId } from '@/design/mock'
import { SCENARIO_CATEGORY_LABEL } from '@/lib/format'

/**
 * 시나리오 표 — 행 6개. 열: 이름 · [실행](보조 버튼, 이름 바로 옆) · 분류(글자만) · 기대 판정 · 실행 횟수(mono).
 * 표 위 오른쪽(표 오른쪽 끝)에 고스트 "데모 초기화"(위험 확인 대화상자). 카드·칩·아이콘 없음.
 * 열 너비(DESIGN.md "표의 열 너비"): 놓인 칸의 폭을 다 쓰고 열은 비율로 나눈다(table-fixed + %, 합 100). 빈 열·최대 폭 없음.
 * 시나리오 랩 두 칸 배치의 왼쪽 칸에 놓이므로 왼쪽만 흰 면 끝까지 붙인다(-ml-6, 첫 칸 pl-6). 폭은 두 칸 배치가 줄인다.
 * 제목 줄은 높이 30px(고스트 버튼) — 오른쪽 칸 "실행 결과" 제목 줄도 같은 높이라 두 제목이 같은 줄에 선다.
 * 실행 중에는 그 줄 버튼이 "실행 중…"으로 바뀌고(흐리게 하지 않는다), 다른 실행·초기화는 끝날 때까지 막는다.
 */
export interface ScenarioTableProps {
  scenarios: readonly Scenario[]
  /** 시나리오별 실행 횟수 (실행하면 늘어난다) */
  runCounts: Readonly<Record<ScenarioId, number>>
  /** 지금 실행 중인 시나리오 */
  runningId: ScenarioId | null
  onRun: (id: ScenarioId) => void
  onReset: () => void
  /** 데모 초기화 대화상자 내용 (사실만 — <DemoResetFacts>) */
  resetContent: ReactNode
}

export function ScenarioTable({ scenarios, runCounts, runningId, onRun, onReset, resetContent }: ScenarioTableProps) {
  const titleId = useId()
  const busy = runningId !== null

  return (
    <section aria-labelledby={titleId}>
      <div className="flex h-[30px] items-center justify-between">
        <h4 id={titleId} className="type-section-title text-ink">
          시나리오
        </h4>
        <ConfirmDialog
          trigger={
            <Button variant="ghost" disabled={busy}>
              {DEMO_RESET_TITLE}
            </Button>
          }
          title={DEMO_RESET_TITLE}
          confirmLabel={DEMO_RESET_CONFIRM}
          tone="danger"
          onConfirm={onReset}
        >
          {resetContent}
        </ConfirmDialog>
      </div>
      <div className="-ml-6 mt-2">
        <Table aria-labelledby={titleId} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[29%] pl-6">이름</TableHead>
              <TableHead className="w-[20%]">
                <span className="sr-only">실행</span>
              </TableHead>
              <TableHead className="w-[15%]">분류</TableHead>
              <TableHead className="w-[21%]">기대 판정</TableHead>
              <TableHead className="w-[15%] text-right">실행 횟수</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scenarios.map((s) => {
              const running = runningId === s.id
              return (
                <TableRow key={s.id}>
                  <TableCell className="pl-6 text-ink">{s.name}</TableCell>
                  <TableCell className="py-[4px]">
                    <Button
                      variant="outline"
                      className="min-w-[76px]"
                      disabled={busy && !running}
                      aria-disabled={running || undefined}
                      aria-label={running ? `${s.name} 실행 중` : `${s.name} 실행`}
                      onClick={() => {
                        if (!busy) onRun(s.id)
                      }}
                    >
                      {running ? '실행 중…' : '실행'}
                    </Button>
                  </TableCell>
                  <TableCell className="text-ink-muted">{SCENARIO_CATEGORY_LABEL[s.category]}</TableCell>
                  <TableCell className="text-ink">{s.expected}</TableCell>
                  <TableCell className="text-right type-mono">{runCounts[s.id]}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </section>
  )
}
