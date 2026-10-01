import { useId, useState } from 'react'

import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { notify } from '@/components/app/notify'
import { VersionBadge } from '@/components/app/VersionBadge'
import { fmtMonthDayClock, productionSwitchMessage } from '@/components/monitoring/helpers'
import {
  PRODUCTION_SWITCH_CONFIRM,
  PRODUCTION_SWITCH_TITLE,
  ProductionSwitchFacts,
} from '@/components/monitoring/ProductionSwitchFacts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { ModelVersion, Ymdhm } from '@/design/mock'
import { fmtDecimal } from '@/lib/format'

/**
 * 모델 버전 표 — 운영 중 하나 + 보관.
 * 열: 버전 · 상태(+ 전환 버튼) · 방식(처음 학습 / 재학습) · 학습 데이터 · 검증 MAE (게이트 5분) · 운영 기간(배포 ~ 보관).
 * 열 너비(DESIGN.md "표의 열 너비"): 놓인 칸의 폭을 다 쓰고 열은 비율로 나눈다(table-fixed + %, 합 100). 빈 열 없음.
 * 흰 면 좌우 끝까지 붙인다(-mx-6, 첫 칸 pl-6 · 끝 칸 pr-6).
 * epoch 수는 표에 두지 않는다(재학습 epoch 은 로그 원문에 있다).
 * - 보관 버전 줄에만 상태 글자 바로 옆에 고스트 "운영으로 전환" → 위험 확인 대화상자(운영 버전을 바꾸는 되돌리기 어려운 동작).
 * - 상태는 글자만 — 운영 중은 ink 500, 보관은 ink-subtle. 색·배지로 반복하지 않는다.
 * - 단순 방법 MAE 는 게이트 이력의 "단순 방법 대비 10% 개선" 값과 겹쳐 여기 두지 않는다.
 * 화면 글자는 "운영 버전 / 운영 중 / 운영으로 전환". 영문 Production 은 쓰지 않는다(로그 원문은 그대로).
 */
export interface ModelVersionTableProps {
  versions: readonly ModelVersion[]
  gateMae: number
  /** 전환하면 적용되는 다음 예측 (예: 10:38 OZ107) */
  nextPrediction: { at: Ymdhm; flightId: string }
}

const STATUS_LABEL: Record<ModelVersion['status'], string> = {
  production: '운영 중',
  retired: '보관',
}

/** 학습 방식 — 데이터의 'fine-tuning' 은 화면에서 "재학습" */
const METHOD_LABEL: Record<ModelVersion['method'], string> = {
  '처음 학습': '처음 학습',
  'fine-tuning': '재학습',
}

export function ModelVersionTable({ versions, gateMae, nextPrediction }: ModelVersionTableProps) {
  const titleId = useId()
  const [target, setTarget] = useState<ModelVersion | null>(null)
  const production = versions.find((v) => v.status === 'production') ?? null
  const rows = [...versions].sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))

  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        모델 버전
      </h4>
      <div className="-mx-6 mt-3">
        <Table aria-labelledby={titleId} className="table-fixed">
          <TableHeader>
            <TableRow>
              <TableHead className="w-[8%] pl-6">버전</TableHead>
              <TableHead className="w-[18%]">상태</TableHead>
              <TableHead className="w-[10%]">방식</TableHead>
              <TableHead className="w-[26%]">학습 데이터</TableHead>
              <TableHead className="w-[14%] text-right">검증 MAE (게이트 {gateMae}분)</TableHead>
              <TableHead className="w-[24%] pr-6 pl-6">운영 기간</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((v) => (
              <TableRow key={v.version}>
                <TableCell className="pl-6">
                  <VersionBadge version={v.version} />
                </TableCell>
                <TableCell className="py-[4px]">
                  {/* 버튼(30px)이 있는 줄도 글자 기준선이 다른 칸과 맞도록 같은 높이 줄 안에 둔다 */}
                  <span className="inline-flex h-[30px] items-center gap-2">
                    <span className={v.status === 'production' ? 'font-medium text-ink' : 'text-ink-subtle'}>
                      {STATUS_LABEL[v.status]}
                    </span>
                    {v.status === 'retired' && (
                      <Button variant="ghost" onClick={() => setTarget(v)}>
                        운영으로 전환
                      </Button>
                    )}
                  </span>
                </TableCell>
                <TableCell className="text-ink-muted">{METHOD_LABEL[v.method]}</TableCell>
                <TableCell className="truncate text-ink-muted" title={v.trainData}>
                  {v.trainData}
                </TableCell>
                <TableCell className="text-right tabular-nums">{fmtDecimal(v.valMae)}</TableCell>
                <TableCell className="pr-6 pl-6 tabular-nums">
                  {fmtMonthDayClock(v.deployedAt)}
                  <span className="text-ink-subtle"> ~ </span>
                  {v.retiredAt && fmtMonthDayClock(v.retiredAt)}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null)
        }}
        title={PRODUCTION_SWITCH_TITLE}
        confirmLabel={PRODUCTION_SWITCH_CONFIRM}
        tone="danger"
        onConfirm={() => {
          if (target && production) notify(productionSwitchMessage(production.version, target.version))
          setTarget(null)
        }}
      >
        {target && production && <ProductionSwitchFacts from={production} to={target} nextPrediction={nextPrediction} />}
      </ConfirmDialog>
    </section>
  )
}
