import type { ReactNode } from 'react'

import { StatusDot } from '@/components/app/StatusDot'
import { cn } from '@/lib/cn'
import { fmtClock, fmtDecimal, NumUnit, verdictStatus, type VerdictInput, type Ymdhm } from '@/lib/format'

/**
 * 판정 블록 — DESIGN.md "판정 블록 (모델 모니터링)". 제목 줄 바로 아래, 판정과 근거 수치를 한 덩어리로.
 *   첫 줄:  ● 정상 · 창 MAE 4.2분 / 임계값 5.0분 · 연속 초과 0/2 · 최근 21편, 10:30 기준
 *   둘째 줄(caption ink-subtle): 운영 버전 v2   응답 시간 p95 182ms   마지막 판정 10:30 (가운뎃점 대신 간격)
 * - 판정 이름은 section-title, 점은 상태 표시 대응표 그대로. 창 MAE 숫자만 figure-value(KBO).
 * - 같은 수치를 두 번 쓰지 않는다: 연속 초과(1/2)·창 편수(13/21)는 근거 수치 쪽에만 두고 판정 이름에는 붙이지 않는다.
 *   이 화면에는 숫자 줄(figure-row)이 없다 — 이 블록이 대신한다.
 * - 게이지·도넛 같은 그래픽 없음.
 */
export interface VerdictBlockProps {
  verdict: VerdictInput
  /** 창에 모인 편 수 (창 크기보다 적으면 판정 보류) */
  windowCount: number
  /** 창 크기 (21) */
  windowSize: number
  windowMae: number
  threshold: number
  consecutive: number
  consecutiveLimit: number
  /** 근거 수치의 기준 시각 ("10:30 기준") */
  asOf: Ymdhm
  /** 둘째 줄 (낮은 위계). 없으면 첫 줄만 — 상태별 견본 */
  meta?: VerdictBlockMeta
  className?: string
}

export interface VerdictBlockMeta {
  /** 운영 버전 (v2) */
  version: string
  /** 예측 API 응답 시간 p95 (ms) */
  p95Ms: number
  /** 마지막 판정 시각 */
  judgedAt: Ymdhm
}

/** 판정 이름 — 대응표 글자에서 근거 수치와 겹치는 꼬리(1/2, 13/21)만 뺀다 */
function verdictName(verdict: VerdictInput, label: string): string {
  if (verdict.kind === 'warn') return '주의'
  if (verdict.kind === 'pending') return '판정 보류'
  return label
}

export function VerdictBlock({
  verdict,
  windowCount,
  windowSize,
  windowMae,
  threshold,
  consecutive,
  consecutiveLimit,
  asOf,
  meta,
  className,
}: VerdictBlockProps) {
  const status = verdictStatus(verdict)
  // 판정 이름은 ink. 게이트 불합격만 대응표대로 danger-text
  const nameClass = status.textClass === 'text-danger-text' ? 'text-danger-text' : 'text-ink'
  const pending = windowCount < windowSize

  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      <p className="flex flex-wrap items-baseline gap-x-6 gap-y-1 type-body-sm text-ink-muted">
        <span className={cn('type-section-title whitespace-nowrap', nameClass)}>
          <StatusDot tone={status.dot} className="mr-2" />
          {verdictName(verdict, status.label)}
        </span>
        <span className="whitespace-nowrap">
          창 MAE{' '}
          <NumUnit value={fmtDecimal(windowMae)} unit="분" className="type-figure-value text-ink" />
          <span className="text-ink-subtle"> / </span>
          임계값 <span className="tabular-nums">{fmtDecimal(threshold)}</span>분
        </span>
        <span className="whitespace-nowrap">
          연속 초과{' '}
          <span className="tabular-nums">
            {consecutive}/{consecutiveLimit}
          </span>
        </span>
        <span className="whitespace-nowrap text-ink-subtle">
          최근{' '}
          <span className="tabular-nums">{pending ? `${windowCount}/${windowSize}` : windowCount}</span>편,{' '}
          <span className="tabular-nums">{fmtClock(asOf)}</span> 기준
        </span>
      </p>
      {meta && (
        <p className="flex flex-wrap gap-x-5 type-caption text-ink-subtle">
          <Item>
            운영 버전 <span className="type-mono-sm">{meta.version}</span>
          </Item>
          <Item>
            응답 시간 p95 <span className="tabular-nums">{meta.p95Ms}</span>ms
          </Item>
          <Item>
            마지막 판정 <span className="tabular-nums">{fmtClock(meta.judgedAt)}</span>
          </Item>
        </p>
      )}
    </div>
  )
}


function Item({ children }: { children: ReactNode }) {
  return <span className="whitespace-nowrap">{children}</span>
}

