/**
 * 표기·상태 헬퍼 — DESIGN.md "문구"와 "상태 표시 대응표"를 코드로 옮긴 것.
 *
 * 시각은 데이터 그대로 "YYYYMMDDHHMM"(KST, 12자리) 문자열로 다룬다.
 * 계산은 UTC 달력으로 해서 브라우저 시간대와 상관없이 같은 결과가 나온다.
 *
 * 표기: 편명 KE712 · 수취대 T1-07 · 시각 14:50 · 남은 시간 12분 후 · 지연 +8분 · 처리 시간 46분 · 편수 3편
 */
import { createElement, type ReactNode } from 'react'

import { cn } from '@/lib/cn'

/** "YYYYMMDDHHMM" (예: "202610011450") */
export type Ymdhm = string

/* ───────────────────────── 시각 계산 ───────────────────────── */

function toMs(t: Ymdhm): number {
  const y = Number(t.slice(0, 4))
  const mo = Number(t.slice(4, 6))
  const d = Number(t.slice(6, 8))
  const h = Number(t.slice(8, 10))
  const mi = Number(t.slice(10, 12))
  return Date.UTC(y, mo - 1, d, h, mi)
}

function fromMs(ms: number): Ymdhm {
  const dt = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}`
}

/** t 에 분을 더한다. addMinutes("202610011450", 12) → "202610011502" */
export function addMinutes(t: Ymdhm, minutes: number): Ymdhm {
  return fromMs(toMs(t) + minutes * 60_000)
}

/** a − b (분). diffMinutes("202610011502", "202610011450") → 12 */
export function diffMinutes(a: Ymdhm, b: Ymdhm): number {
  return Math.round((toMs(a) - toMs(b)) / 60_000)
}

/** 하루 안 분 (0~1439). 타임라인 x 좌표 계산용 */
export function minuteOfDay(t: Ymdhm): number {
  return Number(t.slice(8, 10)) * 60 + Number(t.slice(10, 12))
}

/* ───────────────────────── 글자 표기 ───────────────────────── */

/** "202610011450" → "14:50" (24시간제, 초 없음) */
export function fmtClock(t: Ymdhm): string {
  return `${t.slice(8, 10)}:${t.slice(10, 12)}`
}

/** "202610011450" → "2026-10-01" */
export function fmtDate(t: Ymdhm): string {
  return `${t.slice(0, 4)}-${t.slice(4, 6)}-${t.slice(6, 8)}`
}

/** "202610011450" → "2026-10-01 14:50" */
export function fmtDateTime(t: Ymdhm): string {
  return `${fmtDate(t)} ${fmtClock(t)}`
}

/** 46 → "46분" (글자 하나로 쓸 때. 화면에서는 <Minutes> 로 숫자·단위를 나눈다) */
export function fmtMinutes(minutes: number): string {
  return `${minutes}분`
}

/** 3 → "3편" */
export function fmtCount(count: number): string {
  return `${count}편`
}

/** 4.15 → "4.2" (소수 한 자리. 오차·MAE) */
export function fmtDecimal(value: number, digits = 1): string {
  return value.toFixed(digits)
}

const MINUS = '−' // − (숫자 폭에 맞는 빼기 기호)

/**
 * 부호 붙은 분. 지연·오차·가정 차이에 쓴다.
 * 8 → "+8분", -3 → "−3분", 0 → "0분"
 */
export function fmtSignedMinutes(minutes: number): string {
  if (minutes > 0) return `+${minutes}분`
  if (minutes < 0) return `${MINUS}${Math.abs(minutes)}분`
  return '0분'
}

/** fmtSignedMinutes 의 숫자 부분만. 8 → "+8", -3 → "−3", 0 → "0" */
export function fmtSigned(value: number | string): string {
  const n = typeof value === 'string' ? Number(value) : value
  if (n > 0) return `+${value}`
  if (n < 0) return `${MINUS}${String(value).replace('-', '')}`
  return '0'
}

/**
 * 남은 시간. target − now.
 * 12분 → "12분 후", 75분 → "1시간 15분 후", 120분 → "2시간 후", 0 → "지금", −5분 → "5분 전"
 */
export function fmtUntil(target: Ymdhm, now: Ymdhm): string {
  const m = diffMinutes(target, now)
  if (m === 0) return '지금'
  const abs = Math.abs(m)
  const h = Math.floor(abs / 60)
  const mm = abs % 60
  const body = h === 0 ? `${mm}분` : mm === 0 ? `${h}시간` : `${h}시간 ${mm}분`
  return m > 0 ? `${body} 후` : `${body} 전`
}

/**
 * ETA → 착륙. 착륙이 없거나 ETA 와 같으면 ETA 만.
 * ("202610011450", "202610011443") → "14:50 → 14:43"
 */
export function fmtEtaLanding(eta: Ymdhm, landing: Ymdhm | null | undefined): string {
  if (!landing || landing === eta) return fmtClock(eta)
  return `${fmtClock(eta)} → ${fmtClock(landing)}`
}

/* ─────────────── 숫자 + 단위 분리 렌더 (숫자 span + 단위 span) ─────────────── */

export interface NumUnitProps {
  value: number | string
  unit: string
  /** 숫자 span 에 더할 클래스 (예: 'type-figure-value', 'font-semibold') */
  className?: string
  /** 단위 span 에 더할 클래스 (기본: body-sm ink-subtle) */
  unitClassName?: string
}

/**
 * 숫자와 단위를 다른 span 으로 나눠 그린다. 숫자는 tabular-nums, 단위는 body-sm ink-subtle.
 * <NumUnit value={46} unit="분" /> → <span>46</span><span>분</span>
 * 글꼴·크기는 감싼 요소를 따른다(숫자). 기준선 정렬을 위해 inline-flex items-baseline.
 */
export function NumUnit({ value, unit, className, unitClassName }: NumUnitProps): ReactNode {
  return createElement(
    'span',
    { className: 'inline-flex items-baseline' },
    createElement('span', { className: cn('tabular-nums', className) }, value),
    createElement('span', { className: cn('ml-0.5 type-body-sm text-ink-subtle', unitClassName) }, unit),
  )
}

/** <Minutes value={46} /> → 46분 */
export function Minutes({ value, className, unitClassName }: Omit<NumUnitProps, 'unit'>): ReactNode {
  return NumUnit({ value, unit: '분', className, unitClassName })
}

/** <Count value={3} /> → 3편 */
export function Count({ value, className, unitClassName }: Omit<NumUnitProps, 'unit'>): ReactNode {
  return NumUnit({ value, unit: '편', className, unitClassName })
}

/** <Until target="…1502" now="…1450" /> → 12분 후 (숫자 span + "분 후" span). 1시간 넘으면 글자 하나로 */
export function Until({
  target,
  now,
  className,
  unitClassName,
}: {
  target: Ymdhm
  now: Ymdhm
  className?: string
  unitClassName?: string
}): ReactNode {
  const m = diffMinutes(target, now)
  if (m > 0 && m < 60) return NumUnit({ value: m, unit: '분 후', className, unitClassName })
  return createElement('span', { className: cn('tabular-nums', className) }, fmtUntil(target, now))
}

/* ───────────────────────── 상태 표시 대응표 ───────────────────────── */

/**
 * 점 모양. 점은 6px, 빈 점은 1.5px 테두리만. 'none' 은 점 없음.
 * hollow = ink-tertiary 빈 점 · subtle = ink-subtle 점 · muted = ink-muted 점 · ink = ink 점
 */
export type DotTone = 'hollow' | 'success' | 'warning' | 'subtle' | 'muted' | 'ink' | 'primary' | 'danger' | 'none'

const DOT_TONE_CLASS: Record<Exclude<DotTone, 'none'>, string> = {
  hollow: 'border-[1.5px] border-ink-tertiary',
  success: 'bg-success',
  warning: 'bg-warning',
  subtle: 'bg-ink-subtle',
  muted: 'bg-ink-muted',
  ink: 'bg-ink',
  primary: 'bg-primary',
  danger: 'bg-danger',
}

/** 상태 점 클래스. <span aria-hidden className={dotClass('success')} /> ('none' 이면 빈 문자열) */
export function dotClass(tone: DotTone): string {
  if (tone === 'none') return ''
  return cn('inline-block size-1.5 shrink-0 rounded-full', DOT_TONE_CLASS[tone])
}

/** 상태 하나를 그리는 데 필요한 것: 글자 + 점 + 글자색 클래스 (+ 조치 필요 라벨 여부) */
export interface StatusDisplay {
  label: string
  dot: DotTone
  /** 글자 클래스. 기본은 'text-ink-muted' (상태 글자 = body-sm ink-muted) */
  textClass: string
  /** true 면 점 대신 signal-label(노랑 라벨)로 그린다 — 라인 critical "조치 필요" 하나뿐 */
  signalLabel?: boolean
}

const TEXT_MUTED = 'text-ink-muted'

/* 판정 (모델 모니터링) */
export type VerdictKind = 'pending' | 'ok' | 'warn' | 'alert_only' | 'retrain_promoted' | 'retrain_rejected'

export interface VerdictInput {
  kind: VerdictKind
  /** pending: 지금 창에 모인 편 수 (예: 13) */
  windowCount?: number
  /** pending: 창 크기 (기본 21) */
  windowSize?: number
  /** warn: 연속 초과 횟수 (1) / 한도 (2) */
  consecutive?: number
  consecutiveLimit?: number
  /** alert_only: 이벤트 이름 (예: '컨베이어 고장') */
  eventName?: string | null
  /** retrain_promoted: 배포한 버전 (예: 'v2') */
  deployedVersion?: string | null
  /** retrain_rejected: 유지한 버전 (예: 'v1') */
  keptVersion?: string | null
  /** retrain_rejected: 새 모델이 기준은 못 넘었지만 지금 모델보다 나아 사람 승인을 기다린다 */
  needsApproval?: boolean
  /** retrain_rejected: 같은 데이터로 이미 불합격해 재학습을 보류했다 (새 데이터를 기다림) */
  held?: boolean
}

/**
 * 판정 상태.
 * pending → "판정 보류 13/21" 빈 점 · ok → "정상" success · warn → "주의 1/2" warning
 * alert_only → "알림만 · 컨베이어 고장" ink-subtle 점 · retrain_promoted → "재학습 · v2 배포" primary
 * retrain_rejected → "재학습 · 게이트 불합격, v1 유지" danger 점 + danger-text 글자
 */
export function verdictStatus(v: VerdictInput): StatusDisplay {
  switch (v.kind) {
    case 'pending':
      return { label: `판정 보류 ${v.windowCount ?? 0}/${v.windowSize ?? 21}`, dot: 'hollow', textClass: TEXT_MUTED }
    case 'ok':
      return { label: '정상', dot: 'success', textClass: TEXT_MUTED }
    case 'warn':
      return { label: `주의 ${v.consecutive ?? 1}/${v.consecutiveLimit ?? 2}`, dot: 'warning', textClass: TEXT_MUTED }
    case 'alert_only':
      return { label: v.eventName ? `알림만 · ${v.eventName}` : '알림만', dot: 'subtle', textClass: TEXT_MUTED }
    case 'retrain_promoted':
      return { label: `재학습 · ${v.deployedVersion ?? 'v2'} 배포`, dot: 'primary', textClass: TEXT_MUTED }
    case 'retrain_rejected':
      return {
        label: v.held
          ? `재학습 보류 · 새 데이터 대기, ${v.keptVersion ?? 'v1'} 유지`
          : `재학습 · 게이트 불합격${v.needsApproval ? '(승인 대기)' : ''}, ${v.keptVersion ?? 'v1'} 유지`,
        dot: 'danger',
        textClass: 'text-danger-text',
      }
  }
}

/* 편 (운영 현황) */
export type FlightStatus = 'scheduled' | 'landed' | 'processing' | 'completed'

export const FLIGHT_STATUS_LABEL: Record<FlightStatus, string> = {
  scheduled: '도착 예정',
  landed: '착륙',
  processing: '처리 중',
  completed: '완료',
}

/**
 * 편 상태.
 * scheduled → "도착 예정" 빈 점 · landed → "착륙" ink-subtle 점 · processing → "처리 중" ink 점
 * completed → "완료" 점 없음 (그 행 글자 전체를 ink-subtle 로)
 */
export function flightStatus(status: FlightStatus): StatusDisplay {
  switch (status) {
    // 편 상태는 늘 있는 상태라 점을 찍지 않는다(점은 예외 상태에만). 진행 정도는 글자 진하기로만 구분한다
    case 'scheduled':
      return { label: '도착 예정', dot: 'none', textClass: 'text-ink-subtle' }
    case 'landed':
      return { label: '착륙', dot: 'none', textClass: TEXT_MUTED }
    case 'processing':
      return { label: '처리 중', dot: 'none', textClass: 'text-ink font-medium' }
    case 'completed':
      return { label: '완료', dot: 'none', textClass: 'text-ink-subtle' }
  }
}

/** 완료된 편의 행 글자 클래스 */
export const COMPLETED_ROW_TEXT = 'text-ink-subtle'

/** 예측 아직 없음: "13:50 발행 예정" (ink-tertiary 글자) */
export function pendingPredictionLabel(issueAt: Ymdhm): string {
  return `${fmtClock(issueAt)} 발행 예정`
}
export const PENDING_PREDICTION_TEXT = 'text-ink-tertiary tabular-nums'

/** 예측 처리 시간 기준 (분). 이 값을 넘으면 조치 필요 */
export const ACTION_THRESHOLD_MIN = 50

/** 50분 초과 예측인가 (같으면 아님) */
export function isOverThreshold(minutes: number): boolean {
  return minutes > ACTION_THRESHOLD_MIN
}

/* 라인 (수취대) */
export type LineStatus = 'normal' | 'busy' | 'critical'

/** 라인 상태. normal → "원활" · busy → "혼잡" (둘 다 점 없이 글자만) · critical → "조치 필요" signal-label */
export function lineStatus(status: LineStatus): StatusDisplay {
  switch (status) {
    case 'normal':
      return { label: '원활', dot: 'none', textClass: 'text-ink-subtle' }
    case 'busy':
      return { label: '혼잡', dot: 'none', textClass: TEXT_MUTED }
    case 'critical':
      return { label: '조치 필요', dot: 'none', textClass: 'text-on-signal', signalLabel: true }
  }
}

/* 서버 (상단 바) */
export type ServerStatus = 'connected' | 'disconnected' | 'mock'

/**
 * 서버 상태. connected → "연결됨" success 점 · disconnected → "연결 끊김" danger 점
 * mock → "목업 데이터" 빈 점: 서버 없이 목업 API로 도는 동안은 "연결됨"이라고 하지 않는다
 */
export function serverStatus(status: ServerStatus): StatusDisplay {
  switch (status) {
    case 'connected':
      return { label: '연결됨', dot: 'success', textClass: TEXT_MUTED }
    case 'disconnected':
      return { label: '연결 끊김', dot: 'danger', textClass: TEXT_MUTED }
    case 'mock':
      return { label: '목업 데이터', dot: 'hollow', textClass: 'text-ink-subtle' }
  }
}

/* 파이프라인 단계 (시나리오 랩) */
export type StepState = 'waiting' | 'running' | 'done' | 'skipped' | 'failed'

/**
 * 파이프라인 단계 상태.
 * waiting → 빈 점 + ink-tertiary 글자 · running → primary 점 + ink "진행 중"
 * done → ink-subtle 점 + ink (재학습·배포 단계면 primary 점) · skipped → 점 없이 ink-tertiary "건너뜀" (앞 연결선 점선)
 * failed → danger 점 + danger-text (뒤 단계는 모두 건너뜀)
 * label 은 단계 이름 옆/아래에 붙는 상태 글자 (done·failed 는 결과 한 줄을 대신 쓴다).
 */
export function stepStatus(state: StepState, opts: { systemAction?: boolean } = {}): StatusDisplay {
  switch (state) {
    case 'waiting':
      return { label: '대기', dot: 'hollow', textClass: 'text-ink-tertiary' }
    case 'running':
      return { label: '진행 중', dot: 'primary', textClass: 'text-ink' }
    case 'done':
      return { label: '완료', dot: opts.systemAction ? 'primary' : 'subtle', textClass: 'text-ink' }
    case 'skipped':
      return { label: '건너뜀', dot: 'none', textClass: 'text-ink-tertiary' }
    case 'failed':
      return { label: '실패', dot: 'danger', textClass: 'text-danger-text' }
  }
}

/* 게이트 검사 */
export function gateResult(passed: boolean): { label: '통과' | '불합격'; textClass: string } {
  return passed ? { label: '통과', textClass: 'text-success-text' } : { label: '불합격', textClass: 'text-danger-text' }
}

/** 시나리오 실행 결과가 기대와 맞는지: "결과 일치" / "결과 다름"(danger-text) */
export function matchResult(matched: boolean): { label: '결과 일치' | '결과 다름'; textClass: string } {
  return matched ? { label: '결과 일치', textClass: 'text-ink-muted' } : { label: '결과 다름', textClass: 'text-danger-text' }
}

/* 시나리오 분류 (글자만) */
export type ScenarioCategory = 'normal' | 'retrain' | 'alert_only' | 'judgement'

export const SCENARIO_CATEGORY_LABEL: Record<ScenarioCategory, string> = {
  normal: '정상',
  retrain: '재학습',
  alert_only: '알림만',
  judgement: '판단 필요',
}

/* 로그 태그 — 글자색만, 바탕 칩 없음 */
export type LogTag = 'WARN' | 'INFO' | 'OK' | 'FAIL' | 'ALERT' | 'CHECK'

export const LOG_TAG_CLASS: Record<LogTag, string> = {
  WARN: 'text-warning-text',
  INFO: 'text-ink-subtle',
  OK: 'text-success-text',
  FAIL: 'text-danger-text',
  ALERT: 'text-ink-muted font-semibold',
  CHECK: 'text-ink-tertiary',
}

/** 재학습·배포 줄의 메시지 글자색 */
export const LOG_HIGHLIGHT_CLASS = 'text-primary-text'

/* ───────────────────────── 자주 쓰는 모양 클래스 ───────────────────────── */

/** signal-label: 노랑 라벨 (라인 "조치 필요", 차트 "50분"). 높이 20px, label 글자 */
export const SIGNAL_LABEL_CLASS =
  'inline-flex h-5 items-center rounded-xs bg-signal px-1.5 type-label whitespace-nowrap text-on-signal'

/** signal-cell: 50분 초과 예측 숫자 칸. 안쪽 2px 6px, 줄 높이 16px(높이 20px — 표 40px 행에 맞음). 숫자는 tabular-nums. 글자 크기는 감싼 곳을 따른다 */
export const SIGNAL_CELL_CLASS = 'inline-block rounded-xs bg-signal px-1.5 py-0.5 leading-4 tabular-nums text-on-signal'

/** version-badge: v1 · v2 */
export const VERSION_BADGE_CLASS =
  'inline-flex items-center rounded-xs bg-surface-2 px-1.5 py-0.5 type-mono-sm text-ink-muted'

/** 오늘이면 "14:50", 다른 날이면 "9/30 14:50" */
export function fmtWhen(t: Ymdhm, now: Ymdhm): string {
  if (t.slice(0, 8) === now.slice(0, 8)) return fmtClock(t)
  return `${Number(t.slice(4, 6))}/${Number(t.slice(6, 8))} ${fmtClock(t)}`
}
