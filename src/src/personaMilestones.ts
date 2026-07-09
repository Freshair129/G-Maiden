export const LEVEL_UP_MILESTONES = [6, 12, 18, 25] as const

export function crossedLevelUpMilestones(prevLevel: number, nextLevel: number): number[] {
  if (nextLevel <= prevLevel) return []
  return LEVEL_UP_MILESTONES.filter((milestone) => prevLevel < milestone && milestone <= nextLevel)
}

export function crossedAnyLevelUpMilestone(prevLevel: number, nextLevel: number): boolean {
  return crossedLevelUpMilestones(prevLevel, nextLevel).length > 0
}
