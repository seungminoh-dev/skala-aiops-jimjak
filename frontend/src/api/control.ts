/**
 * 관제 화면(터미널 Overview) 데이터 — DESIGN.md "5. 화면 > Overview".
 * "AI가 혼자 처리한 것"과 "사람이 개입할 것"을 나눈다. 대상은 실제로 모델이 도는 T1-03 수취대 하나뿐이다.
 * 쉬운 말만 쓴다(드리프트 → 예측 어긋남, 게이트 → 성능 검사, 승격 → 새 모델 적용).
 */
import { useMemo } from 'react'

import { useCarousel } from '@/api/carousel'
import { useModels, useMonitoring } from '@/api/hooks'
import type { Ymdhm } from '@/api/types'
import type { PageKey } from '@/app/routes'
import { fmtClock } from '@/lib/format'

export interface Intervention {
  id: string
  kind: 'action' | 'gate' | 'event'
  title: string
  detail: string
  /** 알림 머리의 짧은 표시 (예: "기준 +7분"). 없으면 "확인 필요" */
  badge?: string
  /** 지도 말풍선 · 배너용 아주 짧은 표시 (예: "7C1108 +7분") */
  short: string
  at: Ymdhm
  /** 자세히 볼 화면 */
  to: PageKey
}

export interface AutoAction {
  id: string
  at: Ymdhm
  /** 흐름 (예: 예측 어긋남 감지 → 모델 다시 학습 → 성능 검사 통과 → v2 적용) */
  steps: string[]
  /** 끝이 사람에게 넘어갔나 (사건 경고·검사 탈락) */
  handedOver: boolean
}

export interface NextFlight {
  id: string
  eta: Ymdhm
  /** 예측 (발행 전이면 null) */
  minutes: number | null
  lastBag: Ymdhm | null
  issueAt: Ymdhm
  over: boolean
}

export interface ControlRoomView {
  interventions: Intervention[]
  /** 최근 것 먼저 */
  autoActions: AutoAction[]
  /** 오늘 자동 점검 횟수 */
  autoChecks: number
  nextFlight: NextFlight | null
  carousel: { processing: boolean; alert: boolean }
}

/** 받침이 있으면(ㄹ 제외) "으로", 없으면 "로" */
function ro(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  if (code < 0 || code > 11171) return `${word}(으)로`
  const final = code % 28
  return `${word}${final === 0 || final === 8 ? '로' : '으로'}`
}

export function useControlRoom(): ControlRoomView {
  const carousel = useCarousel()
  const monitoring = useMonitoring()
  const models = useModels()

  return useMemo(() => {
    const interventions: Intervention[] = []

    // 1. 조치 필요 편 (예측 50분 초과)
    for (const a of carousel.actions) {
      interventions.push({
        id: `action-${a.flight.id}`,
        kind: 'action',
        title: `${a.flight.id} 짐이 ${a.predictedMin}분 걸릴 것 같아요`,
        detail: `${fmtClock(a.deadline)}까지 ${a.guide}`,
        badge: `기준 +${a.overMin}분`,
        short: `${a.flight.id} +${a.overMin}분`,
        at: a.flight.eta,
        to: 'overview',
      })
    }

    // 2. 오늘 성능 검사에 떨어져 보류된 새 모델 (그 뒤로 운영 모델이 바뀌지 않았으면)
    const lastGate = models.gates.at(-1)
    const prod = models.versions.find((v) => v.version === models.production)
    const today = carousel.now.slice(0, 8)
    if (lastGate && !lastGate.passed && lastGate.at.slice(0, 8) === today && (!prod || prod.deployedAt < lastGate.at)) {
      interventions.push({
        id: `gate-${lastGate.id}`,
        kind: 'gate',
        title: `새 모델 ${lastGate.candidate} 적용이 보류됐어요`,
        short: '새 모델 보류',
        detail: `성능 검사를 통과하지 못해 기존 모델(${models.production})을 그대로 쓰고 있어요. 적용할지 판단이 필요해요`,
        at: lastGate.at,
        to: 'models',
      })
    }

    // 3. 공항 사건으로 경고만 낸 경우 (가장 최근 점검일 때만)
    const last = monitoring.lastBatch
    if (last && last.verdict === 'alert_only') {
      interventions.push({
        id: `event-${last.no}`,
        kind: 'event',
        title: `${ro(last.eventName ?? '공항 사건')} 예측이 어긋났어요`,
        short: last.eventName ?? '공항 사건',
        detail: '일시적인 사건이라 모델은 다시 학습하지 않았어요. 현장 상황을 확인해 주세요',
        at: last.at,
        to: 'monitoring',
      })
    }

    // AI 가 혼자 처리한 일
    const autoActions: AutoAction[] = monitoring.batches
      .flatMap((b): AutoAction[] => {
        switch (b.verdict) {
          case 'retrain_promoted':
            return [
              {
                id: `auto-${b.no}`,
                at: b.at,
                steps: ['예측 어긋남 감지', '모델 다시 학습', '성능 검사 통과', `새 모델 ${b.deployedVersion ?? ''} 적용`],
                handedOver: false,
              },
            ]
          case 'retrain_rejected':
            return [
              {
                id: `auto-${b.no}`,
                at: b.at,
                steps: ['예측 어긋남 감지', '모델 다시 학습', '성능 검사 탈락', '기존 모델 유지, 담당자에게 알림'],
                handedOver: true,
              },
            ]
          case 'alert_only':
            return [
              {
                id: `auto-${b.no}`,
                at: b.at,
                steps: [`${b.eventName ?? '공항 사건'} 감지`, '학습 보류', '담당자에게 알림'],
                handedOver: true,
              },
            ]
          default:
            return []
        }
      })
      .reverse()

    // 다음 편 (아직 짐이 안 나온 편 중 가장 먼저 도착하는 편)
    const next = carousel.next
    const nextFlight: NextFlight | null = next
      ? {
          id: next.id,
          eta: next.eta,
          minutes: next.prediction?.minutes ?? null,
          lastBag: next.prediction?.lastBag ?? null,
          issueAt: next.issueAt,
          over: next.prediction?.over ?? false,
        }
      : null

    return {
      interventions,
      autoActions,
      autoChecks: monitoring.batches.length,
      nextFlight,
      carousel: { processing: carousel.processing !== null, alert: interventions.length > 0 },
    }
  }, [carousel, monitoring, models])
}
