# Competitive Brief — G-Maiden

> **ขอบเขต:** คู่แข่งกลุ่ม Dota Coach / Overwolf overlays (+ บริบทตลาดที่เกี่ยวข้อง)
> **โฟกัส:** ครบทุกมิติ (overview → features → positioning → SWOT → strategy)
> **ใช้เพื่อ:** วางกลยุทธ์ product / จัดลำดับฟีเจอร์
> **วันที่:** 2026-06-22 · **อายุข้อมูล:** ราคา/ฟีเจอร์ในตลาด overlay เปลี่ยนเร็ว — ตรวจซ้ำทุก ~1 ไตรมาส
> **เกี่ยวกับเรา:** G-Maiden = AI companion เสียงจริง + overlay โปร่งใส อ่าน GSI สดและเตือน gank ภายใน latency budget เข้ม (G-Signal ≤300ms) พร้อม persona "Maiden" สไตล์ live-caster

---

## 1. สรุปผู้บริหาร (TL;DR)

ตลาด Dota 2 overlay/companion วันนี้แบ่งเป็นสามค่ายชัดเจน และ **ไม่มีใครเล่นในช่องที่ G-Maiden จะเล่น**:

1. **ค่าย "ครู/คำแนะนำ" (Dota Coach)** — timer, hero guide, draft/item advice แบบ *ข้อความบนจอ* ผู้เล่นต้องเหลือบมองเอง
2. **ค่าย "ข้อมูล/ดราฟต์" (DotaPlus บน Overwolf + Dota Plus ของ Valve)** — counter stats, draft suggestion, post-game analytics
3. **ค่าย "สตรีมเมอร์" (Dotabod)** — overlay สำหรับ OBS/Twitch ไม่ใช่ตัวช่วยผู้เล่น

**ช่องว่างเชิงกลยุทธ์ที่ชัดที่สุด:** ทุกเจ้าสื่อสารด้วย **ข้อความ/ภาพ** ที่ดึงสายตาออกจากเกม — *ไม่มีใครทำ real-time voice companion ที่เตือนอันตรายแบบ interrupt ทันเวลา* และไม่มีใครทำ **gank-route prediction จาก heatmap**. นี่คือหัวใจของ G-Signal + G-Motion + persona เสียง ซึ่งเป็น position ที่ยัง "ว่าง"

**บทเรียนเตือนใจ:** GOSU.AI (AI coach สาย Dota 2, ระดมทุน ~$5.12M) **ปิดกิจการแล้ว** — พิสูจน์ว่า "AI tips บนจอ" อย่างเดียวไม่พอสร้างธุรกิจยั่งยืน ความแตกต่างต้องลึกกว่าการแสดงคำแนะนำ

**ความเสี่ยงใหญ่สุด:** Valve เป็นทั้ง platform และคู่แข่ง — Dota Plus (in-client) มี Assistant อยู่แล้ว และ Valve ขยายฟีเจอร์ได้ตลอดโดยที่เราคุมไม่ได้

---

## 2. แผนที่สนามแข่ง (Competitive Landscape)

### แกนวิเคราะห์
- **แกน X — ช่องทางสื่อสาร:** ข้อความ/ภาพบนจอ ←→ เสียงสด (voice-first)
- **แกน Y — จังหวะ:** วิเคราะห์หลังเกม/ก่อนเกม ←→ เตือนสดระหว่างเล่น (real-time critical-path)

```
                    เตือนสด real-time (มุมที่ G-Maiden ยึด)
                              ▲
                              │   ★ G-Maiden
                              │   (voice + gank predict)
        Dota Coach ●         │
        DotaPlus (Overwolf) ●│
        Dota Plus (Valve) ●  │
   ───────────────────────────┼───────────────────────────►
   ข้อความ/ภาพ                │                 เสียงสด (voice)
        Stratz ●              │
        OpenDota ●            │
        Dotabuff ●            │   Dotabod ● (สตรีมเมอร์ คนละ use case)
                              │
                         หลังเกม / ก่อนเกม
```

