from probe import *
port=9361
cmd=[r'C:\Program Files\Google\Chrome\Application\chrome.exe',f'--user-data-dir={ROOT}/runtime/video-probe',f'--remote-debugging-port={port}',f'--remote-allow-origins=http://localhost:{port}','--no-first-run','http://127.0.0.1:8768/?benchmark=1&mode=video']
p=subprocess.Popen(cmd);root=psutil.Process(p.pid)
try:
    time.sleep(1)
    c=CDP(port);c.call('Emulation.setFocusEmulationEnabled',{'enabled':True})
    c.ev('window.ready')
    js='''(()=>{let v=document.querySelector('video');let x=document.createElement('canvas');x.width=640;x.height=320;let ctx=x.getContext('2d');ctx.drawImage(v,0,0);let d=ctx.getImageData(0,0,640,320).data;let n=0;for(let i=3;i<d.length;i+=4)if(d[i]>200)n++;return {time:v.currentTime,duration:v.duration,ready:v.readyState,opaque:n,quality:v.getVideoPlaybackQuality()};})()'''
    print('SEEK',c.ev(js),flush=True)
    c.ev('motionLab.play(false)');time.sleep(1.2)
    print('PLAY',c.ev(js),flush=True)
    c.ev('motionLab.stop()');c.screenshot('video-playing-proof.png')
    print('PRESENT',c.ev('new Promise(r=>{let v=document.querySelector("video");v.requestVideoFrameCallback((n,m)=>r(m));v.currentTime=1.5;})'),flush=True)
    print('NEW SEEK',c.ev(js),flush=True)
finally:
    for q in [*root.children(recursive=True),root]:
        try:q.terminate()
        except psutil.NoSuchProcess:pass
