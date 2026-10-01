import {
  ArrowsClockwiseIcon,
  CheckCircleIcon,
  CircleDashedIcon,
  LightningIcon,
  WarningIcon,
  XCircleIcon,
} from '@phosphor-icons/react'

import type { VerdictInput } from '@/api'
import { cn } from '@/lib/cn'

/**
 * 판정 표시 — 아이콘 + 글자 + 색 (정보 계열).
 *   정상 = 초록 체크 · 주의 = 주황 경고 · 사건 경고(alert_only) = 주황 번개 · 재학습 승격 = 파랑 순환 · 게이트 실패 = 빨강 · 보류 = 회색 점선 원
 * engineer = true 면 원어(드리프트·alert_only·Production), false 면 쉬운 말.
 */
export function verdictView(v: VerdictInput, engineer = true) {
  switch (v.kind) {
    case 'ok':
      return { Icon: CheckCircleIcon, cls: 'text-green-900', label: '정상' }
    case 'warn':
      return { Icon: WarningIcon, cls: 'text-amber-900', label: engineer ? `드리프트 주의 ${v.consecutive ?? 1}/${v.consecutiveLimit ?? 2}` : `예측 어긋남 ${v.consecutive ?? 1}/${v.consecutiveLimit ?? 2}` }
    case 'alert_only':
      return { Icon: LightningIcon, cls: 'text-amber-900', label: engineer ? `alert_only · ${v.eventName ?? '사건'}` : `사건 경고 · ${v.eventName ?? '공항 사건'}` }
    case 'retrain_promoted':
      return { Icon: ArrowsClockwiseIcon, cls: 'text-blue-900', label: engineer ? `재학습 → ${v.deployedVersion ?? 'v2'} Production` : `다시 학습 → 새 모델 ${v.deployedVersion ?? 'v2'} 적용` }
    case 'retrain_rejected':
      return { Icon: XCircleIcon, cls: 'text-red-900', label: engineer ? `재학습 → 게이트 실패, ${v.keptVersion ?? 'v1'} 유지` : `다시 학습 → 성능 검사 탈락, ${v.keptVersion ?? 'v1'} 유지` }
    default:
      return { Icon: CircleDashedIcon, cls: 'text-gray-900', label: `판정 보류 ${v.windowCount ?? 0}/${v.windowSize ?? 21}` }
  }
}

export function VerdictLabel({ v, engineer = true, className }: { v: VerdictInput; engineer?: boolean; className?: string }) {
  const { Icon, cls, label } = verdictView(v, engineer)
  return (
    <span className={cn('inline-flex items-center gap-1.5 font-medium', cls, className)}>
      <Icon size={16} weight={v.kind === 'warn' || v.kind === 'retrain_rejected' ? 'bold' : 'regular'} className="shrink-0" />
      {label}
    </span>
  )
}
