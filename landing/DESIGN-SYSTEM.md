---
version: "0.12.1b"
created_at: "2026-07-20T00:00:00+07:00,ATHER"
last_update: "2026-07-21T06:29:00+07:00,ATHER"
status: "beta"
attributes:
  domain: "public-landing"
  scope: "G-Maiden landing microsite"
  language: "th UI and documentation"
---

# G-Maiden Thai-first Landing — Design System

> **Implementation status:** CR-029 art-first 2.5D Hero, CR-030 scroll-driven cinematic narrative, CR-031 localized layer motion, and CR-032 scene-depth plus character-rig decomposition scaffold are approved; production deployment requires the recorded visual-QA gate in `landing/design-qa.md`.

## 1. Objective

แทนที่ fake-door landing เดิมด้วย landing ที่เปิดด้วย fullscreen hero สำหรับ **G-Maiden** โดยใช้
โครง composition จาก brief “VANGUARD” เท่านั้น ได้แก่ full-bleed video, transparent navigation,
display headline 3 บรรทัด, CTA, proof row และ mobile menu overlay

สิ่งที่ **ไม่** นำมาจาก VANGUARD: ชื่อแบรนด์, creative-agency positioning, claims, สี และภาพลักษณ์
ทั้งหมดต้องเป็น G-Maiden และอ้าง product truth ใน repo

## 2. Complexity and risk

- **Complexity:** C-3 — Architecture-Driven Implementation (`Text → Doc → Diagram → Code`)
- **Risk:** HIGH — Hero ใช้ responsive cinematic key art, provenance manifest, bounded pointer/scroll motion และ production visual-QA gate
- **Parent alignment:** ใช้ product truth จาก `docs/product/product-requirements.md` และ
  `docs/product/software-requirements-specification.md`
- **Peer alignment:** ใช้ COLD BOOTH palette จาก `docs/design-system/02-tokens.md` แต่แยก namespace
  ของ landing เพื่อไม่ชนกับ Command Deck
- **Known impact:** pricing/waitlist fake-door UI และ `tier_click` analytics ใน landing เดิมถูกถอดออก;
  อนุญาตเฉพาะ Vercel Web Analytics แบบ aggregate page view ตาม §11.1 โดยไม่มี custom event และไม่แตะ
  Tauri app, overlay, GSI, auth หรือ release version

## 3. Accepted concept

![G-Maiden fullscreen hero concept](assets/concepts/g-maiden-hero-concept-v1.png)

- Native concept size: `1672 × 941` (ประมาณ 16:9)
- Concept มีหน้าที่ล็อก composition, hierarchy, density และ G-Maiden color direction
- Production background ต้องใช้ video URL ที่ผู้ใช้ระบุ ไม่ใช้ภาพ arena ใน concept เป็น asset จริง
- VANGUARD ใช้เป็น structural reference เท่านั้น และต้องไม่มีคำว่า `VANGUARD` ในหน้า production

## 4. Page anatomy

หน้าเดียวสูง `100svh`/`100dvh` โดยไม่เกิด page scroll ใน viewport ปกติ:

1. Fullscreen responsive `<picture>` media with separate desktop/mobile key art
2. Readability layer แบบ neutral black เฉพาะบริเวณที่จำเป็น ห้าม tint วิดีโอเป็นสีน้ำเงิน
3. Navbar ด้านบน
4. Hero content ชิดซ้ายและกึ่งกลางแนวตั้ง
5. Proof metrics ด้านล่างของ content column
6. Mobile menu overlay ด้านบนสุดเมื่อเปิด

Container เป็น open/full-bleed composition — ไม่มี card, glass panel, bento grid หรือ rounded shell

## 5. Visible-copy lock

ข้อความเหนือ fold ที่อนุญาตมีเฉพาะรายการนี้:

