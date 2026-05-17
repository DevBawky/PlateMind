import type { PlayerRole } from '../../domain/models/player'

export type HandFilter = 'ALL' | 'R' | 'L'
export type SortKey = 'volume' | 'velocity' | 'arsenal' | 'aggression' | 'discipline'

interface PlayerSearchBoxProps {
  query: string
  role: PlayerRole
  handFilter: HandFilter
  sortKey: SortKey
  onQueryChange: (query: string) => void
  onRoleChange: (role: PlayerRole) => void
  onHandFilterChange: (filter: HandFilter) => void
  onSortKeyChange: (sortKey: SortKey) => void
}

const pitcherSorts: Array<{ key: SortKey; label: string }> = [
  { key: 'volume', label: '투구 수' },
  { key: 'velocity', label: '평균 구속' },
  { key: 'arsenal', label: '구종 다양성' }
]

const batterSorts: Array<{ key: SortKey; label: string }> = [
  { key: 'volume', label: '본 투구 수' },
  { key: 'aggression', label: '공격성' },
  { key: 'discipline', label: '선구안' }
]

function PlayerSearchBox({
  query,
  role,
  handFilter,
  sortKey,
  onQueryChange,
  onRoleChange,
  onHandFilterChange,
  onSortKeyChange
}: PlayerSearchBoxProps): React.JSX.Element {
  const sortOptions = role === 'pitcher' ? pitcherSorts : batterSorts
  const handLabels = role === 'pitcher' ? ['전체', 'RHP', 'LHP'] : ['전체', 'RHB', 'LHB']
  const handValues: HandFilter[] = ['ALL', 'R', 'L']

  return (
    <section className="matchup-search">
      <label className="search-field">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">선수 검색</span>
        <input
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="이름 또는 팀 입력"
        />
      </label>

      <div className="segmented-control">
        <button className={role === 'pitcher' ? 'active' : ''} type="button" onClick={() => onRoleChange('pitcher')}>
          투수
        </button>
        <button className={role === 'batter' ? 'active' : ''} type="button" onClick={() => onRoleChange('batter')}>
          타자
        </button>
      </div>

      <div className="button-filter-row">
        {handValues.map((value, index) => (
          <button
            className={handFilter === value ? 'active' : ''}
            key={value}
            type="button"
            onClick={() => onHandFilterChange(value)}
          >
            {handLabels[index]}
          </button>
        ))}
      </div>

      <div className="button-filter-row">
        {sortOptions.map((option) => (
          <button
            className={sortKey === option.key ? 'active' : ''}
            key={option.key}
            type="button"
            onClick={() => onSortKeyChange(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  )
}

export default PlayerSearchBox
