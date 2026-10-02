import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

/**
 * 문서 전용 유틸(type-*, shadow-depth-3, num)을 tailwind-merge 에 알려 준다.
 * - type-body 뒤에 type-body-sm 을 주면 뒤의 것만 남는다.
 * - shadow-none 뒤에 shadow-depth-3 을 주면 뒤의 것만 남는다.
 */
const twMerge = extendTailwindMerge<'typography'>({
  extend: {
    theme: {
      shadow: ['depth-3'],
    },
    classGroups: {
      typography: [
        {
          type: [
            'hero-value',
            'page-title',
            'figure-value',
            'wordmark',
            'section-title',
            'body',
            'body-sm',
            'label',
            'caption',
            'button',
            'mono',
            'mono-sm',
          ],
        },
      ],
      'fvn-spacing': ['num'],
    },
  },
})

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
