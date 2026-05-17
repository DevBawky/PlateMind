import type { PitchType } from '../models/pitch'
import type { CountState, ZoneId, ZoneProbability } from '../models/zone'

export type PlateAppearanceResult = 'out' | 'hit' | 'homeRun' | 'walk' | 'strikeOut'
export type BatterAction = 'take' | 'swing'
export type PitchResult =
  | 'ball'
  | 'calledStrike'
  | 'swingingStrike'
  | 'foul'
  | 'inPlayOut'
  | 'hit'
  | 'homeRun'

export interface PitchTurnResult {
  pitchNumber: number
  countBefore: CountState
  pitchType: PitchType
  zoneId: ZoneId
  batterAction: BatterAction
  pitchResult: PitchResult
  countAfter: CountState | `결과: ${string}`
  pressureValue: number
  riskValue: number
}

export interface SimulationSummary {
  totalRuns: number
  outProbability: number
  onBaseProbability: number
  hitProbability: number
  homeRunProbability: number
  walkProbability: number
  strikeOutProbability: number
  averagePitchCount: number
  averagePressureValue: number
  averageRiskValue: number
  sampleTurns: PitchTurnResult[]
}

interface PlateAppearanceSimulation {
  result: PlateAppearanceResult
  turns: PitchTurnResult[]
  pressureTotal: number
  riskTotal: number
  pitchCount: number
}

const maxPitchesPerPlateAppearance = 12

export const clampProbability = (value: number): number => Math.min(Math.max(value, 0), 1)

export const weightedRandomZone = (zones: ZoneProbability[]): ZoneProbability => {
  const totalWeight = zones.reduce((sum, zone) => sum + Math.max(zone.pitchProbability, 0), 0)

  if (totalWeight <= 0) {
    return zones[Math.floor(Math.random() * zones.length)]
  }

  let cursor = Math.random() * totalWeight

  for (const zone of zones) {
    cursor -= Math.max(zone.pitchProbability, 0)

    if (cursor <= 0) {
      return zone
    }
  }

  return zones[zones.length - 1]
}

const toCountState = (balls: number, strikes: number): CountState => {
  return `${Math.min(balls, 3)}-${Math.min(strikes, 2)}` as CountState
}

const hasDataFor = (zones: ZoneProbability[], count: CountState, pitchType: PitchType): boolean => {
  return zones.some((zone) => zone.count === count && zone.pitchType === pitchType)
}

export const choosePitchTypeForCount = (
  count: CountState,
  zones: ZoneProbability[],
  preferredPitchType: PitchType
): PitchType => {
  if (hasDataFor(zones, count, preferredPitchType)) {
    return preferredPitchType
  }

  const countPlan: Partial<Record<CountState, PitchType[]>> = {
    '0-0': ['FF', 'SI', 'FC'],
    '0-2': ['SL', 'CH', 'CU', 'FS', 'ST'],
    '2-1': ['CH', 'FF', 'SI'],
    '3-1': ['FF', 'SI', 'FC'],
    '3-2': Math.random() < 0.58 ? ['SL', 'FF', 'CH'] : ['FF', 'SL', 'SI']
  }
  const candidates = countPlan[count] ?? []
  const plannedPitchType = candidates.find((pitchType) => hasDataFor(zones, count, pitchType))

  if (plannedPitchType) {
    return plannedPitchType
  }

  const countMatch = zones.find((zone) => zone.count === count)

  return countMatch?.pitchType ?? zones[0]?.pitchType ?? 'FF'
}

const getZonesForTurn = (
  allZones: ZoneProbability[],
  count: CountState,
  pitchType: PitchType
): ZoneProbability[] => {
  const exactMatch = allZones.filter((zone) => zone.count === count && zone.pitchType === pitchType)

  if (exactMatch.length > 0) {
    return exactMatch
  }

  const countMatch = allZones.filter((zone) => zone.count === count)

  if (countMatch.length > 0) {
    return countMatch
  }

  const defaultMatch = allZones.filter((zone) => zone.count === '0-0')

  return defaultMatch.length > 0 ? defaultMatch : allZones
}

const getCalledStrikeProbability = (zone: ZoneProbability): number => {
  return clampProbability(0.48 + (zone.pressureValue - zone.riskValue) / 150)
}

const getTerminalCountAfter = (result: PlateAppearanceResult): `결과: ${string}` => {
  const labelByResult: Record<PlateAppearanceResult, string> = {
    out: '아웃',
    hit: '안타',
    homeRun: '홈런',
    walk: '볼넷',
    strikeOut: '삼진'
  }

  return `결과: ${labelByResult[result]}`
}

