import { NavTabs } from '@/components/app/NavTabs'
import { StatusText } from '@/components/app/StatusText'
import type { AppTab } from '@/components/app/tabs'
import { VersionBadge } from '@/components/app/VersionBadge'
import { Brand } from '@/components/brand/Brand'
import { cn } from '@/lib/cn'
import { fmtClock, fmtDate, serverStatus, type ServerStatus, type Ymdhm } from '@/lib/format'

/**
 * 상단 바 app-header — canvas 바탕, 높이 52px, body-sm. 사이드바 없음.
 * 왼쪽: 브랜드(마스코트 얼굴 마크 2px 배율 50×34px + "짐작", brand/Brand) · 화면 탭 3개.
 * 마크는 늘 그린다 — 상단 바 견본마다 마크가 보인다.
 * 오른쪽 3개만: 서버 상태(점 + 글자) · 모델 버전(version-badge) · KST 시계(tabular, 초 없이 14:50).
 *
 * 상태
 * - 시각 지정 중(pinnedAt): 시계 자리를 "14:50 기준 · 시각 지정"으로 바꾼다 (primary-subtle 바탕 + primary-text).
 * - 연결 끊김(serverStatus 'disconnected'): danger 점 "연결 끊김" + 시계 왼쪽에 warning-text "14:52 기준"
 *   (lastUpdatedAt). 마지막 갱신이 갱신 주기의 2배를 넘은 것도 연결 끊김으로 넘긴다. 화면 숫자는 지우지 않는다.
 *
 * 검색, ⌘K, 단축키 표시, 알림 종, 아바타를 넣지 않는다.
 */
export interface AppHeaderProps {
  /** 지금 화면. null 이면 고른 탭 없음 (디자인 시트에서 화면 밖 구역을 볼 때) */
  tab: AppTab | null
  onTabChange?: (tab: AppTab) => void
  serverStatus: ServerStatus
  /** 운영 모델 버전 (예: "v2") */
  modelVersion: string
  /** 지금 시각 (KST) — 시계 */
  now: Ymdhm
  /** 시각 지정 중이면 그 시각. null·생략이면 실시간 */
  pinnedAt?: Ymdhm | null
  /** 마지막 갱신 시각 — 연결 끊김일 때 "14:52 기준" 으로 보인다 */
  lastUpdatedAt?: Ymdhm | null
  className?: string
}

export function AppHeader({
  tab,
  onTabChange,
  serverStatus: status,
  modelVersion,
  now,
  pinnedAt = null,
  lastUpdatedAt = null,
  className,
}: AppHeaderProps) {
  const disconnected = status === 'disconnected'

  return (
    <header className={cn('flex h-[52px] items-center gap-6 bg-canvas px-4 type-body-sm text-ink', className)}>
      <Brand />

      <NavTabs value={tab} onValueChange={onTabChange} />

      <div className="ml-auto flex shrink-0 items-baseline gap-4">
        <StatusText status={serverStatus(status)} />
        <span>
          <span className="sr-only">운영 모델 </span>
          <VersionBadge version={modelVersion} />
        </span>
        <span className="flex items-baseline gap-2">
          {disconnected && lastUpdatedAt && (
            <span className="tabular-nums text-warning-text">{fmtClock(lastUpdatedAt)} 기준</span>
          )}
          {pinnedAt ? (
            <span className="inline-flex h-5 items-center rounded-xs bg-primary-subtle px-1.5 tabular-nums text-primary-text">
              {fmtClock(pinnedAt)} 기준 · 시각 지정
            </span>
          ) : (
            <time dateTime={`${fmtDate(now)}T${fmtClock(now)}+09:00`} className="tabular-nums">
              {fmtClock(now)}
            </time>
          )}
        </span>
      </div>
    </header>
  )
}