| Role | Copy |
| --- | --- |
| Brand | `G-MAIDEN` |
| Desktop/mobile nav | `FEATURES`, `HOW IT WORKS`, `PRIVACY`, `FAQ` |
| Nav action | `JOIN THE BETA` |
| Hero label | `REAL-TIME AI COMPANION FOR DOTA 2` |
| H1 line 1 | `SEE DANGER.` |
| H1 line 2 | `REACT FASTER.` |
| H1 line 3 | `STAY ALIVE.` |
| Supporting copy | `Maiden watches the match, warns you by voice, and keeps your focus where it belongs — in the game.` |
| Primary CTA | `SEE HOW IT WORKS` |
| Trust proof | `LOCAL-FIRST` / `PRIVACY BY DEFAULT` |
| Metric 1 | `≤300MS` / `SIGNAL LATENCY` |
| Metric 2 | `≤2.5%` / `BACKGROUND CPU` |
| Metric 3 | `LOCAL` / `MATCH DATA` |

ห้ามเพิ่ม eyebrow, badge, testimonial, pricing, social proof หรือ product claim อื่นใน hero โดยไม่แก้
เอกสารและขออนุมัติใหม่

## 6. Design tokens

### 6.1 Color

| Token | Value | Role |
| --- | --- | --- |
| `--landing-void` | `#06070A` | fallback/background edge |
| `--landing-text` | `#EEF4FB` | primary text |
| `--landing-text-dim` | `rgba(238, 244, 251, 0.70)` | body/supporting text |
| `--landing-text-mute` | `rgba(238, 244, 251, 0.50)` | labels and proof captions |
| `--landing-ice` | `#8FD4FF` | brand/action/focus accent |
| `--landing-ice-bright` | `#9BE7FF` | icon/highlight |
| `--landing-action` | `#226CFF` | primary CTA fill |
| `--landing-signal` | `#A3E635` | tiny live/signal marker only |
| `--landing-border` | `rgba(207, 236, 255, 0.30)` | outline action |
| `--landing-scrim` | `rgba(0, 0, 0, 0.95)` | mobile menu |

**Color lock:** dark/blue-biased black + ice palette; lime ใช้เฉพาะ attention signal ไม่ใช่ CTA หลัก

### 6.2 Typography

| Role | Family | Weight | Scale / treatment |
| --- | --- | --- | --- |
| Brand + display | `FSP DEMO - PODIUM Sharp 4.11`, condensed fallback | 700 | uppercase, sharp, `clamp(2.8rem, 8vw, 7rem)` for H1 |
| UI + body | `Inter`, system sans-serif | 400–700 | uppercase UI with wide tracking; readable body copy |
| H1 | Podium | 700 | line-height `0.92`, tight tracking |
| Hero label | Inter | 500 | `12–14px`, tracking `0.3em` |
| Body | Inter | 400 | `14–16px`, relaxed line-height |
| Metric value | Inter | 700 | `24–48px`, tabular numerals |
| Metric label | Inter | 500 | `9–12px`, uppercase, wide tracking |

Font loading follows the supplied brief in `index.html`. Production release must confirm that the
Podium demo webfont license permits this deployment; if not, approval is required before substituting
another condensed display face.

### 6.3 Spacing and geometry

- Viewport gutter: `24px` mobile, `40px` small desktop, `64px` large desktop
- Navbar vertical padding: `20px` mobile, `28px` large desktop
- Hero content max width: `min(46rem, 58vw)` desktop; full available width mobile
- Vertical rhythm: `16 · 24 · 32 · 40 · 56px`
- Buttons: square/near-square corners (`0–2px`), never pill
- Border: `1px` translucent ice-white
- No card radius/elevation system because the accepted container model has no cards

## 7. Media treatment

