import { describe, expect, it } from "vitest";
import { crossedAnyLevelUpMilestone, crossedLevelUpMilestones } from "../personaMilestones";

describe("persona milestones", () => {
  it("fires on direct milestone hits", () => {
    expect(crossedAnyLevelUpMilestone(5, 6)).toBe(true);
    expect(crossedLevelUpMilestones(5, 6)).toEqual([6]);
  });

  it("fires when a milestone is skipped over", () => {
    expect(crossedAnyLevelUpMilestone(11, 13)).toBe(true);
    expect(crossedLevelUpMilestones(11, 13)).toEqual([12]);
  });

  it("stays silent when no milestone is crossed", () => {
    expect(crossedAnyLevelUpMilestone(13, 17)).toBe(false);
    expect(crossedLevelUpMilestones(13, 17)).toEqual([]);
  });

  it("returns every crossed milestone for large jumps", () => {
    expect(crossedLevelUpMilestones(5, 19)).toEqual([6, 12, 18]);
  });
});
