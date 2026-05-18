import type { PitchType } from '../../domain/models/pitch'
import type { ZoneId, ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'
import { useMemo, useState } from 'react'
import { createPortal } from 'react-dom'

export type PitchFilter = PitchType | 'ALL'
export type PitchMapMode = 'pitchType' | 'pitchResult' | 'countResult' | 'pressure' | 'risk'
export type PitchMapSampleCount = 10 | 100 | 1000
type HeatmapMetric = 'none' | 'whiffProbability' | 'hitProbability' | 'contactProbability' | 'battingAverage'

interface PitchBreakdownChartProps {
  zones: ZoneProbability[]
  pitchTypes: PitchType[]
  selectedPitchType: PitchFilter
  pitchMapMode: PitchMapMode
  pitchMapSampleCount: PitchMapSampleCount
  pitchClusterRadius: number
  simulationVersion: number
  pitcherCommand: number
  onSelectPitchType: (pitchType: PitchFilter) => void
  onSelectZone: (zoneId: ZoneId, pitchType: PitchType) => void
  onSelectPitchMapMode: (mode: PitchMapMode) => void
  onSelectPitchMapSampleCount: (count: PitchMapSampleCount) => void
  onChangePitchClusterRadius: (radius: number) => void
}

interface PlotPoint {
  key: string
  x: number
  y: number
  zoneId: ZoneId
  pitchType: PitchType
  countState: ZoneProbability['count']
  categoryKey: string
  label: string
  color: string
  title: string
  count: number
  onBaseProbability: number
  outProbability: number
  battingAverage: number
  hitProbability: number
  whiffProbability: number
  contactProbability: number
  swingProbability: number
  metricValue?: number
  isStrike: boolean
  sourceLabel: string
  mixLabel?: string
  dataQuality?: ZoneProbability['dataQuality']
}

interface PitchMapSummary {
  advantage: string
  strikeProbability: number
  ballProbability: number
  onBaseProbability: number
  outProbability: number
}

interface PlotCategory {
  key: string
  label: string
  color: string
}

interface MetricProfile {
  veryHigh: number
  high: number
  low: number
  veryLow: number
}

interface HeatmapCell {
  key: string
  x: number
  y: number
  intensity: number
  value: number
}

interface RgbColor {
  red: number
  green: number
  blue: number
}

interface PitchDotTooltipState {
  point: PlotPoint
  x: number
  y: number
}

const pitchTypeLabels: Record<PitchType, string> = {
  FF: '포심 패스트볼',
  SL: '슬라이더',
  CH: '체인지업',
  CU: '커브',
  SI: '싱커',
  FS: '스플리터',
  FC: '커터',
  ST: '스위퍼',
  SV: '슬러브',
  KC: '너클 커브',
  KN: '너클볼',
  EP: '이퍼스',
  FO: '포크볼',
  SC: '스크루볼'
}

const pitchTypeColors: Record<PitchType, string> = {
  FF: '#df3152',
  SL: '#f4e300',
  CH: '#2fc65a',
  CU: '#26c6da',
  SI: '#ff9f1c',
  FS: '#d9a72f',
  FC: '#a85532',
  ST: '#b9e600',
  SV: '#8b5cf6',
  KC: '#06b6d4',
  KN: '#94a3b8',
  EP: '#f472b6',
  FO: '#c084fc',
  SC: '#14b8a6'
}

const pitchMapModes: Array<{ key: PitchMapMode; label: string }> = [
  { key: 'pitchType', label: '구종' },
  { key: 'pitchResult', label: '결과' },
  { key: 'countResult', label: 'S/B' },
  { key: 'pressure', label: '압박' },
  { key: 'risk', label: '위험' }
]

const pitchMapModeDescriptions: Record<PitchMapMode, string> = {
  pitchType: '구종 모드는 패스트볼, 슬라이더, 체인지업처럼 실제 구종별 사용 위치와 밀집도를 색으로 구분합니다.',
  pitchResult: '결과 모드는 헛스윙, 루킹, 타격 가능성이 높은 공을 나눠 타석 결과 흐름을 보여줍니다.',
  countResult: 'S/B 모드는 스트라이크존 안팎의 분포를 기준으로 스트라이크와 볼 성향을 분리합니다.',
  pressure: '압박 모드는 헛스윙 가능성, 존 공략, 카운트 우위, 피안타 억제력을 합쳐 현재 분포 안에서 압박 강도를 세분화합니다.',
  risk: '위험 모드는 피안타, 장타, 볼넷성 이탈, 컨택 허용 가능성을 합산해 현재 분포 안에서 실점 위험을 세분화합니다.'
}

const pitchMapSampleCounts: PitchMapSampleCount[] = [10, 100, 1000]

const heatmapMetrics: Array<{ key: HeatmapMetric; label: string }> = [
  { key: 'none', label: '점만' },
  { key: 'whiffProbability', label: '헛스윙' },
  { key: 'hitProbability', label: '피안타' },
  { key: 'contactProbability', label: '컨택' },
  { key: 'battingAverage', label: '타율' }
]

const resultCategories: Record<string, PlotCategory> = {
  whiff: { key: 'whiff', label: '헛스윙', color: '#e11d48' },
  looking: { key: 'looking', label: '루킹', color: '#2563eb' },
  contact: { key: 'contact', label: '타격', color: '#f59e0b' }
}

const countCategories: Record<string, PlotCategory> = {
  strike: { key: 'strike', label: '스트라이크', color: '#0ea5e9' },
  ball: { key: 'ball', label: '볼', color: '#f97316' }
}

const pressureCategories: Record<string, PlotCategory> = {
  veryHigh: { key: 'veryHigh', label: '압박 최상', color: '#22c55e' },
  high: { key: 'high', label: '높은 압박', color: '#84cc16' },
  medium: { key: 'medium', label: '중간 압박', color: '#f59e0b' },
  low: { key: 'low', label: '낮은 압박', color: '#38bdf8' },
  veryLow: { key: 'veryLow', label: '압박 약함', color: '#64748b' }
}

const riskCategories: Record<string, PlotCategory> = {
  veryHigh: { key: 'veryHigh', label: '치명 위험', color: '#ef4444' },
  high: { key: 'high', label: '높은 위험', color: '#f97316' },
  medium: { key: 'medium', label: '주의', color: '#f59e0b' },
  low: { key: 'low', label: '관리 가능', color: '#14b8a6' },
  veryLow: { key: 'veryLow', label: '안전', color: '#22c55e' }
}

const zoneCenters: Record<ZoneId, { x: number; y: number }> = {
  'high-in': { x: 36, y: 35 },
  'high-middle': { x: 50, y: 35 },
  'high-away': { x: 64, y: 35 },
  'middle-in': { x: 36, y: 52 },
  'middle-middle': { x: 50, y: 50 },
  'middle-away': { x: 64, y: 52 },
  'low-in': { x: 36, y: 69 },
  'low-middle': { x: 50, y: 69 },
  'low-away': { x: 64, y: 69 }
}

const strikeZoneBounds = {
  left: 30,
  right: 70,
  top: 28,
  bottom: 78
}

const plotBounds = {
  left: 22,
  right: 78,
  top: 18,
  bottom: 88
}

const hashToUnit = (value: string): number => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

const hashToCenteredUnit = (value: string): number => hashToUnit(`${value}-a`) + hashToUnit(`${value}-b`) - 1

const isInsideStrikeZone = (point: { x: number; y: number }): boolean => {
  return (
    point.x >= strikeZoneBounds.left &&
    point.x <= strikeZoneBounds.right &&
    point.y >= strikeZoneBounds.top &&
    point.y <= strikeZoneBounds.bottom
  )
}

const pickWeightedZone = (zones: ZoneProbability[], seed: string): ZoneProbability => {
  const totalWeight = zones.reduce((sum, zone) => sum + Math.max(zone.pitchProbability, 0), 0)

  if (totalWeight <= 0) {
    return zones[Math.floor(hashToUnit(seed) * zones.length)] ?? zones[0]
  }

  let cursor = hashToUnit(seed) * totalWeight

  for (const zone of zones) {
    cursor -= Math.max(zone.pitchProbability, 0)

    if (cursor <= 0) {
      return zone
    }
  }

  return zones[zones.length - 1]
}

const plateLocationToPlotPoint = (location: { x: number; y: number }): { x: number; y: number } => {
  return {
    x: Math.min(Math.max(50 + location.x * 18, 7), 93),
    y: Math.min(Math.max(91 - location.y * 19, 8), 94)
  }
}

const getZoneBounds = (zoneId: ZoneId): { left: number; right: number; top: number; bottom: number } => {
  const [vertical, horizontal] = zoneId.split('-') as ['high' | 'middle' | 'low', 'in' | 'middle' | 'away']
  const zoneWidth = (strikeZoneBounds.right - strikeZoneBounds.left) / 3
  const zoneHeight = (strikeZoneBounds.bottom - strikeZoneBounds.top) / 3
  const horizontalIndex = horizontal === 'in' ? 0 : horizontal === 'middle' ? 1 : 2
  const verticalIndex = vertical === 'high' ? 0 : vertical === 'middle' ? 1 : 2

  return {
    left: strikeZoneBounds.left + zoneWidth * horizontalIndex,
    right: strikeZoneBounds.left + zoneWidth * (horizontalIndex + 1),
    top: strikeZoneBounds.top + zoneHeight * verticalIndex,
    bottom: strikeZoneBounds.top + zoneHeight * (verticalIndex + 1)
  }
}

const getObservedBallRate = (zone: ZoneProbability): number | null => {
  if (!zone.sampleLocations || zone.sampleLocations.length === 0) {
    return null
  }

  const ballCount = zone.sampleLocations.filter((location) => !isInsideStrikeZone(plateLocationToPlotPoint(location))).length

  return ballCount / zone.sampleLocations.length
}

const getMissProbability = (zone: ZoneProbability, pitcherCommand: number): number => {
  const observedBallRate = getObservedBallRate(zone)
  const commandPenalty = (0.55 - pitcherCommand) * 0.2

  if (observedBallRate !== null) {
    return Math.min(Math.max(observedBallRate + commandPenalty, 0.12), 0.5)
  }

  const [, strikes] = zone.count.split('-').map(Number)
  const [balls] = zone.count.split('-').map(Number)
  const breakingPenalty = ['SL', 'CH', 'CU', 'FS', 'ST', 'SV', 'KC'].includes(zone.pitchType) ? 0.05 : 0
  const countAdjustment = balls >= 3 ? -0.18 : balls > strikes ? -0.08 : strikes >= 2 ? 0.13 : balls === 0 && strikes === 0 ? -0.02 : 0
  const commandSignal = (zone.riskValue - zone.pressureValue) / 520

  return Math.min(Math.max(0.36 + commandSignal + countAdjustment + breakingPenalty + commandPenalty, 0.12), 0.56)
}

const getStrikePoint = (zone: ZoneProbability, seed: string, pitcherCommand: number): { x: number; y: number } => {
  const bounds = getZoneBounds(zone.zoneId)
  const center = zoneCenters[zone.zoneId]
  const width = bounds.right - bounds.left
  const height = bounds.bottom - bounds.top
  const spread = 0.34 + (1 - pitcherCommand) * 0.38

  return {
    x: Math.min(Math.max(center.x + hashToCenteredUnit(`${seed}-sx`) * width * spread, bounds.left + 0.8), bounds.right - 0.8),
    y: Math.min(Math.max(center.y + hashToCenteredUnit(`${seed}-sy`) * height * spread, bounds.top + 0.8), bounds.bottom - 0.8)
  }
}

const getBallPoint = (zone: ZoneProbability, seed: string, pitcherCommand: number): { x: number; y: number } => {
  const strikePoint = getStrikePoint(zone, seed, pitcherCommand)
  const [vertical, horizontal] = zone.zoneId.split('-') as ['high' | 'middle' | 'low', 'in' | 'middle' | 'away']
  const sideSeed = hashToUnit(`${seed}-side`)
  const missDistance = 2.6 + hashToUnit(`${seed}-miss`) * (8.6 + (1 - pitcherCommand) * 7.5)
  let x = strikePoint.x
  let y = strikePoint.y

  if (horizontal === 'in' || (horizontal === 'middle' && sideSeed < 0.2)) {
    x = strikeZoneBounds.left - missDistance
  } else if (horizontal === 'away' || (horizontal === 'middle' && sideSeed > 0.8)) {
    x = strikeZoneBounds.right + missDistance
  }

  if (vertical === 'high' || (vertical === 'middle' && sideSeed >= 0.2 && sideSeed < 0.5)) {
    y = strikeZoneBounds.top - missDistance * 0.86
  } else if (vertical === 'low' || (vertical === 'middle' && sideSeed >= 0.5 && sideSeed <= 0.8)) {
    y = strikeZoneBounds.bottom + missDistance * 0.86
  }

  return {
    x: Math.min(Math.max(x + hashToCenteredUnit(`${seed}-bx`) * 3.2, plotBounds.left), plotBounds.right),
    y: Math.min(Math.max(y + hashToCenteredUnit(`${seed}-by`) * 3.2, plotBounds.top), plotBounds.bottom)
  }
}

const getLocationForZone = (zone: ZoneProbability, seed: string, pitcherCommand: number): { x: number; y: number } => {
  if (zone.sampleLocations && zone.sampleLocations.length > 0) {
    const locationIndex = Math.floor(hashToUnit(`${seed}-observed-location`) * zone.sampleLocations.length)
    const observedLocation = zone.sampleLocations[locationIndex]

    if (observedLocation) {
      return plateLocationToPlotPoint(observedLocation)
    }
  }

  return hashToUnit(`${seed}-ball`) < getMissProbability(zone, pitcherCommand)
    ? getBallPoint(zone, seed, pitcherCommand)
    : getStrikePoint(zone, seed, pitcherCommand)
}

const getPitchResultCategory = (zone: ZoneProbability, seed: string): PlotCategory => {
  const whiff = Math.max(zone.whiffProbability * zone.swingProbability, 0.03)
  const looking = Math.max((1 - zone.swingProbability) * (0.45 + (zone.pressureValue - zone.riskValue) / 180), 0.03)
  const contact = Math.max(zone.hitProbability + zone.homeRunProbability + zone.swingProbability * (1 - zone.whiffProbability), 0.03)
  const total = whiff + looking + contact
  const cursor = hashToUnit(`${seed}-result`) * total

  if (cursor < whiff) {
    return resultCategories.whiff
  }

  if (cursor < whiff + looking) {
    return resultCategories.looking
  }

  return resultCategories.contact
}

const getQuantile = (values: number[], percentile: number): number => {
  if (values.length === 0) {
    return 0
  }

  const sortedValues = [...values].sort((first, second) => first - second)
  const index = (sortedValues.length - 1) * percentile
  const lowerIndex = Math.floor(index)
  const upperIndex = Math.ceil(index)
  const weight = index - lowerIndex

  return sortedValues[lowerIndex] * (1 - weight) + sortedValues[upperIndex] * weight
}

const getMetricProfile = (values: number[]): MetricProfile => {
  if (values.length === 0) {
    return {
      veryHigh: 80,
      high: 65,
      low: 40,
      veryLow: 25
    }
  }

  const min = Math.min(...values)
  const max = Math.max(...values)

  if (max - min < 4) {
    const center = (min + max) / 2

    return {
      veryHigh: center + 1.5,
      high: center + 0.5,
      low: center - 0.5,
      veryLow: center - 1.5
    }
  }

  return {
    veryHigh: getQuantile(values, 0.82),
    high: getQuantile(values, 0.62),
    low: getQuantile(values, 0.38),
    veryLow: getQuantile(values, 0.18)
  }
}

const getPointMetricValue = (zone: ZoneProbability, mode: PitchMapMode, location: { x: number; y: number }): number => {
  const isStrike = isInsideStrikeZone(location)

  if (mode === 'pressure') {
    const countLeverage = zone.count.endsWith('-2') ? 7 : zone.count.startsWith('3-') ? -8 : zone.count.startsWith('0-') ? 2 : 0

    return (
      zone.pressureValue +
      zone.whiffProbability * 22 +
      zone.pitchProbability * 16 -
      zone.hitProbability * 16 +
      (isStrike ? 5 : -7) +
      countLeverage
    )
  }

  const chasePenalty = isStrike ? -3 : 8

  return (
    zone.riskValue +
    zone.hitProbability * 36 +
    zone.homeRunProbability * 160 +
    (1 - zone.whiffProbability) * 10 +
    (zone.swingProbability > 0.58 ? 5 : 0) +
    chasePenalty
  )
}

const getMetricCategory = (value: number, categories: Record<string, PlotCategory>, profile: MetricProfile): PlotCategory => {
  if (value >= profile.veryHigh) {
    return categories.veryHigh
  }

  if (value >= profile.high) {
    return categories.high
  }

  if (value <= profile.veryLow) {
    return categories.veryLow
  }

  if (value <= profile.low) {
    return categories.low
  }

  return categories.medium
}

const getPointCategory = (
  zone: ZoneProbability,
  mode: PitchMapMode,
  seed: string,
  location: { x: number; y: number },
  metricProfiles: Partial<Record<'pressure' | 'risk', MetricProfile>>
): PlotCategory => {
  if (mode === 'pitchType') {
    return {
      key: zone.pitchType,
      label: pitchTypeLabels[zone.pitchType],
      color: pitchTypeColors[zone.pitchType]
    }
  }

  if (mode === 'pitchResult') {
    return getPitchResultCategory(zone, seed)
  }

  if (mode === 'countResult') {
    return isInsideStrikeZone(location) ? countCategories.strike : countCategories.ball
  }

  if (mode === 'pressure') {
    return getMetricCategory(getPointMetricValue(zone, mode, location), pressureCategories, metricProfiles.pressure ?? getMetricProfile([]))
  }

  return getMetricCategory(getPointMetricValue(zone, mode, location), riskCategories, metricProfiles.risk ?? getMetricProfile([]))
}

const getLegendCategories = (pitchTypes: PitchType[], mode: PitchMapMode): PlotCategory[] => {
  if (mode === 'pitchType') {
    return pitchTypes.map((pitchType) => ({
      key: pitchType,
      label: pitchTypeLabels[pitchType],
      color: pitchTypeColors[pitchType]
    }))
  }

  if (mode === 'pitchResult') {
    return [resultCategories.whiff, resultCategories.looking, resultCategories.contact]
  }

  if (mode === 'countResult') {
    return [countCategories.strike, countCategories.ball]
  }

  if (mode === 'pressure') {
    return [
      pressureCategories.veryHigh,
      pressureCategories.high,
      pressureCategories.medium,
      pressureCategories.low,
      pressureCategories.veryLow
    ]
  }

  return [riskCategories.veryHigh, riskCategories.high, riskCategories.medium, riskCategories.low, riskCategories.veryLow]
}

const clusterPlotPoints = (points: PlotPoint[], radius: number): PlotPoint[] => {
  if (radius <= 0 || points.length <= 1) {
    return points
  }

  const visited = new Set<number>()
  const clusters: PlotPoint[] = []

  points.forEach((point, index) => {
    if (visited.has(index)) {
      return
    }

    const group: PlotPoint[] = [point]
    visited.add(index)

    points.forEach((candidate, candidateIndex) => {
      if (visited.has(candidateIndex) || candidate.categoryKey !== point.categoryKey) {
        return
      }

      const distance = Math.hypot(candidate.x - point.x, candidate.y - point.y)

      if (distance <= radius) {
        group.push(candidate)
        visited.add(candidateIndex)
      }
    })

    const count = group.reduce((sum, item) => sum + item.count, 0)
    const x = group.reduce((sum, item) => sum + item.x * item.count, 0) / count
    const y = group.reduce((sum, item) => sum + item.y * item.count, 0) / count
    const onBaseProbability = group.reduce((sum, item) => sum + item.onBaseProbability * item.count, 0) / count
    const outProbability = group.reduce((sum, item) => sum + item.outProbability * item.count, 0) / count
    const battingAverage = group.reduce((sum, item) => sum + item.battingAverage * item.count, 0) / count
    const hitProbability = group.reduce((sum, item) => sum + item.hitProbability * item.count, 0) / count
    const whiffProbability = group.reduce((sum, item) => sum + item.whiffProbability * item.count, 0) / count
    const contactProbability = group.reduce((sum, item) => sum + item.contactProbability * item.count, 0) / count
    const swingProbability = group.reduce((sum, item) => sum + item.swingProbability * item.count, 0) / count
    const metricTotal = group.reduce((sum, item) => sum + (item.metricValue ?? 0) * item.count, 0)
    const hasMetricValue = group.some((item) => item.metricValue !== undefined)
    const pitchMix = new Map<PitchType, number>()
    const zoneMix = new Map<ZoneId, number>()
    const representative = group[0]

    group.forEach((item) => {
      pitchMix.set(item.pitchType, (pitchMix.get(item.pitchType) ?? 0) + item.count)
      zoneMix.set(item.zoneId, (zoneMix.get(item.zoneId) ?? 0) + item.count)
    })

    const formatMix = <T extends string>(mix: Map<T, number>, labelByKey: Record<T, string>): string =>
      [...mix.entries()]
        .sort((first, second) => second[1] - first[1])
        .slice(0, 3)
        .map(([key, value]) => `${labelByKey[key]} ${Math.round((value / count) * 100)}%`)
        .join(' · ')

    const mixLabel = `${formatMix(pitchMix, pitchTypeLabels)} / ${formatMix(zoneMix, zoneLabels)}`

    clusters.push({
      ...representative,
      key: `${representative.key}-cluster-${index}-${count}`,
      x,
      y,
      count,
      onBaseProbability,
      outProbability,
      battingAverage,
      hitProbability,
      whiffProbability,
      contactProbability,
      swingProbability,
      metricValue: hasMetricValue ? metricTotal / count : undefined,
      isStrike: group.reduce((sum, item) => sum + (item.isStrike ? item.count : 0), 0) / count >= 0.5,
      sourceLabel: group.some((item) => item.sourceLabel === '실측 좌표') ? '실측/보정 혼합' : representative.sourceLabel,
      mixLabel,
      title:
        count > 1
          ? `${representative.label} ${count}개 묶음 / ${mixLabel} / 헛스윙 ${formatPercent(whiffProbability)} / 안타 ${formatPercent(hitProbability)} / 컨택 ${formatPercent(contactProbability)}`
          : representative.title
    })
  })

  return clusters
}

const getSampleOutcome = (
  zone: ZoneProbability,
  location: { x: number; y: number },
  seed: string
): { onBaseProbability: number; outProbability: number } => {
  const isBall = !isInsideStrikeZone(location)
  const contactOnBase = Math.min(Math.max(zone.hitProbability + zone.homeRunProbability * 0.65, 0.08), 0.48)
  const walkProbability = isBall
    ? Math.min(Math.max(0.22 + (1 - zone.swingProbability) * 0.24 + zone.riskValue / 620, 0.2), 0.5)
    : Math.min(Math.max(0.06 + (1 - zone.swingProbability) * 0.09, 0.04), 0.18)
  const hitByPitchProbability = isBall
    ? Math.min(Math.max(0.006 + zone.riskValue / 5200 + hashToUnit(`${seed}-hbp`) * 0.012, 0.006), 0.035)
    : 0.004
  const strikeOutPressure = zone.whiffProbability * zone.swingProbability * 0.2 + zone.pressureValue / 900
  const weakContactOut = Math.max(0.22, 0.56 - contactOnBase * 0.58 - walkProbability * 0.32)
  const volatility = (hashToUnit(`${seed}-outcome`) - 0.5) * 0.028
  const onBaseProbability = Math.min(
    Math.max(contactOnBase + walkProbability + hitByPitchProbability + volatility, 0.24),
    0.72
  )
  const outProbability = Math.min(
    Math.max(weakContactOut + strikeOutPressure - walkProbability * 0.22 - hitByPitchProbability - volatility, 0.18),
    0.78
  )

  return {
    onBaseProbability,
    outProbability
  }
}

const getLocationAdjustedMetrics = (
  zone: ZoneProbability,
  location: { x: number; y: number }
): {
  battingAverage: number
  hitProbability: number
  whiffProbability: number
  contactProbability: number
  swingProbability: number
} => {
  const isStrike = isInsideStrikeZone(location)
  const center = zoneCenters[zone.zoneId]
  const zoneDistance = Math.hypot(location.x - center.x, location.y - center.y)
  const edgeDistance = Math.min(
    Math.abs(location.x - strikeZoneBounds.left),
    Math.abs(location.x - strikeZoneBounds.right),
    Math.abs(location.y - strikeZoneBounds.top),
    Math.abs(location.y - strikeZoneBounds.bottom)
  )
  const heartPenalty = zone.zoneId === 'middle-middle' ? 1.12 : 1
  const chaseBoost = isStrike ? 1 : Math.max(0.68, 1 - zoneDistance / 96)
  const edgeBoost = isStrike ? Math.min(Math.max(1 + (8 - edgeDistance) / 42, 0.92), 1.18) : 1.1
  const whiffProbability = Math.min(Math.max(zone.whiffProbability * edgeBoost * (isStrike ? 1 : 1.16), 0.03), 0.72)
  const swingProbability = Math.min(Math.max(zone.swingProbability * (isStrike ? 1.04 : chaseBoost), 0.08), 0.9)
  const hitProbability = Math.min(Math.max(zone.hitProbability * heartPenalty * (isStrike ? 1 : 0.76), 0.02), 0.58)
  const battingAverage = Math.min(Math.max(zone.battingAverage * heartPenalty * (isStrike ? 1 : 0.72), 0.04), 0.62)

  return {
    battingAverage,
    hitProbability,
    whiffProbability,
    contactProbability: Math.min(Math.max(swingProbability * (1 - whiffProbability), 0), 1),
    swingProbability
  }
}

const getEmptySummary = (): PitchMapSummary => ({
  advantage: '데이터 부족',
  strikeProbability: 0,
  ballProbability: 0,
  onBaseProbability: 0,
  outProbability: 0
})

const getPitchMapSummary = (points: PlotPoint[]): PitchMapSummary => {
  const total = points.reduce((sum, point) => sum + point.count, 0)

  if (total <= 0) {
    return getEmptySummary()
  }

  const strikeCount = points.reduce((sum, point) => sum + (isInsideStrikeZone(point) ? point.count : 0), 0)
  const onBaseTotal = points.reduce((sum, point) => sum + point.onBaseProbability * point.count, 0)
  const outTotal = points.reduce((sum, point) => sum + point.outProbability * point.count, 0)
  const strikeProbability = strikeCount / total
  const ballProbability = 1 - strikeProbability
  const onBaseProbability = onBaseTotal / total
  const outProbability = outTotal / total

  return {
    advantage: onBaseProbability >= 0.3 ? '타자 우세' : '투수 우세',
    strikeProbability,
    ballProbability,
    onBaseProbability,
    outProbability
  }
}

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`
const formatAverage = (value: number): string => value.toFixed(3).replace(/^0/, '')

const mixColor = (start: RgbColor, end: RgbColor, weight: number): RgbColor => {
  return {
    red: Math.round(start.red + (end.red - start.red) * weight),
    green: Math.round(start.green + (end.green - start.green) * weight),
    blue: Math.round(start.blue + (end.blue - start.blue) * weight)
  }
}

const getHeatmapColor = (intensity: number, alpha: number): string => {
  const green = { red: 34, green: 197, blue: 94 }
  const yellow = { red: 234, green: 179, blue: 8 }
  const red = { red: 239, green: 68, blue: 68 }
  const clampedIntensity = Math.min(Math.max(intensity, 0), 1)
  const color =
    clampedIntensity < 0.5
      ? mixColor(green, yellow, clampedIntensity * 2)
      : mixColor(yellow, red, (clampedIntensity - 0.5) * 2)

  return `rgba(${color.red}, ${color.green}, ${color.blue}, ${alpha.toFixed(3)})`
}

const buildMetricProfiles = (zones: ZoneProbability[]): Partial<Record<'pressure' | 'risk', MetricProfile>> => {
  const referencePoints = zones.flatMap((zone) => {
    const center = zoneCenters[zone.zoneId]
    const bounds = getZoneBounds(zone.zoneId)
    const locations = [
      center,
      { x: bounds.left + 1, y: bounds.top + 1 },
      { x: bounds.right - 1, y: bounds.bottom - 1 },
      { x: center.x, y: strikeZoneBounds.bottom + 6 },
      { x: strikeZoneBounds.right + 6, y: center.y }
    ]

    return locations.map((location) => ({ zone, location }))
  })

  return {
    pressure: getMetricProfile(referencePoints.map(({ zone, location }) => getPointMetricValue(zone, 'pressure', location))),
    risk: getMetricProfile(referencePoints.map(({ zone, location }) => getPointMetricValue(zone, 'risk', location)))
  }
}

const buildPlotPoints = (
  zones: ZoneProbability[],
  sampleCount: PitchMapSampleCount,
  mode: PitchMapMode,
  clusterRadius: number,
  simulationVersion: number,
  pitcherCommand: number
): { points: PlotPoint[]; summary: PitchMapSummary } => {
  if (zones.length === 0) {
    return {
      points: [],
      summary: getEmptySummary()
    }
  }

  const observedZones = zones.filter((zone) => zone.dataQuality !== 'predicted' || (zone.sampleLocations?.length ?? 0) > 0)
  const plotZones = observedZones.length > 0 ? observedZones : zones
  const metricProfiles = buildMetricProfiles(plotZones)
  const signature = plotZones
    .slice(0, 24)
    .map((zone) => {
      return [
        zone.pitcherId ?? 'p',
        zone.batterId ?? 'b',
        zone.count,
        zone.pitchType,
        zone.zoneId,
        zone.pitchProbability.toFixed(3),
        zone.swingProbability.toFixed(3),
        zone.hitProbability.toFixed(3),
        zone.riskValue
      ].join('-')
    })
    .join('|')

  const points = Array.from({ length: sampleCount }, (_, index) => {
    const seed = `${signature}-${sampleCount}-${simulationVersion}-${index}`
    const zone = pickWeightedZone(plotZones, seed)
    const location = getLocationForZone(zone, seed, pitcherCommand)
    const category = getPointCategory(zone, mode, seed, location, metricProfiles)
    const outcome = getSampleOutcome(zone, location, seed)
    const detailMetrics = getLocationAdjustedMetrics(zone, location)
    const pointMetricValue = mode === 'pressure' || mode === 'risk' ? getPointMetricValue(zone, mode, location) : undefined
    const metricLabel = pointMetricValue === undefined ? '' : ` / 지수 ${Math.round(pointMetricValue)}`
    const isStrike = isInsideStrikeZone(location)
    const dataQuality = zone.dataQuality ?? (zone.sampleLocations && zone.sampleLocations.length > 0 ? 'observed' : 'predicted')

    return {
      key: seed,
      x: location.x,
      y: location.y,
      zoneId: zone.zoneId,
      pitchType: zone.pitchType,
      countState: zone.count,
      categoryKey: category.key,
      label: category.label,
      color: category.color,
      title: `${category.label}${metricLabel} / ${pitchTypeLabels[zone.pitchType]} / ${zoneLabels[zone.zoneId]} / ${zone.count} / ${isStrike ? '스트라이크 존' : '볼 존'} / 헛스윙 ${formatPercent(detailMetrics.whiffProbability)} / 안타 ${formatPercent(detailMetrics.hitProbability)} / 컨택 ${formatPercent(detailMetrics.contactProbability)}`,
      count: 1,
      onBaseProbability: outcome.onBaseProbability,
      outProbability: outcome.outProbability,
      battingAverage: detailMetrics.battingAverage,
      hitProbability: detailMetrics.hitProbability,
      whiffProbability: detailMetrics.whiffProbability,
      contactProbability: detailMetrics.contactProbability,
      swingProbability: detailMetrics.swingProbability,
      metricValue: pointMetricValue,
      isStrike,
      sourceLabel: zone.sampleLocations && zone.sampleLocations.length > 0 ? '실측 좌표' : '모델 보정',
      dataQuality
    }
  })

  return {
    points: clusterPlotPoints(points, clusterRadius),
    summary: getPitchMapSummary(points)
  }
}

const getHeatmapMetricValue = (
  zone: ZoneProbability,
  metric: Exclude<HeatmapMetric, 'none'>,
  location: { x: number; y: number }
): number => {
  const metrics = getLocationAdjustedMetrics(zone, location)

  if (metric === 'contactProbability') {
    return metrics.contactProbability
  }

  return metrics[metric]
}

const buildHeatmapCells = (zones: ZoneProbability[], metric: HeatmapMetric): HeatmapCell[] => {
  if (metric === 'none' || zones.length === 0) {
    return []
  }

  const columns = 24
  const rows = 24
  const cells: HeatmapCell[] = []
  const rawCells: Array<HeatmapCell & { raw: number }> = []

  for (let row = 0; row < rows; row += 1) {
    for (let column = 0; column < columns; column += 1) {
      const x = plotBounds.left + ((plotBounds.right - plotBounds.left) * (column + 0.5)) / columns
      const y = plotBounds.top + ((plotBounds.bottom - plotBounds.top) * (row + 0.5)) / rows
      const weighted = zones.reduce((sum, zone) => {
        const center = zoneCenters[zone.zoneId]
        const distance = Math.hypot(x - center.x, y - center.y)
        const sigma = isInsideStrikeZone({ x, y }) ? 12.5 : 15.5
        const falloff = Math.exp(-(distance * distance) / (2 * sigma * sigma))

        return sum + getHeatmapMetricValue(zone, metric, { x, y }) * Math.max(zone.pitchProbability, 0.03) * falloff
      }, 0)
      const weight = zones.reduce((sum, zone) => {
        const center = zoneCenters[zone.zoneId]
        const distance = Math.hypot(x - center.x, y - center.y)
        const sigma = isInsideStrikeZone({ x, y }) ? 12.5 : 15.5

        return sum + Math.max(zone.pitchProbability, 0.03) * Math.exp(-(distance * distance) / (2 * sigma * sigma))
      }, 0)
      const value = weight > 0 ? weighted / weight : 0

      rawCells.push({ key: `${metric}-${row}-${column}`, x, y, intensity: 0, value, raw: weighted })
    }
  }

  const values = rawCells.map((cell) => cell.value)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = Math.max(max - min, 0.001)

  rawCells.forEach((cell) => {
    const intensity = Math.min(Math.max((cell.value - min) / range, 0), 1)

    if (intensity > 0.04 || cell.raw > 0.002) {
      cells.push({
        key: cell.key,
        x: cell.x,
        y: cell.y,
        intensity,
        value: cell.value
      })
    }
  })

  return cells
}

function PitchBreakdownChart({
  zones,
  pitchTypes,
  selectedPitchType,
  pitchMapMode,
  pitchMapSampleCount,
  pitchClusterRadius,
  simulationVersion,
  pitcherCommand,
  onSelectPitchType,
  onSelectZone,
  onSelectPitchMapMode,
  onSelectPitchMapSampleCount,
  onChangePitchClusterRadius
}: PitchBreakdownChartProps): React.JSX.Element {
  const [heatmapMetric, setHeatmapMetric] = useState<HeatmapMetric>('whiffProbability')
  const [heatmapOpacity, setHeatmapOpacity] = useState(0.42)
  const [hoveredPoint, setHoveredPoint] = useState<PitchDotTooltipState | null>(null)
  const visibleZones =
    selectedPitchType === 'ALL' ? zones : zones.filter((zone) => zone.pitchType === selectedPitchType)
  const { points, summary } = buildPlotPoints(
    visibleZones,
    pitchMapSampleCount,
    pitchMapMode,
    pitchClusterRadius,
    simulationVersion,
    pitcherCommand
  )
  const heatmapCells = useMemo(() => buildHeatmapCells(visibleZones, heatmapMetric), [heatmapMetric, visibleZones])
  const isPredictionOnly = points.length > 0 && points.every((point) => point.dataQuality === 'predicted')
  const legendCategories = getLegendCategories(pitchTypes, pitchMapMode)

  return (
    <section className="breakdown-card">
      <div className="breakdown-toolbar">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">투구 분포 분석</p>
          <h2 className="text-2xl font-bold text-white">구종별 코스 맵</h2>
          <p className="mt-1 text-sm text-slate-400">{pitchMapModeDescriptions[pitchMapMode]}</p>
        </div>
      </div>

      <div className="pitch-legend">
        {legendCategories.map((category) => (
          <button
            className={`legend-item ${selectedPitchType === category.key ? 'legend-item-active' : ''}`}
            key={category.key}
            type="button"
            onClick={() => {
              if (pitchMapMode === 'pitchType' && pitchTypes.includes(category.key as PitchType)) {
                onSelectPitchType(category.key as PitchType)
              }
            }}
          >
            <span style={{ backgroundColor: category.color }} />
            {category.label}
          </button>
        ))}
      </div>

      <div className="pitch-plot">
        <div className="batter batter-left" />
        <div className="batter batter-right" />
        {heatmapMetric !== 'none' ? (
          <div className="pitch-heatmap" aria-hidden="true">
            {heatmapCells.map((cell) => (
              <span
                key={cell.key}
                style={{
                  left: `${cell.x}%`,
                  top: `${cell.y}%`,
                  background: `radial-gradient(circle, ${getHeatmapColor(cell.intensity, 1)} ${Math.round(22 + cell.intensity * 28)}%, transparent 74%)`,
                  opacity: heatmapOpacity * (0.16 + cell.intensity * 0.7)
                }}
              />
            ))}
          </div>
        ) : null}
        <div className="strike-zone-outline">
          <span />
          <span />
          <span />
          <span />
        </div>
        {points.map((point) => (
          <button
            className={`pitch-dot ${pitchMapSampleCount >= 1000 ? 'pitch-dot-dense' : pitchMapSampleCount >= 100 ? 'pitch-dot-compact' : ''} ${point.dataQuality === 'predicted' ? 'pitch-dot-predicted' : ''}`}
            key={point.key}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              backgroundColor: point.color,
              height: point.count > 1 ? `${Math.min(34, 10 + Math.sqrt(point.count) * 5.2)}px` : undefined,
              width: point.count > 1 ? `${Math.min(34, 10 + Math.sqrt(point.count) * 5.2)}px` : undefined
            }}
            type="button"
            title={point.title}
            onPointerEnter={(event) => setHoveredPoint({ point, x: event.clientX, y: event.clientY })}
            onPointerMove={(event) => setHoveredPoint({ point, x: event.clientX, y: event.clientY })}
            onPointerLeave={() => setHoveredPoint(null)}
            onClick={() => onSelectZone(point.zoneId, point.pitchType)}
          >
            <span className="pitch-dot-tooltip">
              <strong>{point.count > 1 ? `${point.count}개 묶음` : `${pitchTypeLabels[point.pitchType]} ${zoneLabels[point.zoneId]}`}</strong>
              {point.mixLabel ? <span>{point.mixLabel}</span> : null}
              <span>
                {point.countState} · {point.isStrike ? '스트라이크 존' : '볼 존'} · {point.sourceLabel}
              </span>
              {point.metricValue !== undefined ? <span>지수 {Math.round(point.metricValue)}</span> : null}
              <span>출루 {formatPercent(point.onBaseProbability)} · 아웃 {formatPercent(point.outProbability)}</span>
              <span>헛스윙 {formatPercent(point.whiffProbability)} · 스윙 {formatPercent(point.swingProbability)}</span>
              <span>안타 {formatPercent(point.hitProbability)} · 컨택 {formatPercent(point.contactProbability)}</span>
              <span>예상 타율 {formatAverage(point.battingAverage)}</span>
            </span>
          </button>
        ))}
        <div className="plot-caption">
          {pitchMapSampleCount.toLocaleString()}회 샘플 · {isPredictionOnly ? '예측 보정 위치' : '실측 기반 위치'}
        </div>
      </div>

      <div className="pitch-type-strip">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">구종</span>
        <div className="pitch-filter-buttons">
          <button
            className={selectedPitchType === 'ALL' ? 'active' : ''}
            type="button"
            onClick={() => onSelectPitchType('ALL')}
          >
            전체
          </button>
          {pitchTypes.map((pitchType) => (
            <button
              className={selectedPitchType === pitchType ? 'active' : ''}
              key={pitchType}
              type="button"
              onClick={() => onSelectPitchType(pitchType)}
            >
              {pitchType}
            </button>
          ))}
        </div>
      </div>

      <div className="pitch-map-bottom">
        <div className="pitch-map-controls">
          <div className="pitch-filter">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">시뮬레이션</span>
            <div className="pitch-filter-buttons">
              {pitchMapSampleCounts.map((count) => (
                <button
                  className={pitchMapSampleCount === count ? 'active' : ''}
                  key={count}
                  type="button"
                  onClick={() => onSelectPitchMapSampleCount(count)}
                >
                  {count}회
                </button>
              ))}
            </div>
          </div>
          <div className="pitch-filter">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">분포 모드</span>
            <div className="pitch-filter-buttons">
              {pitchMapModes.map((mode) => (
                <button
                  className={pitchMapMode === mode.key ? 'active' : ''}
                  key={mode.key}
                  type="button"
                  onClick={() => onSelectPitchMapMode(mode.key)}
                >
                  {mode.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pitch-filter">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">확률분포 필터</span>
            <div className="pitch-filter-buttons heatmap-filter-buttons">
              {heatmapMetrics.map((metric) => (
                <button
                  className={heatmapMetric === metric.key ? 'active' : ''}
                  key={metric.key}
                  type="button"
                  onClick={() => setHeatmapMetric(metric.key)}
                >
                  <span />
                  {metric.label}
                </button>
              ))}
            </div>
          </div>
          <div className="pitch-filter pitch-density-control">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="heatmap-opacity">
              분포 투명도 {Math.round(heatmapOpacity * 100)}%
            </label>
            <input
              id="heatmap-opacity"
              max="0.8"
              min="0.08"
              step="0.02"
              type="range"
              value={heatmapOpacity}
              onChange={(event) => setHeatmapOpacity(Number(event.target.value))}
            />
          </div>
          <div className="pitch-filter pitch-density-control">
            <label className="text-xs font-semibold uppercase tracking-wide text-slate-500" htmlFor="pitch-cluster-radius">
              밀집 반경 {pitchClusterRadius.toFixed(1)}
            </label>
            <input
              id="pitch-cluster-radius"
              max="6"
              min="0"
              step="0.5"
              type="range"
              value={pitchClusterRadius}
              onChange={(event) => onChangePitchClusterRadius(Number(event.target.value))}
            />
          </div>
        </div>

        <div className="pitch-map-summary">
          <div className="pitch-map-summary-head">
            <span>실시간 요약</span>
            <strong>{summary.advantage}</strong>
          </div>
          <div className="pitch-map-summary-grid">
            <div>
              <span>스트라이크</span>
              <strong>{formatPercent(summary.strikeProbability)}</strong>
            </div>
            <div>
              <span>볼</span>
              <strong>{formatPercent(summary.ballProbability)}</strong>
            </div>
            <div>
              <span>출루</span>
              <strong>{formatPercent(summary.onBaseProbability)}</strong>
            </div>
            <div>
              <span>아웃</span>
              <strong>{formatPercent(summary.outProbability)}</strong>
            </div>
          </div>
        </div>
      </div>

      {hoveredPoint
        ? createPortal(
            <div
              className="pitch-dot-tooltip pitch-dot-tooltip-floating"
              style={{
                left: hoveredPoint.x,
                top: hoveredPoint.y
              }}
            >
              <strong>
                {hoveredPoint.point.count > 1
                  ? `${hoveredPoint.point.count}개 묶음`
                  : `${pitchTypeLabels[hoveredPoint.point.pitchType]} ${zoneLabels[hoveredPoint.point.zoneId]}`}
              </strong>
              {hoveredPoint.point.mixLabel ? <span>{hoveredPoint.point.mixLabel}</span> : null}
              <span>
                {hoveredPoint.point.countState} / {hoveredPoint.point.isStrike ? '스트라이크 존' : '볼 존'} /{' '}
                {hoveredPoint.point.sourceLabel}
              </span>
              {hoveredPoint.point.metricValue !== undefined ? (
                <span>지수 {Math.round(hoveredPoint.point.metricValue)}</span>
              ) : null}
              <span>
                출루 {formatPercent(hoveredPoint.point.onBaseProbability)} / 아웃{' '}
                {formatPercent(hoveredPoint.point.outProbability)}
              </span>
              <span>
                헛스윙 {formatPercent(hoveredPoint.point.whiffProbability)} / 스윙{' '}
                {formatPercent(hoveredPoint.point.swingProbability)}
              </span>
              <span>
                안타 {formatPercent(hoveredPoint.point.hitProbability)} / 컨택{' '}
                {formatPercent(hoveredPoint.point.contactProbability)}
              </span>
              <span>예상 타율 {formatAverage(hoveredPoint.point.battingAverage)}</span>
            </div>,
            document.body
          )
        : null}
    </section>
  )
}

export default PitchBreakdownChart
