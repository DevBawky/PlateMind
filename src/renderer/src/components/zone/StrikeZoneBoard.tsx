import type { ZoneId, ZoneProbability } from '../../domain/models/zone'
import { zoneRows } from '../../domain/models/zone'
import ZoneCell from './ZoneCell'

interface StrikeZoneBoardProps {
  zones: ZoneProbability[]
  selectedZoneId: ZoneId
  onSelectZone: (zoneId: ZoneId) => void
}

function StrikeZoneBoard({ zones, selectedZoneId, onSelectZone }: StrikeZoneBoardProps): React.JSX.Element {
  const zoneMap = new Map(zones.map((zone) => [zone.zoneId, zone]))

  return (
    <section className="flex min-w-0 flex-col gap-4">
      <div>
        <p className="text-sm font-semibold uppercase tracking-wide text-slate-400">스트라이크 존 보드</p>
        <h1 className="text-3xl font-bold text-white">PlateMind MVP</h1>
      </div>
      {zones.length > 0 ? (
        <div className="strike-zone-board">
          {zoneRows.flatMap((row) =>
            row.map((zoneId) => {
              const zone = zoneMap.get(zoneId)

              if (!zone) {
                return null
              }

              return (
                <ZoneCell
                  key={zone.zoneId}
                  zone={zone}
                  isSelected={selectedZoneId === zone.zoneId}
                  onSelect={onSelectZone}
                />
              )
            })
          )}
        </div>
      ) : (
        <div className="empty-state">선택한 볼카운트와 구종에 해당하는 구역 데이터가 없습니다.</div>
      )}
    </section>
  )
}

export default StrikeZoneBoard