มุมขวาบน (**voice + real-time**) ว่างเปล่า — นี่คือที่ที่ G-Maiden ต้องยึดให้ขาด

### การจัดกลุ่มคู่แข่ง

| ระดับ | ใคร | ทำไมเกี่ยว |
| --- | --- | --- |
| **Direct (โดยตรง)** | **Dota Coach**, **DotaPlus** (แอป Overwolf) | overlay ระหว่างเล่นจริง แย่งพื้นที่หน้าจอและความสนใจเดียวกัน |
| **Incumbent / Substitute** | **Dota Plus** (subscription ของ Valve) | ตัวช่วยในตัวเกม ผู้เล่นอาจรู้สึกว่า "มีอยู่แล้ว ไม่ต้องลงเพิ่ม" |
| **Indirect (ทางอ้อม)** | Stratz, OpenDota, Dotabuff | แก้ปัญหาเดียวกัน (เล่นเก่งขึ้น) แต่คนละจังหวะ — เน้น post-game analytics |
| **Adjacent (ข้างเคียง)** | Valve ขยาย Plus Assistant, AI copilot ทั่วไป | วันนี้ไม่ชน แต่ขยายมาทับได้ |
| **Cautionary (กรณีศึกษา)** | GOSU.AI (ปิดแล้ว) | AI coach สาย tips บนจอ ที่ไปไม่รอด |

> ⚠️ **หมายเหตุชื่อชนกัน:** "Dota Plus" (Valve, in-client) กับ "DotaPlus" (แอปบน Overwolf ของผู้พัฒนาภายนอก) **คนละตัว** — บรีฟนี้แยกชัดเสมอ

---

## 3. โปรไฟล์คู่แข่ง (Competitor Overview)

### 3.1 Dota Coach — คู่แข่งโดยตรงที่ใกล้ที่สุด
- **คืออะไร:** แอป companion บนแพลตฟอร์ม **Overwolf** ช่วยพัฒนาฝีมือ/medal/MMR
- **ฟีเจอร์หลัก:** แจ้งเตือน event (Bounty/Water/Power Runes, Neutral Items, Daytime), hero coaching, draft advice, item & skill build, post-match analysis; toggle overlay ด้วย `CTRL+B`; รองรับสองจอ (ดู recent games ของเพื่อนก่อนเริ่มเกม)
- **โมเดลธุรกิจ:** Freemium — ฟรีได้เยอะ; เสียเงินปลดล็อก **Ultimate timers** + coaching ครบ 124 ฮีโร่ (ฟรีได้ 5) + ตัดโฆษณา; ราคาเริ่ม **~$1.99/เดือน**, Pro Coach ราว **$5/เดือน**
- **จุดเด่น/โมเมนตัม:** อยู่บน Overwolf = มี distribution store + ฐานผู้ใช้พร้อม; วาง brand เป็น "เพื่อนร่วมทีมใจเย็นที่คอยสอน" ซึ่งใกล้ persona เราพอควร

### 3.2 DotaPlus (แอป Overwolf — ผู้พัฒนาภายนอก)
- **คืออะไร:** overlay เน้น **ชนะตั้งแต่ดราฟต์** — counter/synergy stats ของผู้เล่นและฮีโร่ในเกมจริง
- **ฟีเจอร์หลัก:** hero suggestion ตาม counter/synergy, item & skill build, post-game stats, แนะนำตาม role/lane, รับรู้จังหวะเกม
- **จุดเด่น:** รีวิว (1v9) ชมว่า "กลมกลืนกับการเล่นปกติ ไม่ยัดเยียดคำแนะนำตายตัว" — UX ที่ลื่นไหลคือจุดแข็ง

