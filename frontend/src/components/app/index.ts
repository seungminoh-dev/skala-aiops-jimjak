/**
 * 앱 공용 부품 — 운영 현황·모델 모니터링·시나리오 랩이 같이 쓴다.
 * 상태 글자는 lib/format 의 헬퍼(verdictStatus, flightStatus, lineStatus, serverStatus …)로 만든 값을 넘긴다.
 */
export { AppHeader, type AppHeaderProps } from '@/components/app/AppHeader'
export {
  ChartLegend,
  LegendDot,
  LegendHollowSubtle,
  LegendLine,
  type ChartLegendProps,
  type LegendItem,
} from '@/components/app/ChartLegend'
export {
  ChartTooltipBox,
  TooltipValue,
  type ChartTooltipBoxProps,
  type TooltipRow,
} from '@/components/app/ChartTooltipBox'
export { ConfirmDialog, ConfirmFacts, type ConfirmDialogProps, type ConfirmFactsProps } from '@/components/app/ConfirmDialog'
export { EmptyState, type EmptyStateProps } from '@/components/app/EmptyState'
export { ErrorState, type ErrorStateProps } from '@/components/app/ErrorState'
export { Figure, FigureRow, type FigureProps, type FigureRowItem, type FigureRowProps } from '@/components/app/FigureRow'
export { LoadingRows, type LoadingRowsProps } from '@/components/app/LoadingRows'
export { NavTab, NavTabs, type NavTabProps, type NavTabsProps } from '@/components/app/NavTabs'
export { notify, notifyDeploy } from '@/components/app/notify'
export { Num, type NumProps } from '@/components/app/Num'
export { ScreenTitleRow, type ScreenTitleRowProps } from '@/components/app/ScreenTitleRow'
export { SignalCell, type SignalCellProps } from '@/components/app/SignalCell'
export { SignalLabel, type SignalLabelProps } from '@/components/app/SignalLabel'
export { StatusDot, type StatusDotProps } from '@/components/app/StatusDot'
export { StatusText, type StatusTextProps } from '@/components/app/StatusText'
export { APP_TABS, type AppTab, type AppTabItem } from '@/components/app/tabs'
export { TimeControl, type TimeControlProps } from '@/components/app/TimeControl'
export { VersionBadge, type VersionBadgeProps } from '@/components/app/VersionBadge'
