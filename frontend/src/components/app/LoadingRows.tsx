import { cn } from '@/lib/cn'

/**
 * 첫 로딩 — 실제 행 높이 그대로 surface-3 막대 3줄(둥글기 4px). 애니메이션·반짝임·스피너 없음.
 * 막대는 행 높이에서 위아래 4px 씩 띄운다 (표 40px → 막대 32px, 조치 필요 48px → 40px, 타임라인 32px → 24px).
 * 다시 불러오는 중에는 쓰지 않는다 — 기존 데이터를 그대로 둔다.
 */
export interface LoadingRowsProps {
  /** 기본 3 */
  rows?: number
  /** 실제 행 높이 (px). 기본 40 (표) */
  rowHeight?: number
  /** 읽어 주는 이름. 기본 "불러오는 중" */
  label?: string
  className?: string
}

export function LoadingRows({ rows = 3, rowHeight = 40, label = '불러오는 중', className }: LoadingRowsProps) {
  return (
    <div role="status" aria-label={label} className={cn('flex flex-col', className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} aria-hidden className="flex flex-col justify-center py-1" style={{ height: rowHeight }}>
          <div className="h-full rounded-xs bg-surface-3" />
        </div>
      ))}
    </div>
  )
}
