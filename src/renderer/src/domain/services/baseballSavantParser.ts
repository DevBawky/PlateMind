import type { Player } from '../models/player'
import type { PitchType } from '../models/pitch'
import type { CountState, ZoneId, ZoneProbability } from '../models/zone'

export interface BaseballSavantDataset {
  pitchers: Player[]
  batters: Player[]
  zones: ZoneProbability[]
  rowCount: number
}

type CsvRow = Record<string, string>
type SavantPlayerType = 'pitcher' | 'batter'

const supportedPitchTypes: PitchType[] = ['FF', 'SL', 'CH', 'CU', 'SI', 'FS', 'FC', 'ST', 'SV', 'KC', 'KN', 'EP', 'FO', 'SC']
const countStates: CountState[] = ['0-0', '0-1', '0-2', '1-0', '1-1', '1-2', '2-0', '2-1', '2-2', '3-0', '3-1', '3-2']
const zoneIds: ZoneId[] = [
  'high-in',
  'high-middle',
  'high-away',
  'middle-in',
  'middle-middle',
  'middle-away',
  'low-in',
  'low-middle',
  'low-away'
]

const parseCsv = (csv: string): CsvRow[] => {
  const rows: string[][] = []
  let cell = ''
  let row: string[] = []
  let inQuotes = false

  for (let index = 0; index < csv.length; index += 1) {
    const char = csv[index]
    const next = csv[index + 1]

    if (char === '"' && next === '"') {
      cell += '"'
      index += 1
    } else if (char === '"') {
      inQuotes = !inQuotes
    } else if (char === ',' && !inQuotes) {
      row.push(cell)
      cell = ''
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') {
        index += 1
      }

      row.push(cell)
      rows.push(row)
      row = []
      cell = ''
    } else {
      cell += char
    }
  }

  if (cell.length > 0 || row.length > 0) {
    row.push(cell)
    rows.push(row)
  }

  const [headers, ...body] = rows.filter((csvRow) => csvRow.some((value) => value.trim().length > 0))

  if (!headers) {
    return []
  }

  return body.map((csvRow) => {
    return headers.reduce<CsvRow>((record, header, index) => {
      record[header] = csvRow[index] ?? ''

      return record
    }, {})
  })
}

const toNumber = (value: string | undefined): number | null => {
  if (!value) {
    return null
  }

  const parsed = Number(value)

  return Number.isFinite(parsed) ? parsed : null
}

const toPitchType = (value: string | undefined): PitchType | null => {
  return supportedPitchTypes.includes(value as PitchType) ? (value as PitchType) : null
}

const toCount = (row: CsvRow): CountState | null => {
  const balls = toNumber(row.balls)
  const strikes = toNumber(row.strikes)
  const count = `${balls ?? 0}-${strikes ?? 0}` as CountState

  return countStates.includes(count) ? count : null
}

const toZoneId = (row: CsvRow): ZoneId | null => {
  const plateX = toNumber(row.plate_x)
  const plateZ = toNumber(row.plate_z)

  if (plateX !== null && plateZ !== null) {
    const horizontal = plateX < -0.28 ? 'in' : plateX > 0.28 ? 'away' : 'middle'
    const vertical = plateZ > 3.1 ? 'high' : plateZ < 2.05 ? 'low' : 'middle'

    return `${vertical}-${horizontal}` as ZoneId
  }

  const zone = toNumber(row.zone)

  if (zone === null || zone < 1 || zone > 9) {
    return null
  }

  return zoneIds[zone - 1]
}

const isSwing = (description: string): boolean => {
  return ['swinging_strike', 'swinging_strike_blocked', 'foul', 'hit_into_play', 'foul_tip'].includes(description)
}

const isWhiff = (description: string): boolean => {
  return description === 'swinging_strike' || description === 'swinging_strike_blocked' || description === 'foul_tip'
}

const isHit = (events: string): boolean => {
  return ['single', 'double', 'triple', 'home_run'].includes(events)
}

const clamp = (value: number): number => Math.min(Math.max(value, 0), 1)

const getPitcherId = (row: CsvRow): string => `savant-p-${row.pitcher}`
const getBatterId = (row: CsvRow): string => `savant-b-${row.batter}`

