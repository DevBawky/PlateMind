import type { PitchType } from '../../domain/models/pitch'
import type { ZoneId, ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'

export type PitchFilter = PitchType | 'ALL'
export type PitchMapMode = 'pitchType' | 'pitchResult' | 'countResult' | 'pressure' | 'risk'
export type PitchMapSampleCount = 10 | 100 | 1000

interface PitchBreakdownChartProps {
  zones: ZoneProbability[]
  pitchTypes: PitchType[]
  selectedPitchType: PitchFilter
  selectedZoneId: ZoneId
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
  categoryKey: string
  label: string
  color: string
  title: string
  count: number
  onBaseProbability: number
  outProbability: number
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

const pitchMapSampleCounts: PitchMapSampleCount[] = [10, 100, 1000]

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
  high: { key: 'high', label: '높은 압박', color: '#059669' },
  medium: { key: 'medium', label: '보통', color: '#d97706' },
  low: { key: 'low', label: '낮은 압박', color: '#64748b' }
}

const riskCategories: Record<string, PlotCategory> = {
  high: { key: 'high', label: '위험', color: '#dc2626' },
  medium: { key: 'medium', label: '주의', color: '#f59e0b' },
  low: { key: 'low', label: '안전', color: '#16a34a' }
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

const getMetricCategory = (
  value: number,
  categories: Record<string, PlotCategory>,
  highThreshold: number,
  lowThreshold: number
): PlotCategory => {
  if (value >= highThreshold) {
    return categories.high
  }

  if (value <= lowThreshold) {
    return categories.low
  }

  return categories.medium
}

const getPointCategory = (
  zone: ZoneProbability,
  mode: PitchMapMode,
  seed: string,
  location: { x: number; y: number }
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
    return getMetricCategory(zone.pressureValue, pressureCategories, 70, 45)
  }

  return getMetricCategory(zone.riskValue, riskCategories, 60, 35)
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
    return [pressureCategories.high, pressureCategories.medium, pressureCategories.low]
  }

  return [riskCategories.high, riskCategories.medium, riskCategories.low]
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
    const representative = group[0]

    clusters.push({
      ...representative,
      key: `${representative.key}-cluster-${index}-${count}`,
      x,
      y,
      count,
      onBaseProbability,
      outProbability,
      title:
        count > 1
          ? `${representative.label} ${count}구 / ${pitchTypeLabels[representative.pitchType]} / ${zoneLabels[representative.zoneId]}`
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
    const category = getPointCategory(zone, mode, seed, location)
    const outcome = getSampleOutcome(zone, location, seed)

    return {
      key: seed,
      x: location.x,
      y: location.y,
      zoneId: zone.zoneId,
      pitchType: zone.pitchType,
      categoryKey: category.key,
      label: category.label,
      color: category.color,
      title: `${category.label} / ${pitchTypeLabels[zone.pitchType]} / ${zoneLabels[zone.zoneId]}`,
      count: 1,
      onBaseProbability: outcome.onBaseProbability,
      outProbability: outcome.outProbability,
      dataQuality: zone.dataQuality ?? (zone.sampleLocations && zone.sampleLocations.length > 0 ? 'observed' : 'predicted')
    }
  })

  return {
    points: clusterPlotPoints(points, clusterRadius),
    summary: getPitchMapSummary(points)
  }
}

function PitchBreakdownChart({
  zones,
  pitchTypes,
  selectedPitchType,
  selectedZoneId,
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
  const isPredictionOnly = points.length > 0 && points.every((point) => point.dataQuality === 'predicted')
  const legendCategories = getLegendCategories(pitchTypes, pitchMapMode)

  return (
    <section className="breakdown-card">
      <div className="breakdown-toolbar">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">투구 분포 분석</p>
          <h2 className="text-2xl font-bold text-white">구종별 코스 맵</h2>
          <p className="mt-1 text-sm text-slate-400">
            선택한 횟수만큼 분포를 샘플링해 선수별 데이터 양 차이를 줄이고, 모드별로 공의 의미를 다시 색칠합니다.
          </p>
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
        <div className="strike-zone-outline">
          <span />
          <span />
          <span />
          <span />
        </div>
        {points.map((point) => (
          <button
            className={`pitch-dot ${pitchMapSampleCount >= 1000 ? 'pitch-dot-dense' : pitchMapSampleCount >= 100 ? 'pitch-dot-compact' : ''} ${point.dataQuality === 'predicted' ? 'pitch-dot-predicted' : ''} ${
              point.zoneId === selectedZoneId ? 'pitch-dot-selected' : ''
            }`}
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
            onClick={() => onSelectZone(point.zoneId, point.pitchType)}
          />
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

    </section>
  )
}

export default PitchBreakdownChart
