import { useLayoutEffect, useRef } from 'react'

import type { LogLine } from '@/design/mock'
import { cn } from '@/lib/cn'
import { fmtClock, fmtDate, LOG_HIGHLIGHT_CLASS, LOG_TAG_CLASS } from '@/lib/format'

/**
 * 로그 log-line — mono 13px, 줄마다 시각(ink-subtle) · 태그 · 메시지(ink-muted). 최신이 아래.
 * 태그는 글자색만(바탕 칩 없음): WARN warning-text · INFO ink-subtle · OK success-text · FAIL danger-text
 * · ALERT ink-muted 굵게 · CHECK ink-tertiary. 재학습·배포 줄은 메시지를 primary-text 로.
 * 높이를 제한하면(maxHeightClass) 그 안에서 스크롤하고, 처음과 줄이 늘 때 맨 아래(최신)를 보인다.
 * 상자 없이 위아래 hairline 선으로만 구역을 나눈다.
 */
export interface LogViewProps {
  lines: readonly LogLine[]
  /** 예: 'max-h-[256px]' — 주면 스크롤 영역(키보드 포커스 가능)이 된다 */
  maxHeightClass?: string
  /** 읽어 주는 이름. 기본 "로그" */
  label?: string
  className?: string
}

export function LogView({ lines, maxHeightClass, label = '로그', className }: LogViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollable = Boolean(maxHeightClass)

  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el && scrollable) el.scrollTop = el.scrollHeight
  }, [lines, scrollable])

  return (
    <div
      ref={scrollRef}
      role="log"
      aria-label={label}
      tabIndex={scrollable ? 0 : undefined}
      className={cn('border-y border-hairline py-2', scrollable && 'overflow-y-auto', maxHeightClass, className)}
    >
      <ol className="type-mono">
        {lines.map((line, i) => (
          <li key={`${line.at}-${i}`} className="grid grid-cols-[5ch_7ch_minmax(0,1fr)] gap-x-3 leading-6">
            <time dateTime={`${fmtDate(line.at)}T${fmtClock(line.at)}`} className="text-ink-subtle tabular-nums">
              {fmtClock(line.at)}
            </time>
            <span className={LOG_TAG_CLASS[line.tag]}>[{line.tag}]</span>
            <span className={line.highlight ? LOG_HIGHLIGHT_CLASS : 'text-ink-muted'}>{line.message}</span>
          </li>
        ))}
      </ol>
    </div>
  )
}
