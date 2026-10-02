import { useEffect, useState, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Specimen } from '@/design/SheetSection'
import { cn } from '@/lib/cn'
import { NumUnit } from '@/lib/format'

/**
 * 기초 — 색·글자·간격·둥글기·깊이.
 * 이 파일은 구역 안쪽만 돌려준다. 바깥 틀(제목·구분선)은 DesignPage 의 SheetSection 이 그린다.
 *
 * 색 견본의 hex·대비는 화면에 실제로 걸린 CSS 변수(src/styles/tokens.css)를 읽어 계산한다.
 * 그래서 토큰을 바꾸면 이 표도 같이 바뀐다. 읽기 전에는 DESIGN.md 값을 보인다.
 */

/* ───────────────────────── 색 ───────────────────────── */

interface Swatch {
  token: string
  /** DESIGN.md 값 (CSS 변수를 읽기 전) */
  value: string
  /** on-* 토큰: 이 면 위 글자 — 대비를 이 면에 대고 잰다 */
  on?: string
  /** 투명도 (overlay 40%) */
  alpha?: number
}

const COLOR_GROUPS: ReadonlyArray<{ name: string; swatches: Swatch[] }> = [
  {
    name: '바탕과 면',
    swatches: [
      { token: 'canvas', value: '#f7f8f8' },
      { token: 'surface-1', value: '#ffffff' },
      { token: 'surface-2', value: '#f1f2f4' },
      { token: 'surface-3', value: '#e8eaed' },
      { token: 'hairline', value: '#e6e8eb' },
      { token: 'hairline-strong', value: '#d0d6e0' },
    ],
  },
  {
    name: '글자',
    swatches: [
      { token: 'ink', value: '#0f1011' },
      { token: 'ink-muted', value: '#3c4149' },
      { token: 'ink-subtle', value: '#62666d' },
      { token: 'ink-tertiary', value: '#8a8f98' },
    ],
  },
  {
    name: '강조색',
    swatches: [
      { token: 'primary', value: '#336fc0' },
      { token: 'primary-hover', value: '#2d62a9' },
      { token: 'primary-pressed', value: '#285796' },
      { token: 'primary-subtle', value: '#ebf1f9' },
      { token: 'primary-border', value: '#b8cde9' },
      { token: 'primary-text', value: '#265390' },
      { token: 'on-primary', value: '#ffffff', on: 'primary' },
    ],
  },
  {
    name: '의미 색',
    swatches: [
      { token: 'success', value: '#27a644' },
      { token: 'success-text', value: '#1f7a35' },
      { token: 'warning', value: '#d46b08' },
      { token: 'warning-text', value: '#b45309' },
      { token: 'danger', value: '#d93636' },
      { token: 'danger-text', value: '#b42318' },
      { token: 'danger-subtle', value: '#fbebeb' },
    ],
  },
  {
    name: '공항 신호색 · 전광판',
    swatches: [
      { token: 'signal', value: '#f5c400' },
      { token: 'signal-subtle', value: '#fcf0bf' },
      { token: 'on-signal', value: '#0f1011', on: 'signal' },
      { token: 'board', value: '#0f1011' },
      { token: 'board-line', value: '#2a2c31' },
      { token: 'on-board', value: '#ffffff', on: 'board' },
    ],
  },
  {
    name: '차트 · 덮개',
    swatches: [
      { token: 'chart-actual', value: '#0f1011' },
      { token: 'chart-predicted', value: '#336fc0' },
      { token: 'chart-threshold', value: '#d46b08' },
      { token: 'chart-reference', value: '#8a8f98' },
      { token: 'overlay', value: '#0f1011', alpha: 0.4 },
    ],
  },
]

const ALL_SWATCHES = COLOR_GROUPS.flatMap((g) => g.swatches)

function readTokens(): Record<string, string> {
  const out: Record<string, string> = {}
  const style = typeof window === 'undefined' ? null : getComputedStyle(document.documentElement)
  for (const s of ALL_SWATCHES) {
    const live = style?.getPropertyValue(`--${s.token}`).trim().toLowerCase()
    out[s.token] = live || s.value
  }
  return out
}

/** 화면에 걸린 토큰 값. 스타일시트가 늦게 붙어도 load 뒤에 다시 읽는다 */
function useTokenValues(): Record<string, string> {
  const [values, setValues] = useState(readTokens)
  useEffect(() => {
    const update = () => setValues(readTokens())
    update()
    window.addEventListener('load', update)
    return () => window.removeEventListener('load', update)
  }, [])
  return values
}

