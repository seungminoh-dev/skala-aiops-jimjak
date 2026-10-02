import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'

import { cn } from '@/lib/cn'

/**
 * 버튼 — Geist (DESIGN.md "면과 그림자").
 * - 높이: sm 32 · default 36 · lg 40. 둥글기 6px. 글자 type-button-14.
 * - variant: default = 검은 기본 버튼 · outline = 흰 보조 버튼(테두리 그림자) · ghost = 바탕 없는 버튼
 *            destructive = 위험(확인 대화상자 안에서만) · link = 링크 글자(blue)
 * - 아이콘만 있는 버튼은 size="icon" + aria-label.
 */
const buttonVariants = cva(
  [
    'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap select-none',
    'rounded-md type-button-14 transition-colors',
    'disabled:pointer-events-none disabled:bg-gray-100 disabled:text-gray-700 disabled:shadow-border',
    "[&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  ],
  {
    variants: {
      variant: {
        default: 'bg-gray-1000 text-white hover:bg-[#383838]',
        outline: 'bg-background-100 text-gray-1000 shadow-border hover:bg-gray-100 data-[state=open]:bg-gray-100',
        ghost: 'text-gray-900 hover:bg-gray-alpha-100 hover:text-gray-1000 data-[state=open]:bg-gray-alpha-100',
        destructive: 'bg-red-700 text-white hover:bg-red-900',
        link: 'h-auto px-0 text-blue-900 underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-3',
        sm: 'h-8 px-2.5',
        lg: 'h-10 px-4',
        icon: 'size-8 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

function Button({
  className,
  variant = 'default',
  size = 'default',
  asChild = false,
  type,
  ...props
}: React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : 'button'

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      type={asChild ? type : (type ?? 'button')}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
