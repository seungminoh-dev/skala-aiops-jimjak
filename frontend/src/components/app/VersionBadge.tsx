import { cn } from '@/lib/cn'
import { VERSION_BADGE_CLASS } from '@/lib/format'

/**
 * 버전 배지 version-badge — v1 · v2.
 * surface-2 바탕 + ink-muted 글자, mono-sm, 둥글기 xs(4px), 안쪽 2px 6px. 높이 20px (표 40px 행에 맞음).
 * 쓰는 곳: 상단 바 운영 버전, 모델 버전 표. 색으로 버전을 구분하지 않는다.
 */
export interface VersionBadgeProps {
  /** 예: "v2" */
  version: string
  className?: string
}

export function VersionBadge({ version, className }: VersionBadgeProps) {
  return <span className={cn(VERSION_BADGE_CLASS, 'leading-4', className)}>{version}</span>
}
