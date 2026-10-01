import { useState, type ReactNode } from 'react'
import {
  AirplaneLandingIcon,
  ArrowClockwiseIcon,
  ArrowsClockwiseIcon,
  CaretDownIcon,
  CaretRightIcon,
  CaretUpIcon,
  ChartLineIcon,
  CheckIcon,
  FlaskIcon,
  ShieldCheckIcon,
  SidebarSimpleIcon,
  SuitcaseRollingIcon,
  TagIcon,
  UsersThreeIcon,
  WarningOctagonIcon,
  XIcon,
  type Icon as PhosphorIcon,
} from '@phosphor-icons/react'

import { APP_TABS, type TabIcon } from '@/components/app/tabs'
import { Brand } from '@/components/brand/Brand'
import { Wordmark } from '@/components/brand/Wordmark'
import { CarouselMap } from '@/components/graphics/CarouselMap'
import { FlapBoard } from '@/components/graphics/FlapBoard'
import { MascotCarry, MascotMark, MascotPose } from '@/components/mascot/Mascot'
import { Button } from '@/components/ui/button'
import { lines, type LineId } from '@/design/mock'
import { Specimen } from '@/design/SheetSection'
import { cn } from '@/lib/cn'

/**
 * 그래픽 — 숫자판(+ 마스코트)·마스코트·수취장 평면도(확장 범위)·아이콘·워드마크
 * 이 파일은 구역 안쪽만 돌려준다. 바깥 틀(제목·구분선)은 DesignPage 의 SheetSection 이 그린다.
 * 부품마다 <Specimen name="부품 이름"> 으로 감싼다 (@/design/SheetSection).
 * 3D 는 쓰지 않는다 (DESIGN.md "3D는 쓰지 않는다").
 */
export function GraphicsSection() {
  const [selected, setSelected] = useState<LineId | null>('T1-07')
  const select = (id: LineId) => setSelected((cur) => (cur === id ? null : id))

  return (
    <>
      <div className="flex flex-wrap items-start gap-x-16 gap-y-10">
        <Specimen name="숫자판 flap-tile · 넘김 · 마스코트 (0편 서 있음, 1편 이상 가방 잡기)">
          <FlapDemo />
        </Specimen>
        <Specimen name="숫자판 · 0편 / 1편 이상 / 두 자리">
          <FlapStates />
        </Specimen>
      </div>

      <Specimen name="마스코트 · 쓰는 곳 세 곳">
        <MascotSheet />
      </Specimen>

      <Specimen name="수취장 평면도 = 확장 범위 · 표시 라인만 누를 수 있다">
        <CarouselMap lines={lines} selected={selected} onSelect={select} />
      </Specimen>

      <Specimen name="탭 아이콘 · 18px">
        <TabIconRow />
      </Specimen>

      <Specimen name="아이콘 · Phosphor Regular (16 · 18px)">
        <IconGrid
          items={PHOSPHOR_ICONS.map(({ name, code, Icon, mirrored }) => ({
            name,
            code,
            render: (size) => <Icon size={size} aria-hidden className={cn(mirrored && '-scale-x-100')} />,
          }))}
        />
      </Specimen>

      <Specimen name="아이콘 · 도메인 뜻 (Phosphor Regular, 직접 그리지 않음)">
        <IconGrid
          items={DOMAIN_ICONS.map(({ name, code, Icon }) => ({ name, code, render: (size) => <Icon size={size} aria-hidden /> }))}
        />
      </Specimen>

      <div className="flex flex-wrap items-start gap-x-16 gap-y-10">
        <Specimen name="상단 바 브랜드 · 마스코트 마크 + 워드마크">
          <div className="flex h-12 items-center">
            <Brand />
          </div>
        </Specimen>
        <Specimen name="워드마크">
          <div className="flex h-12 items-center">
            <Wordmark />
          </div>
        </Specimen>
      </div>
    </>
  )
}

/* ───────────────────────── 숫자판 + 마스코트 ───────────────────────── */

/** 값 바꾸기: 0 → 2 → 3 → 0 … (2 → 3 은 자세가 그대로, 0 ↔ 1 이상일 때만 바뀐다) */
const FLAP_CYCLE = [0, 2, 3] as const

