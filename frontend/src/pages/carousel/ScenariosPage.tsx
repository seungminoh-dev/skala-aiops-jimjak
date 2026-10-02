import { useEffect, useRef, useState, type ComponentType } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import {
  ArrowsClockwiseIcon,
  ChartLineIcon,
  CheckCircleIcon,
  CheckIcon,
  CircleNotchIcon,
  HandPalmIcon,
  LightningIcon,
  PlayIcon,
  RocketLaunchIcon,
  ShieldCheckIcon,
  StackIcon,
  UploadSimpleIcon,
  WarningIcon,
  XIcon,
} from '@phosphor-icons/react'

import {
  actions,
  useDataset,
  useScenarios,
  type PipelineRun,
  type PipelineStep,
  type PipelineStepKey,
  type ScenarioCategory,
  type ScenarioId,
  type ScenarioView,
} from '@/api'
import { DATA_FILES } from '@/api/scenarioData'
import { notify, notifyDeploy, notifyError } from '@/components/app/notify'
import { VerdictLabel } from '@/components/carousel/verdict'
import { Card, PageHeader } from '@/components/common/Card'
import { Pager } from '@/components/common/Pager'
import { MascotCarry, MascotPose } from '@/components/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'
import { EASE_OUT, FADE } from '@/lib/motion'

/**
 * 시나리오 (운영, 쉬운 말) — 질문: "규칙으로는 못 버티는 사건이 생기면?"
 *   왼쪽: 사건 목록 (분류 아이콘 · 예상 결과 · 실행 횟수)
 *   오른쪽: 실행 패널 — 이야기 한 줄 · 데이터 숫자 · 실행 버튼 · 여섯 단계(차례로 불이 들어온다) · 결과
 *   아래: 실행 기록 (페이지 넘김) · 학습 데이터 올리기
 */
type Icon = ComponentType<{ size?: number; className?: string; weight?: 'regular' | 'bold' | 'fill' }>

const CATEGORY: Record<ScenarioCategory, { Icon: Icon; cls: string; label: string }> = {
  normal: { Icon: CheckCircleIcon, cls: 'text-green-900', label: '평소' },
  retrain: { Icon: ArrowsClockwiseIcon, cls: 'text-blue-900', label: '다시 학습' },
  alert_only: { Icon: LightningIcon, cls: 'text-amber-900', label: '사건 경고' },
  judgement: { Icon: HandPalmIcon, cls: 'text-amber-900', label: '사람 판단' },
}

const STORY: Record<ScenarioId, string> = {
  normal: '평소처럼 짐이 나오는 날이에요. AI는 점검만 하고 아무것도 바꾸지 않아요.',
  staff_shortage: '조업 인력이 2주째 모자라 처리 시간이 길어졌어요. 규칙은 그대로라 계속 틀려요.',
  conveyor_fault: '컨베이어가 잠깐 멈춰 몇 편만 크게 늦어요. 일시적인 사건이라 모델은 그대로 둬요.',
  expansion: '수취대가 늘어 처리 시간이 짧아졌어요. 예전 기준으로는 너무 길게 예측해요.',
  opening_chaos: '새 터미널을 막 열었어요. 처음엔 들쭉날쭉하다가 새 흐름이 자리 잡아요.',
  process_change: '짐 처리 방식이 바뀌었어요. 새 모델이 성능 검사를 못 넘을 수도 있어요.',
}

const STEP: Record<PipelineStepKey, { label: string; Icon: Icon }> = {
  drift: { label: '예측 어긋남 검사', Icon: ChartLineIcon },
  event: { label: '공항 사건인지 확인', Icon: LightningIcon },
  consecutive: { label: '두 번 연속인지 확인', Icon: StackIcon },
  retrain: { label: '모델 다시 학습', Icon: ArrowsClockwiseIcon },
  gate: { label: '성능 검사', Icon: ShieldCheckIcon },
  deploy: { label: '새 모델 적용', Icon: RocketLaunchIcon },
}
const STEP_ORDER: PipelineStepKey[] = ['drift', 'event', 'consecutive', 'retrain', 'gate', 'deploy']

