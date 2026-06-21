# Session — 2026-06-21 (turn 6) · Persona event lines

ต่อจาก `2026-06-21-voice-picker.md`. Focus: Maiden พูดแค่ "ถอยก่อนค่ะเพื่อน เลือดเหลือ
น้อยแล้ว" บรรทัดเดียว — รู้สึกบาง. CLAUDE.md ระบุชัดว่า persona "product-critical, not
flavor" ต้อง consistent ทุก utterance. ขยายให้ตอบเหตุการณ์ใน-game ด้วยเส้นที่ตรง persona.

## สิ่งที่ทำ (commit `29935bb`, frontend only)

- **`PERSONA_LINES`** dict ใน `App.tsx` — 5 events × 2-3 เส้นต่อกลุ่ม:
  - **levelUp** (ขึ้นเลเวล): "ขึ้นเลเวลแล้วค่ะ สวยมาก ขยายอำนาจต่อเลย" / "เลเวลขึ้นแล้ว
    — ยังเก่งกว่า movement speed ของซีเอ็มอีกนะ" ← meme-aware Nerf-CM ตามที่ CLAUDE.md
    เรียก
  - **kill** (เก็บคิล): "ฆ่าได้สวยค่ะ!" / "นั่นน่ะ pick ของชั้น — เอ๊ะ ของเพื่อนก็ได้"
    (เผยจังหวะ self-deprecation)
  - **death** (ตาย): "ตายแล้วเหรอคะ ไม่เป็นไรเดี๋ยวกลับมาใหม่" / "เกิดขึ้นได้ค่ะ
    จดจังหวะ map ไว้นะ"
  - **respawn** (ฟื้น): "กลับมาแล้ว ค่อย ๆ นะคะ" / "ฟื้นแล้ว — ดู map ก่อนค่อยเดินออกนะ"
  - **manaLow** (มานา ≤ 15%): "มานาเหลือน้อยแล้วค่ะ ระวังด้วย" / "มานาใกล้หมด —
    ถอยกลับฐานก่อนไหม"
- **Settings**: `personaLines: boolean` (default `true`).
- **Overlay**: เก็บ `prev` tick (เฉพาะ field ที่ trigger: level/kills/deaths/alive/mana)
  ใน `useRef`; ทุก game-tick เทียบ transition.
- **Priority order** ของ event (กรณีหลาย event เกิดพร้อมกัน): death > respawn > kill >
  levelUp > manaLow — เลือก 1 ต่อ tick.
- **Throttle 6s** ระหว่างทุกเส้น (รวม HP danger). **Skip** persona ทั้งหมดเมื่อ `lowHp`
  เพื่อไม่ทับเส้นเตือนหลัก.
- **Mana-low rising edge** เหมือน HP: re-arm เมื่อ mana > 25%.
- UI: row "พูดเสริมตามเหตุการณ์" + Toggle ในการ์ด Alerts.

## Verify

- `pnpm tauri build` pass; bundles ใหม่ออกครบ.
- POST sequence ผ่าน PowerShell: baseline (lvl 6, 2 kills, alive, mana 60%)
  → lvl 7 → kills 3 → alive=false → alive=true (HP 100%), คั่น sleep 7s ทุกครั้ง.
- LIVE card สะท้อน state สุดท้ายครบ: lvl 7 / 3 kills / HP 100% (screenshot).
- ปล่อย respawn ทันทีหลัง death (sleep 0) → throttle 6s กรอง = ดีไซน์ถูก.
- Persona toggle ใหม่แสดงในการ์ด Alerts.

## บทเรียน

1. **เก็บ prev เฉพาะ fields ที่ใช้ trigger** ใน `useRef` ไม่ใช่ทั้ง tick — ลด
   re-render สิ้นเปลือง และไม่ผูก dep ที่ไม่จำเป็นใน useEffect.
2. **`sRef.current` ใน effect ที่ rely on settings** — Overlay's settings มาผ่าน
   `listen('settings')` (event) ไม่ใช่ props. ถ้าใช้ closure `s` ตรง ๆ จะติด stale
   ค่า; ใช้ ref ที่ sync ทุก render.
3. **Priority order pattern** ดีกว่า "speak ทุก event": death เกิดพร้อม level-up
   หรือ kill ได้ (เช่น last hit แล้วโดน gank); ให้ Maiden พูดเส้น "หนัก" สุดก่อน.
4. **Persona pool > single line** — random select กัน "feels canned"; เกินเส้นที่ 3
   ก็จะเริ่มสังเกตได้ → 3 เส้นต่อ event เป็นจุดที่บาลานซ์.
5. **Defaults ของ feature ใหม่:** persona เปิดเป็น `true` ตรงข้ามกับ session ก่อน
   ที่บอกให้ "ระวังเพราะอาจน่ารำคาญ". เหตุผล: throttle 6s + skip ระหว่าง danger
   alert + 1 event ต่อ tick — รวมแล้วพูดสูงสุดน่าจะ 5-6 ครั้งต่อแมตช์ ไม่ไหวก็ปิดทาง UI ได้.

## State ปลาย turn

- Branch `main` ahead of origin by 10 commits.
- Working tree: untracked `orchestration/docs/{ADR-O-002, ADR-O-003, SPEC--GOVIBE-INTEGRATION}.md`
  (งานคู่ขนานของ user — ADR-O-003 ใหม่ใน turn นี้).
- งานต่อ: Piper TTS (iteration ใหญ่ — Thai voice model + ONNX runtime), G-Sentry minimap CV
  spike (ต้องเกมจริง), G-Master + Gemini (cloud + key).
