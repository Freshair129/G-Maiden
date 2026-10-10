from probe import *
from gpu_counters import GPU

MODES=['layers','sprite','video','realtime']
OUT=ROOT/'benchmark.json'
result={'hardware':{'cpu':'Intel Core i7-14700KF','logicalProcessors':psutil.cpu_count(),'gpu':'NVIDIA GeForce RTX 5060 Ti','ramGiB':round(psutil.virtual_memory().total/2**30,2)},'protocol':{'freshProcessPerTrial':True,'focusEmulation':True,'rounds':3,'warmupSeconds':3,'idleSeconds':3,'activeSeconds':9,'motionSeconds':3,'sourceFps':30,'sound':False,'nfrAcceptance':False},'trials':[],'functional':[]}
if '--resume' in sys.argv and OUT.exists():
    prior=json.loads(OUT.read_text(encoding='utf-8'))
    result['trials']=prior['trials'];result['functional']=prior['functional']

def save():OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
def snapshot(root):
    processes=[root,*root.children(recursive=True)];data={}
    for p in processes:
        try:
            cpu=p.cpu_times();mem=p.memory_info()
            data[p.pid]={'cpu':cpu.user+cpu.system,'rss':mem.rss,'private':getattr(mem,'private',None)}
        except (psutil.NoSuchProcess,psutil.AccessDenied):pass
    return data
def sample(root,seconds,gpu):
    initial=snapshot(root);previous=initial;before=time.perf_counter();last=before;samples=[]
    psutil.cpu_percent(None)
    while time.perf_counter()-before<seconds:
        time.sleep(.5)
        now=time.perf_counter();s=snapshot(root)
        delta=sum(max(0,v['cpu']-previous[k]['cpu']) for k,v in s.items() if k in previous)
        samples.append({'elapsed':now-before,'cpuCorePercent':delta/(now-last)*100,'cpuMachinePercent':delta/(now-last)*100/psutil.cpu_count(),'privateMiB':sum(v['private'] or 0 for v in s.values())/2**20,'workingSetSumMiB':sum(v['rss'] for v in s.values())/2**20,'gpuEnginesPercent':gpu.sample(set(s)),'systemCpuPercent':psutil.cpu_percent(None),'pids':list(s)})
        previous=s;last=now
    return samples
def stats(samples):
    out={k:round(statistics.mean(s[k] for s in samples),4) for k in ['cpuCorePercent','cpuMachinePercent','privateMiB','workingSetSumMiB','systemCpuPercent']}
    out['privatePeakMiB']=max(s['privateMiB'] for s in samples)
    good=[s['gpuEnginesPercent'] for s in samples if s['gpuEnginesPercent'] is not None]
    out['gpuEnginesPercent']={k:round(statistics.mean(g.get(k,0) for g in good),4) for k in set().union(*(set(g) for g in good))} if good else None
    return out
def close_owned(root,proc):
    try:children=root.children(recursive=True)
    except psutil.NoSuchProcess:children=[]
    # Every target is this invocation's own Popen process or its observed descendants.
    for p in [*reversed(children),root]:
        try:p.terminate()
        except psutil.NoSuchProcess:pass
    psutil.wait_procs([*children,root],timeout=5)

overall=time.monotonic()
for runtime,port in [('chrome',9351),('webview2',9352)]:
  for repeat in range(3):
    order=MODES[repeat:]+MODES[:repeat]
    for mode in order:
      if any(t['runtime']==runtime and t['round']==repeat+1 and t['mode']==mode for t in result['trials']):continue
      if time.monotonic()-overall>1100:raise TimeoutError('Benchmark ceiling')
      label='chrome' if runtime=='chrome' else 'native'
      profile=ROOT/'runtime'/f'{runtime}-{repeat}-{mode}'
      profile.mkdir(exist_ok=True)
      url=f'http://127.0.0.1:8768/?benchmark=1&mode={mode}'
      if runtime=='chrome':
        cmd=[r'C:\Program Files\Google\Chrome\Application\chrome.exe',f'--user-data-dir={profile}',f'--remote-debugging-port={port}',f'--remote-allow-origins=http://localhost:{port}','--no-first-run','--no-default-browser-check','--window-size=1280,880',url]
      else:cmd=[str(ROOT/'runtime/MaidenMotionBench.exe'),str(profile),str(port),mode]
      proc=subprocess.Popen(cmd,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
      root=psutil.Process(proc.pid)
      (ROOT/f'runtime/{label}.pid').write_text(str(proc.pid))
      gpu=GPU();c=None
      try:
        for attempt in range(80):
          try:
            tabs=get('/json/list',port)
            if any(url==t.get('url') for t in tabs):break
          except Exception:pass
          time.sleep(.2)
        foreground(label)
        c=CDP(port);c.call('Page.bringToFront');c.call('Emulation.setFocusEmulationEnabled',{'enabled':True});c.call('Network.enable')
        for attempt in range(60):
          if c.ev('typeof window.ready!=="undefined"'):break
          time.sleep(.2)
        c.ev('window.ready')
        info=c.ev('motionLab.info()')
        assert info['mode']==mode,info
        assert c.ev('document.visibilityState')=='visible','Occluded test window'
        if repeat==0:
          for bg in ['dark','light','checker']:
            c.ev(f'motionLab.background({json.dumps(bg)})');c.ev('motionLab.seek(1.2)')
            c.ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
            c.screenshot(f'{runtime}-{mode}-{bg}.png')
          alpha=c.ev('''(()=>{const el=document.querySelector('#visual video, #visual canvas, #visual img');const cv=document.createElement('canvas');cv.width=640;cv.height=320;const x=cv.getContext('2d');x.drawImage(el,0,0);const d=x.getImageData(0,0,640,320).data;let transparent=0,partial=0,opaque=0;for(let i=3;i<d.length;i+=4){if(d[i]===0)transparent++;else if(d[i]===255)opaque++;else partial++;}return{corner:d[3],transparent,partial,opaque};})()''')
          assert alpha['corner']==0 and alpha['opaque']>0,alpha
          c.ev('motionLab.play(false)');time.sleep(3.4)
          ended=c.ev('motionLab.info()');assert not ended['playing'],ended
          assert not ended['errors'],ended
          result['functional'].append({'runtime':runtime,'mode':mode,'alpha':alpha,'oneShotStopped':True,'endTime':ended['current']})
        c.ev('motionLab.background("dark")');c.ev('motionLab.play(true)');time.sleep(3)
        c.ev('motionLab.seek(1.2)')
        idle=sample(root,3,gpu)
        c.ev('motionLab.play(true)');c.ev('motionLab.measureStart()')
        active=sample(root,9,gpu)
        frame=c.ev('motionLab.measureEnd()');c.ev('motionLab.stop()')
        assert frame['mode']==mode and frame['visibility']=='visible' and not frame['errors'],frame
        assert frame['rafSamples']>100,frame
        trial={'runtime':runtime,'round':repeat+1,'mode':mode,'info':info,'idle':stats(idle),'active':stats(active),'frames':frame,'raw':{'idle':idle,'active':active},'gpuCounterError':gpu.error}
        result['trials'].append(trial);save()
        print(runtime,repeat+1,mode,'CPU',trial['active']['cpuMachinePercent'],'private MiB',round(trial['active']['privateMiB']), 'rAF p95',round(frame['rafP95Ms'],2),flush=True)
      except Exception as e:
        result.setdefault('failures',[]).append({'runtime':runtime,'round':repeat+1,'mode':mode,'error':str(e)});save();raise
      finally:
        gpu.close()
        if c:c.ws.close()
        close_owned(root,proc)
print('Completed 24 trials',flush=True)
