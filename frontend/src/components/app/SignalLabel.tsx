import type { ReactNode } from 'react'

import { cn } from '@/lib/cn'
import { SIGNAL_LABEL_CLASS } from '@/lib/format'

/**
 * 노랑 라벨 signal-label — 이 콘솔의 유일한 색 라벨.
 * signal 면 + on-signal 글자, label(12px 500), 높이 20px, 둥글기 xs(4px), 안쪽 2px 6px.
 * 쓰는 곳: 라인 상태 "조치 필요", 감시 창 차트의 기준선 끝 "50분". 그 밖에는 쓰지 않는다.
 */
export interface SignalLabelProps {
  /** 기본 "조치 필요" */
  children?: ReactNode
  className?: string
}

export function SignalLabel({ children = '조치 필요', className }: SignalLabelProps) {
  return <span className={cn(SIGNAL_LABEL_CLASS, className)}>{children}</span>
}
