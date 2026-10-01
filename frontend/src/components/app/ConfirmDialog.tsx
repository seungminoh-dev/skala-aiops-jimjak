import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { cn } from '@/lib/cn'

/**
 * 확인 대화상자 — 폭 440px, 제목 section-title, 설명 문장 없이 내용만, 버튼은 오른쪽 아래(보조 → 주요/위험).
 * 위험(tone="danger")은 데모 초기화·롤백처럼 되돌리기 어려운 동작에만. 위험 버튼(button-danger)은 이 안에서만 쓴다.
 * 열리면 포커스는 첫 버튼(취소)에 간다.
 *
 *   <ConfirmDialog
 *     trigger={<Button variant="ghost">데모 초기화</Button>}
 *     title="데모 초기화" confirmLabel="초기화" tone="danger" onConfirm={reset}
 *   >
 *     <ConfirmFacts items={[{ label: '지우는 것', value: '판정 기록 12건 · 시나리오 실행 16회' }]} />
 *   </ConfirmDialog>
 */
export interface ConfirmDialogProps {
  /** 여는 버튼 (asChild 로 감싼다). 없으면 open/onOpenChange 로 연다 */
  trigger?: ReactNode
  open?: boolean
  onOpenChange?: (open: boolean) => void
  title: string
  /** 내용 — 사실만 (ConfirmFacts 권장) */
  children?: ReactNode
  confirmLabel: string
  /** 기본 "취소" */
  cancelLabel?: string
  /** 기본 'default'(주요 버튼). 'danger' 면 위험 버튼 */
  tone?: 'default' | 'danger'
  onConfirm: () => void
}

export function ConfirmDialog({
  trigger,
  open,
  onOpenChange,
  title,
  children,
  confirmLabel,
  cancelLabel = '취소',
  tone = 'default',
  onConfirm,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger asChild>{trigger}</DialogTrigger>}
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {children && <div className="type-body-sm text-ink-muted">{children}</div>}
        <DialogFooter className="pt-1">
          <DialogClose asChild>
            <Button variant="outline">{cancelLabel}</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button variant={tone === 'danger' ? 'destructive' : 'default'} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * 대화상자 내용용 사실 목록 — 이름(ink-subtle) | 값(ink). 행 높이 28px, 값은 기준선 정렬.
 * 값에 편명·버전이 들어가면 mono span 이나 <VersionBadge> 를 넘긴다.
 */
export interface ConfirmFactsProps {
  items: ReadonlyArray<{ label: string; value: ReactNode }>
  className?: string
}

export function ConfirmFacts({ items, className }: ConfirmFactsProps) {
  return (
    <dl className={cn('grid grid-cols-[96px_minmax(0,1fr)] items-baseline gap-x-3 type-body-sm', className)}>
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="py-1 text-ink-subtle">{item.label}</dt>
          <dd className="py-1 text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  )
}