function hexToRgb(hex: string): [number, number, number] | null {
  const m = hex.match(/^#([0-9a-f]{6})$/i)
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

function luminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)
}

/** WCAG 대비. 1.12:1 처럼 2 미만은 소수 둘째 자리까지 */
function contrastText(a: string, b: string): string | null {
  const ra = hexToRgb(a)
  const rb = hexToRgb(b)
  if (!ra || !rb) return null
  const [la, lb] = [luminance(ra), luminance(rb)]
  const ratio = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05)
  if (ratio < 1.005) return null
  return `${ratio < 2 ? ratio.toFixed(2) : ratio.toFixed(1)}:1`
}

function SwatchTile({ swatch, values }: { swatch: Swatch; values: Record<string, string> }) {
  const hex = values[swatch.token]
  const base = swatch.on ? values[swatch.on] : values['surface-1']
  const ratio = swatch.alpha ? null : contrastText(hex, base)
  const fill = swatch.alpha
    ? `color-mix(in srgb, var(--${swatch.token}) ${swatch.alpha * 100}%, transparent)`
    : `var(--${swatch.on ?? swatch.token})`

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <div
        className="flex h-10 items-center justify-center rounded-xs border border-hairline"
        style={{ background: fill }}
      >
        {swatch.on && (
          <span className="type-body-sm font-medium tabular-nums" style={{ color: `var(--${swatch.token})` }}>
            가 57
          </span>
        )}
      </div>
      <div className="flex flex-col">
        <span className="truncate type-mono-sm text-ink">{swatch.token}</span>
        <span className="type-mono-sm text-ink-subtle">
          {hex}
          {swatch.alpha ? ` ${swatch.alpha * 100}%` : ''}
        </span>
        <span className="type-caption tabular-nums text-ink-subtle">
          {ratio ? `${swatch.on ? `${swatch.on} 위` : '흰 면'} ${ratio}` : '-'}
        </span>
      </div>
    </div>
  )
}

function ColorSwatches() {
  const values = useTokenValues()
  return (
    <div className="flex flex-col gap-6">
      {COLOR_GROUPS.map((group) => (
        <div key={group.name} className="grid grid-cols-[136px_repeat(7,minmax(0,1fr))] gap-x-4">
          <div className="flex h-10 items-center type-label text-ink-subtle">{group.name}</div>
          {group.swatches.map((s) => (
            <SwatchTile key={s.token} swatch={s} values={values} />
          ))}
        </div>
      ))}
    </div>
  )
}

/** 의미 색 — 색 하나에 의미 하나 (DESIGN.md "의미 색") */
const MEANINGS: ReadonlyArray<{ token: string; meaning: string; text: string; usage: string }> = [
  {
    token: 'primary',
    meaning: '사용자가 고른 것, 시스템이 한 일',
    text: 'primary-text',
    usage:
      '주요 버튼, 포커스 링, 링크 글자, 선택한 편 테두리, 시각 지정 표시, 차트의 예측 선과 배포 세로선, 로그의 재학습·배포 줄, 판정 "재학습" 점',
  },
  {
    token: 'success',
    meaning: '정상, 통과',
    text: 'success-text',
    usage: '모델 모니터링의 판정 정상 점, 게이트 통과 글자, 서버 연결됨 점. 운영 현황에서는 쓰지 않는다',
  },
  { token: 'warning', meaning: '드리프트 의심', text: 'warning-text', usage: '판정 "주의" 점, 차트 임계값 점선' },
  {
    token: 'danger',
    meaning: '실패, 장애',
    text: 'danger-text',
    usage: '게이트 불합격, 연결 끊김, 오류 점, 위험 확인 버튼',
  },
  {
    token: 'signal',
    meaning: '조치 필요 (50분 초과 예측)',
    text: '면으로만 · 위 글자 on-signal',
    usage: '숫자 칸 바탕, 타임라인 막대, 조치 필요 라벨, 수취장 평면도의 벨트 면',
  },
  { token: 'ink-subtle', meaning: '정보, 대기, 완료', text: 'ink-muted · ink-subtle', usage: '그 밖의 모든 상태' },
]

