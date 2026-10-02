import type { ReactNode } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { WarningIcon, XIcon } from '@phosphor-icons/react'

import { closeAlert, TIER_LABEL, type CarouselTier, type TerminalAlert, type TerminalView } from '@/api'
import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { cn } from '@/lib/cn'
import { carouselName } from '@/lib/format'
import { SPRING } from '@/lib/motion'

import { pointOnStadium, stadium, stadiumPath, TERMINAL_NAME, type TerminalId } from './geometry'

/**
 * 터미널 2D 지도 — DESIGN.md "2. 짐작만의 것 > 터미널 지도".
 * 수취대 37개(T1 3~21, T2 2~19)를 위에서 본 개념도. 상태 네 가지:
 *   미사용 = 회색 · 운영 중 = 검은 선 · 하역 중 = 검은 선 + 짐이 돈다 · 확인 필요 = 빨간 선 + 짐이 돈다
 * T1-07 은 누르면 수취대로 들어간다. 안내 카드(callout)는 감싼 쪽이 liveAnchor 자리에 띄운다.
 */
export interface TerminalMap2DProps {
  zones: TerminalView['zones']
  /** 열린 알림 — 그 수취대 위에 빨간 말풍선을 띄운다 */
  alerts: TerminalAlert[]
  onEnter: () => void
  /** T1-07 아래에 띄울 안내 카드 */
  callout: ReactNode
}

/* 치수 (px) */
const RING_W = 26
const RING_H = 78
const BAND = 7
const FEED_H = 10
const PAD = 2
const SVG_W = RING_W + PAD * 2
const SVG_H = FEED_H + PAD + RING_H + PAD
const CX = SVG_W / 2
const CY = FEED_H + PAD + RING_H / 2

const OUTER_PATH = stadiumPath(stadium(CX, CY, RING_W, RING_H))
const INNER_PATH = stadiumPath(stadium(CX, CY, RING_W - BAND * 2, RING_H - BAND * 2))
const TRACK = stadium(CX, CY, RING_W - BAND, RING_H - BAND)
const TRACK_PATH = stadiumPath(TRACK)

const LABEL_H = 28
const NUMBER_H = 22
const CALLOUT_GAP = 124

