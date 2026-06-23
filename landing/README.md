# G-Maiden Fake-door Landing (E4)

à¸«à¸™à¹‰à¸² static à¸ªà¸³à¸«à¸£à¸±à¸šà¸—à¸”à¸¥à¸­à¸‡ **willingness-to-pay + tier intent** (Business Validation Plan Â§E4)

## à¸à¹ˆà¸­à¸™ deploy â€” à¸•à¸±à¹‰à¸‡à¸„à¹ˆà¸² 1 à¸ˆà¸¸à¸”
à¹à¸à¹‰ `index.html` â†’ à¸•à¸±à¸§à¹à¸›à¸£ `WAITLIST_URL` à¹ƒà¸«à¹‰à¹€à¸›à¹‡à¸™à¸¥à¸´à¸‡à¸à¹Œ waitlist form à¸ˆà¸£à¸´à¸‡ (Google Form/Tally) à¹€à¸Šà¹ˆà¸™
`https://forms.gle/xxxx?tier={TIER}` â€” `{TIER}` à¸ˆà¸°à¸–à¸¹à¸à¹à¸—à¸™à¸”à¹‰à¸§à¸¢à¹à¸žà¹‡à¸à¹€à¸à¸ˆà¸—à¸µà¹ˆà¸„à¸¥à¸´à¸ (free/basic/pro/onetime/hero)
à¹ƒà¸™à¸Ÿà¸­à¸£à¹Œà¸¡à¹ƒà¸«à¹‰à¸¡à¸µ field à¸£à¸±à¸š `tier` (prefill) à¹€à¸žà¸·à¹ˆà¸­à¸šà¸±à¸™à¸—à¸¶à¸à¸§à¹ˆà¸²à¸„à¸™à¸à¸”à¹à¸žà¹‡à¸à¹€à¸à¸ˆà¹„à¸«à¸™

## Deploy (Vercel CLI)
```bash
cd landing
vercel            # preview
vercel --prod     # production
```
à¹à¸¥à¹‰à¸§à¹€à¸›à¸´à¸” **Vercel dashboard â†’ Analytics** à¹€à¸žà¸·à¹ˆà¸­à¹€à¸à¹‡à¸š page views + custom event `tier_click`

## à¹€à¸¡à¸•à¸£à¸´à¸à¸—à¸µà¹ˆà¹„à¸”à¹‰
- **visits** (Vercel Analytics)
- **tier_click** à¸•à¹ˆà¸­à¹à¸žà¹‡à¸à¹€à¸à¸ˆ (event) â†’ à¹à¸žà¹‡à¸à¹€à¸à¸ˆà¹„à¸«à¸™ intent à¸ªà¸¹à¸‡à¸ªà¸¸à¸”
- **waitlist conversion** = à¸ˆà¸³à¸™à¸§à¸™ submit à¹ƒà¸™à¸Ÿà¸­à¸£à¹Œà¸¡ / visits
- à¸Šà¹ˆà¸­à¸‡à¸ˆà¹ˆà¸²à¸¢à¸—à¸µà¹ˆà¹€à¸¥à¸·à¸­à¸ (à¸–à¸²à¸¡à¹ƒà¸™à¸Ÿà¸­à¸£à¹Œà¸¡)

## à¸­à¹ˆà¸²à¸™à¸œà¸¥à¸­à¸¢à¹ˆà¸²à¸‡à¹„à¸£
- conversion à¹€à¸‚à¹‰à¸² waitlist à¸•à¹ˆà¸³à¸¡à¸²à¸ â†’ à¸„à¸¸à¸“à¸„à¹ˆà¸²/à¸‚à¹‰à¸­à¸„à¸§à¸²à¸¡à¸¢à¸±à¸‡à¹„à¸¡à¹ˆà¹‚à¸”à¸™ (à¸à¸¥à¸±à¸šà¹„à¸› E1/E2)
- Basic à¸¿99 à¸–à¸¹à¸à¸à¸”à¹€à¸¢à¸­à¸°à¸à¸§à¹ˆà¸² Pro à¸¡à¸²à¸ â†’ à¸¢à¸·à¸™à¸¢à¸±à¸™ price sensitivity, à¸žà¸´à¸ˆà¸²à¸£à¸“à¸²à¸”à¸±à¸™ Pro value
- à¸”à¸¹ gate G2 à¹ƒà¸™ [Business Validation Plan](../docs/product/business-validation-plan.md)

