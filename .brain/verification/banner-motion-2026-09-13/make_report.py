from pathlib import Path
import json,statistics,html,hashlib
ROOT=Path(__file__).resolve().parent
data=json.loads((ROOT/'benchmark.json').read_text(encoding='utf-8'))
assets=json.loads((ROOT/'asset-manifest.json').read_text())
names={'layers':'Layered motion','sprite':'Sprite sequence','video':'WebM alpha','realtime':'Realtime 3D'}
payload={'layers':sum(assets[f'{n}.png']['bytes'] for n in ['core','wings','ring','shards']),'sprite':sum(assets[f'atlas-{n}.png']['bytes'] for n in range(3)),'video':assets['crest.webm']['bytes'],'realtime':assets['mesh.json']['bytes']}
rows=[];summary=[]
for runtime in ['chrome','webview2']:
  for mode,name in names.items():
    trials=[t for t in data['trials'] if t['runtime']==runtime and t['mode']==mode]
    if not trials:continue
    med=lambda f:statistics.median(f(t) for t in trials)
    cpu=med(lambda t:t['active']['cpuMachinePercent'])
    idle=med(lambda t:t['idle']['cpuMachinePercent'])
    gpu=med(lambda t:(t['active']['gpuEnginesPercent'] or {}).get('3D',0))
    mem=med(lambda t:t['active']['privateMiB'])
    raf=med(lambda t:t['frames']['rafP95Ms'])
    item={'runtime':runtime,'mode':mode,'n':len(trials),'cpuMachineMedianPercent':cpu,'cpuMachineRangePercent':[min(t['active']['cpuMachinePercent'] for t in trials),max(t['active']['cpuMachinePercent'] for t in trials)],'idleCpuMedianPercent':idle,'gpu3DEngineMedianPercent':gpu,'privateMedianMiB':mem,'rafP95MedianMs':raf,'payloadKiB':payload[mode]/1024,'videoFrames':sum(t['frames']['videoFrames'] or 0 for t in trials),'videoDropped':sum(t['frames']['videoDropped'] or 0 for t in trials)}
    summary.append(item)
    rows.append(f'<tr><td>{runtime}</td><td>{name}</td><td>{len(trials)}</td><td>{cpu:.2f}%<small>{item["cpuMachineRangePercent"][0]:.2f}–{item["cpuMachineRangePercent"][1]:.2f}%</small></td><td>{idle:.2f}%</td><td>{gpu:.2f}%</td><td>{mem:.0f}</td><td>{raf:.1f}</td><td>{payload[mode]/1024:.0f}</td></tr>')
