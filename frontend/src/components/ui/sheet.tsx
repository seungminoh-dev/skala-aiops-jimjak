import * as React from 'react'
import { Dialog as SheetPrimitive } from 'radix-ui'
import { XIcon } from '@phosphor-icons/react'

import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { cn } from '@/lib/cn'

/**
 * 서랍(라인 상세) — DESIGN.md "라인 상세 서랍" + 부록 A.
 * - 오른쪽에서 열린다. 폭 480px, 둥글기 lg(12px), 깊이 3단계 그림자.
 *   본문 흰 면과 같이 화면 가장자리에서 8px 띄운다.
 * - 열림·닫힘은 투명도만 150ms (밀려 들어오는 이동 없음).
 * - 덮개는 칠하지 않는다(투명). 바깥을 누르면 닫힌다.
 * - 닫기 X(아이콘 버튼 + 툴팁 "닫기")가 오른쪽 위에 있다. 열릴 때 포커스는 서랍 자체로 간다.
 * - 구성: SheetHeader(SheetTitle) → SheetBody(스크롤) → SheetFooter(선택).
 */
function Sheet({ ...props }: React.ComponentProps<typeof SheetPrimitive.Root>) {
  return <SheetPrimitive.Root data-slot="sheet" {...props} />
}

function SheetTrigger({ ...props }: React.ComponentProps<typeof SheetPrimitive.Trigger>) {
  return <SheetPrimitive.Trigger data-slot="sheet-trigger" {...props} />
}

function SheetClose({ ...props }: React.ComponentProps<typeof SheetPrimitive.Close>) {
  return <SheetPrimitive.Close data-slot="sheet-close" {...props} />
}

function SheetPortal({ ...props }: React.ComponentProps<typeof SheetPrimitive.Portal>) {
  return <SheetPrimitive.Portal data-slot="sheet-portal" {...props} />
}

function SheetOverlay({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Overlay>) {
  return (
    <SheetPrimitive.Overlay
      data-slot="sheet-overlay"
      className={cn(
        'fixed inset-0 z-50 bg-transparent',
        'data-[state=open]:animate-fade-in data-[state=closed]:animate-fade-out',
        className,
      )}
      {...props}
    />
  )
}

function SheetContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  ...props
}: React.ComponentProps<typeof SheetPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  const contentRef = React.useRef<HTMLDivElement>(null)

  return (
    <SheetPortal>
      <SheetOverlay />
      <SheetPrimitive.Content
        data-slot="sheet-content"
        aria-describedby={undefined}
        ref={contentRef}
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented) return
          // 닫기 버튼에 포커스가 가면 툴팁이 바로 뜬다 — 서랍 자체에 포커스를 둔다.
          event.preventDefault()
          contentRef.current?.focus()
        }}
        className={cn(
          'fixed top-2 right-2 bottom-2 z-50 flex w-[480px] max-w-[calc(100%-16px)] flex-col',
          'rounded-lg bg-surface-1 type-body text-ink shadow-depth-3 outline-none',
          'data-[state=open]:animate-drawer-in data-[state=closed]:animate-drawer-out',
          className,
        )}
        {...props}
      >
        {children}
        {showCloseButton && (
          <Tooltip>
            <TooltipTrigger asChild>
              <SheetPrimitive.Close data-slot="sheet-close" asChild>
                <Button variant="ghost" size="icon" className="absolute top-3 right-3" aria-label="닫기">
                  <XIcon />
                </Button>
              </SheetPrimitive.Close>
            </TooltipTrigger>
            <TooltipContent>닫기</TooltipContent>
          </Tooltip>
        )}
      </SheetPrimitive.Content>
    </SheetPortal>
  )
}

function SheetHeader({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-header"
      className={cn('flex min-h-[56px] flex-col justify-center gap-1 border-b border-hairline py-3 pr-14 pl-5', className)}
      {...props}
    />
  )
}

function SheetBody({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="sheet-body" className={cn('min-h-0 flex-1 overflow-y-auto p-5', className)} {...props} />
}

function SheetFooter({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="sheet-footer"
      className={cn('flex items-center justify-end gap-2 border-t border-hairline px-5 py-3', className)}
      {...props}
    />
  )
}

function SheetTitle({ className, ...props }: React.ComponentProps<typeof SheetPrimitive.Title>) {
  return (
    <SheetPrimitive.Title data-slot="sheet-title" className={cn('type-section-title text-ink', className)} {...props} />
  )
}

export { Sheet, SheetTrigger, SheetClose, SheetContent, SheetHeader, SheetBody, SheetFooter, SheetTitle }
