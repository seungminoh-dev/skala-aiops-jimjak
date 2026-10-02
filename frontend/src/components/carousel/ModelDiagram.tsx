import { useReducedMotion } from '@/components/graphics/useReducedMotion'

/**
 * 모델 그림 — Vercel 프로젝트 Overview 의 미리보기 자리(320×210).
 * 앞 20편(막대) → LSTM → Dense → 다음 편 처리 시간. 연결선 위로 점이 흘러간다(움직임 줄이기면 멈춤).
 */
export function ModelDiagram({ sequence, output }: { sequence: number[]; output: number | null }) {
  const reduced = useReducedMotion()
  const bars = sequence.slice(-20)
  const max = Math.max(60, ...bars)
  const flows = [
    { d: 'M112 105 L140 105', dur: 1.2 },
    { d: 'M206 105 L216 105', dur: 0.8 },
    { d: 'M256 105 L270 105', dur: 0.9 },
  ]
  return (
    <div className="relative h-[210px] w-[320px] shrink-0 overflow-hidden rounded-md bg-gray-100">
      <svg aria-hidden width={320} height={210} className="absolute inset-0">
        {/* 입력: 앞 20편 */}
        <text x={14} y={34} className="fill-gray-900 text-[11px]">앞 20편 × 2특성</text>
        {bars.map((v, i) => {
          const h = Math.max(4, (v / max) * 90)
          return (
            <rect
              key={i}
              x={14 + i * 4.6}
              y={150 - h}
              width={3.2}
              height={h}
              rx={1}
              className={reduced ? 'fill-gray-700' : 'animate-bar-grow fill-gray-700'}
              style={{ transformOrigin: `${14 + i * 4.6}px 150px`, transformBox: 'view-box', animationDelay: `${i * 25}ms` }}
            />
          )
        })}
        <line x1={14} x2={106} y1={150.5} y2={150.5} className="stroke-gray-500" />
        <text x={14} y={168} className="fill-gray-700 text-[10px]">처리 시간 · 다음 편 좌석</text>

        {/* LSTM */}
        <rect x={140} y={78} width={66} height={54} rx={8} className="fill-background-100 stroke-gray-1000" strokeWidth={1.5} />
        <text x={173} y={102} textAnchor="middle" className="fill-gray-1000 font-mono text-[13px] font-semibold">LSTM</text>
        <text x={173} y={118} textAnchor="middle" className="fill-gray-900 text-[10px]">순서 기억</text>

        {/* Dense */}
        <rect x={216} y={88} width={40} height={34} rx={6} className="fill-background-100 stroke-gray-1000" strokeWidth={1.5} />
        <text x={236} y={109} textAnchor="middle" className="fill-gray-1000 font-mono text-[11px] font-semibold">Dense</text>

        {/* 연결선 + 흐르는 점 */}
        {flows.map((f) => (
          <g key={f.d}>
            <path d={f.d} className="stroke-gray-700" strokeWidth={1.5} />
            {!reduced && (
              <circle r={2.5} className="fill-blue-700">
                <animateMotion dur={`${f.dur}s`} repeatCount="indefinite" path={f.d} />
              </circle>
            )}
          </g>
        ))}
      </svg>

      {/* 출력 */}
      <div className="absolute top-[86px] right-2 flex h-9 items-center rounded-full bg-blue-700 px-2.5 text-white">
        <span className="type-label-13 font-semibold num">{output !== null ? `${output}분` : '…'}</span>
      </div>
      <span className="absolute right-3 bottom-2 type-label-12 text-gray-900">다음 편 처리 시간</span>
    </div>
  )
}
