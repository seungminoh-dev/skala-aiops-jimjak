import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AirplaneLandingIcon,
  ArrowRightIcon,
  CheckCircleIcon,
  ClockIcon,
  FlaskIcon,
  ListBulletsIcon,
  SparkleIcon,
  WarningIcon,
} from '@phosphor-icons/react'

import { useCarousel, useTerminal, type CarouselFlight, type CarouselView } from '@/api'
import { LIVE_CAROUSEL, PAGE_PATH } from '@/app/routes'
import { FlightList } from '@/components/carousel/FlightList'
import { LivePreview } from '@/components/carousel/LivePreview'
import { SequenceChart } from '@/components/carousel/SequenceChart'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'
import { ACTION_THRESHOLD_MIN, fmtClock } from '@/lib/format'
import { useCountUp } from '@/lib/useCountUp'

/**
 * 수취대 개요 (운영, 쉬운 말) — Vercel 프로젝트 Overview 를 따른다.
 *   1. 다음 편 예측 카드 (Production Deployment 자리): 왼쪽 실시간 수취대 그림 · 오른쪽 핵심 값
 *   2. 예측 근거 (앞 20편 → 다음 편)
 *   3. 오늘 도착편 목록 (페이지 넘김)
 * 정보 계열: 예측 = 파랑 + 반짝 아이콘 · 실제 = 회색 · 기준·조치 필요 = 빨강 + 경고 아이콘 · 시각 = 고정폭 + 시계 아이콘.
 */
export function OverviewPage() {
  const carousel = useCarousel()
  const terminal = useTerminal()
  const navigate = useNavigate()
  const tier = terminal.carousels.find((c) => c.live)?.tier ?? 'operating'
  const next = carousel.next

  return (
    <div className="flex flex-col gap-6">
      {/* 머리: 수취대 이름 · 상태 · 동작 */}
      <div className="flex items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <h1 className="flex items-center gap-2.5 type-heading-24 text-gray-1000">
            <CarouselIcon tier={tier} size={24} />
            <span className="font-mono text-[24px] leading-8 font-semibold tracking-tight">{LIVE_CAROUSEL}</span> 수취대
          </h1>
          <p className="type-label-13 text-gray-900">
            제1여객터미널 · 예측 모델 <span className="type-mono-13 text-gray-1000">{carousel.production}</span> 운영 중 · 오늘 완료{' '}
            <span className="num text-gray-1000">{carousel.stats.completedToday}</span>편
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => navigate(PAGE_PATH.logs)}>
            <ListBulletsIcon />
            로그
          </Button>
          <Button onClick={() => navigate(PAGE_PATH.scenarios)}>
            <FlaskIcon />
            시나리오 실행
          </Button>
        </div>
      </div>

      <NextCard carousel={carousel} next={next} onModel={() => navigate(PAGE_PATH.models)} />

      <section className="material-base">
        <div className="flex items-center justify-between gap-4 border-b border-gray-alpha-400 px-6 py-3">
          <h2 className="type-heading-16 text-gray-1000">예측 근거</h2>
          <span className="flex items-center gap-4 type-label-13 text-gray-900">
            <span className="flex items-center gap-1.5">
              <span className="h-3 w-2 rounded-[2px] bg-linear-to-b from-gray-600 to-gray-200" aria-hidden />
              앞 20편 실제
            </span>
            <span className="flex items-center gap-1.5 text-blue-900">
              <span className="h-3 w-2 rounded-[2px] bg-linear-to-b from-blue-700 to-blue-400" aria-hidden />
              다음 편 예측
            </span>
            <span className="flex items-center gap-1.5 text-red-900">
              <span className="w-4 border-t-[1.5px] border-dashed border-red-700" aria-hidden />
              기준 {ACTION_THRESHOLD_MIN}분
            </span>
          </span>
        </div>
        <div className="px-6 pt-5 pb-4">
          <SequenceChart
            sequence={carousel.sequence}
            next={next ? { id: next.id, minutes: next.prediction?.minutes ?? null, seats: next.seats } : null}
          />
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-heading-16 text-gray-1000">오늘 도착편</h2>
        <FlightList flights={carousel.today} nextId={next?.id ?? null} />
      </section>
    </div>
  )
}

/* ───────────────────────── 예측 카드 ───────────────────────── */

/**
 * 하역 중인 편이 있으면 그 편(언제 끝나나), 없으면 다음 편(예측이 나왔으면 그 값)을 크게 보여준다.
 * 아래 줄에 그 다음 편을 한 줄로.
 */
