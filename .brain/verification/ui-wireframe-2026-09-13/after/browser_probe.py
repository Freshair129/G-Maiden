import subprocess, json, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parent

def browser(*args, js=None):
    command = [r"C:\Users\pc\AppData\Local\npm-cache\_npx\6de2aa2fded2970c\node_modules\agent-browser\bin\agent-browser-win32-x64.exe", "--session", "gmad-ui-fix", *args]
    with tempfile.TemporaryFile(mode="w+",encoding="utf-8") as output:
        p = subprocess.run(command, input=js, stdout=output, stderr=output, text=True, encoding="utf-8", errors="replace", timeout=45)
        output.seek(0); result=output.read()
    if p.returncode: raise RuntimeError(result)
    return result

def evaluate(js):
    raw = browser("--json", "eval", "--stdin", js=js)
    value = json.loads(raw)
    if not value.get("success"): raise RuntimeError(raw)
    return value["data"]["result"]

def click(label):
    # Labels are from inspected snapshots; eval avoids cmd.exe metacharacter parsing.
    evaluate("(() => { const el = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === " + json.dumps(label) + " || b.getAttribute('aria-label') === " + json.dumps(label) + "); if (!el) throw Error('Missing button'); el.click(); })()")
    evaluate("new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))")

def capture(name):
    evaluate("document.fonts.ready.then(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))")
    ROOT.joinpath(name+'.txt').write_text(browser('snapshot','-i'),encoding='utf-8')
    browser('screenshot', str(ROOT/(name+'.png')))
    result=evaluate("""(() => {
      const selectors=['.surface','.account-page','.account-content','.wallet-tab','.gm-packs-page','.voice-inventory','.voice-grid','.voice-detail','.audio-page','.audio-tools-grid','.audio-grid','.settings-detail-body'];
      const region=Object.fromEntries(selectors.map(s => {const e=document.querySelector(s); if(!e)return[s,null];const c=getComputedStyle(e); const r=e.getBoundingClientRect();return[s,{height:e.clientHeight,scroll:e.scrollHeight,overflow:c.overflowY,top:r.top,bottom:r.bottom}]}));
      const cards=[...document.querySelectorAll('.domain-page .card-shell')].map(e=>({background:getComputedStyle(e).background,shadow:getComputedStyle(e).boxShadow,blur:getComputedStyle(e).backdropFilter}));
      return {viewport:[innerWidth,innerHeight],region,cards};
    })()""")
    ROOT.joinpath(name+'.json').write_text(json.dumps(result,ensure_ascii=False,indent=2),encoding='utf-8')
    return result
