import type { Player } from '../models/player'
import type { PitchType } from '../models/pitch'
import type { CountState, ZoneId, ZoneProbability } from '../models/zone'

export type PlateAppearanceResult = 'out' | 'hit' | 'homeRun' | 'walk' | 'hitByPitch' | 'strikeOut'
export type BatterAction = 'take' | 'swing'
export type PitchResult =
  | 'ball'
  | 'calledStrike'
  | 'swingingStrike'
  | 'foul'
  | 'inPlayOut'
  | 'hit'
  | 'homeRun'
  | 'hitByPitch'

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
  hitByPitchProbability: number
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

interface SimulationContext {
  pitcher?: Player | null
  batter?: Player | null
}

const maxPitchesPerPlateAppearance = 12

export const clampProbability = (value: number): number => Math.min(Math.max(value, 0), 1)

const clampRange = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)
const toMphEquivalent = (velocity: number): number => (velocity > 120 ? velocity / 1.609344 : velocity)

const getPitcherSkill = (pitcher?: Player | null): number => {
  if (!pitcher) {
    return 0.52
  }

  const velocity = toMphEquivalent(pitcher.averageVelocity ?? 91)
  const arsenal = pitcher.pitchArsenal?.length ?? 2
  const volume = Math.min(Math.log10((pitcher.pitchCount ?? 0) + 10) / 4, 1)
  const skill = (velocity - 87) / 16 * 0.44 + Math.min(arsenal, 6) / 6 * 0.28 + volume * 0.28

  return clampRange(skill, 0.18, 0.92)
}

const getBatterSkill = (batter?: Player | null): number => {
  if (!batter) {
    return 0.52
  }

  const discipline = batter.disciplineScore ?? 50
  const aggression = batter.aggressionScore ?? 50
  const volume = Math.min(Math.log10((batter.pitchesSeen ?? batter.plateAppearances ?? 0) + 10) / 4, 1)
  const strength = (batter.strongZones?.length ?? 0) * 0.035
  const weakness = (batter.weakZones?.length ?? 0) * 0.018 + (batter.weakPitchTypes?.length ?? 0) * 0.024
  const skill = discipline / 100 * 0.42 + aggression / 100 * 0.22 + volume * 0.28 + strength - weakness

  return clampRange(skill, 0.18, 0.95)
}

