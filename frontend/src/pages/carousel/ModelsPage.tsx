import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CheckCircleIcon,
  CheckIcon,
  CubeIcon,
  HandPalmIcon,
  ListBulletsIcon,
  RocketLaunchIcon,
  XCircleIcon,
  XIcon,
} from '@phosphor-icons/react'

import { actions, useCarousel, useDemoClock, useLogs, useModels, useScenarios, type GateRecord, type LogTag, type ModelVersion } from '@/api'
import { PAGE_PATH } from '@/app/routes'
import { ModelDiagram } from '@/components/carousel/ModelDiagram'
import { ConfirmDialog } from '@/components/app/ConfirmDialog'
import { notifyDeploy, notifyError } from '@/components/app/notify'
import { Card, PageHeader } from '@/components/common/Card'
import { MascotCarry } from '@/components/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { fmtClock, fmtWhen } from '@/lib/format'

/**
 * 모델 (엔지니어, 원어) — Vercel Deployments 를 따른다. 질문: "스스로 고쳐지나"
 *   1. Production 카드: 모델 그림(앞 20편 → LSTM → Dense → 분) · 버전 정보 · 재학습 중이면 마스코트
 *   2. 버전 목록 (Deployments 모양) · 수동 승격
 *   3. 게이트 기록 (펼치면 기준 세 줄)
 *   4. 재학습 로그 (빌드 로그 모양)
 */
export function ModelsPage() {
  const models = useModels()
  const carousel = useCarousel()
  const sc = useScenarios()
  const navigate = useNavigate()
  const now = useDemoClock().now
  const prod = models.versions.find((v) => v.version === models.production)
  const retraining = sc.currentRun?.steps.some((s) => (s.key === 'retrain' || s.key === 'gate') && s.state === 'running') ?? false
  const focus = carousel.processing ?? carousel.next
  const awaiting = models.gates.at(-1)?.needsApproval ? models.gates.at(-1)! : null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="모델"
        sub={<>BagTime_Predictor · LSTM (앞 20편 × 2특성) · MLflow 레지스트리 · 게이트 MAE ≤ {models.gateMae}분</>}
        actions={
          <Button variant="outline" onClick={() => navigate(PAGE_PATH.logs)}>
            <ListBulletsIcon />
            로그
          </Button>
        }
      />

      {/* 1. Production */}
      <Card
        title={
          <>
            Production
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-700 px-2 type-mono-12 font-medium text-white">
              <RocketLaunchIcon size={12} weight="fill" />
              {models.production}
            </span>
          </>
        }
        aside={prod && <>배포 <span className="type-mono-13 text-gray-1000">{fmtWhen(prod.deployedAt, now)}</span></>}
        footer={
          retraining ? (
            <span className="flex items-center gap-3 text-blue-900">
              <MascotCarry size="sm" />
              <span className="flex flex-col">
                <span className="type-label-14 font-semibold">재학습 중</span>
                <span className="type-label-13 text-gray-900">fine-tune from {models.production} · 최근 14일 · 사건 편 제외 · epochs 10</span>
              </span>
            </span>
          ) : awaiting ? (
            <span className="flex items-center gap-2 text-amber-900">
              <HandPalmIcon size={16} className="shrink-0" />
              게이트는 못 넘었지만 지금 모델보다 나은 {awaiting.candidate}이 승인을 기다려요 — 아래 게이트 기록에서 적용할 수 있어요
            </span>
          ) : (
            <span>드리프트가 2번 연속이면 자동으로 재학습하고, 게이트를 통과하면 Production 으로 승격합니다</span>
          )
        }
        bodyClassName="flex gap-8 p-6"
      >
        <ModelDiagram sequence={carousel.sequence.map((s) => s.minutes)} output={focus?.prediction?.minutes ?? null} />
        {prod && (
          <div className="grid flex-1 grid-cols-2 content-start gap-x-8 gap-y-5">
            <Field label="버전">
              <span className="font-mono text-[16px] leading-6 font-semibold text-gray-1000">{prod.version}</span>
            </Field>
            <Field label="학습 방식">
              <span className="type-label-14 text-gray-1000">
                {prod.method === 'fine-tuning' ? (
                  <>
                    fine-tuning ← <span className="type-mono-14">{prod.base}</span>
                  </>
                ) : (
                  '처음 학습'
                )}
              </span>
            </Field>
            <Field label="검증 MAE">
              <span className="flex items-baseline gap-1 text-blue-900">
                <span className="type-heading-48 num">{prod.valMae.toFixed(1)}</span>
                <span className="type-label-14 font-medium">분</span>
              </span>
            </Field>
            <Field label="게이트 기준">
              <span className="flex flex-col gap-1 type-label-13 text-gray-1000">
                <span>검증 MAE ≤ {models.gateMae}분</span>
                <span>기준 대비 10% 이상 개선</span>
                <span>평소 구간 회귀 없음</span>
              </span>
            </Field>
            <Field label="학습 데이터">
              <span className="type-mono-13 text-gray-1000">{prod.trainData}</span>
            </Field>
            <Field label="학습">
              <span className="type-label-14 text-gray-1000">
                <span className="type-mono-13">{fmtWhen(prod.trainedAt, now)}</span> · epochs {prod.epochs}
              </span>
            </Field>
          </div>
        )}
      </Card>

      {/* 2. 버전 목록 */}
      <section className="flex flex-col gap-3">
        <h2 className="type-heading-16 text-gray-1000">버전</h2>
        <ul className="material-base divide-y divide-gray-alpha-400">
          {[...models.versions].reverse().map((v, i) => (
            <VersionRow key={v.version} v={v} production={models.production} index={i} busy={sc.runningId !== null} now={now} />
          ))}
        </ul>
      </section>

      <div className="grid grid-cols-2 items-start gap-4">
        {/* 3. 게이트 기록 */}
        <section className="flex flex-col gap-3">
          <h2 className="type-heading-16 text-gray-1000">게이트 기록</h2>
          {models.gates.length === 0 ? (
            <div className="material-base px-4 py-6 text-center type-label-13 text-gray-900">아직 게이트 기록이 없어요</div>
          ) : (
            <ul className="material-base divide-y divide-gray-alpha-400">
              {[...models.gates].reverse().map((g) => (
                <GateRow key={g.id} g={g} now={now} busy={sc.runningId !== null} />
              ))}
            </ul>
          )}
        </section>

        {/* 4. 재학습 로그 */}
        <section className="flex flex-col gap-3">
          <h2 className="type-heading-16 text-gray-1000">재학습 로그</h2>
          <RetrainLog />
        </section>
      </div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <span className="type-label-13 text-gray-900">{label}</span>
      {children}
    </div>
  )
}

