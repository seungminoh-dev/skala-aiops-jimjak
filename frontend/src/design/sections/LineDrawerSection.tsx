import { useMemo, useState } from 'react'

import { NextPrediction, SameLine, WhatIfSimulator } from '@/components/ops/LineDetail'
import { LineDrawer, LineDrawerPanel, type LineDrawerTarget } from '@/components/ops/LineDrawer'
import { buildDrawerDetail } from '@/components/ops/lineDetailData'
import { Button } from '@/components/ui/button'
import { lineDetail } from '@/design/mock'
import { Specimen } from '@/design/SheetSection'

/**
 * 라인 상세 서랍 — 판단 → 조치(조치 필요 편만) → 같은 수취대 상황 → 근거(접기, 기본 닫힘).
 * 위: 서랍 두 장을 펼친 상태로.
 *   - T2-08 다음 편 KE082 (57분, 조치 필요) — 실제 서랍처럼 근거는 닫힌 채.
 *   - T1-03 다음 편 UA892 (41분) — 근거를 펼쳐 모델 입력 20편과 가정 시뮬레이터(77W 를 고른 상태)를 보인다.
 * 아래: 같은 부품의 다른 상태 — 예측 발행 전, 처리 시간 겹침, 가정 결과 50분 초과, 가정 계산 전 — 와 실제 서랍 열기.
 */
export function LineDrawerSection() {
  const pending = useMemo(() => buildDrawerDetail('T2-12'), [])
  const overlap = useMemo(() => buildDrawerDetail('T1-19'), [])
  const nearThreshold = useMemo(() => buildDrawerDetail('T1-07'), [])

  const [open, setOpen] = useState(false)
  const [target, setTarget] = useState<LineDrawerTarget | null>(null)
  const openDrawer = () => {
    setTarget({ lineId: 'T2-08' })
    setOpen(true)
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-x-16 gap-y-10">
        <Specimen name="서랍 · 조치 필요 편 (T2-08 KE082) · 근거 닫힘">
          <LineDrawerPanel lineId="T2-08" />
        </Specimen>
        <Specimen name={`서랍 · 근거 펼침 (${lineDetail.lineId} ${lineDetail.next.flightId} · 가정 77W)`}>
          <LineDrawerPanel lineId={lineDetail.lineId} initialAircraft="77W" evidenceOpen />
        </Specimen>
      </div>

      {/* 서랍 안쪽 폭(440px)에 맞춘 부품들 */}
      <div className="grid grid-cols-[repeat(auto-fill,440px)] items-start gap-x-16 gap-y-10">
        <Specimen name="다음 편 예측 · 예측 발행 전 (T2-12)">
          <NextPrediction focus={pending.focus} isNext={pending.isNext} />
        </Specimen>

        <Specimen name={`같은 수취대 상황 · 처리 시간 겹침 (T1-19 ${overlap.focus?.id ?? ''})`}>
          <SameLine detail={overlap} />
        </Specimen>

        <Specimen name={`가정 시뮬레이터 · 50분 초과 (T1-07 ${nearThreshold.focus?.id ?? ''} → 77W)`}>
          <WhatIfSimulator focus={nearThreshold.focus} whatIf={nearThreshold.whatIf} initialAircraft="77W" />
        </Specimen>

        <Specimen name="가정 시뮬레이터 · 예측 발행 전">
          <WhatIfSimulator focus={pending.focus} whatIf={pending.whatIf} />
        </Specimen>

        <Specimen name="서랍 열기">
          <div>
            <Button variant="outline" data-line-trigger="" aria-haspopup="dialog" onClick={openDrawer}>
              <span className="font-mono">T2-08</span>
              <span>라인 상세 열기</span>
            </Button>
          </div>
        </Specimen>
      </div>

      <LineDrawer open={open} target={target} onOpenChange={setOpen} />
    </>
  )
}
