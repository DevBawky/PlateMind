import { useMemo, useState } from 'react'
import type { Player, PlayerRole } from '../../domain/models/player'
import PlayerCard from './PlayerCard'
import PlayerSearchBox from './PlayerSearchBox'
import type { HandFilter, SortKey } from './PlayerSearchBox'
import RecommendedMatchups from './RecommendedMatchups'
import SelectedMatchupCard from './SelectedMatchupCard'

interface MatchupBuilderProps {
  pitchers: Player[]
  batters: Player[]
  selectedPitcher: Player | null
  selectedBatter: Player | null
  savantStatus: 'idle' | 'loading' | 'ready' | 'error'
  savantMessage: string
  onLoadBaseballSavant: () => void
  onSelectPitcher: (pitcher: Player) => void
  onSelectBatter: (batter: Player) => void
}

const getVolume = (player: Player): number => {
  return player.role === 'pitcher' ? (player.pitchCount ?? 0) : (player.pitchesSeen ?? player.plateAppearances ?? 0)
}

const sortPlayers = (players: Player[], sortKey: SortKey): Player[] => {
  return [...players].sort((first, second) => {
    if (sortKey === 'velocity') {
      return (second.averageVelocity ?? 0) - (first.averageVelocity ?? 0)
    }

    if (sortKey === 'arsenal') {
      return (second.pitchArsenal?.length ?? 0) - (first.pitchArsenal?.length ?? 0)
    }

    if (sortKey === 'aggression') {
      return (second.aggressionScore ?? 0) - (first.aggressionScore ?? 0)
    }

    if (sortKey === 'discipline') {
      return (second.disciplineScore ?? 0) - (first.disciplineScore ?? 0)
    }

    return getVolume(second) - getVolume(first)
  })
}

function MatchupBuilder({
  pitchers,
  batters,
  selectedPitcher,
  selectedBatter,
  savantStatus,
  savantMessage,
  onLoadBaseballSavant,
  onSelectPitcher,
  onSelectBatter
}: MatchupBuilderProps): React.JSX.Element {
  const [query, setQuery] = useState('')
  const [role, setRole] = useState<PlayerRole>('pitcher')
  const [handFilter, setHandFilter] = useState<HandFilter>('ALL')
  const [sortKey, setSortKey] = useState<SortKey>('volume')

  const candidates = role === 'pitcher' ? pitchers : batters
  const filteredPlayers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase()
    const filtered = candidates.filter((player) => {
      const matchesQuery =
        normalizedQuery.length === 0 ||
        player.name.toLowerCase().includes(normalizedQuery) ||
        player.team.toLowerCase().includes(normalizedQuery)
      const matchesHand = handFilter === 'ALL' || player.handedness === handFilter

      return matchesQuery && matchesHand
    })

    return sortPlayers(filtered, sortKey).slice(0, 12)
  }, [candidates, handFilter, query, sortKey])

  const handleRoleChange = (nextRole: PlayerRole): void => {
    setRole(nextRole)
    setHandFilter('ALL')
    setSortKey('volume')
  }

  return (
    <aside className="matchup-builder panel-card">
      <div className="matchup-builder-header">
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">매치업 빌더</p>
        <p className="mt-2 text-sm text-slate-400">
          Baseball Savant에서 불러온 선수 목록을 검색하고 카드로 선택합니다.
        </p>
      </div>

      <SelectedMatchupCard pitcher={selectedPitcher} batter={selectedBatter} />

      <section className={`savant-load-card ${savantStatus}`}>
        <div>
          <p className="text-sm font-semibold text-white">Baseball Savant 연동</p>
          <p className="mt-1 text-xs text-slate-400">{savantMessage}</p>
        </div>
        <button type="button" onClick={onLoadBaseballSavant} disabled={savantStatus === 'loading'}>
          {savantStatus === 'loading' ? '불러오는 중' : '데이터 불러오기'}
        </button>
      </section>

      <PlayerSearchBox
        query={query}
        role={role}
        handFilter={handFilter}
        sortKey={sortKey}
        onQueryChange={setQuery}
        onRoleChange={handleRoleChange}
        onHandFilterChange={setHandFilter}
        onSortKeyChange={setSortKey}
      />

      <section className="player-result-section">
        <div className="player-result-header">
          <span>{role === 'pitcher' ? '투수 검색 결과' : '타자 검색 결과'}</span>
          <span>{filteredPlayers.length}명</span>
        </div>
        <div className="player-card-list">
          {filteredPlayers.length > 0 ? (
            filteredPlayers.map((player) => (
              <PlayerCard
                key={player.id}
                player={player}
                isSelected={role === 'pitcher' ? selectedPitcher?.id === player.id : selectedBatter?.id === player.id}
                onSelect={(nextPlayer) => {
                  if (nextPlayer.role === 'pitcher') {
                    onSelectPitcher(nextPlayer)
                  } else {
                    onSelectBatter(nextPlayer)
                  }
                }}
              />
            ))
          ) : (
            <div className="player-empty-state">조건에 맞는 선수가 없습니다.</div>
          )}
        </div>
      </section>

      <RecommendedMatchups
        pitchers={pitchers}
        batters={batters}
        selectedPitcher={selectedPitcher}
        selectedBatter={selectedBatter}
        onSelectPitcher={onSelectPitcher}
        onSelectBatter={onSelectBatter}
      />
    </aside>
  )
}

export default MatchupBuilder