export const weightedRandomZone = (zones: ZoneProbability[], context: SimulationContext = {}): ZoneProbability => {
  const pitcherSkill = getPitcherSkill(context.pitcher)
  const selectionExponent = clampRange(0.62 + pitcherSkill * 0.72, 0.56, 1.28)
  const totalWeight = zones.reduce((sum, zone) => sum + Math.pow(Math.max(zone.pitchProbability, 0.012), selectionExponent), 0)

  if (totalWeight <= 0) {
    return zones[Math.floor(Math.random() * zones.length)]
  }

  let cursor = Math.random() * totalWeight

  for (const zone of zones) {
    cursor -= Math.pow(Math.max(zone.pitchProbability, 0.012), selectionExponent)

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
    return Math.random() < 0.54 ? plannedPitchType : preferredPitchType
  }

  const countMatches = zones.filter((zone) => zone.count === count)
  const availableZones = countMatches.length > 0 ? countMatches : zones
  const pitchUsage = new Map<PitchType, number>()

  for (const zone of availableZones) {
    const preferredBoost = zone.pitchType === preferredPitchType ? 1.18 : 1
    pitchUsage.set(zone.pitchType, (pitchUsage.get(zone.pitchType) ?? 0) + Math.max(zone.pitchProbability, 0.01) * preferredBoost)
  }

  const totalUsage = [...pitchUsage.values()].reduce((sum, value) => sum + value, 0)
  let cursor = Math.random() * totalUsage

  for (const [pitchType, weight] of pitchUsage.entries()) {
    cursor -= weight

    if (cursor <= 0) {
      return pitchType
    }
  }

  return availableZones[0]?.pitchType ?? preferredPitchType
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

const getPitchInZoneProbability = (zone: ZoneProbability, balls: number, strikes: number, context: SimulationContext): number => {
  const pitcherSkill = getPitcherSkill(context.pitcher)
  const breakingPenalty = ['SL', 'CH', 'CU', 'FS', 'ST', 'SV', 'KC'].includes(zone.pitchType) ? 0.08 : 0
  const countAdjustment =
    balls >= 3 ? 0.16 : balls > strikes ? 0.05 : strikes >= 2 ? -0.16 : balls === 0 && strikes === 0 ? -0.03 : -0.05
  const commandSignal = (zone.pressureValue - zone.riskValue) / 820
  const skillSignal = (pitcherSkill - 0.5) * 0.22

  return clampRange(0.53 + commandSignal + skillSignal + countAdjustment - breakingPenalty, 0.28, 0.78)
}

const getBatterSwingProbability = (
  zone: ZoneProbability,
  isInZone: boolean,
  balls: number,
  strikes: number,
  context: SimulationContext
): number => {
  const batter = context.batter
  const batterSkill = getBatterSkill(batter)
  const discipline = (batter?.disciplineScore ?? 50) / 100
  const aggression = (batter?.aggressionScore ?? 50) / 100
  const countAdjustment = strikes >= 2 ? 0.05 : balls >= 3 ? -0.14 : balls > strikes ? -0.09 : 0
  const zoneSwing = zone.swingProbability * (0.86 + aggression * 0.42)
  const chaseControl = 0.42 - discipline * 0.26 - batterSkill * 0.1
  const locationMultiplier = isInZone ? 1.04 : clampRange(chaseControl, 0.1, 0.34)

  return clampRange(zoneSwing * locationMultiplier + countAdjustment, isInZone ? 0.25 : 0.04, isInZone ? 0.84 : 0.34)
}

const getHitByPitchProbability = (zone: ZoneProbability, isInZone: boolean): number => {
  if (isInZone) {
    return 0
  }

  const velocityRisk = ['FF', 'SI', 'FC'].includes(zone.pitchType) ? 0.003 : 0

  return clampProbability(0.002 + velocityRisk + zone.riskValue / 9000)
}

const getTerminalCountAfter = (result: PlateAppearanceResult): `결과: ${string}` => {
  const labelByResult: Record<PlateAppearanceResult, string> = {
    out: '아웃',
    hit: '안타',
    homeRun: '홈런',
    walk: '볼넷',
    hitByPitch: '몸에 맞는 공',
    strikeOut: '삼진'
  }

  return `결과: ${labelByResult[result]}`
}

export const simulateSinglePlateAppearance = (
  allZones: ZoneProbability[],
  preferredPitchType: PitchType = 'FF',
  context: SimulationContext = {}
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
    const zone = weightedRandomZone(zonesForTurn, context)
    const pitcherSkill = getPitcherSkill(context.pitcher)
    const batterSkill = getBatterSkill(context.batter)
    const matchupEdge = batterSkill - pitcherSkill
    const isInZone = Math.random() < getPitchInZoneProbability(zone, balls, strikes, context)
    const batterAction: BatterAction = Math.random() < getBatterSwingProbability(zone, isInZone, balls, strikes, context) ? 'swing' : 'take'
    let pitchResult: PitchResult
    let plateAppearanceResult: PlateAppearanceResult | null = null

    pressureTotal += zone.pressureValue
    riskTotal += zone.riskValue

    if (!isInZone && Math.random() < getHitByPitchProbability(zone, isInZone)) {
      pitchResult = 'hitByPitch'
      plateAppearanceResult = 'hitByPitch'
    } else if (batterAction === 'swing') {
      const chasePenalty = isInZone ? 1 : 0.48
      const whiffBoost = isInZone ? 1 : 1.28
      const strongZone = context.batter?.strongZones?.includes(zone.zoneId) ? 0.055 : 0
      const weakZone = context.batter?.weakZones?.includes(zone.zoneId) ? -0.05 : 0
      const weakPitch = context.batter?.weakPitchTypes?.includes(zone.pitchType) ? -0.055 : 0
      const whiffProbability = clampProbability(zone.whiffProbability * whiffBoost + pitcherSkill * 0.11 - batterSkill * 0.18 - strongZone - weakPitch)
      const hitProbability = clampProbability(0.18 + zone.hitProbability * 0.55 + matchupEdge * 0.22 + strongZone + weakZone + weakPitch)
      const homeRunProbability = clampProbability(0.018 + zone.homeRunProbability * 0.7 + matchupEdge * 0.045 + strongZone * 0.35)

      if (Math.random() < whiffProbability) {
        pitchResult = 'swingingStrike'
        strikes += 1
      } else if (Math.random() < homeRunProbability * chasePenalty) {
        pitchResult = 'homeRun'
        plateAppearanceResult = 'homeRun'
      } else if (Math.random() < hitProbability * chasePenalty) {
        pitchResult = 'hit'
        plateAppearanceResult = 'hit'
      } else if (Math.random() < clampRange(0.34 + batterSkill * 0.16, 0.34, 0.49)) {
        pitchResult = 'foul'

        if (strikes < 2) {
          strikes += 1
        }
      } else {
        pitchResult = 'inPlayOut'
        plateAppearanceResult = 'out'
      }
    } else if (isInZone) {
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
  totalRuns = 10000,
  context: SimulationContext = {}
): SimulationSummary => {
  if (allZones.length === 0 || totalRuns <= 0) {
    return {
      totalRuns: 0,
      outProbability: 0,
      onBaseProbability: 0,
      hitProbability: 0,
      homeRunProbability: 0,
      walkProbability: 0,
      hitByPitchProbability: 0,
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
  let hitByPitches = 0
  let strikeOuts = 0
  let pitchTotal = 0
  let pressureTotal = 0
  let riskTotal = 0
  let sampleTurns: PitchTurnResult[] = []

  for (let run = 0; run < totalRuns; run += 1) {
    const plateAppearance = simulateSinglePlateAppearance(allZones, preferredPitchType, context)

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

    if (plateAppearance.result === 'hitByPitch') {
      hitByPitches += 1
    }

    if (plateAppearance.result === 'strikeOut') {
      strikeOuts += 1
    }
  }

  return {
    totalRuns,
    outProbability: outs / totalRuns,
    onBaseProbability: (hits + walks + hitByPitches) / totalRuns,
    hitProbability: hits / totalRuns,
    homeRunProbability: homeRuns / totalRuns,
    walkProbability: walks / totalRuns,
    hitByPitchProbability: hitByPitches / totalRuns,
    strikeOutProbability: strikeOuts / totalRuns,
    averagePitchCount: pitchTotal / totalRuns,
    averagePressureValue: pressureTotal / Math.max(pitchTotal, 1),
    averageRiskValue: riskTotal / Math.max(pitchTotal, 1),
    sampleTurns
  }
}