### 3.3 Dota Plus (Valve — incumbent ในตัวเกม)
- **คืออะไร:** subscription ทางการ **~$3.99/เดือน** (ลดถ้าสมัครยาว) — Plus Assistant ฝังในไคลเอนต์
- **ฟีเจอร์หลัก:** item suggestion (data-driven), real-time comparative analytics, lane setup, ability suggestion, **Death Summary** (ไทม์ไลน์วินาทีต่อวินาทีว่าตายเพราะอะไร), dynamic hero pick suggestion; + ระบบ XP/badge/chat wheel
- **จุดเด่น:** ข้อมูลจาก Valve เอง (แม่นและ "ทางการ"), ฝังในเกมไม่ต้องลงแอปนอก, แบรนด์น่าเชื่อถือสูงสุด
- **จุดอ่อนเชิงโครงสร้าง:** เป็น "ตัวเลข/ตัวเลือก" — ไม่มีเสียง ไม่มีการเตือนอันตรายเชิงรุก ไม่มี persona

### 3.4 กลุ่ม Post-game Analytics (Stratz / OpenDota / Dotabuff)
- เครื่องมือมาตรฐานของชุมชน: สถิติเชิงลึก, match analysis, ติดตามผล — **คนละจังหวะ** (หลังเกมเป็นหลัก) จึงเป็น indirect ไม่ใช่คู่ตรง

### 3.5 Dotabod (สตรีมเมอร์)
- overlay สำหรับ **OBS/Twitch** (ใช้ GSI เหมือนกัน) — automated predictions, real-time stats สำหรับ "ผู้ชม" ไม่ใช่ "ผู้เล่น" → **คนละ use case** แต่ยืนยันว่า GSI ทำ real-time overlay ได้จริง

### 3.6 GOSU.AI (ปิดกิจการ — กรณีศึกษา)
- เคยเป็น AI-driven assistant แสดง tips & tricks ใน Dota 2/PUBG; ระดมทุนรวม **~$5.12M** 3 รอบ; ปี 2024 มีพนักงาน 15 คน — **ปัจจุบันหยุดดำเนินการ**
- **บทเรียน:** "AI แสดงคำแนะนำบนจอ" ไม่ใช่ moat — ต้องมีอย่างอื่นที่ลอกยากและผู้เล่นรู้สึกถึงคุณค่าทันที (เช่น เสียงเตือนทันเวลาที่ช่วยรอดจริง)

---

## 4. ตารางเปรียบเทียบฟีเจอร์ (Feature Comparison Matrix)

**เกณฑ์:** Strong (ผู้นำตลาด) · Adequate (ใช้ได้ ไม่โดดเด่น) · Weak (มีแต่จำกัด) · Absent (ไม่มี)
*ประเมินจากข้อมูลตลาดที่เปิดเผย + ข้อกำหนดใน SRS/PRD ของ G-Maiden (ค่า G-Maiden = เป้าหมาย/ออกแบบ ยังไม่ผ่านการพิสูจน์ใน production)*

