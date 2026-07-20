# Validation — Form Specs & Social Posts

> เสริม [[toolkit|Validation Toolkit]] · (2) field spec สำหรับสร้าง Google Form เร็วๆ · (3) โพสต์โซเชียลนอกกลุ่มไทย

---

## (2) Google Form Field Specs

### ฟอร์ม A — Beta Recruit (E1) + นัดสัมภาษณ์ (E2)
| field | type | ตัวเลือก/หมายเหตุ |
| --- | --- | --- |
| เล่น Dota 2 บน PC (Win10/11)? | Multiple choice | ใช่ / ไม่ใช่ *(ไม่ใช่ → จบฟอร์ม)* |
| Rank ปัจจุบัน | Dropdown | Herald→Immortal (8 ขั้น) |
| ชั่วโมง/อาทิตย์ | Multiple choice | <5 / 5–15 / >15 |
| Role หลัก | Checkbox | Carry / Mid / Offlane / Soft sup / Hard sup |
| เคยใช้ overlay/companion app? | Multiple choice | Dota Plus / Dota Coach / อื่นๆ / ไม่เคย |
| ยินดี opt-in แชร์ข้อมูลการเล่น (ไม่ระบุตัวตน)? | Multiple choice | ยินดี / ไม่ |
| ยินดีคุย feedback 15 นาที? | Multiple choice | ได้ / ไม่ |
| ติดต่อ (Discord/อีเมล) | Short answer | required |

### ฟอร์ม B — Pricing Survey (E3, Van Westendorp)
| field | type | หมายเหตุ |
| --- | --- | --- |
| เล่น Dota 2 PC? + Rank + ชม./อาทิตย์ | (เหมือนข้างบน, คัดกรอง) | |
| *(บริบทสั้น 2–3 บรรทัด ว่า G-Maiden คืออะไร)* | Section text | |
| แพงเกินไปจนไม่ซื้อ (บาท/เดือน) | Short answer (number) | PSM Q1 |
| แพงแต่ยังพอซื้อ (บาท/เดือน) | Short answer (number) | PSM Q2 |
| คุ้ม/ราคาดี (บาท/เดือน) | Short answer (number) | PSM Q3 |
| ถูกเกินไปจนสงสัยคุณภาพ (บาท/เดือน) | Short answer (number) | PSM Q4 |
| ช่องทางจ่ายที่สะดวก | Checkbox | TrueMoney / PromptPay / บัตร / ShopeePay / 7-11-Codashop-UniPin |
| รูปแบบที่ชอบ | Multiple choice | รายเดือน / จ่ายครั้งเดียว / เติมเป็นช่วงๆ |
| ฟีเจอร์ที่อยากได้สุด | Linear/Rank | เตือนแกงค์ / ทำนายเส้นทาง / ฆ่าได้ไหม / แนะนำไอเทม / persona |

> **วิเคราะห์ PSM:** รวมคำตอบ Q1–Q4 → plot cumulative % → จุดตัด "ถูกไป×แพงไป" = OPP (optimal price); ช่วง PMC–PME = ช่วงราคาที่ยอมรับ เทียบ hypothesis ฿99–199

---

## (3) โพสต์โซเชียล (ขยายนอกกลุ่มไทย)

### Twitter/X (ไทย)
> 🔮 ทำ AI ที่ "พูดเตือน" ตอนจะโดนแกงค์ใน Dota 2 อยู่
> เสียงไทย สาย CM รู้มีม Nerf CM 😂 + บอกด้วยว่า "คอมโบนี้ฆ่าได้ไหม"
> อ่านผ่าน GSI ทางการ = ไม่โดนแบน · ข้อมูลอยู่ในเครื่อง
> หาคนลองฟรี 👉 [ลิงก์]
> #Dota2 #โดต้า

### Twitter/X (EN — global reach)
> Building a voice AI co-pilot for Dota 2 that *talks* — warns you before a gank lands (<300ms) and tells you "can I kill this?" in real time.
> Reads official GSI = ban-safe. Data stays local.
> Looking for beta testers 👉 [link]
> #Dota2

### Reddit r/DotA2 (EN — อ่านกฎ self-promo ก่อนโพสต์)
> **Title:** I'm building a real-time *voice* co-pilot for Dota 2 (gank warnings + lethality calc) — looking for beta testers
>
> Hey all — solo dev here. Every Dota tool I've used shows advice as *text* you have to glance at. I'm building one that **talks**: it warns you by voice before a gank hits (sub-300ms) and tells you in real time whether your combo will kill a target.
>
> It reads Valve's official GSI + the minimap (no memory injection → ban-safe), runs locally (your data stays on your machine), and has a Thai caster persona that owns the "Nerf CM" meme.
>
> Honest feedback wanted — especially: would voice warnings annoy you, or help? Free beta 👉 [link]

> ⚠️ โพสต์ Reddit: อ่าน rule self-promotion ของ subreddit ก่อน, ตอบคอมเมนต์จริงจัง, อย่า spam หลาย subreddit พร้อมกัน

