import json
from browser_probe import *
click('Account')
evaluate("""(async()=>{const {mount}=await import('/node_modules/.cache/gmad-ui/account-fixture.js?v=final');const surface=document.querySelector('.surface.page-account');surface.replaceChildren();window.accountFixtureRoot=mount(surface);})()""")
results={};keyboard=[]
for w,h in [(1200,780),(1265,817),(1920,1080)]:
 browser('set','viewport',str(w),str(h))
 for label,name in [('บัญชี','profile'),('กระเป๋า','wallet'),('ประวัติธุรกรรม','ledger'),('ความปลอดภัย','security')]:
  click(label);evaluate("document.querySelector('.account-content').scrollTop=0");browser('wait','350')
  results[f'{w}-{name}']=capture(f'{w}x{h}-signedin-{name}')
  if name in ['ledger','security']:
   selector='[aria-label="รายการธุรกรรมในหน้านี้"]' if name=='ledger' else '.account-content'
   before=evaluate("document.querySelector('.account-title').getBoundingClientRect().top")
   browser('focus',selector);browser('press','Control+End');browser('wait','500')
   state=evaluate("(()=>{const region=document.querySelector("+json.dumps(selector)+");return{top:document.querySelector('.account-title').getBoundingClientRect().top,scrollTop:region.scrollTop,height:region.clientHeight,scrollHeight:region.scrollHeight}})()")
   assert abs(state['top']-before)<1 and abs(state['scrollTop']+state['height']-state['scrollHeight'])<2,state
   keyboard.append({'viewport':[w,h],'region':name,**state});capture(f'{w}x{h}-signedin-{name}-end')
ROOT.joinpath('signedin-matrix.json').write_text(json.dumps(results,ensure_ascii=False,indent=2),encoding='utf-8')
ROOT.joinpath('keyboard-scroll.json').write_text(json.dumps(keyboard,ensure_ascii=False,indent=2),encoding='utf-8')
print('12 signed-in states and 6 keyboard checks passed',flush=True)
ROOT.joinpath('browser-final-errors.json').write_text(browser('--json','errors'),encoding='utf-8')
