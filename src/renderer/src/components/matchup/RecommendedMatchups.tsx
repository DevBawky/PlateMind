import { useMemo, useState } from 'react'
import type { Player, PlayerRole } from '../../domain/models/player'

interface RecommendedMatchupsProps {
  pitchers: Player[]
  batters: Player[]
  selectedPitcher: Player | null
  selectedBatter: Player | null
  onSelectPitcher: (pitcher: Player) => void
  onSelectBatter: (batter: Player) => void
}

type RankingTab = 'matchups' | 'recommendedPitchers' | 'recommendedBatters' | 'lowPitchers' | 'lowBatters'

interface RankedPlayer {
  player: Player
  score: number
  summary: string
}

interface RankedMatchup {
  pitcher: Player
  batter: Player
  score: number
  summary: string
}

const rankingTabs: Array<{ key: RankingTab; label: string }> = [
  { key: 'matchups', label: '추천 매치업' },
  { key: 'recommendedPitchers', label: '추천 투수' },
  { key: 'recommendedBatters', label: '추천 타자' },
  { key: 'lowPitchers', label: '하위 투수' },
  { key: 'lowBatters', label: '하위 타자' }
]

const playerTabConfig: Record<Exclude<RankingTab, 'matchups'>, { role: PlayerRole; order: 'desc' | 'asc' }> = {
  recommendedPitchers: { role: 'pitcher', order: 'desc' },
  recommendedBatters: { role: 'batter', order: 'desc' },
  lowPitchers: { role: 'pitcher', order: 'asc' },
  lowBatters: { role: 'batter', order: 'asc' }
}

const getPitcherScore = (player: Player): number => {
  const velocity = player.averageVelocity ?? 142
  const arsenal = player.pitchArsenal?.length ?? 0
  const volume = Math.log10((player.pitchCount ?? 0) + 10) * 8
  const primaryBonus = player.primaryPitch ? 4 : 0

  return velocity * 0.58 + arsenal * 5 + volume + primaryBonus
}

const getBatterScore = (player: Player): number => {
  const discipline = player.disciplineScore ?? 50
  const aggression = player.aggressionScore ?? 50
  const volume = Math.log10((player.pitchesSeen ?? player.plateAppearances ?? 0) + 10) * 9
  const strength = (player.strongZones?.length ?? 0) * 4
  const weaknessPenalty = (player.weakPitchTypes?.length ?? 0) * 2

  return discipline * 0.62 + aggression * 0.36 + volume + strength - weaknessPenalty
}

const getScore = (player: Player): number => {
  return player.role === 'pitcher' ? getPitcherScore(player) : getBatterScore(player)
}

const getSummary = (player: Player): string => {
  if (player.role === 'pitcher') {
    const velocity = player.averageVelocity ? `${player.averageVelocity.toFixed(1)} km/h` : '구속 데이터 부족'
    const arsenal = `${player.pitchArsenal?.length ?? 0}구종`
    const volume = `${(player.pitchCount ?? 0).toLocaleString()}구`

    return `${velocity} / ${arsenal} / ${volume}`
  }

  const discipline = `선구안 ${player.disciplineScore ?? 50}`
  const aggression = `공격성 ${player.aggressionScore ?? 50}`
  const volume = `${(player.pitchesSeen ?? player.plateAppearances ?? 0).toLocaleString()} 관측`

  return `${discipline} / ${aggression} / ${volume}`
}

const getMatchupScore = (pitcher: Player, batter: Player): number => {
  const pitcherScore = getPitcherScore(pitcher)
  const batterScore = getBatterScore(batter)
  const handednessBonus = pitcher.handedness !== batter.handedness ? 7 : 2
  const pitchWeaknessBonus = (batter.weakPitchTypes ?? []).filter((pitchType) => pitcher.pitchArsenal?.includes(pitchType)).length * 6
  const confidence = Math.log10((pitcher.pitchCount ?? 0) + (batter.pitchesSeen ?? batter.plateAppearances ?? 0) + 20) * 3

  return pitcherScore * 0.56 + batterScore * 0.36 + handednessBonus + pitchWeaknessBonus + confidence
}