- Source: original G-Maiden cinematic key art generated from the approved internal character target; no Valve/Dota/Crystal Maiden model, costume, logo, footage, or `D:\dota` media is shipped.
- Production delivery: desktop WebP `81,068 bytes` (`1672 × 941`) and mobile WebP `87,836 bytes` (`941 × 1672`), selected through semantic `<picture>` media under CR-029.
- Provenance: generation prompt summary, tool, reference hash, output hashes, rights boundary, and production review state live in `G:\G-Maiden-3D-Studio\workspace\gmaiden-ice-mage\source\production-art\gmaiden-2-5d-hero-v1.provenance.json`.
- Motion: slow ambient media scale plus bounded `requestAnimationFrame` pointer parallax (`≤18px`, `≤0.7deg`) and passive scroll exit (`≤18px`). No character-body deformation claim.
- Runtime gate: pointer motion runs only for `pointer: fine`; touch and `prefers-reduced-motion: reduce` receive the static responsive image with all decorative transforms disabled.
- Fit: cinematic subject stays in the media plane and does not receive pointer events; headline, countdown, navigation, and CTA remain semantic HTML above the image.
- Readability: neutral black directional scrims preserve the left text-safe zone and the dedicated lower-right countdown zone without covering the subject's face or torso.
- Prohibited: Three.js/WebGL in the Hero, external copyrighted character media, runtime image generation, audio, scroll pinning, or interaction-capturing media.

### 7.1 Scroll-driven cinematic narrative

- CR-030 adds one passive scroll controller for the landing root. It writes bounded progress values
  only to CSS custom properties and never pins, captures, or changes native browser scrolling.
- Hero art, scrim, and copy use a short composited exit depth. The Open Beta beacon receives an
  ice-signal sweep tied to that same bounded progress.
- GMAD and feature rails are visible by default. `IntersectionObserver` adds a one-time enhancement
  state for diagnostic line, brightness, and focus treatment after the content is already visible.
- Touch and `prefers-reduced-motion: reduce` disable decorative scroll transforms and preserve the
  same content, anchor links, CTA behavior, and reading order.
- No GSAP, Lenis, ScrollTrigger, WebGL, remote media, or new runtime dependency is permitted.

### 7.2 Layer-separated Hero wind motion

- CR-031 upgrades the Hero from one flat media plane into a layered render stack: base silhouette,
  localized hair edge pass, localized cloth edge pass, and frost atmosphere.
- The layered stack reuses the approved original Hero art source and separates motion through
  localized masked DOM layers instead of shifting multiple full-frame duplicates. This avoids face
  skew, body ghosting, and the “one warped slab” failure seen in owner UAT.
- Hair moves with the highest wind amplitude, cloth follows with a slightly heavier lag, and frost
  stays in a lighter foreground screen-blend pass so the scene reads as wind instead of a rigid
  poster translation.
- One Hero animation loop owns pointer drift and wind-phase variables. The countdown, navigation,
  and copy stay outside the media stack.
- Touch and `prefers-reduced-motion: reduce` collapse the layered stack to the static base Hero
  image so the mobile and accessible paths avoid duplicate-layer ghosting.

### 7.3 Scene-depth and character-rig decomposition scaffold

- CR-032 restructures the Hero into a full scene stack before deeper animation work:
  background backdrop, mid-depth B, mid-depth A, cave wall left, cave wall right, character layer,
  and atmosphere overlay.
- The figure remains one scene layer, but inside that character layer the DOM must expose separate
  groups for core, hair, left arm, right arm, cloth, and held object.
- This scaffold is an authoring boundary, not a claim that full skeletal animation is already done.
  The immediate goal is correct component ownership, layer order, and pivot targeting.
- Named pivots such as `head`, `shoulder_left`, `elbow_left`, `wrist_left`, `pelvis`,
  `hair_root_front`, and `object_anchor` are required so later motion can animate the right piece
  without re-authoring the full Hero structure again.
- Inside those approved groups, production DOM should expose named subnodes (for example hair
  strands, arm segments, cloth panels, and held-object parts) through stable targeting hooks so a
  later motion pass can address one piece without guessing selectors from visual classes alone.
- This pass may still reuse the approved Hero art through masked DOM slices while the team prepares
  a more complete asset-separation workflow.

### 7.4 Phase-2 localized motion authoring

- Phase 2 starts after the scene-depth scaffold is in place. It does not claim full skeletal
  animation; instead it adds separate motion channels for the already-approved subnodes.
- Head, face, and upper torso stay comparatively stable so the Hero keeps a premium portrait read,
  while the stronger motion energy belongs to front hair, hair tails, cloth panels, hem, and the
  held crystal.
