from probe import *
results=[]
for runtime,port in [('chrome',9371),('webview2',9372)]:
    profile=ROOT/'runtime'/f'final-{runtime}';profile.mkdir(exist_ok=True)
    if runtime=='chrome':cmd=[r'C:\Program Files\Google\Chrome\Application\chrome.exe',f'--user-data-dir={profile}',f'--remote-debugging-port={port}',f'--remote-allow-origins=http://localhost:{port}','--no-first-run','--window-size=1280,920','http://127.0.0.1:8768/']
    else:cmd=[str(ROOT/'runtime/MaidenMotionBench.exe'),str(profile),str(port),'layers']
    proc=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL);root=psutil.Process(proc.pid)
    try:
        for attempt in range(60):
            try:c=CDP(port);break
            except Exception:time.sleep(.2)
        c.call('Emulation.setFocusEmulationEnabled',{'enabled':True})
        c.call('Network.enable')
        for attempt in range(60):
            if c.ev('typeof window.ready!=="undefined"'):break
            time.sleep(.2)
        c.ev('window.ready')
        for mode in ['layers','sprite','video','realtime']:
            c.ev(f'motionLab.select({json.dumps(mode)})')
            c.ev('motionLab.seek(-.001)')
            c.ev('motionLab.seek(1.2)')
            if mode=='video':
                assert c.ev('Math.abs(document.querySelector("video").currentTime-1.2)<.04')
                assert c.ev('document.querySelectorAll("#visual canvas").length')==1
            c.ev('motionLab.play(false)');time.sleep(3.4)
            ended=c.ev('({info:motionLab.info(),hidden:getComputedStyle(document.querySelector("#visual")).visibility,caption:getComputedStyle(document.querySelector("#caption")).opacity})')
            assert ended['hidden']=='hidden' and ended['caption']=='0' and not ended['info']['playing'] and not ended['info']['errors'],ended
            c.ev('motionLab.play(true)');time.sleep(.3)
            assert c.ev('motionLab.info().playing')
            if mode=='video':assert c.ev('document.querySelectorAll("#visual canvas").length')==0
            c.ev('motionLab.seek(1.2)')
            for bg in ['dark','light','checker']:
                c.ev(f'motionLab.background({json.dumps(bg)})')
                c.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
                c.screenshot(f'{runtime}-{mode}-{bg}.png')
            results.append({'runtime':runtime,'mode':mode,'negativeSeek':True,'oneShotHidden':True,'captionHidden':True,'replay':True,'errors':c.ev('motionLab.info().errors')})
            print(runtime,mode,'PASS',flush=True)
        requests=[e['params']['request']['url'] for e in c.events if e.get('method')=='Network.requestWillBeSent']
        external=[u for u in requests if not u.startswith(('http://127.0.0.1:8768/','data:','blob:'))]
        assert not external,external
        (ROOT/f'{runtime}-network.json').write_text(json.dumps({'requests':len(requests),'external':external},indent=2))
    finally:
        for p in [*root.children(recursive=True),root]:
            try:p.terminate()
            except psutil.NoSuchProcess:pass
(ROOT/'final-functional.json').write_text(json.dumps(results,indent=2))
print('8/8 final combinations passed',flush=True)
