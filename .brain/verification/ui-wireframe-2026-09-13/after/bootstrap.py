from browser_probe import *
print(browser('open','http://127.0.0.1:1420'),flush=True)
print(browser('snapshot','-i')[:500],flush=True)
print(evaluate("""(async()=>{
const mocks=await import('/node_modules/@tauri-apps/api/mocks.js');
const items=Array.from({length:24},(_,i)=>({id:'fixture_event_'+i,group:'fixture',label:'Synthetic event '+i,subtitle:'Synthetic only',thai:'ตัวอย่างอีเวนต์',accent:'#64c7ff',mapping:null,defaultClipCount:0,defaultClipUrl:null}));
const packs=Array.from({length:12},(_,i)=>({id:'ui-fixture-'+i,name:'UI fixture pack '+i,version:'0.0.0',locale:'th-TH',author:'Synthetic fixture',description:'Long fixture description '.repeat(30),path:'fixture-only',coveredEvents:0,totalEvents:24,clips:0,availableClips:Array.from({length:20},(_,j)=>({path:'fixture-'+j+'.wav',name:'Fixture '+j,url:''})),availableBanners:[],items,coverImage:'',coverImageUrl:null,builtIn:false}));
window.uiFixture={rootDir:'fixture-only',packsDir:'fixture-only',cacheDir:'fixture-only',activePackId:packs[0].id,activePack:packs[0],packs,groups:[{id:'fixture',label:'Synthetic events',accent:'#64c7ff'}]};
mocks.mockIPC((cmd)=>{if(cmd==='voice_api_state')return window.uiFixture;if(cmd==='secret_get'||cmd==='lock_gmad_runtime')return null;throw Error('Unavailable in UI fixture: '+cmd);},{shouldMockEvents:true});mocks.mockWindows('control');localStorage.setItem('gm-onboarded','1');return 'Fixture ready';})()"""),flush=True)
print(browser('network','route','**/*.supabase.co/**','--abort'),flush=True)
