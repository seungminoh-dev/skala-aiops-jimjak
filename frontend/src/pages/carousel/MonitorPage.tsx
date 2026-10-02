import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChartLineIcon, GaugeIcon, ListBulletsIcon, StackIcon, TimerIcon } from '@phosphor-icons/react'

import { batchVerdictInput, useMonitoring, useScenarios, type BatchRecord } from '@/api'
import { LIVE_CAROUSEL, PAGE_PATH } from '@/app/routes'
import { verdictView, VerdictLabel } from '@/components/carousel/verdict'
import { LineChart, type Marker } from '@/components/charts/LineChart'
import { Sparkline } from '@/components/charts/Sparkline'
import { Card, PageHeader, StatCard } from '@/components/common/Card'
import { Pager } from '@/components/common/Pager'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { carouselName, fmtClock } from '@/lib/format'

/**
 * 모니터링 (엔지니어, 원어) — Vercel Observability 를 따른다. 질문: "모델이 알아채나"
 *   1. 지표 네 칸: 지금 판정 · 감시 창 MAE(추세선) · 연속 초과 · 응답 시간
 *   2. 그래프 두 칸: 배치별 MAE(임계선·사건·배포 표시) · 감시 창 21편 예측 vs 실제
 *   3. 판정 기록 목록 (페이지 넘김)
 */