const rankPlayers = (players: Player[], tab: Exclude<RankingTab, 'matchups'>): RankedPlayer[] => {
  const tabConfig = playerTabConfig[tab]

  return players
    .filter((player) => player.role === tabConfig.role)
    .map((player) => ({
      player,
      score: getScore(player),
      summary: getSummary(player)
    }))
    .sort((first, second) => (tabConfig.order === 'desc' ? second.score - first.score : first.score - second.score))
    .slice(0, 20)
}

const rankMatchups = (pitchers: Player[], batters: Player[]): RankedMatchup[] => {
  const pitcherPool = [...pitchers].sort((first, second) => getPitcherScore(second) - getPitcherScore(first)).slice(0, 12)
  const batterPool = [...batters].sort((first, second) => getBatterScore(second) - getBatterScore(first)).slice(0, 12)

  return pitcherPool
    .flatMap((pitcher) =>
      batterPool.map((batter) => ({
        pitcher,
        batter,
        score: getMatchupScore(pitcher, batter),
        summary: `${pitcher.team} ${pitcher.handedness}HP vs ${batter.team} ${batter.handedness}HB`
      }))
    )
    .sort((first, second) => second.score - first.score)
    .slice(0, 20)
}

function RecommendedMatchups({
  pitchers,
  batters,
  selectedPitcher,
  selectedBatter,
  onSelectPitcher,
  onSelectBatter
}: RecommendedMatchupsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RankingTab>('matchups')
  const players = useMemo(() => [...pitchers, ...batters], [batters, pitchers])
  const rankedPlayers = useMemo(
    () => (activeTab === 'matchups' ? [] : rankPlayers(players, activeTab)),
    [activeTab, players]
  )
  const rankedMatchups = useMemo(() => rankMatchups(pitchers, batters), [batters, pitchers])

  const selectRandomMatchup = (): void => {
    if (pitchers.length === 0 || batters.length === 0) {
      return
    }

    onSelectPitcher(pitchers[Math.floor(Math.random() * pitchers.length)])
    onSelectBatter(batters[Math.floor(Math.random() * batters.length)])
  }

  return (
    <section className="recommended-matchups">
      <div className="recommended-matchups-head">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">추천 매치업</p>
        <button className="random-match-button" type="button" onClick={selectRandomMatchup}>
          랜덤 매치
        </button>
      </div>
      <div className="matchup-ranking-tabs">
        {rankingTabs.map((tab) => (
          <button className={activeTab === tab.key ? 'active' : ''} key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="recommendation-list matchup-ranking-list">
        {activeTab === 'matchups'
          ? rankedMatchups.map(({ pitcher, batter, score, summary }, index) => {
              const selected = selectedPitcher?.id === pitcher.id && selectedBatter?.id === batter.id

              return (
                <button
                  className={`matchup-pair-item ${selected ? 'selected' : ''}`}
                  key={`${pitcher.id}-${batter.id}`}
                  type="button"
                  onClick={() => {
                    onSelectPitcher(pitcher)
                    onSelectBatter(batter)
                  }}
                >
                  <span className="ranking-index">{index + 1}</span>
                  <span className="matchup-pair-line">
                    <strong>{pitcher.name}</strong>
                    <span className="matchup-pair-vs">vs</span>
                    <strong>{batter.name}</strong>
                  </span>
                  <span className="matchup-pair-meta">{summary}</span>
                  <small>추천도 {Math.round(score)}</small>
                </button>
              )
            })
          : rankedPlayers.map(({ player, score, summary }, index) => {
              const selected = player.role === 'pitcher' ? selectedPitcher?.id === player.id : selectedBatter?.id === player.id

              return (
                <button
                  className={selected ? 'selected' : ''}
                  key={player.id}
                  type="button"
                  onClick={() => {
                    if (player.role === 'pitcher') {
                      onSelectPitcher(player)
                    } else {
                      onSelectBatter(player)
                    }
                  }}
                >
                  <span className="ranking-index">{index + 1}</span>
                  <strong>{player.name}</strong>
                  <span>{summary}</span>
                  <small>추천도 {Math.round(score)}</small>
                </button>
              )
            })}
      </div>
    </section>
  )
}

export default RecommendedMatchups