function FlapDemo() {
  const [step, setStep] = useState(0)
  const value = FLAP_CYCLE[step]

  return (
    <div className="flex items-center gap-8">
      {/* 숫자판 오른쪽에 마스코트(80px) — DESIGN.md "숫자판" */}
      <div className="flex items-center gap-4">
        <span className="inline-flex items-baseline gap-1.5">
          <FlapBoard value={value} />
          <span className="type-body text-ink-subtle">편</span>
        </span>
        <MascotPose alert={value > 0} size="sm" />
      </div>
      <div className="flex items-center gap-3">
        <Button variant="outline" onClick={() => setStep((s) => (s + 1) % FLAP_CYCLE.length)}>
          값 바꾸기
        </Button>
        <span className="type-body-sm tabular-nums text-ink-subtle">
          {[...FLAP_CYCLE, FLAP_CYCLE[0]].map((v, i) => (
            <span key={i}>
              {i > 0 && <span className="px-1">→</span>}
              <span className={cn(i === step && 'font-medium text-ink')}>{v}</span>
            </span>
          ))}
        </span>
      </div>
    </div>
  )
}

function FlapStates() {
  const states = [
    { value: 0, label: '0편 · 흰 숫자' },
    { value: 2, label: '1편 이상 · 노랑 숫자' },
    { value: 12, label: '두 자리' },
  ]
  return (
    <div className="flex items-start gap-8">
      {states.map((s) => (
        <div key={s.value} className="flex flex-col gap-2">
          <FlapBoard value={s.value} />
          <span className="type-caption text-ink-subtle">{s.label}</span>
        </div>
      ))}
    </div>
  )
}

/* ───────────────────────── 마스코트 ───────────────────────── */

