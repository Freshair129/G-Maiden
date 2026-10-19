(function(){
  const M=globalThis.GM_WIREFRAMES,R=globalThis.GM_WIREFRAME_RENDER,U=globalThis.GM_USER_FLOWS;
  const el=id=>document.getElementById(id);
  let current=M.normalize(location.hash),mode='screens',lastRoutes=[];
  function options(select,values,selected){select.replaceChildren(...values.map(([value,label])=>{const o=document.createElement('option');o.value=value;o.textContent=label;o.selected=value===selected;return o;}));}
  function link(label,to){const a=document.createElement('a');a.textContent=label;a.href='#'+to;a.dataset.destination=to;return a;}
  function setMode(next){
    mode=next;el('screen-view').hidden=mode!=='screens';el('flow-view').hidden=mode!=='flows';el('userflow-view').hidden=mode!=='userflows';
    el('screens-mode').setAttribute('aria-pressed',mode==='screens');el('flows-mode').setAttribute('aria-pressed',mode==='flows');el('userflows-mode').setAttribute('aria-pressed',mode==='userflows');
    if(mode==='flows')renderFlow();else if(mode==='userflows')renderUserFlow();else{history.replaceState(null,'','#'+current.route);el('status').textContent='กำลังดู '+current.route+' · สถานะตัวอย่าง';}
  }
  function render(){
    const screen=M.makeScreen(current.route),result=R.screenSVG(screen,{grid:el('grid-toggle').checked});
    el('screen-canvas').innerHTML=result.svg;
    options(el('tab-select'),current.page.tabs,current.tab);
    const stateOptions=current.page.states.map(([value,label])=>[value,current.tab==='editor'&&value==='active'?'บันทึกแล้ว':current.page.key==='account'&&current.tab==='security'&&value==='loading'?'กำลังอ่านสถานะ':label]);
    options(el('state-select'),stateOptions,current.state);
    el('screen-title').textContent=current.page.id+' · '+current.page.title;
    el('screen-description').textContent='stage 1420×760 · กรอบเดิม · '+(current.page.key==='dashboard'?'A–J':'พื้นที่เนื้อหา 116,86 / 1148×622');
    document.querySelectorAll('#page-nav button').forEach(b=>b.setAttribute('aria-current',b.dataset.page===current.page.key?'page':'false'));
    el('geometry').replaceChildren(...screen.blocks.map(b=>{const n=document.createElement('span');n.textContent=`${b.id}: x${b.x} y${b.y} · ${b.w}×${b.h}`;return n;}));
    el('back-button').disabled=!lastRoutes.length;
    el('status').textContent='กำลังดู '+current.route+' · สถานะตัวอย่าง';
    if(result.issues.length)console.error('Wireframe content overflow',result.issues);
  }
  function navigate(to,push=true){
    if(to[0]==='@'){showChrome(to);return;}
    const next=M.normalize(to);if(push&&current.route!==next.route)lastRoutes.push(current.route);
    current=next;history.replaceState(null,'','#'+current.route);setMode('screens');render();
    if(el('chrome-dialog').open)el('chrome-dialog').close();
  }
  function renderFlow(){
    const f=M.flows.find(f=>f.id===el('flow-select').value)||M.flows[0];
    el('flow-canvas').innerHTML=R.flowSVG(f);
    el('recovery-links').replaceChildren(...f.recovery.map(([to,label])=>link(label,to)));
    el('status').textContent=f.id+' · '+f.title;
    history.replaceState(null,'','#wireflow/'+f.id);
  }
  function renderUserFlow(){
    const f=U.flows.find(f=>f.id===el('userflow-select').value)||U.flows[0];
    el('userflow-canvas').innerHTML=U.svg(f);
    el('userflow-success').textContent='ผลที่ผู้ใช้ควรได้รับ: '+f.success;
    el('status').textContent=f.id+' · '+f.title+' · แบบเป้าหมาย';
    history.replaceState(null,'','#user-flow/'+f.id);
  }
  function openHash(){
    const parts=location.hash.slice(1).split('/');
    if(parts[0]==='user-flow'){el('userflow-select').value=U.flows.some(f=>f.id===parts[1])?parts[1]:'UF01';setMode('userflows');}
    else if(parts[0]==='wireflow'){el('flow-select').value=M.flows.some(f=>f.id===parts[1])?parts[1]:'F01';setMode('flows');}
    else navigate(location.hash.replace(/^#/,''),false);
  }
  function showChrome(type){
    const d=el('chrome-dialog');el('dialog-title').textContent=type==='@profile'?'H · เมนูโปรไฟล์':'J · เมนูพลังงาน';
    if(type==='@profile')el('dialog-content').replaceChildren(link('บัญชีและ Steam','account/account/signedout'),link('แพ็กเสียง','voice/inventory/ready'),link('ตั้งค่า','settings/general/ready'));
    else{const p=document.createElement('p');p.textContent='ในแอปจริง: พับลง Tray / ออกจากแอป / จับลากหน้าต่าง แบบนี้แสดงตำแหน่งและปิดกลับหน้าเดิมได้';el('dialog-content').replaceChildren(p);}
    d.showModal();
  }
  M.pages.forEach(p=>{const b=document.createElement('button');b.textContent=p.id+' '+p.label;b.dataset.page=p.key;b.addEventListener('click',()=>navigate(p.key));el('page-nav').append(b);el('all-page-links').append(link(p.id+' '+p.label,p.key));});
  options(el('flow-select'),M.flows.map(f=>[f.id,f.id+' · '+f.title]),'F01');
  options(el('userflow-select'),U.flows.map(f=>[f.id,f.id+' · '+f.title]),'UF01');
  document.addEventListener('click',event=>{const a=event.target.closest('[data-destination]');if(a){event.preventDefault();navigate(a.dataset.destination);}});
  document.addEventListener('keydown',event=>{if(event.ctrlKey&&/^[1-7]$/.test(event.key)){event.preventDefault();navigate(M.pages[Number(event.key)-1].key);}});
  el('tab-select').addEventListener('change',()=>navigate(M.route(current.page.key,el('tab-select').value,current.state)));
  el('state-select').addEventListener('change',()=>navigate(M.route(current.page.key,current.tab,el('state-select').value)));
  el('grid-toggle').addEventListener('change',render);
  el('screens-mode').addEventListener('click',()=>setMode('screens'));el('flows-mode').addEventListener('click',()=>setMode('flows'));
  el('userflows-mode').addEventListener('click',()=>setMode('userflows'));el('userflow-select').addEventListener('change',renderUserFlow);
  el('related-wireflow').addEventListener('click',()=>{el('flow-select').value=U.flows.find(f=>f.id===el('userflow-select').value).wireflow;setMode('flows');});
  el('flow-select').addEventListener('change',renderFlow);el('open-current').addEventListener('click',()=>setMode('screens'));
  el('back-button').addEventListener('click',()=>{if(lastRoutes.length)navigate(lastRoutes.pop(),false);});
  el('dialog-close').addEventListener('click',()=>el('chrome-dialog').close());
  window.addEventListener('hashchange',openHash);
  render();openHash();
})();
