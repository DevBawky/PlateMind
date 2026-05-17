import { zoneLabels } from '../../domain/models/zone'
import type { PitchResult, SimulationSummary } from '../../domain/services/monteCarloSimulator'

interface SimulationPanelProps {
  summary: SimulationSummary
}

const formatPercent = (value: number): string => `${(value * 100).toFixed(1)}%`
const formatValue = (value: number): string => value.toFixed(1)

const resultLabels: Record<PitchResult, string> = {
  ball: '볼',
  calledStrike: '루킹 스트라이크',
  swingingStrike: '헛스윙',
  foul: '파울',
  inPlayOut: '인플레이 아웃',
  hit: '안타',
  homeRun: '홈런',
  hitByPitch: '몸에 맞는 공'
}

function SimulationPanel({ summary }: SimulationPanelProps): React.JSX.Element {
  const metrics = [
    ['출루 %', formatPercent(summary.onBaseProbability)],
    ['아웃 %', formatPercent(summary.outProbability)],
    ['안타 %', formatPercent(summary.hitProbability)],
    ['홈런 %', formatPercent(summary.homeRunProbability)],
    ['볼넷 %', formatPercent(summary.walkProbability)],
    ['데드볼 %', formatPercent(summary.hitByPitchProbability)],
    ['삼진 %', formatPercent(summary.strikeOutProbability)],
    ['평균 투구 수', formatValue(summary.averagePitchCount)],
    ['평균 압박 지수', formatValue(summary.averagePressureValue)],
    ['평균 위험 지수', formatValue(summary.averageRiskValue)]
  ]

  return (
    <aside className="panel-card simulation-panel">
      <div className="border-b border-slate-700 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">타석 시뮬레이션</p>
        <h2 className="mt-1 text-2xl font-bold text-white">
          시뮬레이션 횟수 {summary.totalRuns.toLocaleString()}회
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          0-0 카운트부터 타석 종료까지 투수의 선택과 타자의 반응을 반복 계산합니다.
        </p>
      </div>

      <div className="simulation-metric-grid">
        {metrics.map(([label, value]) => (
          <div className="detail-row" key={label}>
            <span className="text-sm text-slate-400">{label}</span>
            <span className="text-base font-semibold text-white">{value}</span>
          </div>
        ))}
      </div>

      <div className="mt-5 border-b border-slate-700 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">대표 타석 로그</p>
      </div>

      {summary.sampleTurns.length > 0 ? (
        <div className="simulation-log-scroll">
          <ol className="simulation-log">
            {summary.sampleTurns.map((turn) => (
              <li className="simulation-log-item" key={turn.pitchNumber}>
                <span className="simulation-log-index">{turn.pitchNumber}</span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white">
                    {turn.countBefore} | {turn.pitchType} | {zoneLabels[turn.zoneId]}
                  </p>
                  <p className="text-xs text-slate-400">
                    {turn.batterAction === 'take' ? '지켜봄' : '스윙'} | {resultLabels[turn.pitchResult]} |{' '}
                    {turn.countAfter}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        </div>
      ) : (
        <p className="mt-5 text-sm text-slate-400">시뮬레이션 가능한 데이터가 없습니다.</p>
      )}
    </aside>
  )
}

export default SimulationPanel
