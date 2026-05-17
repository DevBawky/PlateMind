import type { ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'

interface ZoneDetailPanelProps {
  zone: ZoneProbability | null
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`
const formatAverage = (value: number): string => value.toFixed(3).replace(/^0/, '')

const qualityLabels: Record<NonNullable<ZoneProbability['dataQuality']>, string> = {
  observed: '실측 데이터',
  predicted: '예측 보정',
  mixed: '실측 + 예측'
}

function ZoneDetailPanel({ zone }: ZoneDetailPanelProps): React.JSX.Element {
  const metrics = zone
    ? [
        ['투구 가능성', formatPercent(zone.pitchProbability)],
        ['예상 타율', formatAverage(zone.battingAverage)],
        ['안타 확률', formatPercent(zone.hitProbability)],
        ['홈런 확률', formatPercent(zone.homeRunProbability)],
        ['스윙 확률', formatPercent(zone.swingProbability)],
        ['헛스윙 확률', formatPercent(zone.whiffProbability)],
        ['압박 지수', zone.pressureValue.toString()],
        ['위험 지수', zone.riskValue.toString()],
        ['데이터 상태', qualityLabels[zone.dataQuality ?? 'observed']]
      ]
    : []

  return (
    <aside className="panel-card">
      <div className="border-b border-slate-700 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">선택 구역 상세 분석</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{zone ? zoneLabels[zone.zoneId] : '데이터 없음'}</h2>
        <p className="mt-2 text-sm text-slate-400">
          압박 지수는 현재 구종과 코스가 타자에게 주는 압박을, 위험 지수는 출루와 장타로 이어질 가능성을 수치화한 값입니다.
        </p>
      </div>
      {zone ? (
        <div className="mt-5 grid gap-3">
          {metrics.map(([label, value]) => (
            <div className="detail-row" key={label}>
              <span className="text-sm text-slate-400">{label}</span>
              <span className="text-base font-semibold text-white">{value}</span>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-400">구종 또는 투구 위치를 선택하면 구역 분석을 표시합니다.</p>
      )}
    </aside>
  )
}

export default ZoneDetailPanel
