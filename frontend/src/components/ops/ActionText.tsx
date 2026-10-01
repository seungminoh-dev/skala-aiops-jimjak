import { CREW_DEADLINE_LEAD_MIN, type ActionItem, type Ymdhm } from '@/design/mock'
import { cn } from '@/lib/cn'
import { diffMinutes, fmtClock } from '@/lib/format'

/**
 * 조치 문장 — 조치 필요 목록과 라인 상세 서랍이 같이 쓴다. 근거가 있는 것만 쓴다(DESIGN.md "조치 문구의 근거 규칙").
 * 읽는 순서(DESIGN.md "조치 필요 목록"): 마감 → 조치 문구 → 계산 기준.
 * - 마감 <ActionDeadline>: "10:38까지" (조 이동 마감 = 착륙 예정 − 30분). 지났으면 "10:38 마감 지남".
 * - 조치 <ActionGuide>: 기획서의 운영 기준 문장 그대로 "인력 추가·벨트 재배정 검토" (13px ink-muted)
 *   + 아래 둘째 줄 계산 기준 "(착륙 30분 전 기준)" (12px ink-subtle). 필요 인원·벨트 번호 같은 처방은 없다.
 * 목록은 마감과 조치를 다른 칸에 둔다. 서랍은 <ActionText> 로 마감(+ 남은 시간) / 조치 / 계산 기준을 세 줄로 쌓는다.
 */

/** 줄임표는 그대로 두되 스크롤 상자를 만들지 않는다(overflow clip) — 목록 칸의 기준선 정렬이 깨지지 않게 */
const ONE_LINE = 'overflow-clip text-ellipsis whitespace-nowrap'

/** "10:38까지" · 지났으면 "10:38 마감 지남". 글자 크기·색은 className 으로 (목록·서랍 모두 14px 500 ink) */
export function ActionDeadline({ item, now, className }: { item: ActionItem; now: Ymdhm; className?: string }) {
  const passed = item.crewDeadline < now
  return (
    <span className={cn('whitespace-nowrap tabular-nums', className)}>
      <span className="sr-only">조 이동 마감 </span>
      {fmtClock(item.crewDeadline)}
      {passed ? ' 마감 지남' : '까지'}
    </span>
  )
}

/** 조치 문구(13px ink-muted) + 아래 줄 계산 기준(12px ink-subtle) */
export function ActionGuide({ item, className }: { item: ActionItem; className?: string }) {
  return (
    <span className={cn('flex min-w-0 flex-col', className)}>
      <span className={cn(ONE_LINE, 'type-body-sm text-ink-muted')}>{item.action}</span>
      <span className={cn(ONE_LINE, 'type-caption text-ink-subtle')}>(착륙 {CREW_DEADLINE_LEAD_MIN}분 전 기준)</span>
    </span>
  )
}

/** 마감까지 남은 시간: "8분 남음" · "1시간 5분 남음". 지났거나 지금이면 null */
function remainingText(deadline: Ymdhm, now: Ymdhm): string | null {
  const m = diffMinutes(deadline, now)
  if (m <= 0) return null
  const h = Math.floor(m / 60)
  const mm = m % 60
  const body = h === 0 ? `${mm}분` : mm === 0 ? `${h}시간` : `${h}시간 ${mm}분`
  return `${body} 남음`
}

/** 서랍의 조치 — 마감(14px 500 ink) + 남은 시간(12px) / 조치 문구 / 계산 기준 */
export function ActionText({ item, now, className }: { item: ActionItem; now: Ymdhm; className?: string }) {
  const remaining = remainingText(item.crewDeadline, now)
  return (
    <div className={className}>
      <p className="flex items-baseline gap-2">
        <ActionDeadline item={item} now={now} className="type-body font-medium text-ink" />
        {remaining && <span className="type-caption text-ink-subtle tabular-nums">{remaining}</span>}
      </p>
      <ActionGuide item={item} className="mt-0.5" />
    </div>
  )
}
