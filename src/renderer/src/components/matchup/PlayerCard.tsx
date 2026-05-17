import type { Player } from '../../domain/models/player'
import type { PitchType } from '../../domain/models/pitch'
import { zoneLabels } from '../../domain/models/zone'

interface PlayerCardProps {
  player: Player
  isSelected: boolean
  onSelect: (player: Player) => void
}

const pitchLabels: Record<PitchType, string> = {
  FF: '포심',
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
  SC: '스크류볼'
}

const handednessLabel = (player: Player): string => {
  if (player.role === 'pitcher') {
    return player.handedness === 'R' ? 'RHP' : 'LHP'
  }

  return player.handedness === 'R' ? 'RHB' : 'LHB'
}

function PlayerCard({ player, isSelected, onSelect }: PlayerCardProps): React.JSX.Element {
  const isPitcher = player.role === 'pitcher'
  const topPitches = (player.pitchArsenal ?? []).slice(0, 3)
  const tags = (player.tags ?? []).slice(0, 3)
  const zoneSummary = isPitcher
    ? `${player.pitchCount?.toLocaleString() ?? 0}구`
    : `${player.pitchesSeen?.toLocaleString() ?? player.plateAppearances?.toLocaleString() ?? 0}개 관찰`

  return (
    <button
      className={`player-card ${isSelected ? 'player-card-selected' : ''}`}
      type="button"
      onClick={() => onSelect(player)}
    >
      <div className="player-card-head">
        <div>
          <p className="player-card-name">{player.name}</p>
          <p className="text-xs text-slate-400">
            {player.team} · {handednessLabel(player)}
          </p>
        </div>
        <span className="player-card-count">{zoneSummary}</span>
      </div>

      <div className="player-card-body">
        {isPitcher ? (
          <>
            <p className="text-xs text-slate-400">
              주요 구종 {topPitches.map((pitch) => pitchLabels[pitch]).join(' / ') || '데이터 부족'}
            </p>
            <p className="text-xs text-slate-400">
              평균 구속 {player.averageVelocity ? `${player.averageVelocity.toFixed(1)} km/h` : '데이터 부족'}
            </p>
          </>
        ) : (
          <>
            <p className="text-xs text-slate-400">
              강점 구역 {(player.strongZones ?? []).slice(0, 2).map((zone) => zoneLabels[zone]).join(' / ') || '데이터 부족'}
            </p>
            <p className="text-xs text-slate-400">
              약점 구역 {(player.weakZones ?? []).slice(0, 2).map((zone) => zoneLabels[zone]).join(' / ') || '데이터 부족'}
            </p>
          </>
        )}
      </div>

      <div className="tag-row">
        {tags.map((tag) => (
          <span key={tag}>{tag}</span>
        ))}
      </div>
    </button>
  )
}

export default PlayerCard
