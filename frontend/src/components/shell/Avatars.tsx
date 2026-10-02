import { cn } from '@/lib/cn'

/** 담당 관제사 (목업) — 이름 첫 글자 동그라미를 겹쳐 놓는다. Vercel 목록 끝의 작성자 아바타 자리 */
export function Avatars({ names, size = 20, className }: { names: string[]; size?: number; className?: string }) {
  if (names.length === 0) return null
  return (
    <span className={cn('flex shrink-0 items-center', className)} aria-label={`담당 ${names.join(', ')}`} title={`담당 ${names.join(', ')}`}>
      {names.map((n, i) => (
        <span
          key={n}
          aria-hidden
          className={cn(
            'flex items-center justify-center rounded-full bg-gray-200 font-medium text-gray-1000 ring-2 ring-background-200',
            i > 0 && '-ml-1.5',
          )}
          style={{ width: size, height: size, fontSize: Math.round(size * 0.5) }}
        >
          {n.slice(0, 1)}
        </span>
      ))}
    </span>
  )
}
