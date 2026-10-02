import { Toaster as Sonner } from 'sonner'

/**
 * 토스트 — DESIGN.md "토스트": 오른쪽 아래, 한 줄, 3초, 깊이 3단계.
 * App 루트에 한 번 붙어 있다. 쓰는 쪽은 `import { toast } from 'sonner'` 후 `toast('메시지')`.
 * 새 모델 배포만 primary 점을 붙인다:
 *   toast('v2 배포 · 운영 버전 v1 → v2', { icon: <span className="size-1.5 rounded-full bg-primary" /> })
 * 이동 애니메이션은 index.css 에서 끄고 투명도만 남겼다.
 */
function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={3000}
      gap={8}
      visibleToasts={3}
      expand
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex h-10 w-[356px] items-center gap-2 rounded-md border border-border bg-surface-1 px-3 type-body-sm text-ink shadow-depth-3',
          title: 'truncate',
          icon: 'flex size-4 shrink-0 items-center justify-center',
        },
      }}
    />
  )
}

export { Toaster }
