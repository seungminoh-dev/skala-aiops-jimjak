import { useId, useState } from 'react'

import { actions, ApiError, type ModelVersion, type ModelVersionId, type Ymdhm } from '@/api'
import { ConfirmDialog, ConfirmFacts } from '@/components/app/ConfirmDialog'
import { notify } from '@/components/app/notify'
import { Num } from '@/components/app/Num'
import { VersionBadge } from '@/components/app/VersionBadge'
import { fmtMonthDayClock, productionSwitchMessage } from '@/components/monitoring/helpers'
import {
  PRODUCTION_SWITCH_CONFIRM,
  PRODUCTION_SWITCH_TITLE,
  ProductionSwitchFacts,
} from '@/components/monitoring/ProductionSwitchFacts'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { fmtDecimal } from '@/lib/format'

/**
 * 모델 버전 표 (실제 화면용) — components/monitoring/ModelVersionTable 과 같은 모양·글자.
 * 차이: "운영으로 전환" 확인 → actions.promoteVersion 으로 실제 운영 버전을 바꾼다.
 * (공용 ModelVersionTable 은 전환 콜백이 없어 토스트만 띄운다. onPromote prop 이 생기면 이 파일을 지우고 그것을 쓴다.)
 * - 전환 중이거나 시나리오가 실행 중이면 전환 버튼을 잠근다 (실행 중 재학습과 운영 버전이 엇갈리지 않게).
 * - 성공: 토스트 "운영 버전 v2 → v1" (새 모델 배포가 아니므로 점 없이). 실패: 서버 detail 한 줄.
 * - 열 너비는 ModelVersionTable 과 같은 비율(전폭, 빈 열 없음, 흰 면 좌우 끝까지).
 */
export interface VersionTableProps {
  versions: readonly ModelVersion[]
  production: ModelVersionId
  gateMae: number
  /** 전환하면 적용되는 다음 예측. 남은 예측이 없으면 null */
  nextPrediction: { at: Ymdhm; flightId: string } | null
  /** 시나리오 실행 중이면 전환을 막는다 */
  locked?: boolean
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

export function VersionTable({ versions, production, gateMae, nextPrediction, locked = false }: VersionTableProps) {
  const titleId = useId()
  const [target, setTarget] = useState<ModelVersion | null>(null)
  const [promoting, setPromoting] = useState(false)
  const current = versions.find((v) => v.version === production) ?? null
  const rows = [...versions].sort((a, b) => b.deployedAt.localeCompare(a.deployedAt))

  function promote(to: ModelVersion) {
    const from = production
    setPromoting(true)
    actions
      .promoteVersion(to.version)
      .then(() => notify(productionSwitchMessage(from, to.version)))
      .catch((err: unknown) =>
        notify(err instanceof ApiError ? err.detail : '운영 버전을 바꾸지 못했습니다'),
      )
      .finally(() => setPromoting(false))
  }

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
                  <span className="inline-flex h-[30px] items-center gap-2">
                    <span className={v.status === 'production' ? 'font-medium text-ink' : 'text-ink-subtle'}>
                      {STATUS_LABEL[v.status]}
                    </span>
                    {v.status === 'retired' && (
                      <Button variant="ghost" disabled={promoting || locked} onClick={() => setTarget(v)}>
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
          if (target) promote(target)
          setTarget(null)
        }}
      >
        {target && current && <SwitchFacts from={current} to={target} nextPrediction={nextPrediction} />}
      </ConfirmDialog>
    </section>
  )
}

/** 확인 대화상자 내용 — 다음 예측이 남아 있으면 공용 ProductionSwitchFacts, 없으면 "다음 예측부터"만 */
function SwitchFacts({
  from,
  to,
  nextPrediction,
}: {
  from: ModelVersion
  to: ModelVersion
  nextPrediction: { at: Ymdhm; flightId: string } | null
}) {
  if (nextPrediction) return <ProductionSwitchFacts from={from} to={to} nextPrediction={nextPrediction} />
  return (
    <ConfirmFacts
      items={[
        {
          label: '운영 버전',
          value: (
            <span className="type-mono">
              {from.version} → {to.version}
            </span>
          ),
        },
        {
          label: '검증 MAE',
          value: (
            <>
              <span className="tabular-nums">{fmtDecimal(from.valMae)}</span> →{' '}
              <Num value={to.valMae} digits={1} unit="분" />
            </>
          ),
        },
        { label: '적용', value: '다음 예측부터' },
      ]}
    />
  )
}