export function MonitorPage() {
  const m = useMonitoring()
  const sc = useScenarios()
  const navigate = useNavigate()
  const last = m.lastBatch
  const verdict = m.verdictBlock.verdict
  const vv = verdictView(verdict)
  const maes = m.batches.map((b) => b.windowMae)
  const overNow = last ? last.windowMae > m.threshold : false
  const scenarioName = (id: string | null) => sc.scenarios.find((s) => s.id === id)?.name ?? null

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="모니터링"
        sub={
          <>
            {carouselName(LIVE_CAROUSEL)} 수취대 예측 모델 <span className="type-mono-13 text-gray-1000">{m.modelVersion}</span> · {m.windowSize}편이 모일 때마다
            드리프트를 점검합니다{last && <> · 마지막 점검 <span className="type-mono-13 text-gray-1000">{fmtClock(last.at)}</span></>}
          </>
        }
        actions={
          <Button variant="outline" onClick={() => navigate(PAGE_PATH.logs)}>
            <ListBulletsIcon />
            로그
          </Button>
        }
      />

      {/* 1. 지표 */}
      <div className="grid grid-cols-4 gap-4">
        <div className="material-base flex flex-col gap-2 p-4">
          <span className="flex items-center gap-1.5 type-label-13 text-gray-900">
            <GaugeIcon size={14} />
            지금 판정
          </span>
          <span className={cn('flex items-center gap-2 type-heading-20', vv.cls)}>
            <vv.Icon size={24} weight={verdict.kind === 'warn' ? 'bold' : 'regular'} />
            {vv.label}
          </span>
          <span className="type-label-13 text-gray-900">
            {verdict.kind === 'ok' && '감시 창 MAE가 임계값 아래예요'}
            {verdict.kind === 'warn' && '한 번 더 넘으면 재학습합니다'}
            {verdict.kind === 'alert_only' && '사건 태그 편 때문이라 재학습하지 않았어요'}
            {verdict.kind === 'retrain_promoted' && '게이트를 통과해 새 버전이 Production이 됐어요'}
            {verdict.kind === 'retrain_rejected' && '게이트를 통과하지 못해 기존 버전을 유지해요'}
            {verdict.kind === 'pending' && '감시 창에 편이 더 모여야 판정해요'}
          </span>
        </div>
        <StatCard
          label="감시 창 MAE"
          icon={<ChartLineIcon size={14} />}
          value={last ? last.windowMae.toFixed(1) : '-'}
          unit="분"
          tone={overNow ? 'red' : 'blue'}
          sub={
            <>
              임계값 <span className="text-red-900">{m.threshold}분</span> (정상 구간 p95와 배포 기준 {m.gateMae}분 중 큰 값)
            </>
          }
          chart={<Sparkline values={maes} tone={overNow ? 'red' : 'blue'} threshold={m.threshold} height={36} />}
        />
        <StatCard
          label="연속 초과"
          icon={<StackIcon size={14} />}
          value={`${m.consecutive}/${m.consecutiveLimit}`}
          tone={m.consecutive > 0 ? 'amber' : 'plain'}
          sub={`${m.consecutiveLimit}번 연속으로 넘으면 재학습`}
          chart={
            <div className="flex gap-1.5">
              {Array.from({ length: m.consecutiveLimit }, (_, i) => (
                <span key={i} className={cn('h-2 flex-1 rounded-full transition-colors duration-500', i < m.consecutive ? 'bg-amber-700' : 'bg-gray-100')} />
              ))}
            </div>
          }
        />
        <StatCard
          label="응답 시간 p95"
          icon={<TimerIcon size={14} />}
          value={m.latency.p95Ms}
          unit="ms"
          sub={
            <>
              p50 {m.latency.p50Ms}ms · 요청 {m.latency.requests.toLocaleString()}회 ({m.latency.windowLabel})
            </>
          }
        />
      </div>

      {/* 2. 그래프 */}
      <div className="grid grid-cols-2 gap-4">
        <Card
          title="배치별 MAE"
          aside={
            <>
              <Legend tone="blue" label="MAE" />
              <Legend tone="red" dashed label="임계값" />
            </>
          }
        >
          <LineChart
            count={m.batches.length}
            series={[{ key: 'mae', values: maes, tone: 'blue', area: true, dots: true }]}
            yMax={Math.max(10, Math.ceil(Math.max(...maes, m.threshold) + 1))}
            yTicks={[0, 5, 10]}
            threshold={{ value: m.threshold, label: `임계값 ${m.threshold}` }}
            markers={batchMarkers(m.batches)}
            xLabel={(i) => (i % 2 === 0 || i === m.batches.length - 1 ? fmtClock(m.batches[i].at) : null)}
            tooltip={(i) => <BatchTip b={m.batches[i]} limit={m.consecutiveLimit} scenario={scenarioName(m.batches[i].scenarioId)} />}
            height={240}
          />
        </Card>

        <Card
          title={`감시 창 ${m.judgedWindow.length}편`}
          aside={
            <>
              <Legend tone="blue" label="예측" />
              <Legend tone="gray" label="실제" />
            </>
          }
        >
          <LineChart
            count={m.judgedWindow.length}
            series={[
              { key: 'pred', values: m.judgedWindow.map((p) => p.predicted), tone: 'blue', dots: true },
              { key: 'act', values: m.judgedWindow.map((p) => p.actual), tone: 'gray', area: true, dots: true },
            ]}
            yMax={Math.max(60, Math.ceil((Math.max(...m.judgedWindow.map((p) => Math.max(p.actual, p.predicted)), 0) + 5) / 10) * 10)}
            yTicks={[0, 25, 50]}
            yUnit="분"
            markers={m.judgedWindow.flatMap((p, i): Marker[] => (p.eventTag ? [{ index: i, kind: 'event' }] : []))}
            xLabel={(i) => (i === 0 || i === m.judgedWindow.length - 1 || i === 10 ? `${i + 1}` : null)}
            tooltip={(i) => {
              const p = m.judgedWindow[i]
              return (
                <span className="flex flex-col gap-0.5">
                  <span className="type-mono-12 font-medium text-gray-1000">
                    {p.flightId} <span className="text-gray-700">{fmtClock(p.landing)} 착륙</span>
                  </span>
                  <span className="text-blue-900">예측 {p.predicted}분</span>
                  <span className="text-gray-1000">
                    실제 {p.actual}분 <span className={Math.abs(p.errorMin) >= 10 ? 'text-red-900' : 'text-gray-700'}>({p.errorMin > 0 ? '+' : ''}{p.errorMin}분)</span>
                  </span>
                  {p.eventTag && <span className="text-amber-900">사건: {p.eventTag}</span>}
                </span>
              )
            }}
            height={240}
          />
        </Card>
      </div>

      {/* 3. 판정 기록 */}
      <BatchList batches={m.batches} limit={m.consecutiveLimit} scenarioName={scenarioName} threshold={m.threshold} />
    </div>
  )
}

