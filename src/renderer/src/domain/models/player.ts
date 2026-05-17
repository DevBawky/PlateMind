import type { PitchType } from './pitch'
import type { ZoneId } from './zone'

export type PlayerRole = 'pitcher' | 'batter'

export interface Player {
  id: string
  name: string
  role: PlayerRole
  team: string
  handedness: 'R' | 'L'
  pitchArsenal?: PitchType[]
  pitchCount?: number
  plateAppearances?: number
  pitchesSeen?: number
  averageVelocity?: number
  primaryPitch?: PitchType
  tags?: string[]
  strongZones?: ZoneId[]
  weakZones?: ZoneId[]
  weakPitchTypes?: PitchType[]
  aggressionScore?: number
  disciplineScore?: number
}
