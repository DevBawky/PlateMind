export type PitchType =
  | 'FF'
  | 'SL'
  | 'CH'
  | 'CU'
  | 'SI'
  | 'FS'
  | 'FC'
  | 'ST'
  | 'SV'
  | 'KC'
  | 'KN'
  | 'EP'
  | 'FO'
  | 'SC'

export interface PitchProfile {
  pitchType: PitchType
  usageRate: number
  averageVelocity: number
}
