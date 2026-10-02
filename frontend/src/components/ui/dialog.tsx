import * as React from 'react'
import { Dialog as DialogPrimitive } from 'radix-ui'
import { XIcon } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

/**
 * 대화상자 — DESIGN.md "대화상자" + 부록 A.
 * - 폭 440px, 안쪽 여백 20px, 둥글기 lg(12px), 깊이 3단계 그림자, 덮개 overlay 40%.
 * - 열림·닫힘은 투명도만 150ms. 확대·이동 없음.
 * - 제목은 section-title, 설명 문장 없이 내용만 (DialogDescription 은 두지 않는다).
 * - 버튼은 오른쪽 아래 DialogFooter 에 보조(outline) → 주요(default)/위험(destructive) 순서.
 * - 닫기 X 는 기본으로 숨긴다 (showCloseButton 으로 켤 수 있다, 툴팁 "닫기" 포함).
 */
function Dialog({ ...props }: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({ ...props }: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({ ...props }: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({ ...props }: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-overlay/40',
        'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        className,
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = false,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        aria-describedby={undefined}
        className={cn(
          'fixed top-1/2 left-1/2 z-50 grid w-[440px] max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4',
          'rounded-lg bg-surface-1 p-5 type-body text-ink shadow-depth-3 outline-none',
          'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <DialogPrimitive.Close data-slot="dialog-close" asChild>
                <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="닫기">
                  <XIcon />
                </Button>
              </DialogPrimitive.Close>
            </TooltipTrigger>
            <TooltipContent>닫기</TooltipContent>
          </Tooltip>
        )}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="dialog-header" className={cn('flex flex-col gap-1', className)} {...props} />
}

function DialogFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn('flex items-center justify-end gap-2', className)}
      {...props}
    />
  )
}

function DialogTitle({ className, ...props }: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn('type-section-title text-ink', className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
