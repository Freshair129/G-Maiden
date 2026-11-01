import type { CompanionData } from "../companion";
import { prettyHeroName } from "./events";

export function heroSlotStatus(hero: CompanionData["heroes"][number] | undefined, cv: CompanionData["heroCv"]) {
  if (!hero || hero.hero === "—") return { label: "รอระบุฮีโร่", tone: "unknown" };
  if (hero.state === "dead") return { label: `ตาย · ${hero.timer} วิ`, tone: "dead" };
  if (hero.state === "missing") return { label: `หายจากสายตา · ${hero.timer} วิ`, tone: "missing" };
  if (hero.state === "visible") return { label: "มองเห็น", tone: "visible" };
  // Identity is not evidence of life or minimap visibility. HUD color is only a cue.
  if (cv.phase === "live" && cv.local && cv.roster && cv.hud) {
    const localTeam = cv.local.team;
    if (localTeam === "radiant" || localTeam === "dire") {
      const team = hero.team === "ally" ? localTeam : localTeam === "radiant" ? "dire" : "radiant";
      const slot = cv.roster[team].findIndex(name => name !== null && prettyHeroName(name) === hero.hero);
      const cue = slot >= 0 ? cv.hud[team][slot]?.cue : undefined;
      if (cue === "death_hint") return { label: "อาจตาย · HUD", tone: "death-hint" };
      if (cue === "colored") return { label: "ไม่พบสัญญาณตาย · HUD", tone: "hud" };
    }
  }
  return { label: "ยังไม่ทราบสถานะ", tone: "unknown" };
}