export function TerminalMap2D({ zones, alerts, onEnter, callout }: TerminalMap2DProps) {
  const reduced = useReducedMotion()
  const t1 = zones[0]
  const liveIndex = t1.carousels.findIndex((c) => c.live)
  const live = t1.carousels[liveIndex]
  const liveLeftPct = ((liveIndex + 0.5) / t1.carousels.length) * 100
  const ringBottom = LABEL_H + SVG_H
  /** 구역 윗변(이름 줄 위) — T2 는 T1 구역 높이만큼 아래 */
  const zoneTop = [0, LABEL_H + 1 + SVG_H + NUMBER_H + CALLOUT_GAP]

  // 알림 말풍선 자리: 그 수취대 고리 꼭대기(뒷벽) 위
  const pins = alerts.flatMap((a) => {
    for (let zi = 0; zi < zones.length; zi++) {
      const i = zones[zi].carousels.findIndex((c) => c.id === a.carouselId)
      if (i >= 0) return [{ alert: a, leftPct: ((i + 0.5) / zones[zi].carousels.length) * 100, top: zoneTop[zi] + LABEL_H }]
    }
    return []
  })

  return (
    <div className="relative">
      {zones.map((zone, zi) => (
        <section key={zone.terminal} aria-label={`${zone.terminal} ${TERMINAL_NAME[zone.terminal as TerminalId]}`}>
          <div className="flex items-baseline gap-2" style={{ height: LABEL_H }}>
            <span className="type-mono-13 font-medium text-gray-1000">{zone.terminal}</span>
            <span className="type-label-12 text-gray-900">{TERMINAL_NAME[zone.terminal as TerminalId]}</span>
          </div>
          {/* 뒷벽 = 윗선 */}
          <ul className="flex border-t border-gray-500">
            {zone.carousels.map((c) => {
              const label = `${carouselName(c.id)} ${TIER_LABEL[c.tier]}`
              const body = (
                <>
                  <span className="relative block">
                    {c.tier === 'alert' && !reduced && (
                      <span aria-hidden className="absolute inset-x-0 bottom-0 animate-alert-pulse rounded-full border-2 border-red-700" style={{ height: RING_H + 4 }} />
                    )}
                    <Ring tier={c.tier} emphasis={c.live} reduced={reduced} />
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'mt-1 type-label-12 num',
                      c.live ? 'font-medium text-gray-1000' : c.tier === 'idle' ? 'text-gray-600' : 'text-gray-900',
                      c.tier === 'alert' && 'text-red-900',
                    )}
                    style={{ height: NUMBER_H - 4 }}
                  >
                    {c.number}
                  </span>
                </>
              )
              return (
                <li key={c.id} className="flex min-w-0 flex-1 justify-center" title={label}>
                  {c.live ? (
                    <button
                      type="button"
                      onClick={onEnter}
                      aria-label={`${label}, 수취대로 들어가기`}
                      className="group flex cursor-pointer flex-col items-center rounded-md"
                    >
                      {body}
                    </button>
                  ) : (
                    <div className="flex flex-col items-center">
                      {body}
                      <span className="sr-only">{label}</span>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
          {zi === 0 && <div style={{ height: CALLOUT_GAP }} />}
        </section>
      ))}

      {/* T1-07 → 안내 카드 연결선 */}
      <span
        aria-hidden
        className={cn('absolute w-px', live?.tier === 'alert' ? 'bg-red-700' : 'bg-gray-1000')}
        style={{ left: `${liveLeftPct}%`, top: ringBottom + NUMBER_H, height: 20 }}
      />
      <div className="absolute" style={{ left: `${liveLeftPct}%`, top: ringBottom + NUMBER_H + 20, transform: 'translateX(-28px)' }}>
        {callout}
      </div>

      {/* 확인 필요 말풍선 — 뒷벽 바로 위, 꼬리가 수취대를 가리킨다. X 로 닫는다(확인) */}
      <AnimatePresence>
      {pins.map(({ alert, leftPct, top }) => (
        <motion.div
          key={alert.id}
          // 닫으면 꼬리 쪽으로 오므라들며 사라지고, 새로 뜨면 꼬리에서 튀어나온다
          initial={{ opacity: 0, scale: 0.6, x: '-50%', y: '-100%' }}
          animate={{ opacity: 1, scale: 1, x: '-50%', y: '-100%' }}
          exit={{ opacity: 0, scale: 0.6, x: '-50%', y: '-100%' }}
          transition={SPRING}
          className="absolute z-10 flex flex-col items-center"
          style={{ left: `${leftPct}%`, top: top - 2, transformOrigin: '50% 100%' }}
          title={`${alert.title}\n${alert.detail}`}
        >
          <span className="flex h-7 items-center gap-1.5 rounded-md bg-red-700 pr-1 pl-2 whitespace-nowrap text-white shadow-menu">
            <WarningIcon size={14} weight="bold" />
            <span className="type-label-12 font-semibold">{alert.short}</span>
            <button
              type="button"
              onClick={() => closeAlert(alert.id)}
              aria-label={`${carouselName(alert.carouselId)} 알림 확인하고 닫기`}
              title="확인하고 닫기"
              className="flex size-5 cursor-pointer items-center justify-center rounded-sm transition-colors hover:bg-red-900"
            >
              <XIcon size={12} weight="bold" />
            </button>
          </span>
          <span aria-hidden className="-mt-1 size-2 rotate-45 bg-red-700" />
        </motion.div>
      ))}
      </AnimatePresence>
    </div>
  )
}

const TIER_STROKE: Record<CarouselTier, string> = {
  idle: 'stroke-gray-400',
  operating: 'stroke-gray-1000',
  unloading: 'stroke-gray-1000',
  alert: 'stroke-red-700',
}

function Ring({ tier, emphasis, reduced }: { tier: CarouselTier; emphasis: boolean; reduced: boolean }) {
  const stroke = TIER_STROKE[tier]
  const strokeWidth = tier === 'idle' ? 1 : emphasis || tier === 'alert' ? 2 : 1.5
  const busy = tier === 'unloading' || tier === 'alert'
  const lap = 11
  const bags = 3
  const feedL = CX - 3.5
  const feedR = CX + 3.5

  return (
    <svg aria-hidden width={SVG_W} height={SVG_H} className="block shrink-0 overflow-visible">
      <g className={tier === 'idle' ? 'stroke-gray-400' : 'stroke-gray-700'} strokeWidth={1}>
        <line x1={feedL} x2={feedL} y1={0} y2={FEED_H + PAD + 1} />
        <line x1={feedR} x2={feedR} y1={0} y2={FEED_H + PAD + 1} />
      </g>
      <path
        d={`${OUTER_PATH} ${INNER_PATH}`}
        fillRule="evenodd"
        className={cn(
          'transition-colors duration-500',
          tier === 'alert' ? 'fill-red-100' : tier === 'idle' ? 'fill-gray-100' : 'fill-background-100',
          emphasis && tier !== 'alert' && 'group-hover:fill-gray-200',
        )}
      />
      <path d={INNER_PATH} className={cn('fill-background-200 transition-colors duration-500', stroke)} strokeWidth={strokeWidth} />
      <path d={OUTER_PATH} className={cn('fill-none transition-colors duration-500', stroke)} strokeWidth={strokeWidth} />
      {busy &&
        Array.from({ length: bags }, (_, i) => {
          const phase = i / bags
          const cls = tier === 'alert' ? 'fill-red-700' : 'fill-gray-900'
          if (reduced) {
            const p = pointOnStadium(TRACK, phase)
            return <Bag key={i} className={cls} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} />
          }
          return (
            <Bag key={i} className={cls}>
              <animateMotion dur={`${lap}s`} begin={`${-phase * lap}s`} repeatCount="indefinite" rotate="auto" path={TRACK_PATH} />
            </Bag>
          )
        })}
    </svg>
  )
}

function Bag({ className, transform, children }: { className: string; transform?: string; children?: ReactNode }) {
  return (
    <rect x={-3.5} y={-2.5} width={7} height={5} rx={1} transform={transform} className={className}>
      {children}
    </rect>
  )
}
