import type { PitchType } from '../../domain/models/pitch'
import type { ZoneId, ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'

export type PitchFilter = PitchType | 'ALL'

interface PitchBreakdownChartProps {
  zones: ZoneProbability[]
  pitchTypes: PitchType[]
  selectedPitchType: PitchFilter
  selectedZoneId: ZoneId
  onSelectPitchType: (pitchType: PitchFilter) => void
  onSelectZone: (zoneId: ZoneId, pitchType: PitchType) => void
}

interface PlotPoint {
  key: string
  x: number
  y: number
  zoneId: ZoneId
  pitchType: PitchType
  dataQuality?: ZoneProbability['dataQuality']
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

const zoneCenters: Record<ZoneId, { x: number; y: number }> = {
  'high-in': { x: 38, y: 38 },
  'high-middle': { x: 50, y: 36 },
  'high-away': { x: 62, y: 38 },
  'middle-in': { x: 38, y: 52 },
  'middle-middle': { x: 50, y: 50 },
  'middle-away': { x: 62, y: 52 },
  'low-in': { x: 38, y: 66 },
  'low-middle': { x: 50, y: 68 },
  'low-away': { x: 62, y: 66 }
}

const hashToUnit = (value: string): number => {
  let hash = 2166136261

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }

  return (hash >>> 0) / 4294967295
}

const plateLocationToPlotPoint = (location: { x: number; y: number }): { x: number; y: number } => {
  return {
    x: Math.min(Math.max(50 + location.x * 18, 7), 93),
    y: Math.min(Math.max(91 - location.y * 19, 8), 94)
  }
}

const buildObservedPoints = (zones: ZoneProbability[]): PlotPoint[] => {
  return zones.flatMap((zone) => {
    if (!zone.sampleLocations || zone.sampleLocations.length === 0) {
      return []
    }

    return zone.sampleLocations.map((location, index) => {
      const point = plateLocationToPlotPoint(location)

      return {
        key: `${zone.pitcherId ?? 'sample'}-${zone.count}-${zone.pitchType}-${zone.zoneId}-${index}`,
        x: point.x,
        y: point.y,
        zoneId: zone.zoneId,
        pitchType: zone.pitchType,
        dataQuality: 'observed'
      }
    })
  })
}

const buildFallbackPredictionPoints = (zones: ZoneProbability[]): PlotPoint[] => {
  const groups = new Map<string, ZoneProbability[]>()

  for (const zone of zones) {
    const key = `${zone.pitchType}|${zone.zoneId}`
    groups.set(key, [...(groups.get(key) ?? []), zone])
  }

  return [...groups.entries()].flatMap(([key, group]) => {
    const [pitchType, zoneId] = key.split('|') as [PitchType, ZoneId]
    const center = zoneCenters[zoneId]
    const averageProbability = group.reduce((sum, zone) => sum + zone.pitchProbability, 0) / Math.max(group.length, 1)
    const pointCount = Math.max(1, Math.min(5, Math.round(averageProbability * 24)))

    return Array.from({ length: pointCount }, (_, index) => {
      const seed = `prediction-${key}-${index}`
      const radius = 2 + hashToUnit(`${seed}-r`) * 5
      const angle = hashToUnit(`${seed}-a`) * Math.PI * 2

      return {
        key: seed,
        x: Math.min(Math.max(center.x + Math.cos(angle) * radius, 15), 84),
        y: Math.min(Math.max(center.y + Math.sin(angle) * radius, 18), 90),
        zoneId,
        pitchType,
        dataQuality: 'predicted'
      }
    })
  })
}

const buildPlotPoints = (zones: ZoneProbability[]): PlotPoint[] => {
  const observedPoints = buildObservedPoints(zones)

  return observedPoints.length > 0 ? observedPoints : buildFallbackPredictionPoints(zones)
}

function PitchBreakdownChart({
  zones,
  pitchTypes,
  selectedPitchType,
  selectedZoneId,
  onSelectPitchType,
  onSelectZone
}: PitchBreakdownChartProps): React.JSX.Element {
  const visibleZones =
    selectedPitchType === 'ALL' ? zones : zones.filter((zone) => zone.pitchType === selectedPitchType)
  const points = buildPlotPoints(visibleZones)
  const isPredictionOnly = points.length > 0 && points.every((point) => point.dataQuality === 'predicted')

  return (
    <section className="breakdown-card">
      <div className="breakdown-toolbar">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">투구 분포 분석</p>
          <h2 className="text-2xl font-bold text-white">구종별 코스 맵</h2>
          <p className="mt-1 text-sm text-slate-400">
            실제 투구 좌표가 있는 경우에는 실측 위치만 표시하고, 데이터가 없을 때만 예측 보정 위치를 보조로 표시합니다.
          </p>
        </div>
        <div className="pitch-filter">
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
            className={`pitch-dot ${point.dataQuality === 'predicted' ? 'pitch-dot-predicted' : ''} ${
              point.zoneId === selectedZoneId ? 'pitch-dot-selected' : ''
            }`}
            key={point.key}
            style={{
              left: `${point.x}%`,
              top: `${point.y}%`,
              backgroundColor: pitchTypeColors[point.pitchType]
            }}
            type="button"
            title={`${pitchTypeLabels[point.pitchType]} / ${zoneLabels[point.zoneId]}`}
            onClick={() => onSelectZone(point.zoneId, point.pitchType)}
          />
        ))}
        <div className="plot-caption">{isPredictionOnly ? '예측 보정 위치' : '실측 투구 위치'}</div>
      </div>

      <div className="pitch-legend">
        {pitchTypes.map((pitchType) => (
          <button
            className={`legend-item ${selectedPitchType === pitchType ? 'legend-item-active' : ''}`}
            key={pitchType}
            type="button"
            onClick={() => onSelectPitchType(pitchType)}
          >
            <span style={{ backgroundColor: pitchTypeColors[pitchType] }} />
            {pitchTypeLabels[pitchType]}
          </button>
        ))}
      </div>
    </section>
  )
}

export default PitchBreakdownChart
