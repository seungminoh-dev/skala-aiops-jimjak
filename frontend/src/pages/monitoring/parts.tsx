import { useId, type ReactNode } from 'react'

import { EmptyState } from '@/components/app/EmptyState'
import { LogView } from '@/components/monitoring/LogView'
import type { LogLine } from '@/api'
import { cn } from '@/lib/cn'

/**
 * 모델 모니터링 화면 조립용 작은 틀.
 * - PageSection: 섹션 사이 여백 32px + 가로 hairline 1px + 여백 32px (DESIGN.md "배치"). 상자 없음.
 * - EmptySection: 기록이 없을 때 — 섹션 제목 + 그 자리에 한 줄 사실.
 * - MonitoringLog: 로그 제목 + 높이 10줄 남짓, 그 안에서 스크롤, 최신이 아래.
 */

export function PageSection({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn('mt-8 border-t border-hairline pt-8', className)}>{children}</div>
}

export function EmptySection({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        {title}
      </h4>
      <EmptyState className="mt-3">{children}</EmptyState>
    </section>
  )
}

export function MonitoringLog({ lines }: { lines: readonly LogLine[] }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId}>
      <h4 id={titleId} className="type-section-title text-ink">
        로그
      </h4>
      {lines.length === 0 ? (
        <EmptyState className="mt-3">아직 로그가 없습니다</EmptyState>
      ) : (
        <LogView lines={lines} maxHeightClass="max-h-[256px]" className="mt-3" />
      )}
    </section>
  )
}