/** 화면 기대 문구를 쉬운 말로 */
const easy = (s: string) =>
  s.replace(/주의/g, '예측 어긋남').replace(/재학습/g, '다시 학습').replace(/알림만/g, '사건 경고').replace(/배포/g, '적용').replace(/게이트/g, '성능 검사')

export function ScenariosPage() {
  const sc = useScenarios()
  const [selected, setSelected] = useState<ScenarioId>('staff_shortage')
  const scenario = sc.scenarios.find((s) => s.id === selected) ?? sc.scenarios[0]
  const running = sc.runningId !== null
  const run = sc.currentRun && sc.currentRun.scenarioId === scenario.id ? sc.currentRun : null
  const [revealed, setRevealed] = useState(false)

  const start = async () => {
    try {
      const result = await actions.runScenario(scenario.id)
      const deploy = result.steps.find((s) => s.key === 'deploy' && s.state === 'done')
      if (deploy) notifyDeploy(`새 모델 ${deploy.result ?? ''} 적용`)
      else notify(`${scenario.name} 실행을 마쳤어요`)
    } catch (e) {
      notifyError(e instanceof Error ? e.message : '실행하지 못했어요')
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="시나리오" sub="규칙만으로는 버티기 어려운 사건을 넣어 보고, AI가 어떻게 대응하는지 봅니다" />

      <div className="grid grid-cols-[340px_minmax(0,1fr)] items-start gap-6">
        {/* 사건 목록 */}
        <ul className="material-base divide-y divide-gray-alpha-400" aria-label="사건">
          {sc.scenarios.map((s) => (
            <ScenarioItem key={s.id} s={s} active={s.id === scenario.id} running={sc.runningId === s.id} onSelect={() => setSelected(s.id)} />
          ))}
        </ul>

        {/* 실행 패널 */}
        <Card
          title={
            <>
              {scenario.name}
              <CategoryChip category={scenario.category} />
            </>
          }
          aside={<span className="type-mono-12">{scenario.dataFile}</span>}
          bodyClassName="flex flex-col gap-6 p-6"
        >
          <div className="flex items-start justify-between gap-6">
            <div className="flex min-w-0 flex-col gap-3">
              <p className="type-copy-14 text-gray-1000">{STORY[scenario.id]}</p>
              <DataFacts id={scenario.id} />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-2">
              <Button size="lg" onClick={() => void start()} disabled={running}>
                {sc.runningId === scenario.id ? <CircleNotchIcon className="animate-spin" /> : <PlayIcon weight="fill" />}
                {sc.runningId === scenario.id ? '실행 중' : '실행'}
              </Button>
              <span className="type-label-12 text-gray-900">
                이번 실행 예상: <span className="font-medium text-gray-1000">{easy(scenario.nextExpected)}</span>
                {scenario.cycle > 1 && (
                  <span className="num">
                    {' '}
                    ({scenario.cursor + 1}/{scenario.cycle}단계)
                  </span>
                )}
              </span>
            </div>
          </div>

          <Steps run={run} onRevealed={setRevealed} />

          <Outcome run={run} running={sc.runningId === scenario.id || (run?.outcome != null && !revealed)} revealed={revealed} />
        </Card>
      </div>

      <RunHistory runs={sc.runs} />
      <DataCard />
    </div>
  )
}

/* ───────────────────────── 사건 목록 ───────────────────────── */

function ScenarioItem({ s, active, running, onSelect }: { s: ScenarioView; active: boolean; running: boolean; onSelect: () => void }) {
  const c = CATEGORY[s.category]
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className={cn(
          'flex w-full cursor-pointer items-start gap-3 px-4 py-3 text-left transition-colors first:rounded-t-md last:rounded-b-md',
          active ? 'bg-gray-100' : 'hover:bg-gray-alpha-100',
        )}
      >
        {running ? <CircleNotchIcon size={18} className="mt-0.5 shrink-0 animate-spin text-blue-700" /> : <c.Icon size={18} className={cn('mt-0.5 shrink-0', c.cls)} />}
        <span className="flex min-w-0 flex-1 flex-col gap-0.5">
          <span className="type-label-14 font-medium text-gray-1000">{s.name}</span>
          <span className="truncate type-label-13 text-gray-900">예상: {easy(s.expected)}</span>
        </span>
        <span className="type-label-12 text-gray-700 num">{s.runs}회</span>
      </button>
    </li>
  )
}

