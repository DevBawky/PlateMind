import type { Player } from '../../domain/models/player'

interface SelectedMatchupCardProps {
  pitcher: Player | null
  batter: Player | null
}

const handednessLabel = (player: Player): string => {
  if (player.role === 'pitcher') {
    return player.handedness === 'R' ? 'RHP' : 'LHP'
  }

  return player.handedness === 'R' ? 'RHB' : 'LHB'
}

function SelectedMatchupCard({ pitcher, batter }: SelectedMatchupCardProps): React.JSX.Element {
  const ready = Boolean(pitcher && batter)

  return (
    <section className="selected-matchup-card">
      <div className="matchup-card-player">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">투수</span>
        {pitcher ? (
          <>
            <strong>{pitcher.name}</strong>
            <span>{handednessLabel(pitcher)}</span>
            <small>보유 구종 {(pitcher.pitchArsenal ?? []).slice(0, 3).join(' / ') || '데이터 부족'}</small>
          </>
        ) : (
          <p>분석할 투수를 선택하세요</p>
        )}
      </div>

      <div className="matchup-vs">VS</div>

      <div className="matchup-card-player">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">타자</span>
        {batter ? (
          <>
            <strong>{batter.name}</strong>
            <span>{handednessLabel(batter)}</span>
            <small>{(batter.tags ?? []).slice(0, 2).join(' / ') || '성향 데이터 부족'}</small>
          </>
        ) : (
          <p>상대할 타자를 선택하세요</p>
        )}
      </div>

      <div className={`readiness-badge ${ready ? 'ready' : ''}`}>{ready ? '분석 가능 · 실제 데이터 기반' : '데이터 부족'}</div>
    </section>
  )
}

export default SelectedMatchupCard
