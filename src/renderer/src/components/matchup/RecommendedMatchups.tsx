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

type RankingTab = 'topPitchers' | 'topBatters' | 'lowPitchers' | 'lowBatters'

interface RankedPlayer {
  player: Player
  score: number
  summary: string
}

const rankingTabs: Array<{ key: RankingTab; label: string; role: PlayerRole; order: 'desc' | 'asc' }> = [
  { key: 'topPitchers', label: '상위 투수', role: 'pitcher', order: 'desc' },
  { key: 'topBatters', label: '상위 타자', role: 'batter', order: 'desc' },
  { key: 'lowPitchers', label: '하위 투수', role: 'pitcher', order: 'asc' },
  { key: 'lowBatters', label: '하위 타자', role: 'batter', order: 'asc' }
]

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

    return `${velocity} · ${arsenal} · ${volume}`
  }

  const discipline = `선구안 ${player.disciplineScore ?? 50}`
  const aggression = `적극성 ${player.aggressionScore ?? 50}`
  const volume = `${(player.pitchesSeen ?? player.plateAppearances ?? 0).toLocaleString()}개 관찰`

  return `${discipline} · ${aggression} · ${volume}`
}

const rankPlayers = (players: Player[], tab: RankingTab): RankedPlayer[] => {
  const tabConfig = rankingTabs.find((item) => item.key === tab) ?? rankingTabs[0]

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

function RecommendedMatchups({
  pitchers,
  batters,
  selectedPitcher,
  selectedBatter,
  onSelectPitcher,
  onSelectBatter
}: RecommendedMatchupsProps): React.JSX.Element {
  const [activeTab, setActiveTab] = useState<RankingTab>('topPitchers')
  const players = useMemo(() => [...pitchers, ...batters], [batters, pitchers])
  const rankedPlayers = useMemo(() => rankPlayers(players, activeTab), [activeTab, players])

  return (
    <section className="recommended-matchups">
      <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">추천 매치업</p>
      <div className="matchup-ranking-tabs">
        {rankingTabs.map((tab) => (
          <button className={activeTab === tab.key ? 'active' : ''} key={tab.key} type="button" onClick={() => setActiveTab(tab.key)}>
            {tab.label}
          </button>
        ))}
      </div>
      <div className="recommendation-list matchup-ranking-list">
        {rankedPlayers.map(({ player, score, summary }, index) => {
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
              <small>능력치 {Math.round(score)}</small>
            </button>
          )
        })}
      </div>
    </section>
  )
}

export default RecommendedMatchups
