(function(root){
  const n=(id,type,col,row,title,detail='',route=null)=>({id,type,col,row,title,detail,route});
  const e=(from,to,label='',loop=null)=>({from,to,label,loop});
  const flows=[
    {id:'UF01',wireflow:'F01',title:'เริ่มใช้และเตรียมเล่น',goal:'เข้าเล่นพร้อมผู้ช่วยในเครื่อง โดยเลือกใช้บัญชีภายหลังได้',success:'ได้รับข้อมูลเกมจริง และเห็นความพร้อมของ GSI / CV ตามจริง',nodes:[
      n('start','start',1,0,'เปิด G-Maiden','เริ่มที่หน้าหลัก','dashboard/main/standby'),
      n('tick','decision',1,1,'ได้รับข้อมูลเกมแล้ว?'),
      n('setup','action',0,1,'ตรวจการเชื่อมต่อเกม','เลือก Dota path / ติดตั้ง GSI','settings/system/ready'),
      n('configured','decision',0,2,'ตั้งค่าสำเร็จ?'),
      n('repair','recovery',0,4,'แก้ path หรือสิทธิ์','คงสถานะไม่พร้อม แล้วลองใหม่','settings/system/error'),
      n('game','action',0,3,'เปิด Dota และรอข้อมูล','ติดตั้งสำเร็จยังไม่เท่ากับ LIVE','dashboard/main/standby'),
      n('later','outcome',2,2,'ตั้งค่าภายหลัง','กลับหน้าหลักได้ แต่ยังไม่พร้อมเกม','dashboard/main/standby'),
      n('ready','system',1,2,'แสดงข้อมูลเกมที่ได้รับ','หน้าหลักเปลี่ยนตาม phase จริง','dashboard/main/prep'),
      n('cv','decision',1,3,'ภาพแผนที่พร้อมใช้?'),
      n('full','outcome',1,4,'เล่นพร้อมข้อมูล GSI + CV','รับเสียงและ Overlay ตามความพร้อม','dashboard/main/live'),
      n('lite','outcome',2,4,'เล่นแบบ Lite','GSI ต่อได้ / ระบุ CV ใช้ไม่ได้','settings/modules/ready')
    ],edges:[e('start','tick'),e('tick','ready','มี'),e('tick','setup','ยังไม่มี'),e('setup','configured','ติดตั้ง / ตรวจ'),e('setup','later','ภายหลัง'),e('configured','game','สำเร็จ'),e('configured','repair','ไม่สำเร็จ'),e('repair','setup','ลองใหม่','left'),e('game','tick','รอข้อมูลจริง','right'),e('ready','cv'),e('cv','full','พร้อม'),e('cv','lite','ไม่พร้อม')]},
    {id:'UF02',wireflow:'F02',title:'เล่นเกมและรับคำแนะนำ',goal:'รับคำเตือนระหว่างเล่น โดยดูรายละเอียดเมื่อจำเป็น',success:'เล่นต่อได้ และจบด้วยประวัติที่แยกข้อมูลครบกับข้อมูลขาด',nodes:[
      n('start','start',1,0,'เริ่มเกม Dota','ข้อมูลเกมเป็นตัวกำหนด phase','dashboard/main/prep'),
      n('fresh','decision',1,1,'ข้อมูลยังสดใหม่?'),
      n('stale','recovery',2,1,'เห็นว่าข้อมูลขาดช่วง','แสดง Unknown / ไม่รับรองว่าปลอดภัย','dashboard/main/stale'),
      n('play','action',1,2,'เล่นและรับเสียง / Overlay','คำเตือนสำคัญแทรกคำแนะนำได้','dashboard/main/live'),
      n('detail','action',0,2,'เปิดรายละเอียดเมื่อจำเป็น','ดูสด / บิลด์ แล้วกลับไปเล่น','live/live/live'),
      n('ended','decision',1,3,'เกมจบ / เซสชันปิด?'),
      n('continue','action',0,3,'เล่นต่อ','ไม่ย้ายหน้าอัตโนมัติ','dashboard/main/live'),
      n('archive','system',1,4,'เก็บประวัติในเครื่อง','แสดงช่วงจบเกมบนหน้าหลัก','dashboard/main/debrief'),
      n('complete','decision',1,5,'ข้อมูลเซสชันครบ?'),
      n('summary','outcome',0,6,'ดูสรุปพร้อมหลักฐาน','ไม่เกิน 3 ข้อ พร้อมเวลาเหตุการณ์','insights/history/complete'),
      n('partial','outcome',2,6,'ดูประวัติที่ไม่ครบ','ระบุช่วงหาย / ไม่เดาผลเกม','insights/history/partial')
    ],edges:[e('start','fresh'),e('fresh','play','สดใหม่'),e('fresh','stale','ขาดช่วง'),e('stale','fresh','ข้อมูลกลับมา','right'),e('stale','archive','เซสชันปิด','right'),e('play','detail','ต้องการรายละเอียด'),e('play','ended'),e('detail','ended','กลับไปเล่น'),e('ended','continue','ยังไม่จบ'),e('continue','fresh','รอบถัดไป','left'),e('ended','archive','จบ / ปิดเซสชัน'),e('archive','complete'),e('complete','summary','ครบ'),e('complete','partial','ไม่ครบ')]},
    {id:'UF03',wireflow:'F03',title:'เลือกเสียงที่อยากใช้',goal:'ลองฟังและเปลี่ยนแพ็ก โดยรักษาเสียงเดิมเมื่อทำรายการไม่สำเร็จ',success:'เห็นแพ็กที่ใช้อยู่จริง แล้วกลับไปเล่นได้',nodes:[
      n('start','start',1,0,'อยากเปลี่ยนเสียง','เปิดคลังแพ็กในเครื่อง','voice/inventory/ready'),
      n('pack','decision',1,1,'มีแพ็กที่ต้องการ?'),
      n('import','action',2,1,'เลือกไฟล์นำเข้า','ยกเลิกได้ / ไม่เปลี่ยนแพ็กเดิม','voice/inventory/loading'),
      n('valid','decision',2,2,'แพ็กอ่านได้?'),
      n('invalid','recovery',2,3,'เห็นเหตุผลที่ใช้ไม่ได้','เลือกไฟล์ใหม่ หรือใช้เสียงเดิม','voice/inventory/error'),
      n('preview','action',1,3,'เลือกแพ็กและลองฟัง','ปรับระดับเสียงก่อนเปิดใช้','voice/inventory/ready'),
      n('activate','action',1,4,'กดเปิดใช้','รอระบบยืนยันก่อนแสดง Active','voice/inventory/ready'),
      n('ok','decision',1,5,'เปิดใช้สำเร็จ?'),
      n('failed','recovery',2,5,'คงแพ็กเดิมไว้','ลองใหม่ หรือกลับไปเลือกแพ็ก','voice/inventory/error'),
      n('done','outcome',1,6,'ใช้เสียงที่เลือกแล้ว','กลับเกมได้ / ตั้งค่าเตือนเพิ่มได้','voice/inventory/active'),
      n('cancel','outcome',0,4,'ใช้เสียงเดิมต่อ','ยกเลิกการนำเข้า / ไม่เปิดใช้','dashboard/main/standby')
    ],edges:[e('start','pack'),e('pack','preview','มี'),e('pack','import','ไม่มี'),e('import','valid','เลือกไฟล์'),e('import','cancel','ยกเลิก','left'),e('valid','preview','อ่านได้'),e('valid','invalid','อ่านไม่ได้'),e('invalid','import','เลือกใหม่','right'),e('invalid','cancel','ไว้ภายหลัง','left'),e('preview','activate','ต้องการใช้'),e('preview','cancel','ใช้เสียงเดิม'),e('activate','ok'),e('ok','done','สำเร็จ'),e('ok','failed','ไม่สำเร็จ'),e('failed','preview','กลับไปเลือก','right')]},
    {id:'UF04',wireflow:'F04',title:'หาแพ็กเสียงเพิ่มเติม',goal:'เข้าใจสถานะร้านและมีทางกลับไปใช้แพ็กในเครื่อง',success:'ใช้เสียง local ต่อได้ โดยไม่ติดอยู่ที่หน้าร้าน',nodes:[
      n('start','start',1,0,'ต้องการแพ็กเพิ่ม','จากคลังเสียง','voice/inventory/ready'),
      n('store','action',1,1,'เปิดร้าน','ดูร้าน / กระเป๋า / คลัง / บันทึก','store/shop/deferred'),
      n('scope','system',1,2,'ร้านอยู่หลัง MVP','ซื้อ / เติมเงินยังไม่เปิดในแบบนี้','store/wallet/deferred'),
      n('local','decision',1,3,'ใช้แพ็กในเครื่องต่อไหม?'),
      n('voice','action',0,4,'กลับคลังแพ็กเสียง','เลือกแพ็กที่มี / นำเข้าไฟล์เอง','voice/inventory/ready'),
      n('home','action',2,4,'กลับหน้าหลัก','บัญชีไม่เป็นเงื่อนไขเล่น local','dashboard/main/standby'),
      n('done','outcome',1,5,'เล่นต่อด้วยเสียง local','ไม่มีธุรกรรมหรือการจ่ายเงินจริง','dashboard/main/standby')
    ],edges:[e('start','store'),e('store','scope'),e('scope','local'),e('local','voice','ใช้'),e('local','home','กลับก่อน'),e('voice','done'),e('home','done')]},
    {id:'UF05',wireflow:'F05',title:'เชื่อมบัญชีตามต้องการ',goal:'ใช้บริการบัญชีหรือโปรไฟล์สาธารณะ โดยเล่น local ต่อได้เสมอ',success:'ได้บัญชีที่ตรวจแล้ว หรือเลือกกลับ local อย่างชัดเจน',nodes:[
      n('start','start',1,0,'เปิดหน้าบัญชี','จากเมนูหรือโปรไฟล์','account/account/signedout'),
      n('want','decision',1,1,'ต้องการเข้าสู่ระบบ?'),
      n('local','outcome',0,1,'ใช้งาน local ต่อ','ไม่ต้องมี Google / GID เพื่อเล่น','dashboard/main/standby'),
      n('google','action',1,2,'เลือกเข้าใช้ด้วย Google','รอ browser callback / ยกเลิกได้','account/account/loading'),
      n('verified','decision',1,3,'ยืนยันบัญชีสำเร็จ?'),
      n('error','recovery',2,3,'แจ้งยกเลิก / เข้าใช้ไม่ได้','ไม่เปิดข้อมูลบัญชีที่ยังไม่ยืนยัน','account/account/error'),
      n('retry','decision',2,4,'ต้องการลองใหม่?'),
      n('profile','system',1,4,'แสดงบัญชีและ GID','GID มาจาก server ไม่ใช่รหัสผ่าน','account/account/signedin'),
      n('steam','decision',1,5,'ต้องการเชื่อม Steam?'),
      n('public','outcome',0,6,'ดูโปรไฟล์สาธารณะ','อ่านไม่ได้ให้แสดง unavailable','insights/overview/empty'),
      n('done','outcome',2,6,'ใช้บัญชีโดยไม่เชื่อม Steam','ออกจากบัญชีแล้ว local ยังใช้ได้','account/account/signedin')
    ],edges:[e('start','want'),e('want','local','ไม่ต้องการ'),e('want','google','ต้องการ'),e('google','verified'),e('verified','profile','สำเร็จ'),e('verified','error','ยกเลิก / ไม่สำเร็จ'),e('error','retry'),e('retry','google','ลองใหม่','right'),e('retry','local','กลับ local','left'),e('profile','steam'),e('steam','public','เชื่อม'),e('steam','done','ยังไม่เชื่อม')]},
    {id:'UF06',wireflow:'F06',title:'ปรับผู้ช่วยและความเป็นส่วนตัว',goal:'ปรับ Overlay / AI โดยรู้ว่าบันทึกอะไร และเลือกการส่ง context เอง',success:'ใช้ค่าที่บันทึกแล้ว พร้อมขอบเขตข้อมูลที่ผู้ใช้เลือก',nodes:[
      n('start','start',1,0,'เปิดตั้งค่า','เลือกหมวดที่ต้องการ','settings/overlay/ready'),
      n('preview','action',1,1,'ปรับค่าและดูตัวอย่าง','Preview ไม่เปลี่ยนข้อมูลเกม','settings/overlay/ready'),
      n('keep','decision',1,2,'ต้องการเก็บค่าใหม่?'),
      n('cancel','outcome',0,2,'กลับไปใช้ค่าเดิม','ยกเลิก / ปิด preview','dashboard/main/standby'),
      n('save','action',1,3,'บันทึกในเครื่อง','รอผลก่อนแจ้งว่าสำเร็จ','settings/overlay/saving'),
      n('saved','decision',1,4,'บันทึกสำเร็จ?'),
      n('error','recovery',2,4,'คงค่าที่ใช้ได้เดิม','แจ้งข้อผิดพลาดและลองใหม่','settings/overlay/error'),
      n('cloud','decision',1,5,'ต้องการ cloud context?'),
      n('off','outcome',0,5,'ใช้ local ต่อ','ค่าเริ่มต้น: ไม่ส่ง context','settings/ai/ready'),
      n('explain','action',1,6,'อ่านข้อมูลที่จะส่งและจุดประสงค์','เลือก provider / login ไม่ใช่ consent','settings/privacy/ready'),
      n('consent','decision',1,7,'ยืนยัน opt-in แยก?'),
      n('on','outcome',2,8,'ส่งเฉพาะ context ที่อนุญาต','Voice / Memory / raw logs อยู่ local','settings/privacy/saved'),
      n('decline','outcome',0,8,'ยังไม่ส่ง context','ปฏิเสธได้และใช้งาน local ต่อ','settings/ai/ready')
    ],edges:[e('start','preview'),e('preview','keep'),e('keep','cancel','ยกเลิก'),e('keep','save','บันทึก'),e('save','saved'),e('saved','cloud','สำเร็จ'),e('saved','error','ไม่สำเร็จ'),e('error','preview','ลองใหม่','right'),e('cloud','off','ไม่ต้องการ'),e('cloud','explain','ต้องการ'),e('explain','consent'),e('consent','on','ยืนยัน'),e('consent','decline','ไม่ยืนยัน')]},
    {id:'UF07',wireflow:'F07',title:'ทบทวนเกมที่ผ่านมา',goal:'ดูสิ่งที่เกิดขึ้นจากประวัติในเครื่อง พร้อมรู้ข้อจำกัดของข้อมูล',success:'ได้สรุปที่มีหลักฐาน หรือคำอธิบายว่าข้อมูลใดขาด',nodes:[
      n('start','start',1,0,'เปิดสถิติ / ประวัติ','จากเมนูหรือหน้าสรุปหลังเกม','insights/history/loading'),
      n('read','decision',1,1,'อ่านประวัติได้?'),
      n('error','recovery',2,1,'แจ้งว่าอ่านไม่ได้','เปิดตั้งค่าระบบเพื่อตรวจ Log','settings/system/ready'),
      n('exists','decision',1,2,'มีเซสชันในเครื่อง?'),
      n('empty','outcome',0,2,'ยังไม่มีประวัติ','กลับไปเล่นก่อน / ไม่แสดงเลข 0 แทน','insights/history/empty'),
      n('select','action',1,3,'เลือกเซสชัน','คง page และรายการที่เลือกเมื่อกลับ','insights/history/complete'),
      n('complete','decision',1,4,'ข้อมูลครบ?'),
      n('summary','action',0,5,'อ่านสรุปและเหตุการณ์','ไม่เกิน 3 ข้อ พร้อมหลักฐานเวลา','insights/history/complete'),
      n('partial','action',2,5,'ตรวจช่วงข้อมูลที่ขาด','ไม่เดา win/loss หรือสาเหตุการตาย','insights/history/partial'),
      n('done','outcome',1,6,'เข้าใจเกมที่ผ่านมา','กลับรายการเดิมหรือเริ่มเกมถัดไป','dashboard/main/standby')
    ],edges:[e('start','read'),e('read','exists','อ่านได้'),e('read','error','อ่านไม่ได้'),e('error','read','ลองอ่านใหม่','right'),e('exists','empty','ไม่มี'),e('exists','select','มี'),e('select','complete'),e('complete','summary','ครบ'),e('complete','partial','ไม่ครบ'),e('summary','done'),e('partial','done')]},
    {id:'UF08',wireflow:'F08',title:'อัปเดตโดยไม่ขัดจังหวะเกม',goal:'เลือกเวลาอัปเดตที่ปลอดจากการเล่น และรู้ผลเมื่ออัปเดตไม่สำเร็จ',success:'อัปเดตแล้วกลับเข้า local core หรือใช้เวอร์ชันเดิมต่อ',nodes:[
      n('start','start',1,0,'ตรวจอัปเดต','ตั้งค่า / ทั่วไป','settings/general/ready'),
      n('available','decision',1,1,'มีอัปเดตใหม่?'),
      n('current','outcome',0,1,'ใช้เวอร์ชันปัจจุบันต่อ','ไม่มีอัปเดต / ผู้ใช้เลือกภายหลัง','dashboard/main/standby'),
      n('download','system',1,2,'ดาวน์โหลดและตรวจความถูกต้อง','แสดงความคืบหน้า','settings/general/saving'),
      n('verified','decision',1,3,'ไฟล์พร้อมติดตั้ง?'),
      n('error','recovery',2,3,'คงเวอร์ชันเดิม','เครือข่าย / ลายเซ็น / ติดตั้งผิดพลาด','settings/general/error'),
      n('playing','decision',1,4,'กำลังเล่นเกม?'),
      n('wait','action',2,4,'เลื่อนไปหลังเกม','ไม่ restart แทรกคำเตือน','dashboard/main/live'),
      n('confirm','decision',1,5,'ยืนยันติดตั้งตอนนี้?'),
      n('later','outcome',0,5,'ติดตั้งภายหลัง','ยังใช้เวอร์ชันเดิมได้','settings/general/saved'),
      n('install','system',1,6,'ติดตั้งและเปิดแอปใหม่','รายงาน error ถ้าไม่สำเร็จ','settings/general/saved'),
      n('done','outcome',1,7,'กลับสู่หน้าหลัก','local core ไม่รอ Beta grant','dashboard/main/standby')
    ],edges:[e('start','available'),e('available','current','ไม่มี / ภายหลัง'),e('available','download','มี'),e('download','verified'),e('verified','error','ไม่พร้อม'),e('error','download','ลองใหม่','right'),e('verified','playing','พร้อม'),e('playing','wait','กำลังเล่น'),e('wait','playing','พ้นเกมแล้ว','right'),e('playing','confirm','ไม่ได้เล่น'),e('confirm','later','ภายหลัง'),e('confirm','install','ยืนยัน'),e('install','done','สำเร็จ'),e('install','error','ไม่สำเร็จ','right')]
    }
  ];
  const esc=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  function lines(value,max=31){
    const chars=Array.from(value),out=[];
    while(chars.length>max){let end=max;for(let i=max;i>max*.6;i--)if(chars[i]===' '){end=i;break;}out.push(chars.splice(0,end).join('').trim());if(chars[0]===' ')chars.shift();}
    if(chars.length)out.push(chars.join(''));return out;
  }
  function layout(flow){return flow.nodes.map(v=>({...v,x:80+v.col*480,y:136+v.row*150,w:300,h:v.type==='decision'?110:92}));}
  function crosses(points,node){
    return points.slice(1).some((p,i)=>{const q=points[i];return Math.max(p[0],q[0])>node.x+1&&Math.min(p[0],q[0])<node.x+node.w-1&&Math.max(p[1],q[1])>node.y+1&&Math.min(p[1],q[1])<node.y+node.h-1;});
  }
  function connectors(flow){
    const nodes=layout(flow),byId=new Map(nodes.map(n=>[n.id,n]));
    return flow.edges.map(edge=>{
      const a=byId.get(edge.from),b=byId.get(edge.to),ax=a.x+a.w/2,ay=a.y+a.h/2,bx=b.x+b.w/2,by=b.y+b.h/2;
      let points,labelX,labelY,anchor='middle';
      if(edge.loop){const x=edge.loop==='right'?1388:32,sy=a.y+126,ty=b.y-20;points=[[ax,a.y+a.h],[ax,sy],[x,sy],[x,ty],[bx,ty],[bx,b.y]];labelX=(x+bx)/2;labelY=ty-6;}
      else if(a.row===b.row){const right=bx>ax;points=[[right?a.x+a.w:a.x,ay],[right?b.x:b.x+b.w,by]];labelX=(points[0][0]+points[1][0])/2;labelY=ay-12;}
      else if(a.col===b.col){points=[[ax,a.y+a.h],[bx,b.y]];labelX=ax+16;labelY=(a.y+a.h+b.y)/2+5;anchor='start';}
      else{const mid=a.y+126;points=[[ax,a.y+a.h],[ax,mid],[bx,mid],[bx,b.y]];labelX=(ax+bx)/2;labelY=mid-8;}
      const others=nodes.filter(n=>n.id!==a.id&&n.id!==b.id);
      if(others.some(n=>crosses(points,n))){
        const x=a.col===2?a.x-40:a.x+a.w+40,sy=a.y+126,ty=b.y-20;
        if(a.col===b.col){
          const side=a.col===2?a.x:a.x+a.w;
          points=[[side,ay],[x,ay],[x,by],[side,by]];labelX=x+(a.col===2?-12:12);labelY=(ay+by)/2;anchor=a.col===2?'end':'start';
        }else{points=[[ax,a.y+a.h],[ax,sy],[x,sy],[x,ty],[bx,ty],[bx,b.y]];labelX=(x+bx)/2;labelY=ty-6;anchor='middle';}
      }
      return {...edge,points,labelX,labelY,anchor,crossings:others.filter(n=>crosses(points,n)).map(n=>n.id)};
    });
  }
  function svg(flow){
    const nodes=layout(flow),height=Math.max(...nodes.map(n=>n.y+n.h))+60;
    const t=(x,y,s,size=15,fill='#e6edf3',anchor='middle',extra='')=>`<text x="${x}" y="${y}" text-anchor="${anchor}" font-size="${size}" fill="${fill}" ${extra}>${esc(s)}</text>`;
    let out=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1420 ${height}" role="group" aria-label="${esc(flow.id+' '+flow.title+' · user flow')}" font-family="Segoe UI,Tahoma,sans-serif"><defs><marker id="uf-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 L10 5 L0 10 Z" fill="#91a9bd"/></marker></defs><rect width="1420" height="${height}" fill="#0b1016"/>`;
    out+=t(36,35,flow.id+' · '+flow.title,24,'#e6edf3','start')+t(36,70,flow.goal,16,'#afc4d4','start');
    for(const edge of connectors(flow)){
      out+=`<polyline points="${edge.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#91a9bd" stroke-width="1.7" marker-end="url(#uf-arrow)"/>`;
      if(edge.label)out+=t(edge.labelX,edge.labelY,edge.label,13,'#cbd9e4',edge.anchor,'paint-order="stroke" stroke="#0b1016" stroke-width="5" stroke-linejoin="round"');
    }
    for(const v of nodes){
      const cx=v.x+v.w/2,cy=v.y+v.h/2,decision=v.type==='decision',end=v.type==='outcome'||v.type==='start',stroke=decision?'#d8b97d':end?'#96d9c3':v.type==='recovery'?'#d6a797':'#789ebd';
      let body=decision?`<path d="M${cx} ${v.y} L${v.x+v.w} ${cy} L${cx} ${v.y+v.h} L${v.x} ${cy} Z" fill="#201f1a" stroke="${stroke}"/>`:`<rect x="${v.x}" y="${v.y}" width="${v.w}" height="${v.h}" rx="${end?36:12}" fill="#14212c" stroke="${stroke}"/>`;
      body+=t(cx,v.y+(decision?59:28),v.title,16);
      lines(v.detail).forEach((l,i)=>body+=t(cx,v.y+51+i*18,l,13,'#b0c0ce'));
      if(v.route){const p=root.GM_WIREFRAMES.normalize(v.route).page;body+=t(v.x+v.w-16,v.y+v.h-10,p.id,10,'#a9dfff','end');out+=`<a href="#${esc(v.route)}" data-destination="${esc(v.route)}" aria-label="${esc(v.title+' · '+p.id)}">${body}</a>`;}else out+=`<g data-user-node="${v.id}">${body}</g>`;
    }
    return out+'</svg>';
  }
  function mermaid(flow){
    const nodes=flow.nodes.map(v=>{const label=(v.title+(v.detail?' — '+v.detail:'')).replace(/"/g,"'");return '  '+v.id+(v.type==='decision'?'{"'+label+'"}':v.type==='start'||v.type==='outcome'?'(["'+label+'"])':'["'+label+'"]');});
    return ['flowchart TD',...nodes,...flow.edges.map(v=>'  '+v.from+' -->'+(v.label?'|"'+v.label+'"|':'')+' '+v.to)].join('\n');
  }
  root.GM_USER_FLOWS={flows,layout,connectors,svg,mermaid};
})(typeof globalThis==='undefined'?window:globalThis);