| ความสามารถ | **G-Maiden (เป้า)** | Dota Coach | DotaPlus (OW) | Dota Plus (Valve) |
| --- | --- | --- | --- | --- |
| **A. เตือนสด real-time** | | | | |
| &nbsp;&nbsp;เตือน gank ด้วย **เสียง interrupt** | **Strong** | Absent | Absent | Absent |
| &nbsp;&nbsp;ทำนายเส้นทาง gank (heatmap) | **Strong** | Absent | Absent | Absent |
| &nbsp;&nbsp;Fog-of-war / ศัตรูหายจากสายตา | **Strong** | Weak | Weak | Adequate |
| &nbsp;&nbsp;Latency เข้ม (≤300ms critical path) | **Strong** | Absent | Absent | n/a (in-client) |
| **B. คำแนะนำเชิงกลยุทธ์** | | | | |
| &nbsp;&nbsp;Item/skill build advice | Adequate | Strong | Strong | Strong |
| &nbsp;&nbsp;Counter-item vs Net Worth ศัตรู | **Strong** | Adequate | Strong | Adequate |
| &nbsp;&nbsp;Draft / hero pick suggestion | Weak* | Adequate | Strong | Strong |
| &nbsp;&nbsp;Event timers (rune/neutral/day) | Adequate | Strong | Adequate | Adequate |
| **C. ประสบการณ์ & persona** | | | | |
| &nbsp;&nbsp;Voice / live-caster persona | **Strong** | Absent | Absent | Absent |
| &nbsp;&nbsp;Belief revision (แก้คำพูดกลางประโยค) | **Strong** | Absent | Absent | Absent |
| &nbsp;&nbsp;Overlay glassmorphism ไม่บังจอ | **Strong** | Adequate | Adequate | Strong (in-client) |
| &nbsp;&nbsp;Hotkey สรุปสถานการณ์ทันที | **Strong** | Adequate | Weak | Absent |
| **D. ความเชื่อใจ & โครงสร้าง** | | | | |
| &nbsp;&nbsp;Privacy-first (ข้อมูลอยู่ local) | **Strong** | Weak | Weak | Adequate (Valve) |
| &nbsp;&nbsp;ทำงานต่อเมื่อเน็ตหลุด (local SLM) | **Strong** | Absent | Absent | n/a |
| &nbsp;&nbsp;Post-game analytics เชิงลึก | Weak | Adequate | Adequate | Adequate |
| &nbsp;&nbsp;Distribution / ฐานผู้ใช้พร้อม | **Weak** | Strong (Overwolf) | Strong (Overwolf) | Strong (in-client) |

\* draft/hero-pick ยังไม่ใช่โฟกัสของ G-Series ปัจจุบัน — ถือเป็น parity gap ที่ต้องตัดสินใจ (ดู §8)

**อ่านตารางอย่างไร:** เราชนะขาดในแถบ A (real-time/voice) และ C/D (persona/trust/resilience) — แต่ **แพ้ชัด** เรื่อง draft, post-game analytics และ **distribution** ซึ่งคู่แข่งบน Overwolf ได้เปรียบมาก

---

## 5. วิเคราะห์ Positioning

### Positioning ของแต่ละเจ้า
| เจ้า | Category ที่อ้าง | ตัวสร้างความต่าง | คำสัญญา (value prop) |
| --- | --- | --- | --- |
| **G-Maiden** | AI **companion** เสียงสด | เตือน gank ทันเวลา + persona Maiden | "เพื่อนที่เห็นอันตรายก่อนคุณ และพูดเตือนทัน" |
| Dota Coach | Coaching companion | timer + guide ครบ | "เหมือนมีโค้ชใจเย็นข้างตัว" |
| DotaPlus (OW) | Draft/stats helper | counter stats ในเกม | "ชนะตั้งแต่ดราฟต์" |
| Dota Plus (Valve) | Official assistant | data จากเจ้าของเกม | "ตัวช่วยทางการในเกม" |

### ช่องว่าง positioning
- **ช่องที่ยังไม่มีใครยึด:** "AI ที่ *พูด* และ *เตือนอันตรายเชิงรุก* แบบ co-pilot" — ทุกเจ้าเป็น "ตัวช่วยแบบ pull (ผู้เล่นต้องไปดู)" ส่วน G-Maiden เป็น **push (มาหาเราเองตอนสำคัญ)**
- **ช่องที่แออัด:** "item/build/draft advice" — ทุกเจ้าอ้างหมด ความหมายเริ่มจาง อย่าเอามาเป็นหัวหอก
- **ช่อง emerging:** voice AI + on-device/privacy-first กำลังเป็นเทรนด์ — สอดคล้องกับ local SLM + privacy-first ของเรา
- **ช่องที่คู่แข่งอ้างแต่ทำได้ไม่เต็ม:** "real-time" — หลายเจ้าใช้คำนี้แต่จริง ๆ คือ stats refresh ไม่ใช่ critical-path alert ที่การันตี latency