/* ───────────────────────── 버전 ───────────────────────── */

function VersionRow({ v, production, index, busy, now }: { v: ModelVersion; production: string; index: number; busy: boolean; now: string }) {
  const isProd = v.version === production
  const promote = async () => {
    try {
      await actions.promoteVersion(v.version)
      notifyDeploy(`${v.version}을 Production 으로 바꿨어요`)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '승격하지 못했어요')
    }
  }
  return (
    <li className="grid h-14 animate-fade-up grid-cols-[minmax(0,1fr)_150px_120px_140px_150px] items-center gap-4 px-4" style={{ animationDelay: `${index * 40}ms` }}>
      <span className="flex min-w-0 items-center gap-3">
        <CubeIcon size={18} className={isProd ? 'text-blue-700' : 'text-gray-700'} />
        <span className="type-mono-14 font-semibold text-gray-1000">{v.version}</span>
        <span className="truncate type-label-13 text-gray-900">
          {v.method === 'fine-tuning' ? `fine-tuning ← ${v.base}` : '처음 학습'} · {v.trainData}
        </span>
      </span>
      <span>
        {isProd ? (
          <span className="inline-flex h-6 items-center gap-1 rounded-full bg-blue-700 px-2 type-label-12 font-medium text-white">
            <RocketLaunchIcon size={12} weight="fill" />
            Production
          </span>
        ) : (
          <span className="inline-flex h-6 items-center rounded-full px-2 type-label-12 text-gray-900 shadow-border">Retired</span>
        )}
      </span>
      <span className="type-label-13 text-gray-900">
        MAE <span className="type-mono-13 font-medium text-gray-1000">{v.valMae.toFixed(1)}</span>
      </span>
      <span className="type-label-13 text-gray-900">
        학습 <span className="type-mono-13 text-gray-1000">{fmtWhen(v.trainedAt, now)}</span>
      </span>
      <span className="flex justify-end">
        {!isProd && (
          <ConfirmDialog
            trigger={
              <Button variant="outline" size="sm" disabled={busy}>
                <ArrowsClockwiseIcon />
                Production 으로
              </Button>
            }
            title={`${v.version}을 Production 으로`}
            confirmLabel="승격"
            onConfirm={() => void promote()}
          >
            <p className="type-copy-14 text-gray-900">다음 예측부터 {v.version}이 씁니다. 감시 창은 새로 모입니다.</p>
          </ConfirmDialog>
        )}
      </span>
    </li>
  )
}

/* ───────────────────────── 게이트 ───────────────────────── */

