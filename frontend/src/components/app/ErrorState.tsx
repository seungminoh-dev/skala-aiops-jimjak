import { Button } from '@/components/ui/button'
import { cn } from '@/lib/cn'

/**
 * 오류 상태 — 그 자리에 ink-muted 한 줄 + 고스트 버튼 "다시 시도". 빨강 상자·아이콘 없음.
 *   <ErrorState message="도착편을 불러오지 못했습니다" onRetry={refetch} />
 * 다시 불러오는 동안 기존 데이터가 있으면 그대로 두고, 이 줄은 첫 로딩이 실패했을 때만 쓴다.
 */
export interface ErrorStateProps {
  message: string
  onRetry?: () => void
  /** 기본 "다시 시도" */
  retryLabel?: string
  className?: string
}

export function ErrorState({ message, onRetry, retryLabel = '다시 시도', className }: ErrorStateProps) {
  return (
    <div role="alert" className={cn('flex min-h-10 items-center gap-2 type-body-sm text-ink-muted', className)}>
      <span>{message}</span>
      {onRetry && (
        <Button variant="ghost" onClick={onRetry}>
          {retryLabel}
        </Button>
      )}
    </div>
  )
}