function CategoryChip({ category }: { category: ScenarioCategory }) {
  const c = CATEGORY[category]
  return (
    <span className={cn('inline-flex h-6 items-center gap-1 rounded-full bg-gray-100 px-2 type-label-12 font-medium', c.cls)}>
      <c.Icon size={12} weight="bold" />
      {c.label}
    </span>
  )
}

function DataFacts({ id }: { id: ScenarioId }) {
  const d = DATA_FILES[id].summary
  const normal = DATA_FILES.normal.summary
  const diff = Math.round((d.waitMeanMin - normal.waitMeanMin) * 10) / 10
  return (
    <div className="flex flex-wrap gap-x-6 gap-y-1 type-label-13 text-gray-900">
      <span>
        평균 처리 시간 <span className="font-medium text-gray-1000 num">{d.waitMeanMin}분</span>
        {id !== 'normal' && (
          <span className={cn('num', diff > 0 ? 'text-red-900' : 'text-green-900')}>
            {' '}
            (평소보다 {diff > 0 ? '+' : ''}
            {diff}분)
          </span>
        )}
      </span>
      <span>
        50분 넘는 편 <span className="font-medium text-gray-1000 num">{d.over50Rows}편</span> / {d.rows}편
      </span>
      {d.eventRows > 0 && (
        <span className="text-amber-900">
          사건 편 <span className="font-medium num">{d.eventRows}편</span>
        </span>
      )}
    </div>
  )
}

/* ───────────────────────── 여섯 단계 ───────────────────────── */

/**
 * 여섯 단계 — 결과가 오면 왼쪽부터 한 단계씩 불이 들어온다(단계 사이 선이 차오르고, 동그라미가 톡 커진다).
 * 끝까지 켜지면 onRevealed 로 결과 상자를 보이게 한다.
 */
