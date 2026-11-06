// Isolated browser component fixture: real Account/Wallet/Security views,
// synthetic hooks only. Never load this bundle in the desktop application.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const require = createRequire(new URL('../../../../src/package.json', import.meta.url));
const { build } = createRequire(require.resolve('vite'))('esbuild');
const user = JSON.stringify({ id: 'synthetic-ui-user', email: 'ui-fixture@example.invalid' });
const mocks = {
  'auth.ts': `const user=${user}; const value={user,session:{access_token:'synthetic-never-sent',user},loading:false,busy:false,error:null,signOutPhase:'idle',lastAuthEvent:'SIGNED_IN',signOutWarning:null,signInWithGoogle:()=>{throw Error('fixture only')},signOut:()=>{throw Error('fixture only')}}; export const useAuth=()=>value;`,
  'profile.ts': `const user=${user}; export const useProfile=()=>({user,displayName:'Synthetic UI fixture',gidCode:'G-SYNTHETIC',generationName:'Fixture',save:async()=>{throw Error('fixture only')}});`,
  'identity.ts': `export const useIdentity=()=>({identity:null,loading:false,resolving:false,error:null,linkSteam:async()=>{throw Error('fixture only')},clear:async()=>{throw Error('fixture only')}});`,
  'wallet.ts': `const rows=Array.from({length:60},(_,i)=>({id:i+1,currency:'wallet',entryType:'grant',amount:10,balanceAfter:1000,refType:null,refId:null,note:'Synthetic transaction '+i,createdAt:'2026-09-13T00:00:00Z'})); const value={shardBalance:120,walletBalance:1000,lifetimeShardEarned:200,lifetimeShardSpent:80,lifetimeTopup:1000,lifetimeSpend:0,shardExpiresAt:null,shardDailyEarnCap:200,shardEarnedToday:10,loading:false,ledger:async({limit}={})=>rows.slice(0,limit||60),shareMatch:async()=>{throw Error('fixture only')},topup:async()=>{throw Error('fixture only')}};export const useWallet=()=>value;`,
  'securityApi.ts': `export const readSecurityState=async()=>({current_session:{session_ref:'synthetic',aal:'aal1',authoritative:true},factors:[],contacts:[],observed_device_source:'app_observed',devices:Array.from({length:20},(_,i)=>({id:'fixture-'+i,label:'Synthetic device '+i,platform:'windows',app_version:'0.13.2',last_seen_at:'2026-09-13T00:00:00Z',source:'app_observed'}))}); export const readSecurityEvents=async()=>Array.from({length:50},(_,i)=>({id:'event-'+i,event_type:'Synthetic UI event '+i,outcome:'fixture',source:'fixture',context:{},occurred_at:'2026-09-13T00:00:00Z'}));export const requestSessionAction=async()=>{throw Error('fixture only')};`,
  'supabase.ts': `export const supabase={from:(table)=>{if(table!=='coin_packages')throw Error('provider blocked in fixture');return{select:()=>({eq:()=>({order:async()=>({data:[],error:null})})})}},functions:{invoke:async()=>{throw Error('provider blocked in fixture')}}};`,
};
await build({
  stdin: { contents: `import React from 'react';import {createRoot} from 'react-dom/client';import AccountPage from './AccountPage';export function mount(element){const root=createRoot(element);root.render(React.createElement(AccountPage));return root;}`, resolveDir: fileURLToPath(new URL('../../../../src/src/', import.meta.url)), loader:'tsx' },
  bundle:true, format:'esm', jsx:'automatic', define:{'process.env.NODE_ENV':'"development"'},
  outfile:fileURLToPath(new URL('./account-fixture.js',import.meta.url)),
  plugins:[{name:'synthetic-ui-only',setup(build){
    build.onResolve({filter:/^@tauri-apps\/api\/core$/},()=>({path:'native-fixture',namespace:'fixture'}));
    build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:`export const invoke=async(cmd)=>{if(cmd==='verify_gmad_entitlement')return{state:'eligible',gid:'G-SYNTHETIC',terms:{version:'fixture'}};if(cmd==='lock_gmad_runtime')return null;throw Error('Native action blocked: '+cmd)};`,loader:'js'}));
    build.onLoad({filter:/[\/\\](auth|profile|wallet|securityApi|supabase|identity)\.ts$/},args=>({contents:mocks[args.path.split(/[\/\\]/).pop()],loader:'js'}));
  }}],
});
