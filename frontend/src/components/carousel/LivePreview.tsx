import type { ReactNode } from 'react'

import type { CarouselFlight } from '@/api'
import { LIVE_CAROUSEL } from '@/app/routes'
import { useReducedMotion } from '@/components/graphics/useReducedMotion'
import { MascotCarry, MascotPose } from '@/components/mascot/Mascot'
import { CarouselIcon } from '@/components/terminal/CarouselIcon'
import { pointOnStadium, stadium, stadiumPath } from '@/components/terminal/geometry'
import { carouselName } from '@/lib/format'

/**
 * 수취대 실시간 그림 — Vercel 프로젝트 Overview 의 미리보기 자리.
 * 하역 중이면 벨트 위로 짐이 돌고 마스코트가 짐을 나른다. 아니면 벨트가 비어 있고 마스코트는 서 있다.
 */
const W = 320
const H = 210
const RING_W = 92
const RING_H = 236
const BAND = 26
const CX = W / 2
const CY = 112

// 세로 고리를 만들어 90° 돌려 가로로 눕힌다
const OUTER = stadiumPath(stadium(CX, CY, RING_W, RING_H))
const INNER = stadiumPath(stadium(CX, CY, RING_W - BAND * 2, RING_H - BAND * 2))
const TRACK = stadium(CX, CY, RING_W - BAND, RING_H - BAND)
const TRACK_PATH = stadiumPath(TRACK)
const LAP = 10
const BAGS = 7

export function LivePreview({ processing, label }: { processing: CarouselFlight | null; label: ReactNode }) {
  const reduced = useReducedMotion()
  const busy = processing !== null

  return (
    <div className="relative h-[210px] w-[320px] shrink-0 overflow-hidden rounded-md bg-gray-100">
      <svg aria-hidden width={W} height={H} className="absolute inset-0">
        {/* 뒷벽과 투입구 */}
        <line x1={0} x2={W} y1={22} y2={22} className="stroke-gray-500" strokeWidth={1} />
        <g transform={`rotate(90 ${CX} ${CY})`}>
          <path d={`${OUTER} ${INNER}`} fillRule="evenodd" className="fill-background-100" />
          <path d={INNER} className="fill-gray-200 stroke-gray-1000" strokeWidth={2} />
          <path d={OUTER} className="fill-none stroke-gray-1000" strokeWidth={2} />
          {busy &&
            Array.from({ length: BAGS }, (_, i) => {
              const phase = i / BAGS
              const cls = i % 3 === 0 ? 'fill-gray-1000' : i % 3 === 1 ? 'fill-gray-700' : 'fill-gray-900'
              if (reduced) {
                const p = pointOnStadium(TRACK, phase)
                return <rect key={i} x={-7} y={-5} width={14} height={10} rx={2} className={cls} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} />
              }
              return (
                <rect key={i} x={-7} y={-5} width={14} height={10} rx={2} className={cls}>
                  <animateMotion dur={`${LAP}s`} begin={`${-phase * LAP}s`} repeatCount="indefinite" rotate="auto" path={TRACK_PATH} />
                </rect>
              )
            })}
        </g>
        <g className="stroke-gray-700" strokeWidth={1}>
          <line x1={CX - 8} x2={CX - 8} y1={22} y2={CY - RING_W / 2 + 2} />
          <line x1={CX + 8} x2={CX + 8} y1={22} y2={CY - RING_W / 2 + 2} />
        </g>
      </svg>

      <span className="absolute top-2.5 left-2.5 flex items-center gap-1.5 rounded-full bg-background-100 px-2 py-1 type-label-12 text-gray-1000 shadow-border">
        <CarouselIcon tier={busy ? 'unloading' : 'operating'} size={14} />
        {label}
      </span>
      <span className="absolute right-3 bottom-2 type-label-12 text-gray-900">{carouselName(LIVE_CAROUSEL)}</span>
      <span className="absolute bottom-1 left-3">{busy ? <MascotCarry size="sm" /> : <MascotPose alert={false} size="sm" />}</span>
    </div>
  )
}