function Steps({ run, onRevealed }: { run: PipelineRun | null; onRevealed: (done: boolean) => void }) {
  const steps: PipelineStep[] =
    run?.steps ??
    STEP_ORDER.map((key) => ({ key, name: STEP[key].label, state: 'waiting', result: null, systemAction: key === 'retrain' || key === 'deploy' }))
  const finished = Boolean(run?.outcome)
  const [revealed, setRevealed] = useState(finished ? 0 : steps.length)

  useEffect(() => {
    if (!finished) {
      setRevealed(steps.length)
      onRevealed(false)
      return
    }
    setRevealed(0)
    onRevealed(false)
    let n = 0
    const id = window.setInterval(() => {
      n += 1
      setRevealed(n)
      if (n >= steps.length) {
        window.clearInterval(id)
        onRevealed(true)
      }
    }, 260)
    return () => window.clearInterval(id)
    // 새 결과(run.id)가 올 때마다 다시 켠다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run?.id, finished])

  return (
    <ol className="grid grid-cols-6 gap-2" aria-label="AI 대응 단계">
      {steps.map((step, i) => {
        const s: PipelineStep = i < revealed ? step : { ...step, state: 'waiting', result: null }
        const meta = STEP[s.key]
        const tone =
          s.state === 'done'
            ? s.systemAction
              ? 'border-blue-400 bg-blue-100 text-blue-900'
              : 'border-green-400 bg-green-100 text-green-900'
            : s.state === 'running'
              ? 'border-blue-700 bg-background-100 text-blue-900'
              : s.state === 'failed'
                ? 'border-red-400 bg-red-100 text-red-900'
                : 'border-gray-alpha-400 bg-background-100 text-gray-700'
        return (
          <li key={s.key} className="relative flex flex-col gap-2">
            {/* 다음 단계로 이어지는 선 — 이 단계가 끝나면 왼쪽부터 차오른다 */}
            {i < steps.length - 1 && (
              <span aria-hidden className="absolute top-5 left-[calc(50%+22px)] h-px w-[calc(100%-44px+8px)] bg-gray-alpha-400">
                <motion.span
                  className="absolute inset-0 origin-left bg-gray-1000"
                  initial={false}
                  animate={{ scaleX: s.state === 'done' ? 1 : 0 }}
                  transition={{ duration: 0.26, ease: EASE_OUT }}
                />
              </span>
            )}
            <motion.span
              key={s.state}
              initial={{ scale: 0.82 }}
              animate={{ scale: 1 }}
              transition={{ type: 'spring', stiffness: 600, damping: 18 }}
              className={cn(
                'relative mx-auto flex size-10 items-center justify-center rounded-full border transition-colors duration-200',
                tone,
                s.state === 'skipped' && 'border-dashed',
              )}
            >
              {s.state === 'running' ? (
                <CircleNotchIcon size={18} className="animate-spin" />
              ) : s.state === 'done' ? (
                <CheckIcon size={18} weight="bold" />
              ) : s.state === 'failed' ? (
                <XIcon size={18} weight="bold" />
              ) : (
                <meta.Icon size={18} />
              )}
            </motion.span>
            <span className={cn('text-center type-label-13 transition-colors', s.state === 'waiting' || s.state === 'skipped' ? 'text-gray-700' : 'font-medium text-gray-1000')}>
              {meta.label}
            </span>
            <AnimatePresence mode="wait" initial={false}>
              <motion.span
                key={`${s.state}-${s.result ?? ''}`}
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={FADE}
                className="min-h-4 text-center type-mono-12 text-gray-900"
              >
                {s.state === 'skipped' ? '건너뜀' : (s.result ?? '')}
              </motion.span>
            </AnimatePresence>
          </li>
        )
      })}
    </ol>
  )
}

function Outcome({ run, running, revealed }: { run: PipelineRun | null; running: boolean; revealed: boolean }) {
  if (running)
    return (
      <div className="flex items-center gap-3 rounded-md bg-blue-100 px-4 py-3">
        <MascotCarry size="sm" />
        <span className="type-label-14 font-medium text-blue-900">AI가 상황을 판단하고 있어요</span>
      </div>
    )
  if (!run || !run.outcome || !revealed)
    return (
      <div className="flex items-center gap-3 rounded-md bg-gray-100 px-4 py-3">
        <MascotPose alert={false} size="sm" />
        <span className="type-label-14 text-gray-900">실행을 누르면 AI가 이 사건에 어떻게 대응하는지 단계별로 보여줘요</span>
      </div>
    )
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
      className="flex flex-col gap-3 rounded-md border border-gray-alpha-400 px-4 py-3"
    >
      <div className="flex items-center gap-3">
        <span className="type-label-13 text-gray-900">결과</span>
        <VerdictLabel v={run.outcome} engineer={false} className="type-label-14" />
        <span className={cn('ml-auto flex items-center gap-1 type-label-13 font-medium', run.matched ? 'text-green-900' : 'text-amber-900')}>
          {run.matched ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} weight="bold" />}
          {run.matched ? '예상과 같아요' : '예상과 달라요'}
        </span>
      </div>
      {run.gate && (
        <ul className="grid grid-cols-3 gap-2">
          {run.gate.map((g) => (
            <li key={g.criterion} className={cn('flex items-center gap-2 rounded-md px-3 py-2 type-label-13', g.passed ? 'bg-green-100' : 'bg-red-100')}>
              {g.passed ? <CheckIcon size={14} weight="bold" className="text-green-900" /> : <XIcon size={14} weight="bold" className="text-red-900" />}
              <span className="min-w-0 flex-1 truncate text-gray-1000">{g.criterion.replace('검증 MAE', '평균 오차')}</span>
              <span className="type-mono-12 text-gray-900">{g.value}</span>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  )
}

/* ───────────────────────── 실행 기록 ───────────────────────── */

const PAGE = 5

function RunHistory({ runs }: { runs: PipelineRun[] }) {
  const [page, setPage] = useState(0)
  const rows = [...runs].reverse()
  if (rows.length === 0) return null
  const shown = rows.slice(page * PAGE, page * PAGE + PAGE)
  return (
    <section className="flex flex-col gap-3">
      <h2 className="type-heading-16 text-gray-1000">실행 기록</h2>
      <ul key={page} className="material-base divide-y divide-gray-alpha-400">
        {shown.map((r, i) => (
          <li key={r.id} className="grid h-12 animate-fade-up grid-cols-[70px_200px_minmax(0,1fr)_120px] items-center gap-4 px-4" style={{ animationDelay: `${i * 30}ms` }}>
            <span className="type-mono-13 text-gray-900">{fmtClock(r.at)}</span>
            <span className="truncate type-label-14 font-medium text-gray-1000">{r.scenarioName}</span>
            {r.outcome ? <VerdictLabel v={r.outcome} engineer={false} className="type-label-14" /> : <span className="type-label-13 text-gray-700">진행 중</span>}
            <span className={cn('flex items-center justify-end gap-1 type-label-13', r.matched ? 'text-green-900' : 'text-amber-900')}>
              {r.matched ? <CheckCircleIcon size={16} /> : <WarningIcon size={16} weight="bold" />}
              {r.matched ? '예상대로' : '예상과 다름'}
            </span>
          </li>
        ))}
      </ul>
      <Pager page={page} pageSize={PAGE} total={rows.length} onChange={setPage} />
    </section>
  )
}

/* ───────────────────────── 학습 데이터 ───────────────────────── */

function DataCard() {
  const ds = useDataset()
  const input = useRef<HTMLInputElement>(null)
  const upload = async (file: File) => {
    try {
      const res = await actions.uploadCsv(file)
      notify(`${res.filename} ${res.rows}행을 올렸어요`)
    } catch (e) {
      notifyError(`${file.name}을 올리지 못했어요. ${e instanceof Error ? e.message : ''}`)
    }
  }
  const d = ds.current
  return (
    <Card
      title="학습 데이터"
      aside={
        <>
          <input ref={input} type="file" accept=".csv" className="hidden" onChange={(e) => e.target.files?.[0] && void upload(e.target.files[0])} />
          <Button variant="outline" size="sm" disabled={ds.uploading} onClick={() => input.current?.click()}>
            <UploadSimpleIcon />
            CSV 올리기
          </Button>
        </>
      }
      footer={<span>필수 컬럼 {ds.columns.length}개, {ds.minRows}행 이상 (앞 20편 + 감시 창 21편)</span>}
    >
      <div className="grid grid-cols-4 gap-6">
        <Fact label="파일" value={<span className="type-mono-13">{d.fileName}</span>} />
        <Fact label="행" value={`${d.rows.toLocaleString()}행`} />
        {/* 실서버에서 다른 곳이 올린 파일은 서버가 요약을 주지 않는다 → — */}
        <Fact label="평균 처리 시간" value={Number.isFinite(d.waitMeanMin) ? `${d.waitMeanMin}분` : '—'} />
        <Fact label="50분 넘는 편" value={Number.isFinite(d.over50Rows) ? `${d.over50Rows}편` : '—'} />
      </div>
    </Card>
  )
}

function Fact({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="type-label-13 text-gray-900">{label}</span>
      <span className="type-label-14 font-medium text-gray-1000 num">{value}</span>
    </div>
  )
}
