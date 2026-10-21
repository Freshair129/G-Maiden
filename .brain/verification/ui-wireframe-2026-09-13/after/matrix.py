import sys, json
from browser_probe import *
w,h=map(int,sys.argv[1:3]); browser('set','viewport',str(w),str(h))
results={}
def record(name):
    print('Capturing '+name,flush=True)
    results[name]=capture(f'{w}x{h}-{name}')

def category(index):
    evaluate(f"document.querySelectorAll('nav[aria-label=\"หมวดตั้งค่า\"] button')[{index}].click()")

for page in ['Dashboard','Live','Voice','Store','Insights','Account','Settings']:
    click(page)
    defaults={'Live':'สด','Voice':'คลังของฉัน','Store':'ร้านค้า','Insights':'ภาพรวม','Account':'บัญชี'}
    if page in defaults: click(defaults[page])
    if page=='Settings': category(0)
    record(page.lower())
click('Live'); click('บิลด์'); record('build')
click('Voice'); click('ไอเทม'); record('voice-items')
click('ตัวแก้ไข')
for tab,name in [('ติดตั้งและสร้าง','install'),('ข้อมูลและไฟล์','details'),('ผูกอีเวนต์','events')]:
    click(tab); record('voice-editor-'+name)
click('Store')
for tab,name in [('กระเป๋า','wallet'),('คลัง','inventory'),('บันทึก','ledger')]:
    click(tab); record('store-'+name)
click('Insights'); click('ประวัติ'); record('history')
click('Account')
for tab,name in [('กระเป๋า','wallet'),('ประวัติธุรกรรม','ledger'),('ความปลอดภัย','security')]:
    click(tab); record('account-'+name)
click('Settings')
for i,name in enumerate(['general','overlay','voice','ai','modules','privacy','system']):
    category(i); record('settings-'+name)
    if name=='voice':
        click('เสียงพูด'); record('settings-speech')
        click('แบนเนอร์และบุคลิก'); record('settings-banners')
ROOT.joinpath(f'{w}x{h}-matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
failures=[]
for name,result in results.items():
    for sel in ['.surface','.account-page','.audio-page','.gm-packs-page','.voice-inventory','.voice-grid']:
        r=result['region'].get(sel)
        if r and r['scroll']>r['height']+1: failures.append((name,sel,r))
    if name in ['settings-speech','settings-banners']:
        r=result['region']['.settings-detail-body']
        if r['scroll']>r['height']+1: failures.append((name,'audio overflow',r))
print(json.dumps({'viewport':[w,h],'states':len(results),'failures':failures},ensure_ascii=False))