export const simulateSinglePlateAppearance = (
  allZones: ZoneProbability[],
  preferredPitchType: PitchType = 'FF'
): PlateAppearanceSimulation => {
  let balls = 0
  let strikes = 0
  let pressureTotal = 0
  let riskTotal = 0
  const turns: PitchTurnResult[] = []

  for (let pitchNumber = 1; pitchNumber <= maxPitchesPerPlateAppearance; pitchNumber += 1) {
    const countBefore = toCountState(balls, strikes)
    const pitchType = choosePitchTypeForCount(countBefore, allZones, preferredPitchType)
    const zonesForTurn = getZonesForTurn(allZones, countBefore, pitchType)
    const zone = weightedRandomZone(zonesForTurn)
    const batterAction: BatterAction = Math.random() < clampProbability(zone.swingProbability) ? 'swing' : 'take'
    let pitchResult: PitchResult
    let plateAppearanceResult: PlateAppearanceResult | null = null

    pressureTotal += zone.pressureValue
    riskTotal += zone.riskValue

    if (batterAction === 'swing') {
      if (Math.random() < clampProbability(zone.whiffProbability)) {
        pitchResult = 'swingingStrike'
        strikes += 1
      } else if (Math.random() < clampProbability(zone.homeRunProbability)) {
        pitchResult = 'homeRun'
        plateAppearanceResult = 'homeRun'
      } else if (Math.random() < clampProbability(zone.hitProbability)) {
        pitchResult = 'hit'
        plateAppearanceResult = 'hit'
      } else if (Math.random() < 0.42) {
        pitchResult = 'foul'

        if (strikes < 2) {
          strikes += 1
        }
      } else {
        pitchResult = 'inPlayOut'
        plateAppearanceResult = 'out'
      }
    } else if (Math.random() < getCalledStrikeProbability(zone)) {
      pitchResult = 'calledStrike'
      strikes += 1
    } else {
      pitchResult = 'ball'
      balls += 1
    }

    if (!plateAppearanceResult && balls >= 4) {
      plateAppearanceResult = 'walk'
    }

    if (!plateAppearanceResult && strikes >= 3) {
      plateAppearanceResult = 'strikeOut'
    }

    const countAfter = plateAppearanceResult ? getTerminalCountAfter(plateAppearanceResult) : toCountState(balls, strikes)

    turns.push({
      pitchNumber,
      countBefore,
      pitchType,
      zoneId: zone.zoneId,
      batterAction,
      pitchResult,
      countAfter,
      pressureValue: zone.pressureValue,
      riskValue: zone.riskValue
    })

    if (plateAppearanceResult) {
      return {
        result: plateAppearanceResult,
        turns,
        pressureTotal,
        riskTotal,
        pitchCount: pitchNumber
      }
    }
  }

  const fallbackResult: PlateAppearanceResult = balls >= 3 ? 'walk' : 'out'
  const finalTurn = turns[turns.length - 1]

  if (finalTurn) {
    finalTurn.countAfter = getTerminalCountAfter(fallbackResult)
  }

  return {
    result: fallbackResult,
    turns,
    pressureTotal,
    riskTotal,
    pitchCount: turns.length
  }
}

export const runMonteCarloSimulation = (
  allZones: ZoneProbability[],
  preferredPitchType: PitchType = 'FF',
  totalRuns = 10000
): SimulationSummary => {
  if (allZones.length === 0 || totalRuns <= 0) {
    return {
      totalRuns: 0,
      outProbability: 0,
      onBaseProbability: 0,
      hitProbability: 0,
      homeRunProbability: 0,
      walkProbability: 0,
      strikeOutProbability: 0,
      averagePitchCount: 0,
      averagePressureValue: 0,
      averageRiskValue: 0,
      sampleTurns: []
    }
  }

  let outs = 0
  let hits = 0
  let homeRuns = 0
  let walks = 0
  let strikeOuts = 0
  let pitchTotal = 0
  let pressureTotal = 0
  let riskTotal = 0
  let sampleTurns: PitchTurnResult[] = []

  for (let run = 0; run < totalRuns; run += 1) {
    const plateAppearance = simulateSinglePlateAppearance(allZones, preferredPitchType)

    if (run === 0) {
      sampleTurns = plateAppearance.turns
    }

    pitchTotal += plateAppearance.pitchCount
    pressureTotal += plateAppearance.pressureTotal
    riskTotal += plateAppearance.riskTotal

    if (plateAppearance.result === 'out') {
      outs += 1
    }

    if (plateAppearance.result === 'hit' || plateAppearance.result === 'homeRun') {
      hits += 1
    }

    if (plateAppearance.result === 'homeRun') {
      homeRuns += 1
    }

    if (plateAppearance.result === 'walk') {
      walks += 1
    }

    if (plateAppearance.result === 'strikeOut') {
      strikeOuts += 1
    }
  }

  return {
    totalRuns,
    outProbability: outs / totalRuns,
    onBaseProbability: (hits + walks) / totalRuns,
    hitProbability: hits / totalRuns,
    homeRunProbability: homeRuns / totalRuns,
    walkProbability: walks / totalRuns,
    strikeOutProbability: strikeOuts / totalRuns,
    averagePitchCount: pitchTotal / totalRuns,
    averagePressureValue: pressureTotal / Math.max(pitchTotal, 1),
    averageRiskValue: riskTotal / Math.max(pitchTotal, 1),
    sampleTurns
  }
}