- One animation loop may author stable CSS custom properties for these localized channels. The DOM
  ownership from CR-032 must remain unchanged; Phase 2 is about motion targeting, not a new layer map.
- Object glow and aura may pulse independently from cloth and hair motion so the crystal reads as a
  separate magical element rather than a rigid extension of the hand.
- Touch and `prefers-reduced-motion: reduce` still collapse the Hero to the static approved image
  path. Decorative motion channels must fully zero out in that fallback.

## 8. Components and states

### Navbar

- Desktop (`md+`): brand left, four links centered, one outlined action right
- Mobile (`<md`): brand left, three-bar menu button right
- All interactive elements receive visible ice focus rings and minimum 44px hit targets

### Mobile menu

- Fixed fullscreen `z-50`, black 95% + restrained backdrop blur
- Brand + close icon in header row
- Nav links centered vertically in Podium at `40–48px`
- Items enter with `80ms` stagger; close returns focus to menu trigger
- `Escape` closes the menu; body scroll is locked while open

### Hero actions

- Primary CTA: `รับ GID สำหรับ Closed Beta` → Google OAuth PKCE บน Supabase `gstore`
- Secondary CTA: `ดูการทำงาน` → technical design document
- Signed-in state: แสดง immutable GID + account email และข้อความให้ใช้ Google account เดียวกันใน desktop app
- Loading/error/signed-out/registered เป็น honest states; control ที่กำลังทำงานถูก disable
- Vercel Web Analytics เก็บเฉพาะ aggregate page view ตาม §11.1; enrollment เก็บ identity status เท่านั้น

### Closed Beta identity

- Google OAuth only ตาม ADR-14; browser callback กลับ origin/path เดิมบน Vercel
- signup ใหม่หลังเปิด beta ได้ generation `B`; GID เดิม `F/P` ไม่เปลี่ยน
- landing เรียก Edge Function `mint-gid`; ห้ามเขียน `gid_code`/`generation` จาก browser
- `closed_beta_enrollments` เปิด RLS: anon ไม่มีสิทธิ์, authenticated select/insert เฉพาะ row ตัวเอง,
  ไม่มี update grant จึง self-approve เป็น `invited` ไม่ได้
- web session ไม่ถูกส่งเข้า desktop ผ่าน URL; desktop login ด้วย Google account เดิมแล้ว resolve UUID/GID เดิม

### User journey: สมัครและเข้าสู่ระบบ Closed Beta

```mermaid
flowchart TD
  A[ผู้ใช้เปิด G-Maiden Landing] --> B{มี session อยู่แล้วหรือไม่}
  B -- ไม่มี --> C[กด รับ GID สำหรับ Closed Beta]
  C --> D[ไปยัง Google Sign-in ผ่าน Supabase Auth]
  D --> E{ยืนยันตัวตนสำเร็จหรือไม่}
  E -- ไม่สำเร็จ/ยกเลิก --> F[กลับ Landing พร้อมข้อความให้ลองใหม่]
  E -- สำเร็จ --> G[Supabase callback กลับโดเมน Landing]
  G --> H[Landing ขอออกหรืออ่าน GID ผ่าน mint-gid]
  B -- มี --> H
  H --> I{ออก/อ่าน GID สำเร็จหรือไม่}
  I -- ไม่สำเร็จ --> J[แสดงข้อความผิดพลาดและปุ่มลองอีกครั้ง]
  I -- สำเร็จ --> K[บันทึกหรืออ่านสถานะ Closed Beta]
  K --> L{สถานะ registered หรือ invited}
  L -- ใช่ --> M[แสดง GID, อีเมล และสถานะลงทะเบียนแล้ว]
  L -- ไม่ใช่ --> J
```

### GID Security และ Web Profile (ข้อกำหนดที่เสนอ — ยังไม่พัฒนา)

- Google OAuth ยังคงเป็นวิธี sign-in หลักเพียงวิธีเดียว; ไม่มี username/password สำหรับ login และ GID
  เป็นรหัสระบุตัวตนถาวร ไม่ใช่ credential หรือ recovery factor