> **ข้อเสนอ positioning หลัก:** อย่าวาง G-Maiden เป็น "coach อีกตัว" (จะโดนเทียบกับ Dota Coach/Valve แล้วเสีย) — วางเป็น **"Maiden: เพื่อนเสียงที่เตือนคุณทันก่อนโดน gank"** ให้ voice + การเตือนเชิงรุกเป็นพระเอก ส่วน build advice เป็นของแถม

---

## 6. จุดแข็ง–จุดอ่อนรายเจ้า (อิงหลักฐาน)

**Dota Coach** — 💪 ฐานผู้ใช้บน Overwolf, timer/guide ครบ, freemium ราคาถูก, brand "ใจเย็น" · 😣 เป็นข้อความบนจอ ดึงสายตา, ไม่มีเสียง/เตือนเชิงรุก, ไม่มี gank prediction

**DotaPlus (Overwolf)** — 💪 draft/counter stats แข็ง, UX กลมกลืน, อยู่บน store · 😣 เน้นก่อนเกม/ข้อมูล ไม่ใช่เตือนสดกลางสนาม, ไม่มีเสียง/persona

**Dota Plus (Valve)** — 💪 ข้อมูลทางการ, ฝังในเกม, brand trust สูงสุด, Death Summary ดีมาก · 😣 ไม่มีเสียง/เตือนเชิงรุก/persona, ฟีเจอร์ขยับช้า (Valve โฟกัสกว้าง), ผู้เล่นบางส่วนมองว่า "เกือบ pay-to-win"

**GOSU.AI** — 💀 ปิดแล้ว — เตือนว่า "AI tips บนจอ" ไม่มี moat พอ

---

## 7. โอกาส & ภัยคุกคาม

### โอกาส (Opportunities)
1. **มุม voice + real-time ว่างทั้งตลาด** — ยึดได้ก่อน = นิยาม category ใหม่
2. **gank prediction (G-Motion + G-Signal)** ไม่มีใครทำ → moat เชิงเทคนิคที่ลอกยาก (ต้องทำ heatmap + latency engineering)
3. **Privacy-first + local SLM** ตรงเทรนด์ และต่างจากแอปคลาวด์ที่ผู้เล่นกังวลเรื่องข้อมูล/แอนตี้ชีต
4. **Persona Maiden + ภาษาไทย/meme CM** — emotional hook ที่ analytics ล้วน ๆ ให้ไม่ได้ และเข้าตลาด SEA ได้ก่อน
5. **GOSU.AI ตายทิ้งช่องว่าง** "AI coach" ที่ยังไม่มีใครมาแทนแบบครบ

### ภัยคุกคาม (Threats)
1. **Valve คือ platform + คู่แข่ง** — ขยาย Plus Assistant ให้มี voice/alert เมื่อไรก็ได้ และคุม GSI/นโยบาย overlay (nightmare scenario: Valve เพิ่ม native gank alert)
2. **Overwolf เป็นเจ้าของ distribution** — Dota Coach/DotaPlus ได้เปรียบเข้าถึงผู้ใช้ เราเริ่มจากศูนย์ (เว็บ/Vercel)
3. **ความเสี่ยง latency จริง** — ถ้า G-Signal พลาด ≤300ms บ่อย คุณค่าหลักพังทันที (คู่แข่งไม่มีความเสี่ยงนี้เพราะไม่ได้สัญญา)
4. **เสียงอาจน่ารำคาญ** — voice interrupt ถ้าจูนไม่ดี ผู้เล่นปิดทิ้ง → ต้องคุม false-positive ของ gank warning เข้มมาก
5. **คู่แข่งเติม voice เป็น fast-follow** — TTS เข้าถึงง่าย; moat จริงต้องอยู่ที่ **คุณภาพการทำนาย + persona** ไม่ใช่แค่ "มีเสียง"