const makePitcher = (row: CsvRow, rows: CsvRow[]): Player => {
  const pitchTypes = Array.from(new Set(rows.map((pitchRow) => toPitchType(pitchRow.pitch_type)).filter(Boolean))) as PitchType[]
  const velocities = rows.map((pitchRow) => toNumber(pitchRow.release_speed)).filter((value): value is number => value !== null)
  const pitchCounts = new Map<PitchType, number>()

  for (const pitchType of pitchTypes) {
    pitchCounts.set(pitchType, rows.filter((pitchRow) => pitchRow.pitch_type === pitchType).length)
  }

  const primaryPitch = [...pitchCounts.entries()].sort((first, second) => second[1] - first[1])[0]?.[0]

  return {
    id: getPitcherId(row),
    name: row.pitcher_name || row.player_name || `Pitcher ${row.pitcher}`,
    role: 'pitcher',
    team: row.home_team || row.away_team || 'MLB',
    handedness: row.p_throws === 'L' ? 'L' : 'R',
    pitchArsenal: pitchTypes,
    pitchCount: rows.length,
    averageVelocity: velocities.length > 0 ? velocities.reduce((sum, value) => sum + value, 0) / velocities.length : undefined,
    primaryPitch,
    tags: pitchTypes.length >= 4 ? ['Variety', 'Mix'] : ['Sample Data']
  }
}

const makeBatter = (row: CsvRow, rows: CsvRow[], sourceType: SavantPlayerType): Player => {
  const swings = rows.filter((pitchRow) => isSwing(pitchRow.description)).length
  const takes = rows.length - swings
  const hits = rows.filter((pitchRow) => isHit(pitchRow.events)).length
  const homeRuns = rows.filter((pitchRow) => pitchRow.events === 'home_run').length
  const aggressionScore = rows.length > 0 ? Math.round((swings / rows.length) * 100) : 50
  const disciplineScore = rows.length > 0 ? Math.round((takes / rows.length) * 100) : 50
  const tags = [aggressionScore >= 58 ? 'Aggressive' : 'Patient', homeRuns > 0 ? 'Power' : hits > 0 ? 'Contact' : 'Sample Data']

  return {
    id: getBatterId(row),
    name: row.batter_name || (sourceType === 'batter' ? row.player_name : '') || `Batter ${row.batter}`,
    role: 'batter',
    team: row.home_team || row.away_team || 'MLB',
    handedness: row.stand === 'L' ? 'L' : 'R',
    plateAppearances: new Set(rows.map((pitchRow) => pitchRow.at_bat_number || `${pitchRow.game_pk}-${pitchRow.inning}-${pitchRow.batter}`)).size,
    pitchesSeen: rows.length,
    tags,
    aggressionScore,
    disciplineScore
  }
}

const mergePlayers = (players: Player[]): Player[] => {
  const playerMap = new Map<string, Player>()

  for (const player of players) {
    const existing = playerMap.get(player.id)

    if (!existing) {
      playerMap.set(player.id, player)
      continue
    }

    playerMap.set(player.id, {
      ...existing,
      ...player,
      name: player.name.includes('Pitcher ') || player.name.includes('Batter ') ? existing.name : player.name,
      pitchArsenal: Array.from(new Set([...(existing.pitchArsenal ?? []), ...(player.pitchArsenal ?? [])])),
      pitchCount: Math.max(existing.pitchCount ?? 0, player.pitchCount ?? 0) || undefined,
      pitchesSeen: Math.max(existing.pitchesSeen ?? 0, player.pitchesSeen ?? 0) || undefined,
      plateAppearances: Math.max(existing.plateAppearances ?? 0, player.plateAppearances ?? 0) || undefined
    })
  }

  return [...playerMap.values()]
}

const getLocation = (row: CsvRow): { x: number; y: number } | null => {
  const plateX = toNumber(row.plate_x)
  const plateZ = toNumber(row.plate_z)

  if (plateX === null || plateZ === null) {
    return null
  }

  return {
    x: plateX,
    y: plateZ
  }
}