/** 쓰는 곳 세 곳의 모습 — 같은 바닥선에 세우고 아래에 이름·크기 */
function MascotSheet() {
  const items: Array<{ key: string; art: ReactNode; name: string; size: string }> = [
    { key: 'mark', art: <MascotMark />, name: '상단 바 마크', size: '40px, 칸 1px' },
    { key: 'calm-sm', art: <MascotPose alert={false} size="sm" />, name: '조치 필요 0편 (운영 현황)', size: '40px, 칸 1px' },
    { key: 'alert-sm', art: <MascotPose alert size="sm" />, name: '조치 필요 1편 이상 (운영 현황)', size: '40px, 칸 1px' },
    { key: 'calm', art: <MascotPose alert={false} />, name: '조치 필요 0편 (비교용 80px)', size: '80px, 칸 2px' },
    { key: 'alert', art: <MascotPose alert />, name: '조치 필요 1편 이상 (비교용 80px)', size: '80px, 칸 2px' },
    { key: 'carry', art: <MascotCarry />, name: '실행 중 · 시나리오 랩', size: '6장면 · 장면당 150ms' },
  ]
  return (
    <div className="flex flex-col gap-4">
      <ul className="flex items-end gap-12">
        {items.map((item) => (
          <li key={item.key} className="flex flex-col gap-2">
            <div className="flex h-20 items-end">{item.art}</div>
            <div className="flex flex-col">
              <span className="type-body-sm text-ink">{item.name}</span>
              <span className="type-caption tabular-nums text-ink-subtle">{item.size}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="type-caption text-ink-subtle">
        정수 배율로만 그린다. 원본 40×40칸에서 칸 1px은 40px, 2px은 80px다. 그 사이 크기로 줄이거나 키우지 않고, 다시 칠하지
        않는다. 움직임 줄이기 설정이면 실행 중 장면은 3번 한 장.
      </p>
    </div>
  )
}

/* ───────────────────────── 아이콘 ───────────────────────── */

/** DESIGN.md "아이콘": 크기는 두 가지 — UI 16px, 탭 18px */
const ICON_SIZES = [16, 18] as const
type IconSize = (typeof ICON_SIZES)[number]

/** 탭 아이콘의 코드 이름 (시트 표기용) — app/tabs 의 실제 값과 맞춰 찾는다 */
const TAB_ICON_CODES: Array<{ Icon: TabIcon; code: string; source: string }> = [
  { Icon: SuitcaseRollingIcon, code: 'SuitcaseRollingIcon', source: 'Phosphor Regular' },
  { Icon: ChartLineIcon, code: 'ChartLineIcon', source: 'Phosphor Regular' },
  { Icon: FlaskIcon, code: 'FlaskIcon', source: 'Phosphor Regular' },
]

/** 상단 바 탭에 실제로 쓰는 아이콘 + 글자 (app/tabs 그대로) */
function TabIconRow() {
  return (
    <ul className="flex items-start gap-10">
      {APP_TABS.map(({ id, label, Icon }) => {
        const info = TAB_ICON_CODES.find((c) => c.Icon === Icon)
        return (
          <li key={id} className="flex flex-col gap-1">
            <span className="inline-flex items-center gap-1.5 type-button text-ink">
              <span aria-hidden className="inline-flex">
                <Icon size={18} />
              </span>
              {label}
            </span>
            {info && (
              <span className="inline-flex items-baseline gap-1.5">
                <span className="type-mono-sm text-ink-subtle">{info.code}</span>
                <span className="type-caption text-ink-subtle">{info.source}</span>
              </span>
            )}
          </li>
        )
      })}
    </ul>
  )
}

/**
 * 화면에서 실제로 쓰는 Phosphor 아이콘 — 탭(18px) · 아이콘만 있는 버튼(닫기·새로고침·서랍) · 선택·메뉴 부품 안.
 * 상단 바 탭(components/app/tabs.ts), 기본 부품의 아이콘 버튼, components/ui 와 같은 것만 늘어놓는다.
 * 아이콘은 Phosphor 한 세트만 쓴다. 직접 그린 SVG 아이콘은 쓰지 않는다.
 */
const PHOSPHOR_ICONS: Array<{ name: string; code: string; Icon: PhosphorIcon; mirrored?: boolean }> = [
  { name: '탭 · 운영 현황', code: 'SuitcaseRollingIcon', Icon: SuitcaseRollingIcon },
  { name: '탭 · 모델 모니터링', code: 'ChartLineIcon', Icon: ChartLineIcon },
  { name: '탭 · 시나리오 랩', code: 'FlaskIcon', Icon: FlaskIcon },
  { name: '닫기', code: 'XIcon', Icon: XIcon },
  { name: '새로고침', code: 'ArrowClockwiseIcon', Icon: ArrowClockwiseIcon },
  { name: '라인 상세 열기 (반전)', code: 'SidebarSimpleIcon', Icon: SidebarSimpleIcon, mirrored: true },
  { name: '선택 펼치기', code: 'CaretDownIcon', Icon: CaretDownIcon },
  { name: '목록 위로', code: 'CaretUpIcon', Icon: CaretUpIcon },
  { name: '하위 메뉴', code: 'CaretRightIcon', Icon: CaretRightIcon },
  { name: '선택됨', code: 'CheckIcon', Icon: CheckIcon },
]

const DOMAIN_ICONS: Array<{ name: string; code: string; Icon: PhosphorIcon }> = [
  { name: '수하물', code: 'SuitcaseRollingIcon', Icon: SuitcaseRollingIcon },
  { name: '수하물 태그', code: 'TagIcon', Icon: TagIcon },
  { name: '착륙', code: 'AirplaneLandingIcon', Icon: AirplaneLandingIcon },
  { name: '조업 인력', code: 'UsersThreeIcon', Icon: UsersThreeIcon },
  { name: '컨베이어 고장', code: 'WarningOctagonIcon', Icon: WarningOctagonIcon },
  { name: '오차 추이', code: 'ChartLineIcon', Icon: ChartLineIcon },
  { name: '재학습', code: 'ArrowsClockwiseIcon', Icon: ArrowsClockwiseIcon },
  { name: '게이트', code: 'ShieldCheckIcon', Icon: ShieldCheckIcon },
]

/** 한 칸: 16 · 18px 를 나란히 + 이름 + 코드 이름 */
function IconGrid({ items }: { items: Array<{ name: string; code: string; render: (size: IconSize) => ReactNode }> }) {
  return (
    <ul className="grid grid-cols-8 gap-x-4 gap-y-6">
      {items.map((item) => (
        <li key={item.code} className="flex min-w-0 flex-col gap-2">
          <div className="flex h-6 items-center gap-4 text-ink">
            {ICON_SIZES.map((size) => (
              <span key={size} className="inline-flex">
                {item.render(size)}
              </span>
            ))}
          </div>
          <div className="flex min-w-0 flex-col">
            <span className="type-body-sm text-ink">{item.name}</span>
            <span className="truncate type-mono-sm text-ink-subtle">{item.code}</span>
          </div>
        </li>
      ))}
    </ul>
  )
}