function NextCard({ carousel, next, onModel }: { carousel: CarouselView; next: CarouselFlight | null; onModel: () => void }) {
  const proc = carousel.processing
  const focus = proc ?? next
  const pred = focus?.prediction ?? null
  const minutes = useCountUp(pred?.minutes ?? null)
  const over = pred?.over ?? false
  const action = focus ? carousel.actions.find((a) => a.flight.id === focus.id) : undefined
  const after = proc ? next : null

  return (
    <section className="material-base">
      <div className="flex items-center justify-between gap-4 border-b border-gray-alpha-400 px-6 py-3">
        <h2 className="type-heading-16 text-gray-1000">{proc ? '지금 하역 중' : '다음 편 예측'}</h2>
        {pred && (
          <span className="flex items-center gap-1.5 type-label-13 text-gray-900">
            <SparkleIcon size={14} weight="fill" className="text-blue-700" />
            {fmtClock(pred.issuedAt)} 발행 · 모델 <span className="type-mono-13 text-gray-1000">{pred.version}</span>
          </span>
        )}
      </div>

      <div className="flex gap-8 p-6">
        <LivePreview
          processing={proc}
          label={
            proc ? (
              <>
                하역 중 <span className="type-mono-12 font-medium">{proc.id}</span>
              </>
            ) : (
              '벨트 대기 중'
            )
          }
        />

        {focus ? (
          <div className="grid flex-1 grid-cols-2 content-start gap-x-8 gap-y-5">
            <Field label="편명">
              <span className="flex items-center gap-2">
                <AirplaneLandingIcon size={18} className="text-gray-900" />
                <span className="font-mono text-[16px] leading-6 font-semibold text-gray-1000">{focus.id}</span>
                <span className="type-label-13 text-gray-900">
                  {focus.aircraft} · {focus.seats}석
                </span>
              </span>
            </Field>
            <Field label={proc ? '착륙' : '도착 예정'}>
              <span className="flex items-center gap-2">
                <ClockIcon size={18} className="text-gray-900" />
                <span className="font-mono text-[16px] leading-6 font-semibold text-gray-1000 num">
                  {fmtClock(proc ? focus.landing : focus.eta)}
                </span>
              </span>
            </Field>

            {pred ? (
              <>
                <Field label="예측 처리 시간 (착륙 → 마지막 짐)">
                  <span className={cn('flex items-baseline gap-1', over ? 'text-red-900' : 'text-blue-900')}>
                    <span className="type-heading-48 num">{minutes}</span>
                    <span className="type-label-14 font-medium">분</span>
                  </span>
                </Field>
                <Field label="마지막 짐 예상">
                  <span className="type-heading-48 text-gray-1000 num">{fmtClock(pred.lastBag)}</span>
                </Field>

                {proc && proc.elapsedMin !== null && <Progress elapsed={proc.elapsedMin} predicted={pred.minutes} />}

                <div className="col-span-2">
                  {over && action ? (
                    <div className="flex items-start gap-2.5 rounded-md border border-red-400 bg-red-100 px-3 py-2.5">
                      <WarningIcon size={18} weight="bold" className="mt-px shrink-0 text-red-700" />
                      <span className="flex flex-col gap-0.5">
                        <span className="type-label-14 font-semibold text-red-900">조치 필요 · 기준보다 {action.overMin}분 길어요</span>
                        <span className="type-label-13 text-gray-1000">
                          <span className="type-mono-13 font-medium">{fmtClock(action.deadline)}</span>까지 {action.guide}
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2.5 type-label-14 text-gray-1000">
                      <CheckCircleIcon size={18} className="shrink-0 text-green-900" />
                      기준({ACTION_THRESHOLD_MIN}분) 안이에요. 지금 인력으로 충분해요
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="col-span-2 flex items-center gap-2.5 rounded-md bg-gray-100 px-3 py-3 type-label-14 text-gray-900">
                <ClockIcon size={18} />
                예측은 도착 1시간 전인 <span className="type-mono-14 text-gray-1000">{fmtClock(focus.issueAt)}</span>에 나와요
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-1 items-center type-label-14 text-gray-900">오늘 남은 도착편이 없어요</div>
        )}
      </div>

      <div className="flex items-center justify-between gap-4 rounded-b-md border-t border-gray-alpha-400 bg-background-200 px-6 py-3">
        <span className="flex items-center gap-2 type-label-13 text-gray-900">
          {after ? (
            <>
              <ClockIcon size={14} />
              다음 편 <span className="type-mono-13 font-medium text-gray-1000">{after.id}</span>
              <span className="type-mono-13 text-gray-1000">{fmtClock(after.eta)}</span> 도착
              {after.prediction ? (
                <span className="text-blue-900">예측 {after.prediction.minutes}분</span>
              ) : (
                <span>예측은 {fmtClock(after.issueAt)}에 나와요</span>
              )}
            </>
          ) : (
            '모델은 앞 20편의 처리 시간과 다음 편 좌석 수를 보고 예측합니다'
          )}
        </span>
        <Button variant="outline" size="sm" onClick={onModel}>
          모델 보기 <ArrowRightIcon />
        </Button>
      </div>
    </section>
  )
}

/** 하역 진행 — 지난 시간 / 예측 처리 시간. 막대가 차오르는 움직임 */
function Progress({ elapsed, predicted }: { elapsed: number; predicted: number }) {
  const pct = Math.min(100, Math.round((elapsed / predicted) * 100))
  const left = Math.max(0, predicted - elapsed)
  // 처음 보일 때 0 에서 차오르게
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const id = requestAnimationFrame(() => setWidth(pct))
    return () => cancelAnimationFrame(id)
  }, [pct])
  return (
    <div className="col-span-2 flex flex-col gap-1.5">
      <div className="flex justify-between type-label-13 text-gray-900">
        <span>
          착륙 후 <span className="font-medium text-gray-1000 num">{elapsed}분</span> 지났어요
        </span>
        <span className="text-blue-900 num">약 {left}분 남음</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-100">
        <div
          className="h-full rounded-full bg-linear-to-r from-blue-400 to-blue-700 transition-[width] duration-700 ease-out"
          style={{ width: `${width}%` }}
        />
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
