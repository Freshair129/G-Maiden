# G-Maiden Fullscreen Landing

React + Vite + Tailwind microsite สำหรับ public G-Maiden landing page ตาม
[`DESIGN-SYSTEM.md`](./DESIGN-SYSTEM.md)

Production: <https://g-maiden-landing.vercel.app>

## Local development

```powershell
cd G:\G-Maiden\landing
pnpm install
pnpm dev
```

## Verification

```powershell
pnpm typecheck
pnpm build
```

## Closed Beta / GID

- Google OAuth ใช้ Supabase project `gstore` เดียวกับ G-Maiden desktop app
- Production origin ต้องอยู่ใน Supabase Auth → Redirect URLs
- ค่า default ใช้ publishable key ที่เปิดเผยใน browser ได้; override ได้ด้วย
  `VITE_SUPABASE_URL` และ `VITE_SUPABASE_PUBLISHABLE_KEY`
- ห้ามใส่ `service_role` หรือ secret ใด ๆ ใน `VITE_*`

## Deploy with Vercel CLI

```powershell
vercel link --yes --project g-maiden-landing
vercel build --prod
vercel deploy --prebuilt --prod
```

Vercel project metadata ใน `.vercel/` ถูก ignore และไม่ควร commit

## Web Analytics

- ใช้ `@vercel/analytics/react` เพราะ landing เป็น React + Vite
- เก็บเฉพาะ aggregate page views; ไม่มี custom events
- ตัด query string และ URL fragment ก่อนส่ง เพื่อไม่ให้ OAuth code/token หลุดออกจาก browser
- ห้ามส่ง email, GID, account state, match state, CV detection หรือ G-Log
- Git deployment source: `Freshair129/g-maiden-landing` (`main` → production)

## Scope

- Thai-first fullscreen hero (`100svh`) + shipped-feature signal rails
- Original sea-captain + stone-titan hero artwork พร้อม cinematic 2.5D motion
- Watch-your-back positioning โดยไม่อ้างการเห็นข้อมูลลับหรือทำนายอนาคต
- Responsive desktop/mobile navigation
- Keyboard-accessible fullscreen mobile menu
- Google OAuth + server-authoritative GID + Closed Beta enrollment
- Aggregate Vercel page-view analytics เท่านั้น; ไม่มี account/player-data egress หรือ custom events