---

## 8. นัยเชิงกลยุทธ์ & การจัดลำดับฟีเจอร์ (ส่วนที่สำคัญที่สุด)

### สร้างความต่าง vs ทำให้เท่าทัน
| เรื่อง | ท่าที | เหตุผล |
| --- | --- | --- |
| **Voice + gank warning (G-Signal/G-Motion)** | **Differentiate — ทุ่มสุดตัว** | คือ moat เดียวที่ลอกยากและไม่มีใครมี ต้องดีจน "ว้าว" ตั้งแต่นาทีแรก |
| **Persona Maiden + belief revision** | **Differentiate** | emotional moat ที่ analytics ให้ไม่ได้ |
| **Privacy-first / local SLM** | **Differentiate (พูดให้ดัง)** | ต่างจากคู่แข่งคลาวด์ + เป็นจุดขายความเชื่อใจ |
| **Item/build + counter-item** | **Parity ก็พอ** | คู่แข่งแข็งหมด อย่าไปสู้ตรง ๆ ทำให้ "ดีพอ" แล้วโยงกลับ voice |
| **Draft / hero-pick suggestion** | **ดีเลย์/พิจารณาทีหลัง** | Valve + DotaPlus ครองตลาด ROI ต่ำในช่วงแรก |
| **Post-game analytics** | **อย่าทำตอนนี้** | Stratz/OpenDota/Dotabuff ครองขาด เผาทรัพยากรเปล่า |

