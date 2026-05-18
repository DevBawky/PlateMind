import type { Player } from '../../domain/models/player'
import type { ZoneProbability } from '../../domain/models/zone'
import { zoneLabels } from '../../domain/models/zone'
import type { SimulationSummary } from '../../domain/services/monteCarloSimulator'

interface ResultAnalysisPanelProps {
  pitcher: Player | null
  batter: Player | null
  summary: SimulationSummary
  zones: ZoneProbability[]
  selectedZone: ZoneProbability | null
  recommendedZone: ZoneProbability | null
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`
const formatNumber = (value: number): string => value.toFixed(1)

const getAverage = (values: number[]): number => {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const getTopZone = (zones: ZoneProbability[], score: (zone: ZoneProbability) => number): ZoneProbability | null => {
  if (zones.length === 0) {
    return null
  }

  return [...zones].sort((first, second) => score(second) - score(first))[0]
}

function ResultAnalysisPanel({
  pitcher,
  batter,
  summary,
  zones,
  selectedZone,
  recommendedZone
}: ResultAnalysisPanelProps): React.JSX.Element {
  const pressureAverage = getAverage(zones.map((zone) => zone.pressureValue))
  const riskAverage = getAverage(zones.map((zone) => zone.riskValue))
  const usageLeader = getTopZone(zones, (zone) => zone.pitchProbability)
  const whiffLeader = getTopZone(zones, (zone) => zone.whiffProbability * zone.pitchProbability)
  const dangerLeader = getTopZone(zones, (zone) => zone.hitProbability + zone.homeRunProbability * 1.8 + zone.riskValue / 600)
  const outcomeLabel =
    summary.onBaseProbability >= 0.36
      ? '타자 우세'
      : summary.outProbability >= 0.62 || summary.strikeOutProbability >= 0.26
        ? '투수 우세'
        : '균형'
  const selectedZoneNote = selectedZone
    ? `${selectedZone.pitchType} ${zoneLabels[selectedZone.zoneId]}는 헛스윙 ${formatPercent(selectedZone.whiffProbability)}, 안타 ${formatPercent(selectedZone.hitProbability)}, 위험 ${selectedZone.riskValue}입니다.`
    : '선택된 코스 데이터가 아직 없습니다.'

  const insights = [
    `현재 결과는 ${outcomeLabel} 흐름입니다. 출루 ${formatPercent(summary.onBaseProbability)}, 아웃 ${formatPercent(summary.outProbability)}, 삼진 ${formatPercent(summary.strikeOutProbability)}로 계산됩니다.`,
    recommendedZone
      ? `추천 코스는 ${recommendedZone.pitchType} ${zoneLabels[recommendedZone.zoneId]}입니다. 압박 ${recommendedZone.pressureValue}, 위험 ${recommendedZone.riskValue}, 사용 가능성 ${formatPercent(recommendedZone.pitchProbability)}라서 실행 가치가 가장 높습니다.`
      : '추천 코스를 계산할 만큼의 구역 데이터가 부족합니다.',
    dangerLeader
      ? `가장 조심할 코스는 ${dangerLeader.pitchType} ${zoneLabels[dangerLeader.zoneId]}입니다. 안타 ${formatPercent(dangerLeader.hitProbability)}, 홈런 ${formatPercent(dangerLeader.homeRunProbability)}, 위험 ${dangerLeader.riskValue}로 장타 리스크가 큽니다.`
      : '위험 코스를 계산할 데이터가 부족합니다.'
  ]

  return (
    <aside className="panel-card result-analysis-panel">
      <div className="border-b border-slate-700 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">현재 결과 분석</p>
        <h2 className="mt-1 text-2xl font-bold text-white">{outcomeLabel}</h2>
        <p className="mt-2 text-sm text-slate-400">
          {pitcher?.name ?? '투수 미선택'} vs {batter?.name ?? '타자 미선택'} 기준으로 시뮬레이션 결과와 코스 분포를 함께 해석합니다.
        </p>
      </div>

      <div className="result-analysis-summary">
        <div className="detail-row">
          <span className="text-sm text-slate-400">출루 / 아웃</span>
          <span className="text-base font-semibold text-white">
            {formatPercent(summary.onBaseProbability)} / {formatPercent(summary.outProbability)}
          </span>
        </div>
        <div className="detail-row">
          <span className="text-sm text-slate-400">평균 압박 / 위험</span>
          <span className="text-base font-semibold text-white">
            {formatNumber(pressureAverage)} / {formatNumber(riskAverage)}
          </span>
        </div>
      </div>

      <div className="result-analysis-list">
        {insights.map((insight) => (
          <p key={insight}>{insight}</p>
        ))}
      </div>

      <div className="result-analysis-grid">
        <section>
          <span>주 사용 코스</span>
          <strong>{usageLeader ? `${usageLeader.pitchType} ${zoneLabels[usageLeader.zoneId]}` : '데이터 부족'}</strong>
        </section>
        <section>
          <span>헛스윙 기대</span>
          <strong>{whiffLeader ? `${whiffLeader.pitchType} ${zoneLabels[whiffLeader.zoneId]}` : '데이터 부족'}</strong>
        </section>
      </div>

      <div className="result-analysis-note">
        <span>선택 코스</span>
        <p>{selectedZoneNote}</p>
      </div>
    </aside>
  )
}

export default ResultAnalysisPanel