function GateRow({ g, now, busy }: { g: GateRecord; now: string; busy: boolean }) {
  const [open, setOpen] = useState(false)
  return (
    <li>
      <button type="button" onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-gray-100">
        {g.passed ? <CheckCircleIcon size={18} className="shrink-0 text-green-900" /> : <XCircleIcon size={18} className="shrink-0 text-red-900" />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-label-14 font-medium text-gray-1000">
            <span className="type-mono-14">{g.candidate}</span> {g.passed ? '통과' : '실패'} → {g.decision}
          </span>
          <span className="truncate type-label-13 text-gray-900">{g.trigger}</span>
        </span>
        <span className="type-mono-12 text-gray-900">{fmtWhen(g.at, now)}</span>
        <CaretDownIcon size={14} className={cn('text-gray-900 transition-transform', open && 'rotate-180')} />
      </button>
      <div className={cn('disclosure', open && 'disclosure-open')}>
        <div className="min-h-0 overflow-hidden">
          <ul className="flex flex-col gap-1.5 px-4 pb-3 pl-11">
            {g.checks.map((c) => (
              <li key={c.criterion} className="flex items-center gap-2 type-label-13">
                {c.passed ? <CheckIcon size={14} weight="bold" className="text-green-900" /> : <XIcon size={14} weight="bold" className="text-red-900" />}
                <span className="text-gray-1000">{c.criterion}</span>
                <span className="ml-auto type-mono-12 text-gray-900">{c.value}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      {g.needsApproval && g.runId && <ApprovalBar g={g} runId={g.runId} busy={busy} />}
    </li>
  )
}

/**
 * 승인 막대 — 게이트는 못 넘었지만 같은 검증 데이터에서 지금 모델보다 나은 후보 (기획서 ③ 재학습 "불합격 시").
 * 사람이 승인하면 새 버전으로 등록하고 바로 Production (실서버 POST /models/approve).
 */
function ApprovalBar({ g, runId, busy }: { g: GateRecord; runId: string; busy: boolean }) {
  const failed = g.checks.filter((c) => !c.passed).map((c) => c.criterion)
  const current = g.checks[2]?.value.split(' → ')[0]
  const approve = async () => {
    try {
      const res = await actions.approveCandidate(runId)
      notifyDeploy(`운영자 승인 — ${res.version}을 Production 으로 적용했어요`)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '승인하지 못했어요')
    }
  }
  return (
    <div className="flex items-center gap-3 border-t border-gray-alpha-400 bg-amber-100 px-4 py-3">
      <HandPalmIcon size={18} className="shrink-0 text-amber-900" />
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="type-label-14 font-medium text-gray-1000">승인 대기 · 지금 모델보다 나아요</span>
        <span className="truncate type-label-13 text-gray-900">
          검증 MAE <span className="type-mono-13 text-gray-1000">{current} → {g.checks[0]?.value}</span>분 · 못 넘은 기준: {failed.join(', ')}
        </span>
      </span>
      <ConfirmDialog
        trigger={
          <Button size="sm" disabled={busy}>
            <CheckIcon />
            승인하고 적용
          </Button>
        }
        title={`${g.candidate}을 Production 으로`}
        confirmLabel="승인"
        onConfirm={() => void approve()}
      >
        <p className="type-copy-14 text-gray-900">
          게이트 기준({failed.join(', ')})은 넘지 못했지만, 같은 검증 데이터에서 지금 모델보다 오차가 작아요({current} → {g.checks[0]?.value}분).
          승인하면 새 버전으로 등록해 다음 예측부터 쓰고, 감시 창은 새로 모입니다.
        </p>
      </ConfirmDialog>
    </div>
  )
}

/* ───────────────────────── 재학습 로그 ───────────────────────── */

const TAG_CLS: Record<LogTag, string> = {
  WARN: 'text-amber-900',
  INFO: 'text-gray-900',
  OK: 'text-green-900',
  FAIL: 'text-red-900',
  ALERT: 'text-red-900',
  CHECK: 'text-gray-700',
}

function RetrainLog() {
  const logs = useLogs()
  // 목업(영어 태그 줄)과 실서버(aiops.log 한국어 줄) 둘 다
  const lines = logs
    .filter((l) => /retrain|gate|promot|drift|new_mae|serving|재학습|드리프트|배포|승격|승인|되돌림|fine-tuning|보류|초기화/i.test(l.message))
    .slice(-12)
  if (lines.length === 0)
    return <div className="material-base px-4 py-6 text-center type-label-13 text-gray-900">아직 재학습 로그가 없어요</div>
  return (
    <div className="material-base overflow-hidden">
      <ol className="flex flex-col py-2">
        {lines.map((l, i) => (
          <li key={`${l.at}-${i}`} className="grid animate-fade-up grid-cols-[28px_48px_44px_minmax(0,1fr)] gap-2 px-4 py-1" style={{ animationDelay: `${i * 25}ms` }}>
            <span className="type-mono-12 text-gray-600 num">{i + 1}</span>
            <span className="type-mono-12 text-gray-900 num">{fmtClock(l.at)}</span>
            <span className={cn('type-mono-12 font-medium', TAG_CLS[l.tag])}>{l.tag}</span>
            <span className={cn('type-mono-12 break-words', l.highlight ? 'text-blue-900' : 'text-gray-1000')}>{l.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
