interface PressureInput {
  pitchProbability: number
  hitProbability: number
  homeRunProbability: number
  whiffProbability: number
}

const clamp = (value: number, min: number, max: number): number => {
  return Math.min(Math.max(value, min), max)
}

export const calculatePressureValue = ({
  pitchProbability,
  hitProbability,
  homeRunProbability,
  whiffProbability
}: PressureInput): number => {
  const commandScore = pitchProbability * 35 + whiffProbability * 45
  const damagePenalty = hitProbability * 30 + homeRunProbability * 90

  return Math.round(clamp(50 + commandScore - damagePenalty, 0, 100))
}
