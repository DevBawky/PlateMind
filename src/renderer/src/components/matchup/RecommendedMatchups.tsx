import type { Player } from '../../domain/models/player'

interface RecommendedMatchupsProps {
  pitchers: Player[]
  batters: Player[]
  selectedPitcher: Player | null
  selectedBatter: Player | null
  onSelectPitcher: (pitcher: Player) => void
  onSelectBatter: (batter: Player) => void
}

interface Recommendation {
  player: Player
  reason: string
}

const getBatterRecommendations = (batters: Player[], pitcher: Player | null): Recommendation[] => {
  if (!pitcher) {
    return batters.slice(0, 2).map((player) => ({
      player,
      reason: '불러온 데이터에서 비교하기 좋은 타자입니다.'
    }))
  }

  return batters.slice(0, 3).map((player) => {
    const weakPitch = player.weakPitchTypes?.find((pitchType) => pitcher.pitchArsenal?.includes(pitchType))

    return {
      player,
      reason: weakPitch
        ? `${weakPitch} 약점이 있어 구종 상성이 뚜렷합니다.`
        : '존별 위험도를 비교하기 좋은 타자입니다.'
    }
  })
}

const getPitcherRecommendations = (pitchers: Player[], batter: Player | null): Recommendation[] => {
  if (!batter) {
    return pitchers.slice(0, 2).map((player) => ({
      player,
      reason: '불러온 데이터에서 비교하기 좋은 투수입니다.'
    }))
  }

  return pitchers.slice(0, 3).map((player) => {
    const matchingPitch = player.pitchArsenal?.find((pitchType) => batter.weakPitchTypes?.includes(pitchType))

    return {
      player,
      reason: matchingPitch
        ? `${matchingPitch}로 타자의 약점을 공략할 수 있습니다.`
        : '타자의 강한 구역과 투구 분포를 비교할 수 있습니다.'
    }
  })
}

function RecommendedMatchups({
  pitchers,
  batters,
  selectedPitcher,
  selectedBatter,
  onSelectPitcher,
  onSelectBatter
}: RecommendedMatchupsProps): React.JSX.Element {
  const batterRecommendations = getBatterRecommendations(
    batters.filter((batter) => batter.id !== selectedBatter?.id),
    selectedPitcher
  )
  const pitcherRecommendations = getPitcherRecommendations(
    pitchers.filter((pitcher) => pitcher.id !== selectedPitcher?.id),
    selectedBatter
  )

  return (
    <section className="recommended-matchups">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">추천 매치업</p>
      <div className="recommendation-list">
        {batterRecommendations.map(({ player, reason }) => (
          <button key={player.id} type="button" onClick={() => onSelectBatter(player)}>
            <strong>{player.name}</strong>
            <span>{reason}</span>
          </button>
        ))}
        {pitcherRecommendations.map(({ player, reason }) => (
          <button key={player.id} type="button" onClick={() => onSelectPitcher(player)}>
            <strong>{player.name}</strong>
            <span>{reason}</span>
          </button>
        ))}
      </div>
    </section>
  )
}

export default RecommendedMatchups