(ROOT/'summary.json').write_text(json.dumps(summary,indent=2))
gallery=''.join(f'<article><a href="index.html?mode={m}"><img src="webview2-{m}-dark.png" alt="{name} in WebView2"><h3>{name} ↗</h3></a><p>{["4 baked layers; compositor motion","90 frames in three atlases","Same 90 frames, VP9 alpha","Original mesh; simplified live lighting"][i]}</p></article>' for i,(m,name) in enumerate(names.items()))
page=f'''<!doctype html><html lang="th"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Maiden motion — measured comparison</title><style>
body{{margin:0;background:#0b121a;color:#d7e5ec;font:14px 'Segoe UI',sans-serif}}main{{max-width:1180px;margin:45px auto;padding:0 24px}}h1{{font:42px Georgia,serif;margin:12px 0 20px}}h2{{font-size:19px;margin-top:35px}}.eyebrow{{color:#8ac9df;font-size:10px;letter-spacing:3px}}p,li{{line-height:1.8;color:#a2b7c4}}a{{color:#b2e6f8}}.notice{{border-left:3px solid #99d7ed;padding:12px 20px;background:#132532}}table{{border-collapse:collapse;width:100%;font-size:12px}}td,th{{padding:12px 9px;border-bottom:1px solid #273845;text-align:right}}th{{color:#8ebdce;font-size:10px}}td:first-child,td:nth-child(2),th:first-child,th:nth-child(2){{text-align:left}}small{{display:block;color:#6f91a6;font-size:10px;margin-top:3px}}.scroll{{overflow:auto}}.gallery{{display:grid;grid-template-columns:1fr 1fr;gap:20px}}article{{background:#101d29;border:1px solid #243744;padding:12px}}article img{{width:100%}}article h3{{margin:10px 0;font-size:16px}}article p{{font-size:12px;margin:0}}footer{{margin:35px 0;color:#6b8e9f;font-size:11px}}@media(max-width:700px){{.gallery{{grid-template-columns:1fr}}}}</style><main>
<div class="eyebrow">G–MAIDEN / LOCAL RENDERER STUDY / 13 SEP 2026</div><h1>Four ways to forge the same crest.</h1>
<p>Blender 4.5.0 · 640×320 · 3 seconds / 30 fps · i7-14700KF / RTX 5060 Ti / 32 GB RAM</p>
<div class="notice"><b>ทดสอบครบ {len(data['trials'])}/24 trials — {len(data['functional'])}/8 functional combinations</b><br>Chrome และ native WebView2 ในหน้าต่างทดลอง ใช้ active-page emulation; ไม่ใช่ Tauri Overlay ที่เชื่อมเกม และไม่ใช่ผล Dota FPS.</div>
<p><a href="index.html">▶ เปิดต้นแบบ กดเล่นทั้ง 4 วิธี</a> · <a href="assets/maiden-crest.blend">ไฟล์ Blender</a> · <a href="benchmark.json">Raw measurements</a> · <a href="README.md">วิธีทดสอบและข้อจำกัด</a></p>
<h2>ค่ากลางของ 3 รอบต่อวิธี</h2><p>CPU เป็นสัดส่วนรวม 28 logical processors ของ process tree; แถวตัวเล็กคือช่วงต่ำสุด–สูงสุด. Private MiB รวม runtime/หน้า lab ไม่ใช่ asset อย่างเดียว. GPU เป็นผลรวม counter ของ engine 3D สำหรับ process tree ไม่ใช่ GPU ทั้งเครื่อง.</p>
<div class="scroll"><table><thead><tr><th>Runtime</th><th>Method</th><th>n</th><th>Active CPU</th><th>Idle CPU</th><th>GPU 3D</th><th>Private MiB</th><th>rAF p95 ms</th><th>Asset KiB</th></tr></thead><tbody>{''.join(rows)}</tbody></table></div>
<p>rAF คือโอกาสวาดเฟรมของหน้าเว็บ ไม่ใช่ FPS ของเกม. ภาพ/video ต้นฉบับมี 30 fps; แสงของ WebGL และ motion ของ layers เป็นการประมาณ จึงไม่ใช่การเทียบภาพระดับ pixel-identical ทั้งสี่วิธี.</p>
<h2>ภาพจาก WebView2 — กดเพื่อเล่น</h2><div class="gallery">{gallery}</div>
<h2>ขอบเขตการตัดสินใจ</h2><ul><li>ใช้ผลนี้เลือก renderer สำหรับต้นแบบฉากนี้; ยังไม่ใช่การรับรองงบ RAM 400 MB หรือ FPS impact ≤3% ของ G-Maiden.</li><li>Sprite มี pixel data RGBA ประมาณ 70.3 MiB; layers ประมาณ 3.1 MiB ก่อนนับ browser/GPU copies. ขนาดไฟล์บีบอัดไม่ใช่หน่วยความจำขณะเล่น.</li><li>WebM และ sprite ใช้เฟรมจาก Blender ชุดเดียวกัน; realtime ใช้ mesh เดียวกันกับ shader แบบง่าย ไม่มีเงาสดหรือฉากซับซ้อน.</li><li>Failed runs ถูกแยกเก็บพร้อม RCA; ผลตารางมาจากรอบที่ผ่าน alpha, error และ animation-progress checks เท่านั้น.</li></ul>
<footer>Prototype only · original procedural art · no game data / credentials / production changes</footer></main></html>'''
(ROOT/'report.html').write_text(page,encoding='utf-8')
sources=['lab.js','lab.css','index.html','build_scene.py','package_assets.py','NativeHost.cs','benchmark.py','probe.py','gpu_counters.py','serve.py']
(ROOT/'source-sha256.json').write_text(json.dumps({f:hashlib.sha256((ROOT/f).read_bytes()).hexdigest() for f in sources},indent=2))
print(json.dumps(summary,indent=2))
