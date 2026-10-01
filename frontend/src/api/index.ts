/**
 * 데이터 층 입구 — 화면은 여기서만 가져온다: import { useOps, actions, type Flight } from '@/api'
 * design/mock 을 화면에서 직접 import 하지 않는다.
 */
export * from '@/api/types'
export {
  actions,
  useDataset,
  useDemoClock,
  useHealth,
  useLine,
  useLogs,
  useModels,
  useMonitoring,
  useOps,
  useScenarios,
} from '@/api/hooks'
export { batchVerdictInput } from '@/api/views'
export { useControlRoom, type AutoAction, type ControlRoomView, type Intervention, type NextFlight } from '@/api/control'
export {
  closeAlert,
  FAVORITES,
  reopenAllAlerts,
  TIER_LABEL,
  useTerminal,
  type CarouselTier,
  type TerminalAlert,
  type TerminalCarousel,
  type TerminalView,
} from '@/api/terminal'
export {
  AIRCRAFT_NAME,
  useCarousel,
  type CarouselAction,
  type CarouselFlight,
  type CarouselFlightStatus,
  type CarouselView,
} from '@/api/carousel'
