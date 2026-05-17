import type { ZoneId, ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'

interface ZoneCellProps {
  zone: ZoneProbability
  isSelected: boolean
  onSelect: (zoneId: ZoneId) => void
}

const formatPercent = (value: number): string => `${Math.round(value * 100)}%`
const formatAverage = (value: number): string => value.toFixed(3).replace(/^0/, '')

function ZoneCell({ zone, isSelected, onSelect }: ZoneCellProps): React.JSX.Element {
  const pressureTone =
    zone.pressureValue >= 70 ? 'text-emerald-300' : zone.pressureValue >= 50 ? 'text-sky-300' : 'text-rose-300'

  return (
    <button
      className={`zone-cell ${isSelected ? 'zone-cell-selected' : ''}`}
      type="button"
      onClick={() => onSelect(zone.zoneId)}
      aria-pressed={isSelected}
    >
      <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">{zoneLabels[zone.zoneId]}</span>
      <span className="text-2xl font-bold text-white">{formatPercent(zone.pitchProbability)}</span>
      <span className="zone-cell-grid">
        <span>
          <span className="zone-metric-label">타율</span>
          <span className="zone-metric-value">{formatAverage(zone.battingAverage)}</span>
        </span>
        <span>
          <span className="zone-metric-label">홈런</span>
          <span className="zone-metric-value">{formatPercent(zone.homeRunProbability)}</span>
        </span>
        <span>
          <span className="zone-metric-label">압박</span>
          <span className={`zone-metric-value ${pressureTone}`}>{zone.pressureValue}</span>
        </span>
      </span>
    </button>
  )
}

export default ZoneCell