function MeaningTable() {
  return (
    <div className="-mx-6">
      <Table className="table-fixed">
        <colgroup>
          <col className="w-[184px]" />
          <col className="w-[232px]" />
          <col className="w-[232px]" />
          <col />
        </colgroup>
        <TableHeader>
          <TableRow>
            <TableHead className="pl-6">색</TableHead>
            <TableHead>의미</TableHead>
            <TableHead>글자로 쓸 때</TableHead>
            <TableHead className="pr-6">쓰는 곳 (이 밖에는 쓰지 않는다)</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {MEANINGS.map((m) => (
            <TableRow key={m.token}>
              <TableCell className="pl-6">
                <span
                  aria-hidden
                  className="mr-2 inline-block size-3 rounded-xs align-[calc(0.36em-6px)]"
                  style={{ background: `var(--${m.token})` }}
                />
                {m.token === 'ink-subtle' ? (
                  <span className="text-ink">회색</span>
                ) : (
                  <span className="type-mono text-ink">{m.token}</span>
                )}
              </TableCell>
              <TableCell className="text-ink">{m.meaning}</TableCell>
              <TableCell className="type-mono-sm text-ink-subtle">{m.text}</TableCell>
              <TableCell className="pr-6 whitespace-normal text-ink-muted">{m.usage}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  )
}

/* ───────────────────────── 글자 ───────────────────────── */

/** 표처럼 생긴 목록 한 줄: 흰 면 좌우 끝까지 hairline, 칸은 기준선 정렬 */
function SpecRow({ cols, children, className }: { cols: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('grid items-baseline gap-x-6 border-b border-hairline px-6 py-4', cols, className)}>
      {children}
    </div>
  )
}

function SpecHead({ cols, labels, alignRight = [] }: { cols: string; labels: string[]; alignRight?: number[] }) {
  return (
    <div className={cn('grid h-9 items-center gap-x-6 border-b border-hairline px-6', cols)}>
      {labels.map((l, i) => (
        <span key={i} className={cn('type-label text-ink-subtle', alignRight.includes(i) && 'text-right')}>
          {l}
        </span>
      ))}
    </div>
  )
}

const FONT_COLS = 'grid-cols-[200px_minmax(0,1fr)_360px]'

const FONTS: ReadonlyArray<{ name: string; spec: string; sample: ReactNode; usage: string }> = [
  {
    name: 'KBO 다이아고딕',
    spec: '500 · 700 · 눈누 CDN',
    sample: <span className="type-figure-value text-ink">운영 현황 0123456789</span>,
    usage: '페이지 제목, 숫자판·큰 숫자만. 서비스 이름·로고·본문·표에는 쓰지 않는다',
  },
  {
    name: 'Pretendard Variable',
    spec: '400 · 500 · 600 · jsDelivr CDN',
    sample: <span className="type-body tabular-nums text-ink">도착편 예측 처리 시간 0123456789</span>,
    usage: '본문, 표, 버튼, 시각, 처리 시간, 단위, 서비스 이름. 숫자는 tabular-nums',
  },
  {
    name: 'JetBrains Mono',
    spec: '400 · 600([ALERT] 태그만) · @fontsource',
    sample: <span className="type-mono text-ink">KE082 T2-08 77W v2 0123456789</span>,
    usage: '편명, 기종 코드, 수취대 ID, 버전, 로그',
  },
]

function FontTable() {
  return (
    <div className="-mx-6">
      <SpecHead cols={FONT_COLS} labels={['글꼴', '견본', '쓰는 곳']} />
      {FONTS.map((f) => (
        <SpecRow key={f.name} cols={FONT_COLS}>
          <span className="flex flex-col">
            <span className="type-body-sm text-ink">{f.name}</span>
            <span className="type-caption text-ink-subtle">{f.spec}</span>
          </span>
          {f.sample}
          <span className="type-body-sm text-ink-muted">{f.usage}</span>
        </SpecRow>
      ))}
    </div>
  )
}

const TYPE_COLS = 'grid-cols-[200px_minmax(0,1fr)_360px]'

const TYPE_SCALE: ReadonlyArray<{ token: string; spec: string; sample: ReactNode; usage: string }> = [
  {
    token: 'hero-value',
    spec: 'KBO · 48px · 700 · 1.00',
    sample: <span className="type-hero-value text-ink">02</span>,
    usage: '화면당 하나, 숫자판의 숫자',
  },
  {
    token: 'page-title',
    spec: 'KBO · 20px · 500 · 1.30',
    sample: <span className="type-page-title text-ink">운영 현황</span>,
    usage: '페이지 제목',
  },
  {
    token: 'figure-value',
    spec: 'KBO · 22px · 500 · 1.10',
    sample: (
      <span className="type-figure-value text-ink">
        <NumUnit value={160} unit="편" />
      </span>
    ),
    usage: '숫자 줄의 숫자 (최대 4개). 단위는 body-sm ink-subtle',
  },
  {
    token: 'wordmark',
    spec: 'Pretendard · 16px · 600 · 1.00 · −0.3px',
    sample: <span className="type-wordmark text-ink">짐작</span>,
    usage: '서비스 이름',
  },
  {
    token: 'section-title',
    spec: 'Pretendard · 15px · 600 · 1.40 · −0.1px',
    sample: <span className="type-section-title text-ink">수취대 타임라인</span>,
    usage: '섹션 제목, 대화상자·서랍 제목',
  },
  {
    token: 'body',
    spec: 'Pretendard · 14px · 400 · 1.50',
    sample: <span className="type-body text-ink">착륙부터 승객용 마지막 짐이 벨트에 오르기까지</span>,
    usage: '기본 본문',
  },
  {
    token: 'body-sm',
    spec: 'Pretendard · 13px · 400 · 1.50',
    sample: <span className="type-body-sm tabular-nums text-ink">예상 마지막 짐 11:09 · 처리 중</span>,
    usage: '표, 상태, 폼',
  },
  {
    token: 'label',
    spec: 'Pretendard · 12px · 500 · 1.30',
    sample: <span className="type-label text-ink-subtle">예측 처리 시간 (기준 50분)</span>,
    usage: '표 머리글, 숫자 이름',
  },
  {
    token: 'caption',
    spec: 'Pretendard · 12px · 400 · 1.40',
    sample: <span className="type-caption tabular-nums text-ink-subtle">09:30 · 10:00 · 10:30 · 11:00</span>,
    usage: '메타, 축',
  },
  {
    token: 'button',
    spec: 'Pretendard · 13px · 500 · 1.20',
    sample: <span className="type-button text-ink">실행 · 지금으로 · 다시 시도</span>,
    usage: '버튼, 탭, 세그먼트',
  },
  {
    token: 'mono',
    spec: 'JetBrains Mono · 13px · 400 · 1.40',
    sample: <span className="type-mono text-ink">KE082 · T2-08 · 77W</span>,
    usage: '편명, 라인, 기종, 로그',
  },
  {
    token: 'mono-sm',
    spec: 'JetBrains Mono · 12px · 400 · 1.40',
    sample: <span className="type-mono-sm text-ink">SC4609 · v2</span>,
    usage: '타임라인 막대 편명, 버전 배지, 단계 결과',
  },
]

function TypeScale() {
  return (
    <div className="-mx-6">
      <SpecHead cols={TYPE_COLS} labels={['토큰', '견본', '쓰임']} />
      {TYPE_SCALE.map((t) => (
        <SpecRow key={t.token} cols={TYPE_COLS}>
          <span className="flex flex-col">
            <span className="type-mono-sm text-ink">{t.token}</span>
            <span className="type-caption text-ink-subtle">{t.spec}</span>
          </span>
          {t.sample}
          <span className="type-body-sm text-ink-muted">{t.usage}</span>
        </SpecRow>
      ))}
    </div>
  )
}

/* ───────────────────────── 간격 · 둥글기 · 깊이 ───────────────────────── */

const SPACING: ReadonlyArray<{ token: string; px: number; usage: string }> = [
  { token: 'xxs', px: 4, usage: '기본 단위' },
  { token: 'xs', px: 8, usage: '본문 흰 면 좌우·아래 띄움' },
  { token: 'sm', px: 12, usage: '표 칸 좌우 여백' },
  { token: 'md', px: 16, usage: '파이프라인 단계 사이 연결선' },
  { token: 'lg', px: 24, usage: '본문 흰 면 안쪽 여백' },
  { token: 'xl', px: 32, usage: '섹션 사이, 숫자 줄 숫자 사이' },
  { token: 'xxl', px: 48, usage: '-' },
]

const SPACING_COLS = 'grid-cols-[136px_56px_64px_minmax(0,1fr)]'

function SpacingScale() {
  return (
    <div className="-mx-6">
      <SpecHead cols={SPACING_COLS} labels={['토큰', '값', '', '쓰임']} alignRight={[1]} />
      {SPACING.map((s) => (
        <div
          key={s.token}
          className={cn('grid h-10 items-center gap-x-6 border-b border-hairline px-6', SPACING_COLS)}
        >
          <span className="type-mono-sm text-ink">{s.token}</span>
          <span className="text-right type-body-sm text-ink">
            <NumUnit value={s.px} unit="px" />
          </span>
          <span aria-hidden className="h-4 bg-surface-3" style={{ width: s.px }} />
          <span className="type-body-sm text-ink-muted">{s.usage}</span>
        </div>
      ))}
    </div>
  )
}

const RADII: ReadonlyArray<{ token: string; px: string; className: string; usage: string }> = [
  { token: 'xs', px: '4px', className: 'rounded-xs', usage: '숫자판 칸, 노랑 라벨·칸, 버전 배지, 타임라인 막대' },
  { token: 'sm', px: '6px', className: 'rounded-sm', usage: '탭, 세그먼트 선택 칸' },
  { token: 'md', px: '8px', className: 'rounded-md', usage: '버튼, 입력' },
  { token: 'lg', px: '12px', className: 'rounded-lg', usage: '본문 흰 면, 대화상자, 서랍' },
  { token: 'full', px: '9999px', className: 'rounded-full', usage: '상태 점만' },
]

function RadiusScale() {
  return (
    <div className="grid grid-cols-5 gap-6">
      {RADII.map((r) => (
        <div key={r.token} className="flex flex-col gap-3">
          <div className="flex h-14 items-center">
            {r.token === 'full' ? (
              <span aria-hidden className="size-1.5 rounded-full bg-ink-subtle" />
            ) : (
              <span aria-hidden className={cn('h-14 w-24 border border-hairline-strong bg-surface-1', r.className)} />
            )}
          </div>
          <div className="flex flex-col">
            <span className="flex items-baseline gap-2">
              <span className="type-mono-sm text-ink">{r.token}</span>
              <span className="type-caption tabular-nums text-ink-subtle">{r.px}</span>
            </span>
            <span className="type-caption text-ink-subtle">{r.usage}</span>
          </div>
        </div>
      ))}
    </div>
  )
}

const DEPTHS: ReadonlyArray<{ level: string; name: string; spec: string; usage: string; tile: ReactNode }> = [
  {
    level: '0',
    name: '바탕',
    spec: 'canvas',
    usage: '페이지 바탕, 상단 바',
    tile: null,
  },
  {
    level: '1',
    name: '본문 흰 면',
    spec: 'surface-1 + hairline 1px',
    usage: '화면당 하나',
    tile: <div className="h-full rounded-lg border border-hairline bg-surface-1" />,
  },
  {
    level: '2',
    name: 'hover · 선택',
    spec: 'surface-2 / surface-3',
    usage: '흰 면 안의 hover, 선택·눌림',
    tile: (
      <div className="flex h-full flex-col justify-center gap-1 rounded-lg border border-hairline bg-surface-1 px-2">
        <span className="flex h-[30px] items-center rounded-sm bg-surface-2 px-2.5 type-body-sm text-ink">hover</span>
        <span className="flex h-[30px] items-center rounded-sm bg-surface-3 px-2.5 type-body-sm text-ink">선택</span>
      </div>
    ),
  },
  {
    level: '3',
    name: '떠 있는 것',
    spec: '0 8px 24px rgba(15,16,17,.12)',
    usage: '드롭다운, 대화상자, 툴팁, 서랍, 토스트만',
    tile: <div className="h-full rounded-lg bg-surface-1 shadow-depth-3" />,
  },
  {
    level: '',
    name: '포커스',
    spec: '2px primary + 바깥 2px 띄움',
    usage: '키보드 포커스. outline-none 금지',
    tile: (
      <div inert className="flex h-full items-center justify-center rounded-lg border border-hairline bg-surface-1">
        <Button variant="outline" className="outline-2 outline-offset-2 outline-primary">
          실행
        </Button>
      </div>
    ),
  },
]

function DepthScale() {
  return (
    <div className="-mx-6 bg-canvas px-6 py-6">
      <div className="grid grid-cols-5 gap-6">
        {DEPTHS.map((d) => (
          <div key={d.name} className="flex flex-col gap-3">
            <div className="h-[104px]">{d.tile}</div>
            <div className="flex flex-col">
              <span className="flex items-baseline gap-2">
                {d.level && <span className="type-label tabular-nums text-ink">{d.level}</span>}
                <span className="type-label text-ink">{d.name}</span>
              </span>
              <span className="type-mono-sm text-ink-subtle">{d.spec}</span>
              <span className="type-caption text-ink-subtle">{d.usage}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ───────────────────────── 구역 ───────────────────────── */

export function FoundationsSection() {
  return (
    <>
      <Specimen name="색 견본">
        <ColorSwatches />
      </Specimen>
      <Specimen name="의미 색">
        <MeaningTable />
      </Specimen>
      <Specimen name="글꼴">
        <FontTable />
      </Specimen>
      <Specimen name="글자 크기 체계">
        <TypeScale />
      </Specimen>
      <Specimen name="간격">
        <SpacingScale />
      </Specimen>
      <Specimen name="둥글기">
        <RadiusScale />
      </Specimen>
      <Specimen name="깊이 · 포커스">
        <DepthScale />
      </Specimen>
    </>
  )
}
