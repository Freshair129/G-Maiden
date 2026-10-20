(function(root){
  const M=root.GM_WIREFRAMES;
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const colors={bg:'#0b1016',shell:'#1a2530',surface:'#101820',border:'#526170',text:'#e6edf3',dim:'#b0bdc9',ice:'#a9dfff'};
  const text=(x,y,value,size=15,fill=colors.text,extra='')=>`<text x="${x}" y="${y}" font-size="${size}" fill="${fill}" ${extra}>${esc(value)}</text>`;
  const rect=(x,y,w,h,fill=colors.surface,stroke=colors.border,r=10)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}"/>`;
  function wrap(line,width){
    const max=Math.max(6,Math.floor(width/7.5)),chars=Array.from(line),out=[];
    while(chars.length>max){
      let end=max;
      for(let i=max;i>max*.65;i--)if(chars[i]===' '){end=i;break;}
      out.push(chars.splice(0,end).join('').trim());
      if(chars[0]===' ')chars.shift();
    }
    if(chars.length)out.push(chars.join(''));
    return out;
  }
  function actionLayout(b){
    let x=0,row=0;
    const buttons=b.actions.map(a=>{
      const w=Math.min(b.w-24,Math.max(100,Array.from(a.label).length*7.8+22));
      if(x&&x+w>b.w-24){x=0;row++;}
      const p={...a,x:b.x+12+x,row,w,h:28};x+=w+8;return p;
    });
    const top=b.y+b.h-(buttons.length?(row+1)*34+8:0);
    return {buttons:buttons.map(a=>({...a,y:top+a.row*34})),top};
  }
  function linkButton(a){
    const body=rect(a.x,a.y,a.w,a.h,a.disabled?'#17202a':'#203345',a.disabled?'#3b4650':colors.ice,6)+text(a.x+a.w/2,a.y+19,a.label,13,a.disabled?'#a0aab5':colors.text,'text-anchor="middle"');
    return a.disabled?`<g aria-label="${esc(a.label)} · ยังไม่เปิด">${body}</g>`:`<a href="#${esc(a.to)}" data-destination="${esc(a.to)}" data-action="${esc(a.id)}" aria-label="${esc(a.label)}">${body}</a>`;
  }
  function block(b,issues){
    let result=rect(b.x,b.y,b.w,b.h);
    if(b.w<80){
      result+=text(b.x+b.w/2,b.y+22,b.id,13,colors.ice,'text-anchor="middle"');
      result+=text(b.x+b.w/2,b.y+44,b.title,13,colors.text,'text-anchor="middle"');
      b.lines.forEach((l,i)=>result+=text(b.x+b.w/2,b.y+67+i*27,l,11,colors.dim,'text-anchor="middle"'));
      return result;
    }
    const {buttons,top}=actionLayout(b);
    const hasTitle=Boolean(b.title),titleLines=hasTitle?wrap(`${b.id} · ${b.title}`,b.w-24):[];
    const bodyLines=b.lines.flatMap(l=>wrap(l,b.w-28));
    const start=b.y+(hasTitle?28+(titleLines.length-1)*20:14);
    titleLines.forEach((l,i)=>result+=text(b.x+12,b.y+23+i*20,l,b.h<61?14:16));
    const bodyTop=start+(hasTitle?23:0);
    bodyLines.forEach((l,i)=>{
      const ty=bodyTop+i*21;
      if(ty>top-8)issues.push(`${b.id}: body exceeds reserved text area (${ty} > ${top-8})`);
      result+=text(b.x+14,ty,l,14,colors.dim);
    });
    if(b.anatomy){
      const ay=bodyTop+bodyLines.length*21+8,ah=top-ay-12,ax=b.x+14,aw=b.w-28;
      if(ah<34)issues.push(`${b.id}: insufficient anatomy space`);
      else result+=anatomy(b.anatomy,ax,ay,aw,ah);
    }
    result+=buttons.map(linkButton).join('');
    return result;
  }
  function anatomy(type,x,y,w,h){
    let out='';
    const row=(rx,ry,rw,rh,label)=>rect(rx,ry,rw,rh,'#15212b','#344958',5)+text(rx+10,ry+Math.min(22,rh-5),label,12,colors.dim);
    if(type==='battle'){
      const side=160,mid=w-2*side-20,rh=(h-4*5)/5;
      for(let i=0;i<5;i++){out+=row(x,y+i*(rh+5),side,rh,`ทีมเรา ${i+1} · —`);out+=row(x+w-side,y+i*(rh+5),side,rh,`คู่แข่ง ${i+1} · —`);}
      out+=rect(x+side+10,y,mid,h,'#17232d','#526170',8)+text(x+side+10+mid/2,y+h/2,'พื้นที่แผนที่',15,colors.dim,'text-anchor="middle"');
    }else if(['packs','catalog','items'].includes(type)){
      const cols=type==='items'?6:3,rows=type==='items'?1:2,cw=(w-(cols-1)*10)/cols,ch=(h-(rows-1)*10)/rows;
      for(let i=0;i<cols*rows;i++){const cx=x+(i%cols)*(cw+10),cy=y+Math.floor(i/cols)*(ch+10);out+=row(cx,cy,cw,ch,type==='catalog'?`สินค้า ${i+1} · —`:type==='items'?`ไอเทม ${i+1}`:i===0?'แพ็กเริ่มต้น':`แพ็กตัวอย่าง ${i}`);if(ch>50)out+=text(cx+10,cy+44,type==='catalog'?'หลัง MVP':type==='items'?'—':'ในเครื่อง · ตัวอย่าง',12,colors.dim);}
    }else if(type==='banner'){
      out+=rect(x,y,w,h,'#17232d','#526170',8)+text(x+w/2,y+h/2,'พื้นที่แบนเนอร์จากแพ็ก',14,colors.dim,'text-anchor="middle"');
    }else if(type==='logs'){
      const cw=(w-12)/2,rh=(h-18)/4;
      for(let i=0;i<4;i++){out+=row(x,y+i*(rh+6),cw,rh,'--:-- · Activity');out+=row(x+cw+12,y+i*(rh+6),cw,rh,'--:-- · Event');}
    }else{
      const count=type==='visibility'?5:3,rh=(h-(count-1)*8)/count;
      for(let i=0;i<count;i++){
        const label=type==='visibility'?`ศัตรู ${i+1} · Unknown · อายุข้อมูล —`:type==='mapping'?`Event ${i+1}     คลิป —     fallback —`:type==='transactions'?`วันที่ —     ประเภท —     จำนวน —`:type==='summary'?`เหตุการณ์ ${i+1} · เวลา — · หลักฐาน —`:`รายการ ${i+1} · ตัวอย่าง · ข้อมูล —`;
        out+=row(x,y+i*(rh+8),w,rh,label);
      }
    }
    return out;
  }
  function startSVG(w,h,title){
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="group" aria-label="${esc(title)}"><title>${esc(title)}</title><style>text{font-family:'Segoe UI',Tahoma,sans-serif}a{cursor:pointer}a:hover rect,a:focus rect{stroke:#f1f8ff;stroke-width:2}a:focus{outline:2px solid #a9dfff}</style>`;
  }
  function screenSVG(screen,options={}){
    const {page,tab,state,blocks}=screen,issues=[];
    let out=startSVG(1420,760,`${page.id} ${page.title} · ${tab} · ${state} · wireframe`);
    out+=rect(0,0,1420,760,colors.bg,'none',0);
    out+=`<path d="${page.key==='dashboard'?M.dashboardPath:M.basePath}" transform="translate(12 12)" fill="${colors.shell}" stroke="${colors.border}" stroke-width="1.5"/>`;
    out+=rect(834,24,446,50);
    out+=text(848,55,'H · G-MAIDEN',16)+text(1010,55,'GSI · ตัวอย่าง',13,colors.dim);
    out+=linkButton({id:'H-PROFILE',label:'Guest',to:'@profile',x:1168,y:35,w:98,h:28});
    out+=rect(26,354,64,306);
    M.pages.forEach((p,i)=>{
      const y=359+i*42;
      out+=`<a href="#${p.key}" data-destination="${p.key}" data-action="I-${p.id}" aria-label="${p.id} ${p.label}"${page.key===p.key?' aria-current="page"':''}>${rect(31,y,54,38,page.key===p.key?'#324659':colors.surface,page.key===p.key?colors.ice:'none',7)}${text(58,y+24,p.label,12,colors.text,'text-anchor="middle"')}</a>`;
    });
    out+=linkButton({id:'J-POWER',label:'J',to:'@power',x:35,y:672,w:46,h:46});
    if(page.key==='settings'){
      out+=rect(116,86,240,622);
      page.tabs.forEach((t,i)=>out+=linkButton({id:'S-CAT-'+t[0],label:t[1],to:M.route(page.key,t[0],'ready'),x:128,y:102+i*62,w:216,h:28}));
      out+=text(132,578,'หมวดที่เลือก: '+page.tabs.find(t=>t[0]===tab)[1],13,colors.ice);
    }else if(page.key!=='dashboard'){
      let x=116;
      page.tabs.forEach(t=>{
        const w=Math.max(120,Array.from(t[1]).length*9+30);
        out+=linkButton({id:'TAB-'+t[0],label:(t[0]===tab?'• ':'')+t[1],to:M.route(page.key,t[0],state),x,y:158,w,h:28});x+=w+10;
      });
    }
    blocks.forEach(b=>out+=block(b,issues));
    if(options.grid){
      out+='<g pointer-events="none" stroke="#bdd4e6" stroke-opacity="0.14" stroke-width="0.6">';
      for(let x=40;x<1420;x+=40)out+=`<path d="M${x} 0V760"/>`;
      for(let y=40;y<760;y+=40)out+=`<path d="M0 ${y}H1420"/>`;
      out+='</g>';
    }
    out+=text(140,746,screen.note,13,colors.dim);
    out+=text(1310,34,page.id,18,colors.ice)+text(1310,59,'แบบร่าง',12,colors.dim);
    if(options.grid)out+=text(1310,90,'40 px',12,colors.dim);
    out+='</svg>';
    return {svg:out,issues};
  }
  function flowSVG(flow){
    const w=1420,rows=Math.ceil(flow.steps.length/3),h=110+rows*320;
    let out=startSVG(w,h,`${flow.id} · ${flow.title} · wireflow`);
    out+=rect(0,0,w,h,colors.bg,'none',0);
    out+=`<defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0 0L8 4L0 8" fill="${colors.ice}"/></marker></defs>`;
    out+=text(20,32,`${flow.id} · ${flow.title}`,21)+text(20,62,'กดกรอบใดก็ได้เพื่อเปิดหน้าและสถานะนั้น · ลูกศรแสดงลำดับของสถานการณ์ตัวอย่าง',15,colors.dim);
    const positions=flow.steps.map((_,i)=>{const row=Math.floor(i/3),col=row%2?2-i%3:i%3;return{x:20+col*466,y:94+row*320};});
    positions.forEach((p,i)=>{
      if(i===positions.length-1)return;
      const n=positions[i+1];let d;
      if(p.y===n.y){const right=n.x>p.x;d=`M${p.x+(right?408:0)} ${p.y+130} H${n.x+(right?0:408)}`;}
      else d=`M${p.x+204} ${p.y+260} V${n.y}`;
      out+=`<path d="${d}" fill="none" stroke="${colors.ice}" stroke-width="1.5" marker-end="url(#arrow)"/>`;
    });
    flow.steps.forEach(([to,via],i)=>{
      const p=positions[i],s=M.makeScreen(to);
      out+=`<a href="#${to}" data-destination="${to}" aria-label="${esc(via)}">${rect(p.x,p.y,408,260)}${text(p.x+14,p.y+25,`${i+1}. ${via}`,15)}${text(p.x+14,p.y+48,`${s.page.id} · ${s.page.title} / ${s.tab}`,14,colors.ice)}`;
      out+=`<g transform="translate(${p.x+48} ${p.y+64}) scale(0.22)">`;
      out+=`<path d="${s.page.key==='dashboard'?M.dashboardPath:M.basePath}" transform="translate(12 12)" fill="${colors.shell}" stroke="${colors.border}" stroke-width="3"/>`;
      [[834,24,446,50],[26,354,64,306],[35,672,46,46]].forEach(b=>out+=rect(...b));
      s.blocks.forEach(b=>out+=rect(b.x,b.y,b.w,b.h));
      out+='</g>'+text(p.x+14,p.y+244,`สถานะ: ${s.page.states.find(v=>v[0]===s.state)[1]}`,14,colors.dim)+'</a>';
    });
    return out+'</svg>';
  }
  root.GM_WIREFRAME_RENDER={screenSVG,flowSVG,actionLayout,colors};
})(typeof globalThis==='undefined'?window:globalThis);
