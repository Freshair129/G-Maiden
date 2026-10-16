from probe import *
from PIL import Image
results=[]
for port,label in [(9241,'chrome'),(9242,'webview2')]:
    foreground('chrome' if port==9241 else 'native')
    c=CDP(port);c.call('Page.bringToFront')
    c.call('Network.enable')
    for mode in ['layers','sprite','video','realtime']:
        c.navigate(f'http://127.0.0.1:8768/?mode={mode}&benchmark=1')
        c.ev('window.ready')
        for bg in ['dark','light','checker']:
            c.ev(f'motionLab.background({json.dumps(bg)})')
            c.ev('motionLab.seek(1.2)')
            c.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            c.screenshot(f'{label}-{mode}-{bg}.png')
        alpha=c.ev('''(()=>{const el=document.querySelector('#visual video, #visual canvas, #visual img');const cv=document.createElement('canvas');cv.width=640;cv.height=320;const x=cv.getContext('2d');x.drawImage(el,0,0);const d=x.getImageData(0,0,640,320).data;let transparent=0,partial=0,opaque=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)transparent++;else if(d[i]===255)opaque++;else partial++;}return{corner:d[3],transparent,partial,opaque};})()''')
        assert alpha['corner']==0 and alpha['transparent']>0,alpha
        c.ev('motionLab.play(false)');time.sleep(3.4)
        ended=c.ev('motionLab.info()')
        assert ended['playing']==False,ended
        assert not ended['errors'],ended
        c.ev('motionLab.play(false)');time.sleep(.3)
        replay=c.ev('motionLab.info()')
        assert replay['playing'],replay
        c.ev('motionLab.stop()')
        results.append({'runtime':label,'mode':mode,'alpha':alpha,'ended':ended,'replay':True})
        print(label,mode,'alpha, one-shot, replay PASS',flush=True)
    requests=[e['params']['request']['url'] for e in c.events if e.get('method')=='Network.requestWillBeSent']
    external=[u for u in requests if not u.startswith(('http://127.0.0.1:8768/','data:','blob:'))]
    assert not external,external
    (ROOT/f'{label}-network.json').write_text(json.dumps({'requests':len(requests),'external':external},indent=2))
(ROOT/'functional-checks.json').write_text(json.dumps(results,indent=2,ensure_ascii=False),encoding='utf-8')
print('All eight runtime/renderer combinations verified',flush=True)
