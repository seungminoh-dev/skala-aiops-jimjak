import { useMemo, useState } from 'react'
import {
  CheckCircleIcon,
  InfoIcon,
  ListChecksIcon,
  MagnifyingGlassIcon,
  WarningIcon,
  WarningOctagonIcon,
} from '@phosphor-icons/react'

import { useLogs, type LogTag } from '@/api'
import { LIVE_CAROUSEL } from '@/app/routes'
import { cn } from '@/lib/cn'
import { fmtClock } from '@/lib/format'

/**
 * 전체 로그 (터미널 범위) — Vercel Logs 자리. 최신이 위.
 * 수취대 칸은 메시지의 line=… 값을 쓰고, 없으면 T1-07(예측 모델) 로그로 본다.
 */
const carouselOf = (message: string) => /line=(T\d-\d{2})/.exec(message)?.[1] ?? LIVE_CAROUSEL

/** 수준은 아이콘 + 색으로 (Vercel 목록처럼 머리 줄 없이) */
const TAG: Record<LogTag, { Icon: typeof InfoIcon; cls: string }> = {
  WARN: { Icon: WarningIcon, cls: 'text-amber-900' },
  INFO: { Icon: InfoIcon, cls: 'text-gray-900' },
  OK: { Icon: CheckCircleIcon, cls: 'text-green-900' },
  FAIL: { Icon: WarningOctagonIcon, cls: 'text-red-900' },
  ALERT: { Icon: WarningOctagonIcon, cls: 'text-red-900' },
  CHECK: { Icon: ListChecksIcon, cls: 'text-gray-700' },
}

export function LogsPage() {
  const logs = useLogs()
  const [query, setQuery] = useState('')
  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    return [...logs].reverse().filter((l) => !q || `${l.tag} ${l.message}`.toLowerCase().includes(q))
  }, [logs, query])

  return (
    <div className="flex flex-col gap-6">
      <h1 className="type-heading-24 text-gray-1000">로그</h1>

      <label className="flex h-9 items-center gap-2 rounded-md bg-background-100 px-3 shadow-border focus-within:shadow-[0_0_0_1px_var(--ds-gray-alpha-600)]">
        <MagnifyingGlassIcon size={16} className="text-gray-900" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="로그 검색 (예: drift, retrain, gate)"
          className="flex-1 bg-transparent type-label-14 text-gray-1000 outline-none"
        />
        <span className="type-label-12 text-gray-900 num">{rows.length}줄</span>
      </label>

      <ul className="material-base divide-y divide-gray-alpha-400">
        {rows.map((l, i) => {
          const { Icon, cls } = TAG[l.tag]
          return (
            <li key={`${l.at}-${i}`} className="grid grid-cols-[16px_48px_56px_52px_minmax(0,1fr)] items-start gap-3 px-4 py-2.5">
              <Icon size={16} className={cn('mt-0.5', cls)} aria-hidden />
              <span className="type-mono-13 num text-gray-900">{fmtClock(l.at)}</span>
              <span className="type-mono-13 font-medium text-gray-1000">{carouselOf(l.message)}</span>
              <span className={cn('type-mono-12 mt-px font-medium', cls)}>{l.tag}</span>
              <span className={cn('type-mono-13 break-words', l.highlight ? 'text-blue-900' : 'text-gray-1000')}>{l.message}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