export const parseBaseballSavantCsv = (csv: string, sourceType: SavantPlayerType = 'pitcher'): BaseballSavantDataset => {
  const rows = parseCsv(csv).filter((row) => toPitchType(row.pitch_type) && toCount(row) && toZoneId(row))
  const pitcherGroups = new Map<string, CsvRow[]>()
  const batterGroups = new Map<string, CsvRow[]>()

  for (const row of rows) {
    if (row.pitcher) {
      pitcherGroups.set(row.pitcher, [...(pitcherGroups.get(row.pitcher) ?? []), row])
    }

    if (row.batter) {
      batterGroups.set(row.batter, [...(batterGroups.get(row.batter) ?? []), row])
    }
  }

  const pitchers = [...pitcherGroups.values()].map((group) => makePitcher(group[0], group))
  const batters = [...batterGroups.values()].map((group) => makeBatter(group[0], group, sourceType))
  const totalByCountPitch = new Map<string, number>()
  const groupMap = new Map<string, CsvRow[]>()

  for (const row of rows) {
    const count = toCount(row)
    const pitchType = toPitchType(row.pitch_type)
    const zoneId = toZoneId(row)

    if (!count || !pitchType || !zoneId) {
      continue
    }

    const pitcherId = getPitcherId(row)
    const totalKey = `${pitcherId}|${count}|${pitchType}`
    const groupKey = `${pitcherId}|${count}|${pitchType}|${zoneId}`
    totalByCountPitch.set(totalKey, (totalByCountPitch.get(totalKey) ?? 0) + 1)
    groupMap.set(groupKey, [...(groupMap.get(groupKey) ?? []), row])
  }

  const zones: ZoneProbability[] = [...groupMap.entries()].map(([key, group]) => {
    const [pitcherId, count, pitchType, zoneId] = key.split('|') as [string, CountState, PitchType, ZoneId]
    const batterIds = Array.from(new Set(group.map((row) => getBatterId(row))))
    const sampleLocations = group.map(getLocation).filter((location): location is { x: number; y: number } => Boolean(location))
    const total = totalByCountPitch.get(`${pitcherId}|${count}|${pitchType}`) ?? group.length
    const swings = group.filter((row) => isSwing(row.description)).length
    const whiffs = group.filter((row) => isWhiff(row.description)).length
    const hits = group.filter((row) => isHit(row.events)).length
    const homeRuns = group.filter((row) => row.events === 'home_run').length
    const ballsInPlay = group.filter((row) => row.description === 'hit_into_play').length
    const pitchProbability = group.length / total
    const hitProbability = hits / Math.max(ballsInPlay, group.length)
    const homeRunProbability = homeRuns / Math.max(hits, group.length)
    const whiffProbability = whiffs / Math.max(swings, 1)
    const swingProbability = swings / group.length
    const battingAverage = hits / Math.max(ballsInPlay, group.length)
    const pressureValue = Math.round(clamp(pitchProbability + whiffProbability * 0.8 + (1 - hitProbability) * 0.45) * 100)
    const riskValue = Math.round(clamp(hitProbability * 0.9 + homeRunProbability * 1.3 + (1 - pitchProbability) * 0.2) * 100)

    return {
      pitcherId,
      batterId: batterIds.length === 1 ? batterIds[0] : undefined,
      count: count as CountState,
      pitchType: pitchType as PitchType,
      zoneId,
      pitchProbability,
      battingAverage,
      hitProbability,
      homeRunProbability,
      swingProbability,
      whiffProbability,
      pressureValue,
      riskValue,
      sampleLocations
    }
  })

  return {
    pitchers,
    batters,
    zones,
    rowCount: rows.length
  }
}

export const mergeBaseballSavantDatasets = (...datasets: BaseballSavantDataset[]): BaseballSavantDataset => {
  return {
    pitchers: mergePlayers(datasets.flatMap((dataset) => dataset.pitchers)),
    batters: mergePlayers(datasets.flatMap((dataset) => dataset.batters)),
    zones: datasets.flatMap((dataset) => dataset.zones),
    rowCount: datasets.reduce((sum, dataset) => sum + dataset.rowCount, 0)
  }
}
