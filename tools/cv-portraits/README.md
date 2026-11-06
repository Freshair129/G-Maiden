# Local HUD portrait references

The runtime uses canonical hero IDs, local PNG files and conservative NCC; uncertain slots remain unknown. Screenshots are evaluation inputs, never reference images. HUD identity excludes the lower ult/facet icons and frame edges. Both grayscale and RGB NCC must corroborate identity; terrain can resemble a small grayscale portrait. The score is their minimum. Score >= 0.75, distinct-hero margin >= 0.12 and temporal/session admission are independent requirements.

Public default portraits are cached automatically from Valve's static CDN under `cv/portraits/hud-v2/`. Alternate/persona portraits can be imported from an installed copy of Dota 2. This is a developer preparation step; the app does not invoke Source2Viewer or read VPKs on the capture thread. An installation without a matching cosmetic reference may remain unknown.

1. Export only static hero portraits with [Source2Viewer CLI](https://s2v.app/ValveResourceFormat/guides/exporting-textures.html), for example:

```powershell
Source2Viewer-CLI.exe -i 'G:/steam/steamapps/common/dota 2 beta/game/dota/pak01_dir.vpk' -o '<temporary export>' -d --vpk_extensions vtex_c --vpk_filepath panorama/images/heroes/npc_dota_hero_ --threads 2
```

2. Import into G-Maiden's writable app cache:

```powershell
node tools/cv-portraits/import.mjs '<temporary export>/panorama/images/heroes' "$env:LOCALAPPDATA/com.gmaiden.app/cv/portraits/hud-v2"
node --test tools/cv-portraits/import.test.mjs
```

Names are checked against the bundled Valve ID registry. Only default, `alt`, `altN`, `persona` and `personaN` resources are admitted. Multiple variants map to the same canonical label/ID; they do not compete against one another as different heroes. `local-assets.json` records source names, import time and SHA-256 hashes. Keep Valve images in the local cache, outside git. Rerun import after relevant game asset updates; cache coverage is not a universal live-match accuracy guarantee.