### สิ่งที่ควรทำทันที (ลำดับความสำคัญ)
1. **พิสูจน์ G-Signal ก่อนอย่างอื่น** — latency ≤300ms + false-positive ต่ำ คือเงื่อนไขแพ้/ชนะ ถ้าทำไม่ได้ จุดต่างหายหมด
2. **จูน gank warning ให้ "เชื่อถือได้" ก่อน "ฉลาด"** — ผู้เล่นยอมรับการพลาดบ้าง แต่ไม่ยอมเสียง false alarm รัว ๆ (ดู threat #4)
3. **ทำ persona + belief revision ให้รู้สึกได้จริง** ตั้งแต่ demo แรก — นี่คือสิ่งที่จะถูกพูดถึง/แชร์
4. **ตัดสินใจเรื่อง distribution** — เริ่มเว็บ/Vercel ได้ แต่ **Overwolf store คือที่ที่ผู้เล่น Dota อยู่** พิจารณา publish บน Overwolf เพื่อแก้จุดอ่อน distribution (ข้อเดียวที่เราแพ้ขาดในตาราง §4)

### สิ่งที่ต้องเฝ้าระวังต่อเนื่อง
- การอัปเดต **Dota Plus Assistant** ของ Valve (ถ้าเพิ่ม alert/voice = สัญญาณอันตราย)
- การเปลี่ยน **นโยบาย GSI/overlay ของ Valve** (ความเสี่ยงเชิงโครงสร้างต่อทั้งตลาด)
- ราคา/ฟีเจอร์ใหม่ของ **Dota Coach & DotaPlus** บน Overwolf
- มี startup ใหม่เข้ามุม voice/real-time หรือไม่ (มุมนี้ว่างอยู่ แต่จะไม่ว่างตลอด)

---

## 9.5 G-Damage: Offensive Lethality — moat ที่อาจแข็งที่สุด

> เพิ่มหลังวิเคราะห์เชิงลึก · spec เต็ม: [FEAT-G-DAMAGE](docs/features/FEAT-G-DAMAGE.md)

**ปัญหาที่คู่แข่งแก้ไม่ได้:** สมองคนคำนวณไม่ทันในเสี้ยววินาทีว่า "คอมโบนี้ฆ่ามันได้ไหม"
(armor reduction × magic resist × เลือดปัจจุบัน × บัฟ) — แต่ CPU ทำได้ <1ms

| | ใครทำ | ลักษณะ |
| --- | --- | --- |
| Death Summary | Valve | **หลังตาย** บอกว่าเมื่อกี้ตายเพราะอะไร (reactive) |
| **G-Damage offensive** | **เรา** | **ก่อนกด** บอกว่ากดตอนนี้ตายไหม (predictive) |

ทำไมเป็น moat:
- **Predictive vs reactive** — ไม่มีคู่แข่งทำ offensive lethality สด
- **Valve โครงสร้างทำไม่ได้** — ขึ้นป้าย "กดเลยตายแน่!" ให้ทั้ง playerbase กระทบ competitive integrity
- **"คอมพิวเตอร์ชนะคนแบบพิสูจน์ได้"** — ออโต้การคำนวณในหัวที่เด็ก 8k ทำอยู่
- **ความไม่แน่นอน → กลายเป็นจุดเด่น** — ฝั่งเลือดศัตรูไม่มีวันแม่น 100% (บัฟแอบมีได้) จึงส่งออกเป็น
  *confidence* แล้วโยงเข้า **belief revision** (*"กดได้! —เอ๊ะ เดี๋ยว มันมี Shield!"*) ซึ่งคู่แข่งสาย
  "ตาราง stats" ทำท่านี้ไม่ได้เพราะไม่มีปาก

**ข้อจำกัดที่ต้องชนะให้ได้:** ฝั่ง output (ดาเมจเรา) แม่น 100% จาก GSI; ฝั่ง target (เลือด/เกราะ/บัฟ
ศัตรู) GSI ไม่ให้ → ต้องอ่านแถบเลือดด้วย CV + track ไอเทมศัตรูผ่าน G-Master → **นี่คือความเป็นความตาย
ของฟีเจอร์** (ดู §8 ใน FEAT-G-DAMAGE)

**ความเสี่ยง:** ก้ำกึ่ง "assist เกินไป" — เฟรมเป็น "ออโต้คณิตที่โปรทำในหัว" + ใช้เฉพาะข้อมูลบนจอที่ผู้เล่น
เห็นเอง และเฝ้าท่าที Valve

---

## แหล่งข้อมูล (Sources)

- [Dota Coach — Overwolf](https://www.overwolf.com/app/dota-coach.com-dota_coach)
- [Dota Coach FAQs](https://dotacoach.gg/en/app/faqs) · [Dota Coach Pricing](https://dotacoach.gg/en/app/pricing)
- [DotaPlus — Overwolf](https://www.overwolf.com/app/overwolf-dotaplus) · [DotaPlus landing](https://go.overwolf.com/dotaplus/)
- [Apps for Dota 2 — Overwolf](https://www.overwolf.com/browse-by-game/dota2)
- [Best Dota 2 Overlay & Companion Apps — 1v9](https://1v9.gg/blog/best-dota-2-overlay-companion-apps)
- [Dota Plus (official) — Valve](https://www.dota2.com/plus) · [The Ultimate Dota Plus Guide — Hawk Live](https://hawk.live/posts/dota-2-plus-guide)
- [Dota Plus 2025 Price & Benefits](https://pickem-mongolia.com/news/dota-plus-guide/)
- [Dotabod (streamer overlay)](https://dotabod.com/)
- [GOSU.AI — Tracxn company profile](https://tracxn.com/d/companies/gosuai/__c7ozBd72rN2o8xJLqRICFj4iFFOseXz0_pwjb6qU9zA) · [GOSU.AI FAQ — Dota2Freaks](https://dota2freaks.com/gosu-ai/)

> *บรีฟอิงข้อมูลตลาดที่เปิดเผย ณ 2026-06-22; ค่าของ G-Maiden เป็นเป้าหมายตาม SRS/PRD (ยังไม่ผ่าน production). ตลาด overlay เปลี่ยนเร็ว — รีเฟรชทุก ~1 ไตรมาส*