- Landing มีสองพื้นที่ที่แยกหน้าที่ชัดเจน: public profile (`/u/<handle-or-gid>`) แสดงเฉพาะข้อมูลที่เจ้าของ
  เลือกเผยแพร่ และ account center (`/account`) สำหรับเจ้าของที่ sign-in แล้ว เพื่อจัดการ display name,
  avatar, Steam link, การแจ้งเตือน และความปลอดภัย. Display name แก้ได้จาก Desktop หรือ account center;
  การเปลี่ยนต้องสะท้อน identity เดียวกัน
- Public profile ห้ามแสดง email, เบอร์โทร, recovery email, ประวัติ security activity, session, GID secret
  material หรือข้อมูล match/CV/G-Log. การมีหน้า profile ไม่เปลี่ยนหลักการ local-first ของข้อมูลเกม
- `GID Shield` เป็น badge ที่ผู้ใช้เลือกแสดงบน public profile ได้. Badge หมายถึงเปิด Google primary,
  TOTP 2FA, recovery email ที่ยืนยันแล้ว และ phone OTP ที่ยืนยันแล้วเท่านั้น; ไม่ใช่การยืนยันตัวตนทางกฎหมาย
  หรือการรับรองระดับฝีมือ. สถานะ security เริ่มต้นเป็น private
- TOTP เป็น second factor หลัก. Phone OTP ใช้เป็น recovery/contact factor เท่านั้น และต้องมี rate limit,
  consent, E.164 normalization และ SMS provider ที่ได้รับอนุมัติก่อนทำจริง; ห้ามใช้เบอร์โทรเพียงอย่างเดียว
  เพื่อย้ายบัญชีหรือเปลี่ยน Google identity
- Recovery email ใช้ passwordless magic link. เมื่อเข้า Google เดิมไม่ได้ ต้องผ่าน recovery email และ
  TOTP หรือ phone OTP เพื่อออก recovery session ชั่วคราว; การผูก Google account ใหม่มี hold 24 ชั่วโมง
  และส่ง security alert ไปยังช่องทางเดิม/สำรอง. หากหายทุก factor ต้องเข้าสู่ manual support review;
  Steam หรือ GID อย่างเดียวไม่พอสำหรับ recovery
- Security activity ที่ต้องแจ้งทันที: login/new device, เริ่มหรือจบ recovery, เปลี่ยน Google identity,
  TOTP, phone หรือ recovery email. ข่าวสารผลิตภัณฑ์เป็น opt-in แยกต่างหากและยกเลิกได้. ห้ามส่ง raw match,
  CV หรือ G-Log ออกนอกเครื่องในทุกกรณี
- ข้อมูล phone/recovery/security ต้องแยกจาก public `profiles`, จำกัดด้วย RLS และไม่เก็บ secret หรือ
  authorization state ใน client-accessible user metadata. ต้องมี threat model และ schema/migration review
  ก่อน implementation เพราะเป็นการเปลี่ยนระดับ C-3 / HIGH

```mermaid
flowchart TD
  A[Google OAuth primary] --> B[Account center]
  B --> C[ตั้งค่า TOTP 2FA]
  C --> D[ยืนยัน recovery email]
  D --> E[ยืนยัน phone OTP]
  E --> F[GID Shield พร้อมเปิด badge แบบ opt-in]
  X[เข้า Google เดิมไม่ได้] --> Y[Recovery email magic link]
  Y --> Z{ผ่าน TOTP หรือ phone OTP}
  Z -->|ผ่าน| R[Temporary recovery session]
  R --> S[ผูก Google account ใหม่]
  S --> T[Hold 24 ชั่วโมง + security alerts]
  Z -->|ไม่ผ่าน| U[Manual support review]
```

- Google เป็นช่องทางยืนยันตัวตนช่องทางเดียวของ Landing และไม่ส่ง session/token เข้า desktop ผ่าน URL
- `mint-gid` ต้องรับ browser preflight และตอบ CORS headers ทุกสถานะ ก่อนตรวจ JWT และออก GID
- ผู้ใช้ที่กลับมาอีกครั้งใช้ flow เดิมเพื่ออ่าน GID และสถานะเดิม ไม่ออก GID ซ้ำ