function batchMarkers(batches: BatchRecord[]): Marker[] {
  return batches.flatMap((b, i): Marker[] => {
    if (b.verdict === 'alert_only') return [{ index: i, kind: 'event' }]
    if (b.verdict === 'retrain_rejected') return [{ index: i, kind: 'alert' }]
    if (b.deployedVersion) return [{ index: i, kind: 'deploy', label: b.deployedVersion }]
    return []
  })
}

function Legend({ tone, label, dashed }: { tone: 'blue' | 'gray' | 'red'; label: string; dashed?: boolean }) {
  const color = { blue: 'border-blue-700', gray: 'border-gray-1000', red: 'border-red-700' }[tone]
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn('w-4 border-t-2', color, dashed && 'border-dashed')} aria-hidden />
      {label}
    </span>
  )
}

function BatchTip({ b, limit, scenario }: { b: BatchRecord; limit: number; scenario: string | null }) {
  return (
    <span className="flex flex-col gap-1">
      <span className="type-mono-12 font-medium text-gray-1000">
        배치 #{b.no} <span className="text-gray-700">{fmtClock(b.at)} · {b.modelVersion}</span>
      </span>
      <span className="text-blue-900">MAE {b.windowMae.toFixed(1)}분</span>
      <VerdictLabel v={batchVerdictInput(b, limit)} className="type-label-12" />
      {scenario && <span className="text-gray-700">시나리오: {scenario}</span>}
    </span>
  )
}

/* ───────────────────────── 판정 기록 ───────────────────────── */

const PAGE = 6

function BatchList({
  batches,
  limit,
  threshold,
  scenarioName,
}: {
  batches: BatchRecord[]
  limit: number
  threshold: number
  scenarioName: (id: string | null) => string | null
}) {
  const [page, setPage] = useState(0)
  const rows = [...batches].reverse()
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-heading-16 text-gray-1000">판정 기록</h2>
      <ul key={page} className="material-base divide-y divide-gray-alpha-400">
        {shown.map((b, i) => {
          const pct = Math.min(100, (b.windowMae / (threshold * 1.6)) * 100)
          const over = b.windowMae > threshold
          return (
            <li key={b.no} className="grid h-12 animate-fade-up grid-cols-[150px_minmax(0,1fr)_200px_90px_160px] items-center gap-4 px-4" style={{ animationDelay: `${i * 30}ms` }}>
              <span className="flex items-center gap-2">
                <span className="type-mono-14 font-medium text-gray-1000">#{b.no}</span>
                <span className="type-mono-13 text-gray-900">{fmtClock(b.at)}</span>
              </span>
              <VerdictLabel v={batchVerdictInput(b, limit)} className="type-label-14" />
              <span className="flex items-center gap-2">
                <span className="relative h-1.5 flex-1 overflow-hidden rounded-full bg-gray-100">
                  <span className={cn('absolute inset-y-0 left-0 rounded-full', over ? 'bg-red-700' : 'bg-blue-700')} style={{ width: `${pct}%` }} />
                  <span className="absolute inset-y-0 w-px bg-red-700" style={{ left: `${(threshold / (threshold * 1.6)) * 100}%` }} />
                </span>
                <span className={cn('w-14 text-right type-mono-13 num', over ? 'text-red-900' : 'text-gray-1000')}>{b.windowMae.toFixed(1)}분</span>
              </span>
              <span>
                <span className={cn('inline-flex h-6 items-center rounded-full px-2 type-mono-12', b.deployedVersion ? 'bg-blue-700 text-white' : 'bg-gray-100 text-gray-1000')}>
                  {b.deployedVersion ?? b.modelVersion}
                </span>
              </span>
              <span className="truncate text-right type-label-13 text-gray-900">{scenarioName(b.scenarioId) ?? '평소 운영'}</span>
            </li>
          )
        })}
      </ul>
      <Pager page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
    </section>
  )
}
