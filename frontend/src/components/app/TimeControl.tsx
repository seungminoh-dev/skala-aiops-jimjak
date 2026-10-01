import { useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/cn'
import { addMinutes, fmtClock, fmtDate, type Ymdhm } from '@/lib/format'

/**
 * 시각 제어 — 운영 현황 제목 줄 오른쪽 (DESIGN.md "입력과 세그먼트, 시각 제어").
 * 세그먼트 "실시간 / 시각 지정". 시각 지정을 고르면 오른쪽에 날짜 입력(2026-10-01)과
 * 시각 입력(14:50, 5분 단위), 고스트 버튼 "지금으로"가 나온다. "지금으로"는 실시간으로 돌아간다.
 *
 * - 값은 바깥에서 쥔다(controlled): value = null 이면 실시간, Ymdhm 이면 그 시각.
 *   시각 지정 상태는 화면을 옮겨도 유지돼야 하므로 앱 상태(라우터 위)에 둔다.
 * - 날짜·시각은 브라우저 date/time 입력 대신 글자 입력이다(운영체제 언어에 따라 "오후 02:50"으로 바뀌는 것을 막는다).
 *   Enter 또는 포커스가 빠질 때 반영하고, 시각은 가장 가까운 5분으로 맞춘다. 잘못된 값이면 원래 값으로 돌린다.
 *   시각 입력에서 ↑/↓ 는 5분씩 옮긴다.
 */
export interface TimeControlProps {
  /** null = 실시간, Ymdhm = 시각 지정 */
  value: Ymdhm | null
  onChange: (value: Ymdhm | null) => void
  /** 지금 시각 — 시각 지정으로 바꿀 때 처음 값 (5분 단위로 내림) */
  now: Ymdhm
  className?: string
}

const STEP_MIN = 5

/** 5분 단위로 내림 */
function floorToStep(t: Ymdhm): Ymdhm {
  const mm = Number(t.slice(10, 12))
  return addMinutes(t, -(mm % STEP_MIN))
}

/** "2026-10-01" · "20261001" · "2026.10.01" → "20261001" (없는 날이면 null) */
function parseDate(text: string): string | null {
  const m = text.trim().match(/^(\d{4})\D?(\d{1,2})\D?(\d{1,2})$/)
  if (!m) return null
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const dt = new Date(Date.UTC(y, mo - 1, d))
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null
  return `${m[1]}${String(mo).padStart(2, '0')}${String(d).padStart(2, '0')}`
}

/** "14:50" · "1450" · "9:52" → "1450" · "0950" (가장 가까운 5분, 23:55 까지) */
function parseTime(text: string): string | null {
  const m = text.trim().match(/^(\d{1,2}):?(\d{2})$/)
  if (!m) return null
  const [h, mi] = [Number(m[1]), Number(m[2])]
  if (h > 23 || mi > 59) return null
  const total = Math.min(Math.round((h * 60 + mi) / STEP_MIN) * STEP_MIN, 24 * 60 - STEP_MIN)
  return `${String(Math.floor(total / 60)).padStart(2, '0')}${String(total % 60).padStart(2, '0')}`
}

export function TimeControl({ value, onChange, now, className }: TimeControlProps) {
  const mode = value ? 'pinned' : 'live'

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <Tabs
        value={mode}
        onValueChange={(next) => onChange(next === 'live' ? null : floorToStep(now))}
        className="flex-row gap-0"
      >
        <TabsList aria-label="시각 기준">
          {/* 세그먼트로만 쓰므로 TabsContent 가 없다 — 없는 패널을 가리키지 않게 aria-controls 를 지운다 */}
          <TabsTrigger value="live" aria-controls={undefined}>
            실시간
          </TabsTrigger>
          <TabsTrigger value="pinned" aria-controls={undefined}>
            시각 지정
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {value && <PinnedInputs value={value} onChange={onChange} />}
    </div>
  )
}

/** 시각 지정 중의 날짜·시각 입력 + "지금으로" */
function PinnedInputs({ value, onChange }: { value: Ymdhm; onChange: (value: Ymdhm | null) => void }) {
  const [dateText, setDateText] = useState(fmtDate(value))
  const [timeText, setTimeText] = useState(fmtClock(value))
  // 바깥 값이 바뀌면(↑/↓, 다른 곳에서 변경) 입력 글자를 맞춘다. 다시 그리지 않아 포커스가 유지된다.
  const [shown, setShown] = useState(value)
  if (shown !== value) {
    setShown(value)
    setDateText(fmtDate(value))
    setTimeText(fmtClock(value))
  }

  const commit = () => {
    const date = parseDate(dateText)
    const time = parseTime(timeText)
    if (!date || !time) {
      setDateText(fmtDate(value))
      setTimeText(fmtClock(value))
      return
    }
    const next = `${date}${time}`
    if (next !== value) onChange(next)
    else {
      setDateText(fmtDate(value))
      setTimeText(fmtClock(value))
    }
  }

  const onEnter = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') commit()
  }

  const onTimeKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault()
      onChange(addMinutes(value, e.key === 'ArrowUp' ? STEP_MIN : -STEP_MIN))
      return
    }
    onEnter(e)
  }

  return (
    <>
      <Input
        aria-label="날짜"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="YYYY-MM-DD"
        value={dateText}
        onChange={(e) => setDateText(e.target.value)}
        onBlur={commit}
        onKeyDown={onEnter}
        className="w-[104px]"
      />
      <Input
        aria-label="시각 (5분 단위)"
        inputMode="numeric"
        autoComplete="off"
        spellCheck={false}
        placeholder="HH:MM"
        value={timeText}
        onChange={(e) => setTimeText(e.target.value)}
        onBlur={commit}
        onKeyDown={onTimeKey}
        className="w-16"
      />
      <Button variant="ghost" onClick={() => onChange(null)}>
        지금으로
      </Button>
    </>
  )
}
