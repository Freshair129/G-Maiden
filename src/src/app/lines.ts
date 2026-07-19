// Maiden's persona pool — gentle, smart, lightly self-deprecating about CM nerfs,
// per CLAUDE.md. Multiple lines per event so it doesn't feel scripted.
export const DANGER_LINE = 'ถอยก่อนค่ะเพื่อน เลือดเหลือน้อยแล้ว'

export const PERSONA_LINES = {
  levelUp: [
    'ขึ้นเลเวลแล้วค่ะ สวยมาก ขยายอำนาจต่อเลย',
    'เลเวลใหม่นะคะ เก็บสกิลตามเพลนเดิม',
    'เลเวลขึ้นแล้ว — ยังเก่งกว่า movement speed ของซีเอ็มอีกนะ',
  ],
  kill: [
    'ฆ่าได้สวยค่ะ! เก็บไปเรื่อย ๆ',
    'นั่นน่ะ pick ของชั้น — เอ๊ะ ของเพื่อนก็ได้',
    'ดีมากเลย รักษาแรงโมเมนตัมไว้',
  ],
  death: [
    'ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่',
    'เสียใจด้วยนะ — มาวิเคราะห์กันว่าเกิดอะไรขึ้น',
    'เกิดขึ้นได้ค่ะ จดจังหวะ map ไว้นะ',
  ],
  respawn: [
    'กลับมาแล้ว ค่อย ๆ นะคะ',
    'ฟื้นแล้ว — ดู map ก่อนค่อยเดินออกนะ',
    'พร้อมแล้วใช่ไหม ไปด้วยกันค่ะ',
  ],
  manaLow: [
    'มานาเหลือน้อยแล้วค่ะ ระวังด้วย',
    'มานาใกล้หมด — ถอยกลับฐานก่อนไหม',
  ],
} as const

// Belief Revision (CLAUDE.md persona rule, required of G-Signal). Used when
// Maiden just warned "ถอย!" but the danger evaporated within the speech window —
// kill the current line and replace with one of these to keep her honest.
export const REVISION_LINES = {
  dangerRetracted: [
    'เอ๊ะ! เดี๋ยวก่อน — ไม่ต้องถอยแล้วนะคะ ปลอดภัยแล้ว',
    'อ้าว! พลิกได้เก่งมาก — ขอโทษที่เพิ่งบอกถอย',
    'เอ๊ะ! โทษทีค่ะ คิดเร็วไปหน่อย — ตามล่าต่อได้',
  ],
  // G-Signal gank retraction (gank-clear). Soft Belief-Revision echo on the banner.
  gankCleared: [
    'เอ๊ะ... ปลอดภัยแล้วค่ะ',
    'อ้าว ไม่มาแล้ว — ปลอดภัยค่ะ',
  ],
} as const
