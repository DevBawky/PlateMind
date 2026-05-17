import type { Player } from '../models/player'
import type { PitchType } from '../models/pitch'
import { countStates, zoneRows } from '../models/zone'
import type { CountState, ZoneId, ZoneProbability } from '../models/zone'

export interface BehaviorPrediction {
  label: string
  confidence: number
  description: string
  tags: string[]
}

export interface PredictedMatchupModel {
  zones: ZoneProbability[]
  pitcherBehavior: BehaviorPrediction
  batterBehavior: BehaviorPrediction
  observedZoneCount: number
  predictedZoneCount: number
}

const defaultPitchTypes: PitchType[] = ['FF', 'SL', 'CH']
const allZoneIds = zoneRows.flat()

const clamp = (value: number, min = 0, max = 1): number => Math.min(Math.max(value, min), max)
const clampScore = (value: number): number => Math.round(Math.min(Math.max(value, 1), 99))
const toMphEquivalent = (velocity: number): number => (velocity > 120 ? velocity / 1.609344 : velocity)

const average = (values: number[]): number => {
  if (values.length === 0) {
    return 0
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length
}

const hasBreakingPitch = (pitchTypes: PitchType[]): boolean => {
  return pitchTypes.some((pitchType) => ['SL', 'CU', 'ST', 'SV', 'KC'].includes(pitchType))
}

const getPitchTypesForPrediction = (pitcher: Player | null, zones: ZoneProbability[]): PitchType[] => {
  const observed = Array.from(new Set(zones.map((zone) => zone.pitchType)))
  const arsenal = pitcher?.pitchArsenal ?? []
  const combined = Array.from(new Set([...arsenal, ...observed]))

  return combined.length > 0 ? combined : defaultPitchTypes
}

export const predictPitcherBehavior = (pitcher: Player | null, zones: ZoneProbability[]): BehaviorPrediction => {
  const pitchTypes = getPitchTypesForPrediction(pitcher, zones)
  const averageVelocity = toMphEquivalent(pitcher?.averageVelocity ?? 146.5)
  const whiffRate = average(zones.map((zone) => zone.whiffProbability))
  const pressure = average(zones.map((zone) => zone.pressureValue))
  const risk = average(zones.map((zone) => zone.riskValue))
  const sampleSize = pitcher?.pitchCount ?? zones.reduce((sum, zone) => sum + (zone.sampleLocations?.length ?? 0), 0)

  let label = '균형형 운용'
  const tags = new Set<string>(pitcher?.tags ?? [])

  if (averageVelocity >= 95 || pitchTypes.includes('FF') && whiffRate >= 0.28) {
    label = '파워 피처'
    tags.add('Power')
  } else if (hasBreakingPitch(pitchTypes) && pitchTypes.length >= 3) {
    label = '변화구 조합형'
    tags.add('Breaking')
  } else if (risk <= 38 && pressure >= 55) {
    label = '제구 안정형'
    tags.add('Control')
  }

  const confidence = clamp(0.46 + Math.min(sampleSize, 260) / 650 + zones.length / 540, 0.38, 0.88)

  return {
    label,
    confidence,
    description:
      zones.length > 0
        ? '실제 투구 위치를 우선 반영하고, 부족한 카운트는 구종 구성과 압박/위험 패턴으로 보정했습니다.'
        : '실제 위치 데이터가 부족해 보유 구종, 구속, 기본 투구 성향을 기준으로 행동 유형을 추정했습니다.',
    tags: Array.from(tags).slice(0, 4)
  }
}

export const predictBatterBehavior = (batter: Player | null, zones: ZoneProbability[]): BehaviorPrediction => {
  const aggression = batter?.aggressionScore ?? (average(zones.map((zone) => zone.swingProbability * 100)) || 52)
  const discipline = batter?.disciplineScore ?? 100 - aggression
  const powerSignal = average(zones.map((zone) => zone.homeRunProbability)) * 100
  const hitSignal = average(zones.map((zone) => zone.hitProbability)) * 100
  const sampleSize = batter?.pitchesSeen ?? batter?.plateAppearances ?? 0

  let label = '균형형 타자'
  const tags = new Set<string>(batter?.tags ?? [])

  if (powerSignal >= 4.8 || tags.has('Power')) {
    label = '장타 위협형'
    tags.add('Power')
  } else if (aggression >= 58) {
    label = '적극 공략형'
    tags.add('Aggressive')
  } else if (discipline >= 55) {
    label = '선구안형'
    tags.add('Patient')
  } else if (hitSignal >= 24) {
    label = '컨택 중심형'
    tags.add('Contact')
  }

  const confidence = clamp(0.42 + Math.min(sampleSize, 220) / 680 + zones.length / 650, 0.35, 0.84)

  return {
    label,
    confidence,
    description:
      zones.length > 0
        ? '투수 분포에 타자의 스윙 성향과 강약 구역을 결합해 타석 반응을 추정했습니다.'
        : '타자별 관측 데이터가 부족해 스윙 적극성, 선구안, 강약 구역을 기본값으로 예측했습니다.',
    tags: Array.from(tags).slice(0, 4)
  }
}

const pitchUsageWeight = (pitchType: PitchType, pitcher: Player | null, behavior: BehaviorPrediction): number => {
  const primaryBoost = pitcher?.primaryPitch === pitchType ? 1.34 : 1
  const arsenalIndex = pitcher?.pitchArsenal?.indexOf(pitchType) ?? -1
  const arsenalBoost = arsenalIndex >= 0 ? 1.22 - arsenalIndex * 0.07 : 0.82
  const powerBoost = behavior.label === '파워 피처' && ['FF', 'SI', 'FC'].includes(pitchType) ? 1.18 : 1
  const breakingBoost = behavior.label === '변화구 조합형' && ['SL', 'CU', 'ST', 'SV', 'KC'].includes(pitchType) ? 1.18 : 1

  return Math.max(0.36, primaryBoost * arsenalBoost * powerBoost * breakingBoost)
}

const countAggression = (count: CountState): number => {
  const [balls, strikes] = count.split('-').map(Number)

  if (strikes === 2) {
    return 1.18
  }

  if (balls >= 3) {
    return 0.82
  }

  if (balls > strikes) {
    return 0.92
  }

  return 1
}

const zoneWeight = (
  zoneId: ZoneId,
  pitchType: PitchType,
  pitcherBehavior: BehaviorPrediction,
  batter: Player | null
): number => {
  const baseByZone: Record<ZoneId, number> = {
    'high-in': 0.9,
    'high-middle': 0.78,
    'high-away': 0.95,
    'middle-in': 1.05,
    'middle-middle': 0.86,
    'middle-away': 1.16,
    'low-in': 0.94,
    'low-middle': 1,
    'low-away': 1.24
  }
  const fastballHighBoost = ['FF', 'SI', 'FC'].includes(pitchType) && zoneId.startsWith('high') ? 1.16 : 1
  const breakingLowBoost = ['SL', 'CU', 'ST', 'SV', 'KC', 'CH', 'FS'].includes(pitchType) && zoneId.startsWith('low') ? 1.2 : 1
  const controlBoost = pitcherBehavior.label === '제구 안정형' && zoneId.includes('away') ? 1.12 : 1
  const avoidsBatterStrength = batter?.strongZones?.includes(zoneId) ? 0.82 : 1
  const attacksWeakness = batter?.weakZones?.includes(zoneId) ? 1.18 : 1

  return baseByZone[zoneId] * fastballHighBoost * breakingLowBoost * controlBoost * avoidsBatterStrength * attacksWeakness
}

const predictZoneMetric = (
  zoneId: ZoneId,
  pitchType: PitchType,
  count: CountState,
  pitcher: Player | null,
  batter: Player | null,
  pitcherBehavior: BehaviorPrediction,
  batterBehavior: BehaviorPrediction,
  pitchProbability: number
): Omit<ZoneProbability, 'count' | 'pitchType' | 'zoneId' | 'pitchProbability'> => {
  const velocity = toMphEquivalent(pitcher?.averageVelocity ?? 146.5)
  const aggression = batter?.aggressionScore ?? (batterBehavior.label === '적극 공략형' ? 62 : 50)
  const discipline = batter?.disciplineScore ?? (batterBehavior.label === '선구안형' ? 60 : 50)
  const weakPitch = batter?.weakPitchTypes?.includes(pitchType) ? 0.9 : 1
  const strongZone = batter?.strongZones?.includes(zoneId) ? 1.3 : 1
  const weakZone = batter?.weakZones?.includes(zoneId) ? 0.72 : 1
  const batterSkill = Math.min(Math.max(discipline * 0.5 + aggression * 0.28 + (batter?.strongZones?.length ?? 0) * 4 - (batter?.weakPitchTypes?.length ?? 0) * 2, 20), 90)
  const skillDelta = (batterSkill - 55) / 100
  const putAwayCount = count.endsWith('-2') ? 1.12 : 1
  const hitterCount = count.startsWith('2-') || count.startsWith('3-') ? 1.08 : 1
  const powerPitch = ['FF', 'SI', 'FC'].includes(pitchType) ? 1.04 : 1
  const chasePitch = ['SL', 'CH', 'CU', 'FS', 'ST', 'SV', 'KC'].includes(pitchType) ? 1.1 : 1
  const pitcherPressureBonus = pitcherBehavior.confidence > 0.7 ? 0.012 : 0

  const swingProbability = clamp((0.43 + (aggression - 50) / 150 - (discipline - 50) / 280) * hitterCount * countAggression(count))
  const whiffProbability = clamp((0.19 + pitcherPressureBonus + (velocity - 90) / 110 + (chasePitch - 1) * 0.32 - skillDelta * 0.2) * putAwayCount * weakPitch)
  const hitProbability = clamp((0.19 + skillDelta * 0.22 + (aggression - discipline) / 1200) * strongZone * weakZone * weakPitch * hitterCount)
  const homeRunProbability = clamp((0.026 + skillDelta * 0.04 + (velocity - 90) / 900) * strongZone * powerPitch * (batterBehavior.label === '장타 위협형' ? 1.34 : 1))
  const battingAverage = clamp(hitProbability * (0.88 + swingProbability * 0.3))
  const pressureValue = clampScore(45 + whiffProbability * 72 + pitchProbability * 48 - hitProbability * 34)
  const riskValue = clampScore(30 + hitProbability * 80 + homeRunProbability * 120 + (discipline - 50) * 0.28 - pitchProbability * 18)

  return {
    pitcherId: pitcher?.id,
    batterId: batter?.id,
    battingAverage,
    hitProbability,
    homeRunProbability,
    swingProbability,
    whiffProbability,
    pressureValue,
    riskValue,
    dataQuality: 'predicted'
  }
}

export const buildPredictedMatchupModel = (
  observedZones: ZoneProbability[],
  pitcher: Player | null,
  batter: Player | null,
  selectedPitchTypes?: PitchType[]
): PredictedMatchupModel => {
  const pitcherBehavior = predictPitcherBehavior(pitcher, observedZones)
  const batterBehavior = predictBatterBehavior(batter, observedZones)
  const pitchTypes = selectedPitchTypes && selectedPitchTypes.length > 0 ? selectedPitchTypes : getPitchTypesForPrediction(pitcher, observedZones)
  const observedByKey = new Map<string, ZoneProbability>()

  for (const zone of observedZones) {
    observedByKey.set(`${zone.count}|${zone.pitchType}|${zone.zoneId}`, {
      ...zone,
      dataQuality: zone.dataQuality ?? 'observed'
    })
  }

  const zones: ZoneProbability[] = []
  let predictedZoneCount = 0

  for (const count of countStates) {
    for (const pitchType of pitchTypes) {
      const rawWeights = allZoneIds.map((zoneId) => {
        return zoneWeight(zoneId, pitchType, pitcherBehavior, batter) * pitchUsageWeight(pitchType, pitcher, pitcherBehavior)
      })
      const totalWeight = rawWeights.reduce((sum, value) => sum + value, 0)

      allZoneIds.forEach((zoneId, index) => {
        const key = `${count}|${pitchType}|${zoneId}`
        const observed = observedByKey.get(key)

        if (observed) {
          zones.push(observed)
          return
        }

        const pitchProbability = clamp((rawWeights[index] / Math.max(totalWeight, 1)) * countAggression(count), 0.025, 0.24)

        zones.push({
          count,
          pitchType,
          zoneId,
          pitchProbability,
          ...predictZoneMetric(
            zoneId,
            pitchType,
            count,
            pitcher,
            batter,
            pitcherBehavior,
            batterBehavior,
            pitchProbability
          )
        })
        predictedZoneCount += 1
      })
    }
  }

  return {
    zones,
    pitcherBehavior,
    batterBehavior,
    observedZoneCount: observedZones.length,
    predictedZoneCount
  }
}
