import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';

const dir=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(dir,'../../../..');
const context=vm.createContext({});
for(const name of ['model.js','render.js','user-flows.js'])vm.runInContext(fs.readFileSync(path.join(dir,name),'utf8'),context,{filename:name});
const M=context.GM_WIREFRAMES,R=context.GM_WIREFRAME_RENDER,U=context.GM_USER_FLOWS;
const problems=[],destinations=[],screens=[];
const prefs=fs.readFileSync(path.join(repo,'src/src/deck/prefs.ts'),'utf8');
const pathOf=name=>prefs.match(new RegExp(`export const ${name} =\\s*"([^"]+)"`))?.[1];
if(M.basePath!==pathOf('FUNG_PANEL_PATH'))problems.push('Base shell differs from runtime');
if(M.dashboardPath!==pathOf('FUNG_PANEL_PATH_SIGNALS'))problems.push('Dashboard shell differs from runtime');
const expectedDashboard={A:[42,40,54,198],B:[140,54,640,48],C:[140,110,478,42],D:[140,160,640,276],E:[820,98,440,354],F:[140,446,620,170]};
for(const b of M.makeScreen('dashboard').blocks){if(expectedDashboard[b.id]&&String([b.x,b.y,b.w,b.h])!==String(expectedDashboard[b.id]))problems.push(`Dashboard ${b.id} moved`);}
let variants=0;
for(const p of M.pages)for(const [tab] of p.tabs){
  const route=M.route(p.key,tab,p.states[0][0]);
  const file=`${p.id}-${p.key}-${tab}.svg`;
  screens.push({id:p.id,page:p.key,tab,route,file,states:p.states.map(s=>s[0])});
  for(const [state] of p.states){
    variants++;
    const screen=M.makeScreen(M.route(p.key,tab,state));
    const result=R.screenSVG(screen,{grid:true});
    for(const issue of result.issues)problems.push(`${screen.route}: ${issue}`);
    for(const b of screen.blocks){
      if(b.x<0||b.y<0||b.x+b.w>1420||b.y+b.h>760)problems.push(`${screen.route}: ${b.id} outside stage`);
      for(const a of b.actions)if(!a.disabled){if(!a.to)problems.push(`${screen.route}: ${a.id} has no destination`);else destinations.push([screen.route,a.id,a.to]);}
    }
  }
}
for(const f of M.flows)for(const [to] of [...f.steps,...f.recovery])destinations.push([f.id,'flow',to]);
for(const f of U.flows){
  const ids=new Set(f.nodes.map(n=>n.id)),outgoing=id=>f.edges.filter(e=>e.from===id);
  if(ids.size!==f.nodes.length)problems.push(`${f.id}: duplicate node ID`);
  if(!M.flows.some(w=>w.id===f.wireflow))problems.push(`${f.id}: missing wireflow`);
  const reached=new Set(),pending=f.nodes.filter(n=>n.type==='start').map(n=>n.id);
  while(pending.length){const id=pending.pop();if(reached.has(id))continue;reached.add(id);pending.push(...outgoing(id).map(e=>e.to));}
  for(const edge of f.edges)if(!ids.has(edge.from)||!ids.has(edge.to))problems.push(`${f.id}: dangling edge`);
  for(const edge of U.connectors(f))if(edge.crossings.length)problems.push(`${f.id}: ${edge.from} → ${edge.to} crosses ${edge.crossings.join(',')}`);
  for(const n of f.nodes){
    if(!reached.has(n.id))problems.push(`${f.id}: unreachable ${n.id}`);
    if(n.type==='decision'&&(outgoing(n.id).length<2||outgoing(n.id).some(e=>!e.label)))problems.push(`${f.id}: decision ${n.id} needs labeled branches`);
    if(n.type!=='outcome'&&!outgoing(n.id).length)problems.push(`${f.id}: ${n.id} has no next step`);
    if(n.route)destinations.push([f.id,n.id,n.route]);
  }
}
for(const [from,id,to] of destinations){if(M.normalize(to).route!==to)problems.push(`${from} ${id}: unknown route ${to}`);}
if(M.pages.length!==7||screens.length!==23)problems.push('Expected 7 pages and 23 tab/category frames');
if(problems.length){console.error(problems.join('\n'));process.exit(1);}
for(const screen of screens){
  const {svg}=R.screenSVG(M.makeScreen(screen.route),{grid:true});
  fs.writeFileSync(path.join(dir,screen.file),svg+'\n');
}
for(const flow of M.flows)fs.writeFileSync(path.join(dir,flow.id+'-wireflow.svg'),R.flowSVG(flow)+'\n');
for(const flow of U.flows)fs.writeFileSync(path.join(dir,flow.id+'-user-flow.svg'),U.svg(flow)+'\n');
fs.writeFileSync(path.join(dir,'manifest.json'),JSON.stringify({version:'1.1.0',stage:M.stage,panel:M.panel,pages:7,tabFrames:screens.length,stateVariants:variants,flows:M.flows.map(f=>({id:f.id,title:f.title,file:f.id+'-wireflow.svg',steps:f.steps,recovery:f.recovery})),userFlows:U.flows.map(f=>({id:f.id,title:f.title,goal:f.goal,success:f.success,wireflow:f.wireflow,file:f.id+'-user-flow.svg',nodes:f.nodes,edges:f.edges})),screens},null,2)+'\n');
console.log(`Verified exact runtime shell paths; ${M.pages.length} pages, ${screens.length} tab frames, ${variants} state variants, ${M.flows.length} wireflows, ${U.flows.length} user flows, ${destinations.length} valid destinations. Generated ${screens.length+M.flows.length+U.flows.length} SVGs + manifest.`);
