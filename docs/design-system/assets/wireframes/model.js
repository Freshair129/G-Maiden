/* Design-only model. No game, account, storage, audio or network operations. */
(function (root) {
  const basePath = 'M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 688 A 20 20 0 0 1 1248,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z';
  const dashboardPath = 'M 40,12 H 800 A 20 20 0 0 1 820,32 V 54 A 20 20 0 0 0 840,74 H 1248 A 20 20 0 0 1 1268,94 V 488 A 20 20 0 0 1 1248,508 H 836 A 20 20 0 0 0 816,528 V 688 A 20 20 0 0 1 796,708 H 112 A 20 20 0 0 1 92,688 V 350 A 20 20 0 0 0 72,330 H 32 A 20 20 0 0 1 12,310 V 40 A 28 28 0 0 1 40,12 Z';
  const route = (page, tab, state) => [page, tab, state].filter(Boolean).join('/');
  const a = (id, label, to, disabled = false) => ({id,label,to,disabled});
  const box = (id,x,y,w,h,title,lines=[],actions=[]) => ({id,x,y,w,h,title,lines,actions});
  const pages = [
    {id:'P01',key:'dashboard',label:'หลัก',title:'Dashboard',tabs:[['main','ภาพรวม']],states:[['standby','ก่อนเกม'],['prep','เตรียมเกม'],['live','กำลังเล่น'],['debrief','จบเกม'],['stale','ข้อมูลขาดช่วง']]},
    {id:'P02',key:'live',label:'สด',title:'Live',tabs:[['live','สด'],['build','บิลด์']],states:[['waiting','รอข้อมูล'],['live','กำลังเล่น'],['stale','ข้อมูลขาดช่วง']]},
    {id:'P03',key:'voice',label:'เสียง',title:'Voice Packs',tabs:[['inventory','คลังของฉัน'],['items','ไอเทม'],['editor','ตัวแก้ไข']],states:[['ready','มีแพ็กในเครื่อง'],['empty','ไม่มีแพ็ก'],['loading','กำลังอ่าน'],['error','อ่านหรือติดตั้งไม่สำเร็จ'],['active','เปิดใช้แล้ว']]},
    {id:'P04',key:'store',label:'ร้าน',title:'G-Store',tabs:[['shop','ร้านค้า'],['wallet','กระเป๋า'],['inventory','คลัง'],['ledger','บันทึก']],states:[['deferred','หลัง MVP']]},
    {id:'P05',key:'insights',label:'สถิติ',title:'Insights',tabs:[['overview','ภาพรวม'],['history','ประวัติ']],states:[['empty','ยังไม่มีประวัติ'],['complete','เซสชันครบ'],['partial','เซสชันไม่ครบ'],['loading','กำลังอ่าน'],['error','อ่านไม่สำเร็จ']]},
    {id:'P06',key:'account',label:'บัญชี',title:'Account',tabs:[['account','บัญชี'],['wallet','กระเป๋า'],['ledger','ประวัติธุรกรรม'],['security','ความปลอดภัย']],states:[['signedout','ยังไม่เข้าสู่ระบบ'],['loading','รอ Google'],['signedin','เข้าสู่ระบบแล้ว'],['error','เชื่อมต่อไม่สำเร็จ'],['expired','เซสชันหมดอายุ']]},
    {id:'P07',key:'settings',label:'ตั้งค่า',title:'Settings',tabs:[['general','ทั่วไป'],['overlay','Overlay'],['voice','เสียง & เตือน'],['ai','AI (G-Master)'],['modules','โมดูล & CV'],['privacy','ความเป็นส่วนตัว'],['system','ระบบ']],states:[['ready','พร้อมแก้ไข'],['saving','กำลังทำรายการ'],['saved','สำเร็จ'],['error','ทำรายการไม่สำเร็จ']]}
  ];
  function normalize(value) {
    const parts = String(value || '').replace(/^#/, '').split('/');
    const page = pages.find(p=>p.key===parts[0]) || pages[0];
    const tab = page.tabs.find(t=>t[0]===parts[1])?.[0] || page.tabs[0][0];
    const state = page.states.find(s=>s[0]===parts[2])?.[0] || page.states[0][0];
    return {page,tab,state,route:route(page.key,tab,state)};
  }
  function makeScreen(value) {
    const s = normalize(value), {page,tab,state} = s;
    const blocks=[];
    let note='แบบร่างสำหรับคุยงาน · ข้อมูลทั้งหมดเป็นตัวอย่าง';
    if(page.key==='dashboard'){
      blocks.push(box('A',42,40,54,198,'เสียง',['78%','│','ANN','SIGNAL']));
      blocks.push(box('B',140,54,640,48,`Radiant —       --:--       — Dire · ${page.states.find(v=>v[0]===state)[1]}`));
      blocks.push(box('C',140,110,478,42,'NW —          GPM —          XPM —'));
      if(state==='live'){
        blocks.push(box('D',140,160,640,276,'สนามรบ · ข้อมูลตัวอย่าง',[
          'ความสดใหม่ / coverage ระบุข้างแผนที่ · ค่าที่ไม่มี = —'
        ],[a('D-LIVE','ดูรายละเอียดสด','live/live/live')]));
        blocks.find(b=>b.id==='D').anatomy='battle';
      }else if(state==='debrief'){
        blocks.push(box('D',140,160,640,276,'จบเกม · สรุปในเครื่อง',[
          'เหตุการณ์สำคัญไม่เกิน 3 ข้อ พร้อมเวลาและหลักฐาน',
          'เซสชันไม่ครบต้องติดป้าย ข้อมูลไม่ครบ',
          'ไม่เดาผลแพ้ชนะหรือสาเหตุการตาย'
        ],[a('D-HISTORY','ดูประวัติ','insights/history/complete'),a('D-RESET','กลับก่อนเกม','dashboard/main/standby')]));
      }else{
        const stale=state==='stale';
        blocks.push(box('D',140,160,640,276,stale?'ข้อมูลจากเกมขาดช่วง':'ความพร้อมก่อนเข้าเกม',[
          state==='prep'?'กำลังเลือกฮีโร่ / โหลดเข้าเกม':'GSI: '+(stale?'ไม่สดใหม่ · ไม่สรุปว่าปลอดภัย':'รอเกม'),
          'เสียง: เลือกแพ็กในเครื่อง · G-Signal: เปิด',
          'CV: แสดงขอบเขตที่ตรวจจับได้ หรือ Lite mode',
          stale?'รอ GSI กลับมา แล้วคำนวณจากข้อมูลใหม่':'เปิด Dota 2 แบบ borderless-fullscreen'
        ],[a('D-SETUP','ตั้งค่า GSI','settings/system/ready'),a('D-VOICE','เลือกเสียง','voice/inventory/ready'),a('D-PREVIEW','ตัวอย่างหน้าสด','dashboard/main/live')]));
      }
      blocks.push(box('E',820,98,440,354,'Maiden',[
        state==='live'?'พื้นที่คำแนะนำล่าสุด + สถานะการพูด':'ยังไม่มีคำแนะนำ',
        'ประวัติคำพูดอยู่ในกล่องเดิมและเลื่อนภายใน',
        'แก้คำทำนาย: ขีดฆ่าประโยคเดิมและแสดงคำแก้',
        'Provider แสดงเมื่อมีคำตอบที่ระบุแหล่งจริง',
        'ข้อความยาวต้องไม่ดันกรอบหรือแถบข้าง'
      ],[a('E-AI','ตั้งค่าผู้ช่วย','settings/ai/ready')]));
      blocks.push(box('F',140,446,620,170,'การแจ้งเตือน · สถานะผู้ช่วย',[
        'บันทึกเหตุการณ์มีเวลา · เลื่อนภายใน',
        'เสียง —    G-Signal เปิด    CPU —    RAM —'
      ],[a('F-ALERTS','ปรับเสียงและเตือน','settings/voice/ready')]));
      [['G1',840,532,'ศัตรูหาย'],['G2',1059,532,'ความเสี่ยง'],['G3',840,625,'ระดับเตือน'],['G4',1059,625,'เวลาโดยประมาณ']].forEach(v=>blocks.push(box(v[0],v[1],v[2],209,83,v[3],['— · รอข้อมูล'])));
      return {...s,blocks,note};
    }
    if(page.key==='settings'){
      const label=page.tabs.find(t=>t[0]===tab)[1];
      blocks.push(box('S-H',370,86,894,74,`ตั้งค่า · ${label}`,['ค่าตัวอย่างสำหรับตรวจแบบ · บันทึกและส่งไป Overlay เมื่อใช้ในแอปจริง']));
      const done=state==='saved'?'บันทึกสำเร็จ':state==='saving'?'กำลังทำรายการ…':state==='error'?'ไม่สำเร็จ · คงค่าที่ใช้ได้เดิมและลองใหม่ได้':'พร้อมแก้ไข';
      blocks.push(box('S-STATE',370,170,894,54,done));
      const settings={
        general:[['คุณภาพและขนาด',['คุณภาพ: Cinematic / Balanced / Eco','ความหนาแน่น: Comfortable / Compact','Crisp text / Big mode','ขนาดหน้าต่าง: 1200×780 / 1440×900 / 1920×1080']],['เวอร์ชันและอัปเดต',['Stable · เวอร์ชันจากแอปจริง','ตรวจ → ดาวน์โหลด → ติดตั้งเมื่อพ้นเกม','ระหว่างเล่น: รอจบเกม / ภายหลัง']]],
        overlay:[['Overlay และตำแหน่ง',['เปิด / ปิด Overlay','โมดูลอิสระ: สถานะ / เตือน / สถิติ','ตำแหน่งและสเกล · เลือกโปรไฟล์','ตัวอย่างต้องไม่เปลี่ยนสถานะ GSI']],['โปรไฟล์หน้าจอ',['เลือก / บันทึก / ลบโปรไฟล์','ค่า X / Y และขนาด','ปิดตัวอย่างแล้วกลับค่าที่บันทึก']]],
        voice:[['เสียงและ G-Signal',['เปิดเสียง · ระดับเสียง · ความเร็ว','Sensitivity: Low / Med / High','ทดสอบเสียง / แบนเนอร์','Alt+M ปิดเสียง · Ctrl+Alt+V PTT (เป้าหมาย MVP)']],['Persona และแพ็ก',['ใช้แพ็กที่เลือกในหน้าเสียง','Announcer / Signal แยกสวิตช์','คำเตือนสำคัญมีลำดับสูงกว่าเสียงทั่วไป']]],
        ai:[['ผู้ช่วยในเครื่อง',['โหมด: Auto / Claude / Ollama','โมเดลในเครื่อง: รายการจาก Ollama','สถานะ: พร้อม / กำลังเตรียม / ไม่พร้อม','Voice / Memory ใช้เส้นทาง local']],['Cloud context · ปิดเริ่มต้น',['เปิด opt-in แยกจากบัญชีและปุ่ม Ask','ส่งได้เฉพาะฟิลด์ใน allowlist ของ MVP','ไม่ส่ง CV / G-Log / ID / เสียงหรือ transcript','ไม่มี local model → แสดง unavailable']]],
        modules:[['โมดูลและการจับภาพ',['G-Sentry / G-Motion / G-Signal / G-Log','Capture: DXGI · borderless-fullscreen','CV: แสดง coverage ที่รับรอง','Capture ไม่พร้อม → GSI-only Lite mode']],['Calibration',['เลือกพื้นที่ minimap และตรวจผล','แสดงค่าที่วัดได้จริง / ไม่มีข้อมูล','เลิกแก้ไขแล้วคืนค่า calibration เดิม']]],
        privacy:[['ข้อมูลในเครื่อง',['G-Log / Memory / CV / เสียง อยู่ local','เปิดโฟลเดอร์ข้อมูล · ดูนโยบายการเก็บ','ลบข้อมูล: เลือกขอบเขต → ยืนยัน → ผลลัพธ์','ยกเลิกได้ก่อนยืนยัน']],['การแชร์ context',['Cloud ปิดเริ่มต้น','เปลี่ยน preference ในหมวด AI','ไม่อัปโหลด raw match / ประวัติ / ตัวตน']]],
        system:[['เชื่อมต่อ Dota 2 / GSI',['ตรวจเกม → ติดตั้ง config → เปิด Dota 2','รอ valid tick · แสดงอายุข้อมูล','ไม่พบเกม / สิทธิ์ไม่พอ: อธิบายทางแก้','ไม่ล็อก local core เพราะบัญชีหรือเครือข่าย']],['ระบบและการวินิจฉัย',['เปิดโฟลเดอร์ log ในเครื่อง','สถานะบริการ / เสียง / Capture','Changelog · เวอร์ชันที่ใช้งานจริง']]]
      }[tab];
      const actions=[a('S-SAVE','จำลองบันทึก',route('settings',tab,'saved')),a('S-FAIL','จำลองข้อผิดพลาด',route('settings',tab,'error'))];
      if(tab==='system')actions.unshift(a('S-GSI','จำลองติดตั้ง GSI',route('settings',tab,'saving')));
      if(tab==='voice')actions.unshift(a('S-VOICE','เลือกแพ็กเสียง','voice/inventory/ready'));
      if(tab==='ai')actions.unshift(a('S-PRIVACY','ดูข้อมูลที่อนุญาต','settings/privacy/ready'));
      if(tab==='privacy')actions.unshift(a('S-AI','ไปหมวด AI','settings/ai/ready'));
      blocks.push(box('S-MAIN',370,238,894,238,settings[0][0],settings[0][1],actions));
      blocks.push(box('S-SUB',370,490,894,174,settings[1][0],settings[1][1]));
      blocks.push(box('S-RETURN',370,674,894,34,'',[],[a('S-HOME','กลับหน้าหลัก','dashboard/main/standby')]));
      return {...s,blocks,note};
    }
    const subtitles={live:'ติดตามเกม · แยกข้อมูลจริง / ไม่มีข้อมูล',voice:'แพ็กเสียงในเครื่อง · ใช้งานแบบ local',store:'คงพื้นที่ร้านไว้ · Store และ payment อยู่หลัง MVP',insights:'ประวัติและสรุปในเครื่อง · บอกความครบของข้อมูล',account:'บัญชีเป็นทางเลือก · Google เป็นการเข้าสู่ระบบหลัก'};
    blocks.push(box('P-HEAD',116,86,1148,64,`${page.id} · ${page.title}`, [subtitles[page.key]]));
    if(page.key==='live'){
      if(tab==='live'){
        blocks.push(box('L1',116,198,566,454,'สนามรบและการมองเห็น',[
          state==='live'?'ตัวอย่าง: มี GSI / CV ที่สดใหม่':state==='stale'?'ข้อมูลขาดช่วง · แยกค่าล่าสุดจากค่าปัจจุบัน':'รอข้อมูลจากเกม',
          'Objective: Roshan — / Tower — / Smoke —',
          'ไม่แสดงเวลาที่ไม่มีแหล่งข้อมูล',
          'รายชื่อศัตรู 5 ช่อง: Visible / Missing / Dead / Unknown',
          'ข้อมูลที่ CV ไม่ครอบคลุมแสดง Unknown',
          'KDA / ไอเทมผู้อื่นไม่เดา'
        ],[a('L-SETUP','ตรวจ GSI / CV','settings/modules/ready')]));
        blocks.push(box('L2',698,198,566,454,'Activity + Events',[
          'สองรายการอยู่ในกรอบและเลื่อนภายใน',
          'เวลา · ประเภท · ข้อความ · แหล่งข้อมูล',
          state==='waiting'?'ยังไม่มีเหตุการณ์':'เหตุการณ์ตัวอย่าง · ไม่ใช่เกมจริง',
          'เมื่อข้อมูลกลับมา ต่อรายการโดยไม่ย้ายตำแหน่ง'
        ],[a('L-BUILD','ดูบิลด์','live/build/'+state),a('L-HOME','กลับหน้าหลัก','dashboard/main/'+(state==='live'?'live':'standby'))]));
      }else{
        blocks.push(box('L1',116,198,566,454,'ไอเทมของผู้เล่นเอง',[
          'ฮีโร่ — · ไอเทมปัจจุบัน —',
          'ใช้เฉพาะ valid own-player GSI',
          'ตำแหน่งเลน / ไอเทมถัดไป = — ถ้าไม่มีแหล่งข้อมูล',
          'ไม่สมมติคำแนะนำขั้นสูงที่ยังไม่มี'
        ],[a('B-LIVE','กลับข้อมูลสด','live/live/'+state)]));
        blocks.push(box('L2',698,198,566,454,'คำแนะนำจาก Maiden',[
          'แสดงคำแนะนำที่ได้รับจริง / ยังไม่มีคำแนะนำ',
          'Manual advice เป็นข้อความ ไม่รับรอง structured build',
          'Deep Coach อยู่หลัง MVP',
          'ระบุ provider เมื่อทราบจริง'
        ],[a('B-AI','ตั้งค่าผู้ช่วย','settings/ai/ready')]));
      }
    }
    if(page.key==='voice'){
      if(tab==='items'){
        blocks.push(box('V1',116,198,1148,454,'ไอเทมบัญชี · หลัง MVP',['บัญชีและคลังออนไลน์แยกจากแพ็กเสียงในเครื่อง','ไม่เปิดการซื้อ แลกโค้ด หรือติดตั้งออนไลน์จากแบบนี้'],[a('V-LOCAL','กลับแพ็กในเครื่อง','voice/inventory/ready'),a('V-STORE','ดูหน้าร้าน','store/inventory/deferred')]));
      }else if(tab==='editor'){
        blocks.push(box('V1',116,198,710,454,'รายการเสียงและ event mapping',[
          'เลือกแพ็กที่แก้ไขได้ · แพ็กเริ่มต้นอ่านอย่างเดียว',
          'Event / ไฟล์เสียง / ข้อความ fallback',
          'รายการเลื่อนภายใน · รายการที่เลือกคงอยู่',
          state==='error'?'บันทึกไม่สำเร็จ · เก็บฉบับแก้ไขและลองใหม่':state==='active'?'บันทึกตัวอย่างสำเร็จ':state==='loading'?'กำลังอ่านแพ็กตัวอย่าง…':'แบบฟอร์มตัวอย่าง · ไม่มีการแก้ไฟล์เสียงจริง'
        ],[a('V-SAVE','จำลองบันทึก','voice/editor/active'),a('V-CANCEL','ยกเลิก / กลับคลัง','voice/inventory/ready')]));
        blocks.push(box('V2',842,198,422,454,'รายละเอียดเสียงที่เลือก',['Event: ตัวอย่าง','พรีวิวคลิป · หยุด · ระดับเสียง','ไฟล์ไม่รองรับ → ระบุข้อผิดพลาด','ก่อนเปลี่ยนแพ็กขณะมีงานค้าง: บันทึก / ทิ้ง / อยู่ต่อ'],[a('V-ERROR','ดูกรณีผิดพลาด','voice/editor/error')]));
      }else{
        const messages={ready:'แพ็กในเครื่อง · รายการตัวอย่าง',empty:'ไม่พบแพ็กเพิ่มเติม · ใช้ default / SAPI ตามความพร้อม',loading:'กำลังอ่านโฟลเดอร์…',error:'แพ็กอ่านไม่ได้ · ระบุไฟล์และวิธีแก้ในเครื่อง',active:'เปิดใช้แพ็กตัวอย่างแล้ว'};
        blocks.push(box('V1',116,198,710,454,'คลังแพ็กเสียง',[messages[state],'แพ็กเริ่มต้น · แพ็กที่นำเข้า · แพ็กที่กำลังใช้','ค้นหา / เลือกแพ็ก · หน้า ก่อน / ถัดไป','ไม่แสดงไอเทมบัญชีเป็นไฟล์ที่ติดตั้งแล้ว'],[a('V-IMPORT','จำลองนำเข้า','voice/inventory/loading'),a('V-RETRY','สแกนใหม่','voice/inventory/ready'),a('V-EDIT','เปิดตัวแก้ไข','voice/editor/ready')]));
        blocks.push(box('V2',842,198,422,454,'รายละเอียดแพ็ก',[
          'แพ็กตัวอย่าง · ผู้สร้างตาม metadata',
          'จำนวน event ที่มีเสียง / ทั้งหมด',
          'รูปแบนเนอร์ใช้ภาพจากแพ็กจริง',
          state==='active'?'สถานะ: กำลังใช้':'สถานะ: '+(state==='empty'?'ยังไม่ได้เลือก':'พร้อมตรวจแพ็ก'),
          'ลองฟังไม่เปลี่ยนสถานะเกม'
        ],[a('V-EQUIP','จำลองเปิดใช้','voice/inventory/active',state==='empty'||state==='loading'),a('V-AUDIO','ตั้งค่าเสียง','settings/voice/ready'),a('V-MORE','หาแพ็กเพิ่ม','store/shop/deferred')]));
      }
    }
    if(page.key==='store'||(page.key==='account'&&['wallet','ledger'].includes(tab))){
      const spec={shop:['รายการสินค้า',['ตัวกรอง · รายการแพ็ก · รายละเอียด · ราคาเมื่อมีแหล่งจริง','สถานะสินค้า / owned / coming soon · pager']],wallet:['กระเป๋า',['ยอดคงเหลือจากบัญชี · ขณะนี้แสดง —','ประวัติธุรกรรมย่อ · ไม่เดายอดเงิน']],inventory:['คลังไอเทม',['รายการสิทธิ์จากบัญชี · แยกจากไฟล์ในเครื่อง','สถานะติดตั้ง / เปิดใช้ เมื่อบริการพร้อม']],ledger:['บันทึกธุรกรรม',['ตัวกรอง · วันที่ · ประเภท · จำนวน · สถานะ','Receipt ภายในกรอบ · ไม่แสดงข้อมูลการเงินสมมติ']]}[tab];
      blocks.push(box('T1',116,198,754,454,spec[0],['หลัง MVP · โครงหน้าสำหรับรอบถัดไป',...spec[1]],[
        a('T-VOICE','ใช้แพ็กในเครื่อง','voice/inventory/ready'),
        a('T-DISABLED','ซื้อ / เติมเงิน · ยังไม่เปิด',null,true)
      ]));
      blocks.push(box('T2',886,198,378,454,'บัญชีและขอบเขต',['พื้นที่นี้ไม่เป็นเงื่อนไขเข้าเกม','บัญชีเป็น optional','ไม่มีขั้นตอนชำระเงินจริงในชุดแบบ','เก็บแท็บเดิมไว้ตาม layout'],[a('T-ACCOUNT','ดูบัญชี','account/account/signedout'),a('T-HOME','กลับหน้าหลัก','dashboard/main/standby')]));
    }
    if(page.key==='insights'){
      const msg={empty:'ยังไม่มีเซสชันในเครื่อง',complete:'เซสชันตัวอย่างครบ · มีหลักฐานเหตุการณ์',partial:'ข้อมูลเซสชันไม่ครบ · ไม่สรุปแพ้ชนะ',loading:'กำลังอ่านประวัติในเครื่อง…',error:'อ่านประวัติไม่ได้ · เปิด log ในเครื่องเพื่อตรวจ'}[state];
      if(tab==='overview'){
        blocks.push(box('N1',116,198,1148,100,'ภาพรวมและความครบของข้อมูล',[msg,'Metric ที่ไม่มีแหล่งข้อมูลใช้ — · ระบุจำนวนเซสชันและช่วงเวลา']));
        blocks.push(box('N2',116,314,754,338,'สรุปและรายงานรายสัปดาห์',['สรุปไม่เกิน 3 ข้อ / complete session พร้อมเวลา','ไม่เดา death cause หรือเติมช่วงเวลาที่หาย','Local history ใช้ได้โดยไม่ต้องเข้าบัญชี','OpenDota เป็นส่วนเพิ่มและต้องบอกแหล่งข้อมูล'],[a('N-HISTORY','ดูประวัติ','insights/history/'+state)]));
        blocks.push(box('N3',886,314,378,338,'โปรไฟล์สาธารณะ',['Steam / OpenDota: ไม่ได้เชื่อมต่อ','แสดง unavailable เมื่ออ่านไม่ได้','ไม่ใช้ข้อมูลสาธารณะแทนผลเกมสด'],[a('N-ACCOUNT','เชื่อม Steam (ทางเลือก)','account/account/signedout')]));
      }else{
        blocks.push(box('N1',116,198,596,454,'รายการเซสชันในเครื่อง',[msg,'วันที่ · ฮีโร่ · ระยะเวลา · Complete / Partial','เลือกเซสชัน → รายละเอียดด้านขวา','แบ่งหน้าในกรอบ · คงรายการที่เลือกเมื่อกลับ'],[a('N-COMPLETE','ตัวอย่างครบ','insights/history/complete'),a('N-PARTIAL','ตัวอย่างไม่ครบ','insights/history/partial'),a('N-RETRY','ลองอ่านใหม่','insights/history/loading')]));
        blocks.push(box('N2',728,198,536,454,'รายละเอียดเซสชัน',[
          state==='empty'?'ยังไม่ได้เลือกเซสชัน':'ตัวอย่างเซสชัน · '+msg,
          'Timeline: เวลา / เหตุการณ์ / หลักฐาน',
          'Summary ไม่เกิน 3 ข้อเมื่อข้อมูลครบ',
          'Partial แสดงช่วงที่หายและสิ่งที่ยังสรุปไม่ได้',
          'ข้อมูลทั้งหมดอยู่ในเครื่อง'
        ],[a('N-OVERVIEW','กลับภาพรวม','insights/overview/'+state),a('N-SYSTEM','ตรวจโฟลเดอร์ Log','settings/system/ready')]));
      }
    }
    if(page.key==='account'&&!['wallet','ledger'].includes(tab)){
      const msg={signedout:'ใช้งาน local core ต่อได้โดยไม่เข้าสู่ระบบ',loading:tab==='security'?'กำลังอ่านสถานะจาก provider…':'รอ Google callback · ยกเลิกได้',signedin:'โปรไฟล์ตัวอย่าง · ไม่ใช่บัญชีจริง',error:tab==='security'?'อ่านสถานะไม่ได้ · ไม่เดา assurance':'เข้าสู่ระบบไม่สำเร็จ · ลองใหม่หรือใช้งาน local ต่อ',expired:'เซสชันหมดอายุ · ปิดเฉพาะคำสั่งบัญชี'}[state];
      if(tab==='account'){
        blocks.push(box('Q1',116,198,372,454,'Google / GID',[
          msg,'Google เป็น primary sign-in เท่านั้น',
          state==='signedin'?'GID: แสดงค่าที่ server ออกให้':'GID: —',
          'ไม่ใช้ GID หรือ Steam เป็นรหัสผ่าน',
          'ไม่มี Beta grant / Terms gate สำหรับ local core'
        ],[a('Q-GOOGLE','จำลองเข้า Google','account/account/loading',state==='loading'),a('Q-OK','จำลอง callback สำเร็จ','account/account/signedin'),a('Q-LOCAL','ใช้แบบไม่ล็อกอิน','dashboard/main/standby')]));
        blocks.push(box('Q2',504,198,372,454,'Steam',[
          'สถานะ: ยังไม่เชื่อม / เชื่อมแล้ว / อ่านไม่ได้',
          'Steam ใช้เชื่อมโปรไฟล์สาธารณะ',
          'ไม่ใช่ credential หรือ recovery',
          'ไม่ sync raw match / CV / Memory'
        ],[a('Q-STEAM','ดูสถิติ','insights/overview/empty'),a('Q-ERROR','ดูกรณีเชื่อมต่อพลาด','account/account/error')]));
        blocks.push(box('Q3',892,198,372,454,'โปรไฟล์',[
          'ชื่อที่แสดง: ผู้เล่นตัวอย่าง',
          state==='signedin'?'แก้ชื่อ / กำลังบันทึก / บันทึกแล้ว':'เข้าสู่ระบบก่อนแก้ข้อมูลบัญชี',
          'Sign-out ล้างเฉพาะ account session/cache',
          'เกมและประวัติ local ยังใช้งานต่อ'
        ],[a('Q-SECURITY','ความปลอดภัย','account/security/'+state),a('Q-OUT','จำลองออกจากระบบ','account/account/signedout',state!=='signedin')]));
      }else{
        blocks.push(box('Q1',116,198,566,454,'เซสชันและความปลอดภัย',[msg,'แสดงเฉพาะ provider state ที่อ่านได้จริง','เซสชันปัจจุบัน / อุปกรณ์ / เหตุการณ์','อ่านไม่สำเร็จ = unavailable ไม่เดา assurance','GID Shield / recovery / public badge หลัง MVP'],[a('Q-LOGIN','ไปหน้าบัญชี','account/account/'+state),a('Q-REFRESH','จำลองโหลดใหม่','account/security/loading')]));
        blocks.push(box('Q2',698,198,566,454,'ผลการทำรายการ',[
          'Sign out other sessions ต้องตรวจสิทธิ์และ step-up',
          'ไม่พร้อม → แจ้งเหตุผลและคงเซสชันนี้',
          'แบบนี้ไม่สร้าง MFA / SMS / recovery ใหม่',
          'ไม่แสดงข้อมูลส่วนตัวใน public profile'
        ],[a('Q-REVOKE','ตัวอย่างเซสชันหมดอายุ','account/security/expired')]));
      }
    }
    const anatomy={
      'live/live':[['L1','visibility'],['L2','logs']],
      'live/build':[['L1','items']],
      'voice/inventory':[['V1','packs'],['V2','banner']],
      'voice/editor':[['V1','mapping']],
      'store/shop':[['T1','catalog']],
      'store/ledger':[['T1','transactions']],
      'insights/overview':[['N2','summary']],
      'insights/history':[['N1','sessions']],
      'account/security':[['Q2','sessions']]
    }[page.key+'/'+tab]||[];
    if(!['empty','loading','error','signedout','expired'].includes(state)){
      for(const [id,type] of anatomy){const b=blocks.find(b=>b.id===id);if(b)b.anatomy=type;}
    }
    return {...s,blocks,note};
  }
  const flows=[
    {id:'F01',title:'เริ่มใช้โดยไม่เข้าสู่ระบบ',steps:[['dashboard/main/standby','เปิดแอป'],['settings/system/ready','D-SETUP · ตั้งค่า GSI'],['settings/system/saving','S-GSI · ติดตั้ง'],['settings/system/saved','config พร้อม'],['dashboard/main/prep','เปิด Dota / valid tick']],recovery:[['settings/system/error','ติดตั้งไม่สำเร็จ → แก้ path / สิทธิ์ → ลองใหม่'],['dashboard/main/standby','ออฟไลน์หรือไม่มีบัญชี → ใช้ local core ต่อ']]},
    {id:'F02',title:'ก่อนเกม → สด → สรุป',steps:[['dashboard/main/prep','GSI draft'],['dashboard/main/live','GSI live'],['live/live/live','D-LIVE · ดูรายละเอียด'],['dashboard/main/debrief','GSI จบเกม / จัดเก็บเซสชัน'],['insights/history/complete','D-HISTORY · ดูประวัติ']],recovery:[['dashboard/main/stale','GSI ขาดช่วง → Unknown → valid tick ใหม่'],['insights/history/partial','หลุดกลางเกม → partial · ไม่เดาผล']]},
    {id:'F03',title:'เลือกแพ็กเสียงแล้วกลับเกม',steps:[['dashboard/main/standby','ก่อนเกม'],['voice/inventory/ready','D-VOICE · เลือกแพ็ก'],['voice/inventory/active','V-EQUIP · เปิดใช้'],['settings/voice/ready','V-AUDIO · ทดสอบเสียง'],['dashboard/main/standby','S-HOME · กลับหน้าหลัก']],recovery:[['voice/inventory/error','อ่าน/ติดตั้งพลาด → คงแพ็กเดิม → สแกนใหม่'],['voice/editor/error','แก้แพ็กไม่สำเร็จ → คงงานค้าง / ยกเลิก']]},
    {id:'F04',title:'แพ็กเพิ่มเติม / ร้านหลัง MVP',steps:[['voice/inventory/ready','คลังในเครื่อง'],['store/shop/deferred','V-MORE · หาแพ็กเพิ่ม'],['store/wallet/deferred','แท็บกระเป๋า'],['store/ledger/deferred','แท็บบันทึก'],['voice/inventory/ready','T-VOICE · กลับคลัง']],recovery:[['store/inventory/deferred','คลังบัญชียังไม่เปิด → ไม่แสร้งว่าติดตั้งแล้ว'],['account/account/signedout','T-ACCOUNT · บัญชีเป็นทางเลือก']]},
    {id:'F05',title:'บัญชี optional / ยกเลิก / หมดอายุ',steps:[['dashboard/main/standby','ใช้ local core ได้'],['account/account/signedout','H / I · เปิดบัญชี'],['account/account/loading','Q-GOOGLE · OAuth'],['account/account/signedin','callback ที่ผ่านการตรวจ'],['insights/overview/empty','Q-STEAM · โปรไฟล์สาธารณะ']],recovery:[['account/account/error','ยกเลิก / callback ล้มเหลว → ลองใหม่หรือกลับ local'],['account/security/expired','หมดอายุ / revoke → ปิดเฉพาะ account actions'],['dashboard/main/standby','Q-LOCAL / sign-out → local core']]},
    {id:'F06',title:'ปรับ Overlay / Cloud / ความเป็นส่วนตัว',steps:[['settings/overlay/ready','I · ตั้งค่า Overlay'],['settings/overlay/saved','preview → บันทึกหรือยกเลิก'],['settings/ai/ready','หมวด AI · local เป็นค่าเริ่มต้น'],['settings/privacy/ready','S-PRIVACY · ตรวจข้อมูล'],['dashboard/main/standby','S-HOME · กลับหน้าหลัก']],recovery:[['settings/overlay/error','ค่าใช้ไม่ได้ → คงโปรไฟล์เดิม'],['settings/ai/error','local model ไม่พร้อม → unavailable'],['settings/privacy/error','ลบไม่สำเร็จ → แจ้งขอบเขตที่เหลือ · ไม่รายงานว่าลบแล้ว']]},
    {id:'F07',title:'ประวัติ → รายละเอียด → ตรวจปัญหา',steps:[['insights/overview/complete','I · สถิติ'],['insights/history/complete','N-HISTORY · เลือกเซสชัน'],['insights/history/partial','เลือกเซสชันที่ไม่ครบ'],['settings/system/ready','N-SYSTEM · ตรวจ Log'],['insights/history/loading','กลับประวัติ / ลองอ่านใหม่']],recovery:[['insights/history/empty','ไม่มีเซสชัน → กลับไปเล่นเกม'],['insights/history/error','อ่านไม่สำเร็จ → retry / ตรวจไฟล์ในเครื่อง']]},
    {id:'F08',title:'อัปเดตโดยไม่รบกวนเกม',steps:[['settings/general/ready','ตรวจอัปเดต Stable'],['settings/general/saving','กำลังตรวจ / ดาวน์โหลด'],['settings/general/saved','พร้อมติดตั้งเมื่อพ้นเกม'],['dashboard/main/standby','เปิดใหม่ → local core']],recovery:[['settings/general/error','ดาวน์โหลด / ตรวจลายเซ็นพลาด → คงเวอร์ชันเดิม'],['dashboard/main/live','กำลังเล่น → ภายหลัง / รอจบเกม']]}
  ];
  root.GM_WIREFRAMES={version:'1.0.0',stage:{w:1420,h:760},panel:{x:12,y:12,w:1280,h:720},basePath,dashboardPath,pages,flows,normalize,makeScreen,route};
})(typeof globalThis==='undefined'?window:globalThis);