### Icons

ใช้ `lucide-react` เท่านั้น:

| Icon | Use | Size | Stroke |
| --- | --- | --- | --- |
| `ArrowUpRight` | nav and primary CTA | `16px` | default Lucide outline |
| `Crown` | hero label | `16px` | ice-bright, 70% opacity |
| `Award` | local-first trust proof | `32px` | text-mute |
| `X` | close mobile menu | `24px` | white |

Hamburger ใช้สาม CSS bars ตาม brief ไม่เพิ่ม icon dependency อื่น

## 9. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--landing-enter` | `800ms ease-out` | fade-up hero elements |
| `--landing-stagger` | `200ms` | hero sequence |
| `--landing-menu` | `500ms ease-out` | menu visibility |
| `--landing-menu-stagger` | `80ms` | menu link sequence |
| `--landing-hover` | `200ms ease-out` | border/color/icon movement |

ลำดับ hero: label `0ms` → H1 `200ms` → supporting copy `400ms` → CTA `600ms` → metrics `800ms`.
ภายใต้ `prefers-reduced-motion: reduce` ให้ยกเลิก transform/stagger และแสดง content ทันที

## 10. Responsive behavior

- Breakpoints: `sm 640px`, `md 768px`, `lg 1024px`
- Desktop nav และ action แสดงที่ `md+`; mobile menu trigger แสดงต่ำกว่า `md`
- Award proof ซ่อนต่ำกว่า `sm`
- CTA และ metrics ใช้ `flex-wrap`; ห้าม horizontal overflow ที่ `320px`
- H1 ใช้ clamp และต้องไม่ชน CTA/metrics บน laptop viewport `1366 × 768`
- Mobile viewport ใช้ `100svh` เพื่อหลีกเลี่ยง browser chrome ตัด content

## 11. Implementation inventory

Landing ใช้ React + Vite + TypeScript + Tailwind แยกจาก app หลัก:

- `landing/package.json`
- `landing/index.html`
- `landing/vite.config.ts`
- `landing/tailwind.config.js`
- `landing/postcss.config.js`
- `landing/tsconfig*.json`
- `landing/src/main.tsx`
- `landing/src/App.tsx` — component เดียวตาม brief, `useState` สำหรับ mobile menu
- `landing/src/HeroMedia25D.tsx` — semantic responsive Hero art with bounded decorative motion plus the scene-depth and character-rig scaffold
- `landing/src/beta.ts` — Google OAuth PKCE + server-authoritative GID/enrollment state
- `landing/src/index.css`
- `landing/public/assets/hero/gmaiden-2-5d-hero-desktop-v1.webp` — desktop production key art
- `landing/public/assets/hero/gmaiden-2-5d-hero-mobile-v1.webp` — mobile production key art
- `landing/README.md` — local dev/build/deploy instructions
- `supabase/migrations/20260720183000_cr005_closed_beta_registration.sql`
- `supabase/migrations/20260720184500_cr005_beta_rls_initplan.sql`
- `supabase/tests/cr005_closed_beta_registration.sql`

Dependencies จำกัดไว้ที่ React, Vite, TypeScript, Tailwind/PostCSS/Autoprefixer, `lucide-react` และ
`@supabase/supabase-js` กับ `@vercel/analytics` แบบ pinned. ไม่เพิ่ม router หรือ state library

### 11.1 Web Analytics privacy boundary

- ใช้ `@vercel/analytics/react` สำหรับ React + Vite; ห้ามใช้ entrypoint `/next`
- เก็บเฉพาะ page view แบบ aggregate และไม่สร้าง custom event
- `beforeSend` ต้องตัด query string และ fragment ออกจาก URL ก่อนส่งทุกครั้ง
- ห้ามส่ง email, GID, OAuth code/token, Supabase session, account state, match state, CV detection หรือ G-Log
- Analytics เป็นของ public landing เท่านั้นและไม่ถูกนำเข้า desktop application
- Local preview บน `localhost` และ `127.0.0.1` ต้องไม่ mount analytics script เพื่อไม่ให้เกิด console noise
  หรือหลอกว่า local QA เป็น production page view
