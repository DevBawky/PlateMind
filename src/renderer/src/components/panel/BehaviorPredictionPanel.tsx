import type { BehaviorPrediction } from '../../domain/services/behaviorPredictor'

interface BehaviorPredictionPanelProps {
  pitcherBehavior: BehaviorPrediction
  batterBehavior: BehaviorPrediction
  observedZoneCount: number
  predictedZoneCount: number
}

const formatConfidence = (value: number): string => `${Math.round(value * 100)}%`

function BehaviorPredictionPanel({
  pitcherBehavior,
  batterBehavior,
  observedZoneCount,
  predictedZoneCount
}: BehaviorPredictionPanelProps): React.JSX.Element {
  const predictions = [
    ['투수 행동 유형', pitcherBehavior],
    ['타자 반응 유형', batterBehavior]
  ] as const

  return (
    <aside className="panel-card behavior-panel">
      <div className="border-b border-slate-700 pb-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">행동 유형 예측</p>
        <h2 className="mt-1 text-2xl font-bold text-white">부족 데이터 보정</h2>
        <p className="mt-2 text-sm text-slate-400">
          실제 투구 기록이 부족한 구간은 선수 프로필과 관측 패턴을 바탕으로 예측해 분석과 시뮬레이션에 반영합니다.
        </p>
      </div>

      <div className="prediction-grid">
        {predictions.map(([title, prediction]) => (
          <section className="prediction-block" key={title}>
            <div className="prediction-block-head">
              <span>{title}</span>
              <strong>{formatConfidence(prediction.confidence)}</strong>
            </div>
            <h3>{prediction.label}</h3>
            <p>{prediction.description}</p>
            <div className="tag-row">
              {prediction.tags.length > 0 ? prediction.tags.map((tag) => <span key={tag}>{tag}</span>) : <span>샘플 추정</span>}
            </div>
          </section>
        ))}
      </div>

      <div className="prediction-data-row">
        <span>관측 구역 {observedZoneCount.toLocaleString()}개</span>
        <span>예측 보정 {predictedZoneCount.toLocaleString()}개</span>
      </div>
    </aside>
  )
}

export default BehaviorPredictionPanel
