import type { PitchType } from './pitch'

export type CountState =
  | '0-0'
  | '0-1'
  | '0-2'
  | '1-0'
  | '1-1'
  | '1-2'
  | '2-0'
  | '2-1'
  | '2-2'
  | '3-0'
  | '3-1'
  | '3-2'

export type ZoneId =
  | 'high-in'
  | 'high-middle'
  | 'high-away'
  | 'middle-in'
  | 'middle-middle'
  | 'middle-away'
  | 'low-in'
  | 'low-middle'
  | 'low-away'

export type ZoneDataQuality = 'observed' | 'predicted' | 'mixed'

export interface ZoneProbability {
  pitcherId?: string
  batterId?: string
  count: CountState
  pitchType: PitchType
  zoneId: ZoneId
  pitchProbability: number
  battingAverage: number
  hitProbability: number
  homeRunProbability: number
  swingProbability: number
  whiffProbability: number
  pressureValue: number
  riskValue: number
  dataQuality?: ZoneDataQuality
  sampleLocations?: Array<{
    x: number
    y: number
  }>
}

export const zoneRows: ZoneId[][] = [
  ['high-in', 'high-middle', 'high-away'],
  ['middle-in', 'middle-middle', 'middle-away'],
  ['low-in', 'low-middle', 'low-away']
]

export const zoneLabels: Record<ZoneId, string> = {
  'high-in': '상단 몸쪽',
  'high-middle': '상단 중앙',
  'high-away': '상단 바깥쪽',
  'middle-in': '중단 몸쪽',
  'middle-middle': '중앙',
  'middle-away': '중단 바깥쪽',
  'low-in': '하단 몸쪽',
  'low-middle': '하단 중앙',
  'low-away': '하단 바깥쪽'
}

export const countStates: CountState[] = [
  '0-0',
  '0-1',
  '0-2',
  '1-0',
  '1-1',
  '1-2',
  '2-0',
  '2-1',
  '2-2',
  '3-0',
  '3-1',
  '3-2'
]