- Production source คือ private repository `Freshair129/g-maiden-landing`; branch `main` deploy production
  ผ่าน Vercel Git integration และ branch อื่นใช้ preview deployment

## 12. Acceptance, success, and exit criteria

### Acceptance criteria

- ชื่อและ copy ทั้งหมดเป็น G-Maiden; ไม่มี VANGUARD production copy
- ใช้ exact CloudFront video URL และ media attributes ตาม brief
- Desktop/mobile composition และ mobile menu ตรง spec
- Color/type/icon/motion ใช้ tokens และ component rules ในเอกสารนี้
- Keyboard navigation, `Escape`, focus return และ reduced-motion ทำงาน
- CTA Google OAuth ทำงานจริง; successful signup แสดง GID และลง enrollment แบบ idempotent
- Analytics ส่งเฉพาะ redacted page view และไม่ส่ง query/fragment หรือข้อมูล account/game
- signup ใหม่เป็น generation `B`; existing GID ไม่ถูกเปลี่ยน
- anon/cross-user/self-approve ถูก RLS/grants ปฏิเสธ
- public profile ไม่เผยข้อมูลติดต่อหรือข้อมูลเกมภายในเครื่อง และ public badge ต้อง opt-in
- ไม่มี password login; GID/Steam เพียงอย่างเดียวใช้ recovery หรือเปลี่ยน Google identity ไม่ได้
- recovery ต้องบังคับ recovery email ร่วมกับ TOTP หรือ phone OTP, ทำ hold 24 ชั่วโมงก่อน rebind identity
  และบันทึก/แจ้ง security activity

### Success criteria

- Build และ TypeScript ผ่านโดยไม่มี error
- ไม่มี overflow ที่ `320 × 568`, `390 × 844`, `768 × 1024`, `1366 × 768`, `1440 × 900`
- Primary content ไม่ถูกตัดใน viewport เล็ก
- Video error มี dark fallback และ content ยังอ่านได้
- hero artwork ≤250 KB และไม่มี external background-video request
- production callback กลับ landing origin ที่อยู่ใน Supabase redirect allow list

### Exit criteria

- ตรวจ browser จริงทั้ง desktop/mobile และเปิด/ปิด mobile menu
- จับ screenshot ที่ native concept ratio เมื่อทำได้
- เปรียบเทียบ concept กับ render อย่างน้อย 5 จุด: copy, composition, typography, palette,
  media treatment, spacing, responsive behavior และ motion
- `landing/design-qa.md` ต้องบันทึก source/render comparison ใน artifact เดียวกันทั้ง `1440×900` และ `390×844` พร้อม `final result: passed` ก่อน deploy
- ทำ above-the-fold copy diff ได้ผลตรงกับ §5
- รัน `codedoc-aligner`; exit `2` ถือว่า gate ไม่ผ่าน ไม่ใช่ aligned
- ไม่แตะ/รวมไฟล์ dirty เดิมที่อยู่นอก `landing/`

## 13. Thai-first feature signal rails

- ภาษาไทยเป็นภาษาหลักของ navigation, hero, metrics, state และ feature copy
- Section `#features` ต่อจาก hero ด้วย numbered signal rails 01–04 แบบเปิดโล่ง ไม่ใช้ card grid
- Positioning หลักคือบัดดี้ที่คอย `watch your back` และช่วยเก็บตกสัญญาณที่อาจพลาด
- ห้ามสื่อว่าเห็นเกมล่วงหน้า เข้าถึงข้อมูลที่ผู้เล่นทั่วไปไม่เห็น หรือทำนายเส้นทาง/เจตนาศัตรู
- Diagnostic proof ใช้เฉพาะ observed state: missing timer, threshold, advice context, local log/resource status
- Source concept: `assets/concepts/g-maiden-feature-signal-rails-v2.png`; production สร้างด้วย semantic HTML/CSS

