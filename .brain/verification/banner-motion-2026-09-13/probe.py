import sys, json, time, urllib.request, subprocess, tempfile, base64, statistics, re, os, ctypes
from pathlib import Path
ROOT=Path(__file__).resolve().parent
sys.stdout.reconfigure(encoding='utf-8')
sys.path.insert(0,str(ROOT/'runtime/python'))
import psutil, websocket
def foreground(label):
    pid=int((ROOT/f'runtime/{label}.pid').read_text())
    allowed={pid,*[p.pid for p in psutil.Process(pid).children(recursive=True)]}
    found=[]
    callback=ctypes.WINFUNCTYPE(ctypes.c_bool,ctypes.c_void_p,ctypes.c_void_p)
    user=ctypes.windll.user32
    user.GetWindowThreadProcessId.argtypes=[ctypes.c_void_p,ctypes.POINTER(ctypes.c_ulong)]
    user.ShowWindow.argtypes=[ctypes.c_void_p,ctypes.c_int]
    user.SetForegroundWindow.argtypes=[ctypes.c_void_p]
    user.SetWindowPos.argtypes=[ctypes.c_void_p,ctypes.c_void_p,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_int,ctypes.c_uint]
    def visit(hwnd,param):
        owner=ctypes.c_ulong();user.GetWindowThreadProcessId(hwnd,ctypes.byref(owner))
        if owner.value in allowed:
            title=ctypes.create_unicode_buffer(512)
            user.GetWindowTextW(ctypes.c_void_p(hwnd),title,512)
            if title.value and ('Maiden' in title.value or 'Chrome' in title.value):found.append(hwnd)
        return True
    user.EnumWindows(callback(visit),0)
    for hwnd in found:
        user.ShowWindow(hwnd,9);user.SetWindowPos(hwnd,ctypes.c_void_p(-1),0,0,0,0,0x43);user.SetForegroundWindow(hwnd)
    return len(found)
EXE=r'C:\Users\pc\AppData\Local\npm-cache\_npx\6de2aa2fded2970c\node_modules\agent-browser\bin\agent-browser-win32-x64.exe'
def browser(*args):
    with tempfile.TemporaryFile(mode='w+',encoding='utf-8') as f:
        p=subprocess.run([EXE,'--session','gmad-motion',*args],stdout=f,stderr=f,text=True,timeout=45)
        f.seek(0);s=f.read()
    if p.returncode:raise RuntimeError(s)
    return s
def get(path,port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}',timeout=8) as r:return json.load(r)
class CDP:
    def __init__(self,port,kind='page'):
        if kind=='browser': url=get('/json/version',port)['webSocketDebuggerUrl']
        else:
            tabs=get('/json/list',port)
            tab=next((t for t in tabs if t['type']=='page' and '127.0.0.1:8768' in t['url']),next(t for t in tabs if t['type']=='page'))
            url=tab['webSocketDebuggerUrl']
        self.ws=websocket.create_connection(url,timeout=35,origin=f'http://localhost:{port}');self.seq=0;self.events=[]
    def call(self,method,params=None):
        self.seq+=1;self.ws.send(json.dumps({'id':self.seq,'method':method,'params':params or {}}))
        deadline=time.monotonic()+40
        while True:
            if time.monotonic()>deadline:raise TimeoutError(method)
            r=json.loads(self.ws.recv())
            if r.get('id')==self.seq:
                if 'error'in r:raise RuntimeError(r['error'])
                return r.get('result',{})
            self.events.append(r)
    def ev(self,code):
        r=self.call('Runtime.evaluate',{'expression':code,'awaitPromise':True,'returnByValue':True})
        if 'exceptionDetails'in r:raise RuntimeError(r['exceptionDetails'])
        return r.get('result',{}).get('value')
    def navigate(self,url):
        old=self.ev('performance.timeOrigin')
        self.call('Page.navigate',{'url':url})
        end=time.time()+20
        while time.time()<end:
            try:
                if self.ev(f'performance.timeOrigin!=={old} && typeof window.motionLab!=="undefined" && typeof window.ready!=="undefined"'):
                    self.ev('window.ready');return
            except Exception:pass
            time.sleep(.15)
        raise TimeoutError('Lab did not load')
    def screenshot(self,name):
        data=self.call('Page.captureScreenshot',{'format':'png','captureBeyondViewport':False})['data']
        (ROOT/name).write_bytes(base64.b64decode(data))

if __name__=='__main__':
    port=int(sys.argv[1]) if len(sys.argv)>1 else 9241
    print(json.dumps(get('/json/list',port),indent=2),flush=True)
    c=CDP(port);print(c.ev('document.title'),flush=True)