## 14. Out of scope

- การเปลี่ยน Command Deck, overlay หรือ Rust backend
- pricing, custom-event analytics, social graph, invite admin dashboard และ email campaign
- Desktop app version bump, GitHub release และ tag; Landing production deploy อยู่ภายใต้ CR-029 เท่านั้น
- การใช้ concept image เป็น production background
- prediction percentage, hidden-information claim และ future path projection
- การ implement MFA, SMS provider, schema migration, recovery workflow หรือ public-profile routes ก่อนผ่าน
  threat-model และ approval gate

## CHANGELOG

| Version | Date | Status | Summary | Commit Hash | Agent |
| --- | --- | --- | --- | --- | --- |
| 0.1.0b | 2026-07-20 | candidate | Initial G-Maiden landing design-system proposal using the VANGUARD brief as structural reference | — | ATHER |
| 0.2.0b | 2026-07-20 | beta | Approved implementation; added production cold video grade and Vercel deployment state | — | ATHER |
| 0.3.0b | 2026-07-20 | beta | Original cinematic hero, Closed Beta Google OAuth/GID enrollment, RLS contract and production verification gates | — | ATHER |
| 0.4.0b | 2026-07-20 | beta | Thai-first hero and open feature rails; watch-your-back positioning without prediction overclaims | — | ATHER |
| 0.4.1b | 2026-07-20 | beta | Production asset isolation and verified Vercel deployment | — | ATHER |
| 0.5.0b | 2026-07-20 | beta | Approved aggregate Vercel page-view analytics with URL redaction and standalone Git deployment contract | — | ATHER |
| 0.5.1b | 2026-07-21 | beta | Added Closed Beta signup and login user-flow diagram, including callback, GID, registration, and recoverable failure states | - | ATHER |
| 0.6.0b | 2026-07-21 | beta | Added proposed GID Shield, 2FA, phone/recovery, security notification, and privacy-safe web-profile contract | - | ATHER |
| 0.7.0b | 2026-07-21 | beta | Replaced the static two-character Hero with the reviewed MPFB2 G-Maiden GLB, accessible fallback, bounded cursor/scroll motion, and CR-028 production handoff | - | ATHER |
| 0.8.0b | 2026-07-21 | beta | Superseded the rejected MPFB/WebGL Hero with CR-029 responsive cinematic 2.5D media, provenance, bounded passive motion, and mandatory source/render visual QA | - | ATHER |
| 0.9.0b | 2026-07-21 | beta | Added CR-030 bounded scroll-driven cinematic narrative: one passive progress controller, signal beacon, and observer-enhanced GMAD and feature rails without scroll hijacking | - | ATHER |
| 0.9.1b | 2026-07-21 | beta | Clarified the implementation status header and normalized document timestamps for the approved CR-030 landing narrative. | - | ATHER |
| 0.12.1b | 2026-07-21 | beta | Clarified and aligned analytics behavior so local preview on localhost does not mount Vercel Analytics while production privacy rules stay unchanged. | - | ATHER |
| 0.12.0b | 2026-07-21 | beta | Added Phase-2 localized motion-authoring guidance for head stability, hair tails, cloth channels, and held-crystal pulse on top of the CR-032 rig scaffold. | - | ATHER |
| 0.11.1b | 2026-07-21 | beta | Clarified CR-032 implementation detail: Hero subcomponents now require stable named node targeting inside each approved rig group for later motion authoring. | - | ATHER |
| 0.11.0b | 2026-07-21 | beta | Added CR-032 scene-depth and character-rig scaffold requirements so the Hero exposes cave layers, character subcomponents, and pivot ownership before deeper animation work. | - | ATHER |
| 0.10.1b | 2026-07-21 | beta | Clarified CR-031 to use localized hair and cloth edge masks instead of whole-frame duplicate planes after owner UAT found skewed facial proportions. | - | ATHER |
| 0.10.0b | 2026-07-21 | beta | Added CR-031 layer-separated Hero wind motion contract with base, hair, cloth, and frost layers plus static fallback rules. | - | ATHER |
