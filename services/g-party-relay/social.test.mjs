import test from 'node:test';
import assert from 'node:assert/strict';
import { createRelay } from './server.mjs';

async function fixture(t, options = {}) {
 const server = createRelay(options); await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const origin=`http://127.0.0.1:${server.address().port}`;
 const post=async(path,body,token)=>{const r=await fetch(origin+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:`Bearer ${token}`}:{})},body:JSON.stringify(body)});return {status:r.status,body:await r.json()};};
 const owner=(await post('/v1/rooms',{displayName:'Owner'})).body;
 return {origin,post,owner,server};
}
test('unconfigured social proof fails closed while guest room has authoritative generation',async t=>{
 const {post,owner}=await fixture(t);
 assert.equal(owner.roomGeneration,1);
 const r=await post(`/v1/rooms/${owner.roomId}/social-proof`,{challenge:'1'.repeat(64)},owner.memberToken);
 assert.deepEqual(r,{status:503,body:{error:'social_unavailable'}});
});
test('configured member proof signs bounded current roster without renewing membership TTL',async t=>{
 let at=0;
 const {post,owner}=await fixture(t,{now:()=>at,social:{relayOrigin:'https://relay.example.test',key:'00'.repeat(32),redeemUrl:'https://broker.example.test/functions/v1/g-party-social-redeem'},wallNow:()=>1700000000000});
 at=29999;
 const r=await post(`/v1/rooms/${owner.roomId}/social-proof`,{challenge:'11'.repeat(32)},owner.memberToken);
 assert.equal(r.status,200);const p=JSON.parse(Buffer.from(r.body.proof.split('.')[0],'base64url'));
 assert.equal(p.generation,1);assert.deepEqual(p.memberIds,[owner.memberId]);
 at=30000;
 assert.equal((await post(`/v1/rooms/${owner.roomId}/social-proof`,{challenge:'11'.repeat(32)},owner.memberToken)).status,404);
});

import { createServer, request as httpRequest } from 'node:http';
import { createHmac } from 'node:crypto';
import { signProof, socialConfiguration, environmentSocialConfiguration, redeemTicket } from './social.mjs';
const KEY=Buffer.alloc(32);
const VECTOR={v:1,relayOrigin:'https://relay.example.test',challenge:'11'.repeat(32),roomId:'22'.repeat(16),memberId:'33'.repeat(16),ownerId:'33'.repeat(16),generation:1,memberIds:['33'.repeat(16)],issuedAtMs:1700000000000,expiresAtMs:1700000060000};
test('proof exact bytes match shared broker vector; changed key/origin change signer output',()=>{
 const proof=signProof(VECTOR,KEY);const [segment,signature]=proof.split('.');
 const expected=createHmac('sha256',KEY).update('GPartySocialProof/v1\n'+segment).digest('base64url');
 assert.equal(signature,expected);
 assert.equal(signature,'wqozqxv-tD61g7YUki6NEayO3ftyBsVsND-oTYWlSOo');
 assert.equal(Buffer.from(segment,'base64url').toString(),JSON.stringify(VECTOR));
 assert.notEqual(signProof(VECTOR,Buffer.alloc(32,1)),proof);
 assert.notEqual(signProof({...VECTOR,relayOrigin:'https://evil.example.test'},KEY),proof);
});
test('production configuration requires normalized HTTPS and never enables loopback',()=>{
 const value={relayOrigin:'http://127.0.0.1:5555',key:'00'.repeat(32),redeemUrl:'http://127.0.0.1:5556/redeem'};
 assert.equal(socialConfiguration(value),null);assert.ok(socialConfiguration(value,true));
 assert.equal(environmentSocialConfiguration({G_PARTY_SOCIAL_RELAY_ORIGIN:value.relayOrigin,G_PARTY_SOCIAL_HMAC_KEY:value.key,G_PARTY_SOCIAL_REDEEM_URL:value.redeemUrl}),null);
 for(const relayOrigin of ['https://relay.example.test/','https://u:p@relay.example.test','https://relay.example.test/path','https://relay.example.test?x=1'])assert.equal(socialConfiguration({...value,relayOrigin}),null);
});
function deferred(){let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};}
async function broker(t,admit){
 const seen=new Set();let calls=0;
 const server=createServer(async(req,res)=>{
  const chunks=[];for await(const c of req)chunks.push(c);const raw=Buffer.concat(chunks).toString();
  const expected=createHmac('sha256',KEY).update('GPartySocialRedeem/v1\n'+raw).digest('hex');
  assert.equal(req.headers['x-g-party-signature'],expected);
  const value=JSON.parse(raw);assert.deepEqual(Object.keys(value),['ticket','relayOrigin','nonce','issuedAtMs']);assert.match(value.nonce,/^[a-f0-9]{64}$/);assert.equal(value.relayOrigin,'https://relay.example.test');calls++;
  let result=seen.has(value.ticket)?{status:404,body:{error:'unavailable'}}:await admit(value,calls);seen.add(value.ticket);
  res.writeHead(result.status??200,{'content-type':'application/json'});res.end(JSON.stringify(result.body));
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>{server.closeAllConnections();server.close();});
 return {url:`http://127.0.0.1:${server.address().port}/redeem`,calls:()=>calls};
}
async function socialFixture(t,admit,options={}){
 let owner;const b=await broker(t,async(value,calls)=>admit?admit(value,calls,owner):{body:{roomId:owner.roomId,ownerId:owner.memberId,generation:1}});
 const f=await fixture(t,{...options,social:{relayOrigin:'https://relay.example.test',key:'00'.repeat(32),redeemUrl:b.url,allowLoopback:true}});owner=f.owner;return {...f,broker:b};
}
const socialJoin=(f,ticket='1'.repeat(64))=>f.post('/v1/rooms/social-join',{ticket,displayName:'Friend'});
test('signed HTTP broker redemption admits once, rejects replay, expired tickets and five-member capacity',async t=>{
 const f=await socialFixture(t,(value,_calls,owner)=> value.ticket==='e'.repeat(64)?{status:404,body:{error:'unavailable'}}:{body:{roomId:owner.roomId,ownerId:owner.memberId,generation:1}});
 assert.equal((await socialJoin(f)).status,201);
 assert.equal((await socialJoin(f)).status,503);
 assert.equal((await socialJoin(f,'e'.repeat(64))).status,503);
 const results=await Promise.all(['2','3','4','5','6','7'].map(c=>socialJoin(f,c.repeat(64))));
 assert.equal(results.filter(r=>r.status===201).length,3);
 assert.equal(results.filter(r=>r.status===409).length,3);
});
for(const mutation of ['rotate','owner-leave','owner-expiry'])test(`delayed redemption revalidates ${mutation} before synchronous admission`,async t=>{
 const entered=deferred(),release=deferred();let at=0;
 const f=await socialFixture(t,async(_value,_calls,owner)=>{entered.resolve();await release.promise;return {body:{roomId:owner.roomId,ownerId:owner.memberId,generation:1}};},{now:()=>at});
 const joining=socialJoin(f);await entered.promise;
 if(mutation==='rotate')assert.equal((await f.post(`/v1/rooms/${f.owner.roomId}/invite`,{},f.owner.memberToken)).body.roomGeneration,2);
 else if(mutation==='owner-leave')await fetch(f.origin+`/v1/rooms/${f.owner.roomId}/members/me`,{method:'DELETE',headers:{authorization:`Bearer ${f.owner.memberToken}`}});
 else at=30000;
 release.resolve();assert.equal((await joining).status,404);
});
async function pausedBody(f,path,token){
 const observed=new Promise(r=>f.server.once('request',r));
 const req=httpRequest(f.origin+path,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${token}`,'transfer-encoding':'chunked'}});
 const result=new Promise((resolve,reject)=>{req.on('error',reject);req.on('response',res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});});
 req.write('{"challenge":');
 // Socket response to a separate health request orders the first request's headers.
 await observed;
 return {finish:()=>{req.end(JSON.stringify('1'.repeat(64))+'}');return result;}};
}
for(const mutation of ['kick','rotate','owner-leave'])test(`proof reauthenticates after body read raced with ${mutation}`,async t=>{
 const f=await socialFixture(t);const peer=(await f.post('/v1/rooms/join',{invite:f.owner.invite,displayName:'Peer'})).body;
 const pending=await pausedBody(f,`/v1/rooms/${peer.roomId}/social-proof`,peer.memberToken);
 if(mutation==='rotate')await f.post(`/v1/rooms/${f.owner.roomId}/invite`,{},f.owner.memberToken);
 else await fetch(f.origin+`/v1/rooms/${f.owner.roomId}/members/${mutation==='kick'?peer.memberId:'me'}`,{method:'DELETE',headers:{authorization:`Bearer ${f.owner.memberToken}`}});
 assert.ok([401,404].includes((await pending.finish()).status));
});
test('proof validates auth, exact bounded challenge, and member rate without refreshing sample age',async t=>{
 let at=0;const f=await socialFixture(t,null,{now:()=>at});const path=`/v1/rooms/${f.owner.roomId}/social-proof`;
 assert.equal((await f.post(path,{challenge:'1'.repeat(64)})).status,401);
 for(const body of [{challenge:'x'},{challenge:'1'.repeat(64),extra:true}])assert.equal((await f.post(path,body,f.owner.memberToken)).status,400);
 const scope={matchKey:'f'.repeat(64),team:'radiant'};
 const sample={hero:'npc_dota_hero_axe',level:2,hp:200,maxHp:600,manaPercent:50,alive:true,respawnSeconds:0,sourceAgeMs:0};
 await f.post(`/v1/rooms/${f.owner.roomId}/sync`,{sequence:1,scope,sample},f.owner.memberToken);
 at=1900;await f.post(path,{challenge:'1'.repeat(64)},f.owner.memberToken);
 at=2100;const synced=await f.post(`/v1/rooms/${f.owner.roomId}/sync`,{sequence:2,scope,sample:null},f.owner.memberToken);
 // The proof did not turn source stats into a renewed publication.
 assert.equal(synced.body.members[0].sample,null);
 for(let i=0;i<27;i++)await f.post(path,{challenge:'1'.repeat(64)},f.owner.memberToken);
 assert.equal((await f.post(path,{challenge:'1'.repeat(64)},f.owner.memberToken)).status,429);
});

test('32 in-flight admissions fail closed across IP buckets and release permits after failure',async t=>{
 const entered=deferred(),release=deferred();let count=0;
 const f=await socialFixture(t,async()=>{if(++count===32)entered.resolve();await release.promise;return {status:404,body:{error:'unavailable'}};});
 function from(ip,ticket){return new Promise((resolve,reject)=>{const raw=JSON.stringify({ticket,displayName:'Friend'});const req=httpRequest(f.origin+'/v1/rooms/social-join',{method:'POST',localAddress:ip,headers:{'content-type':'application/json','content-length':Buffer.byteLength(raw)}},res=>{const chunks=[];res.on('data',c=>chunks.push(c));res.on('end',()=>resolve({status:res.statusCode,body:JSON.parse(Buffer.concat(chunks))}));});req.on('error',reject);req.end(raw);});}
 const pending=Array.from({length:32},(_,i)=>from(i<16?'127.0.0.2':'127.0.0.3',i.toString(16).padStart(64,'0')));
 await entered.promise;
 assert.equal((await from('127.0.0.4','e'.repeat(64))).body.error,'capacity');
 release.resolve();assert.ok((await Promise.all(pending)).every(r=>r.status===503));
 assert.equal((await from('127.0.0.4','f'.repeat(64))).body.error,'social_unavailable');
});
test('social proof never refreshes a publisher GSI age observed by another member',async t=>{
 let at=0;const f=await socialFixture(t,null,{now:()=>at});
 const peer=(await f.post('/v1/rooms/join',{invite:f.owner.invite,displayName:'Peer'})).body;
 const scope={matchKey:'f'.repeat(64),team:'radiant'};const sample={hero:'npc_dota_hero_axe',level:2,hp:200,maxHp:600,manaPercent:50,alive:true,respawnSeconds:0,sourceAgeMs:0};
 await f.post(`/v1/rooms/${f.owner.roomId}/sync`,{sequence:1,scope,sample},f.owner.memberToken);
 at=1900;assert.equal((await f.post(`/v1/rooms/${f.owner.roomId}/social-proof`,{challenge:'1'.repeat(64)},f.owner.memberToken)).status,200);
 at=2100;const snapshot=await f.post(`/v1/rooms/${peer.roomId}/sync`,{sequence:1,scope,sample},peer.memberToken);
 const owner=snapshot.body.members.find(m=>m.memberId===f.owner.memberId);assert.equal(owner.state,'stale');assert.equal(owner.ageMs,2100);assert.equal(owner.sample,null);
});
test('production social registration rejects HTTPS loopback hosts too',()=>{
 for(const host of ['127.0.0.1','127.0.0.2','[::1]','[::ffff:127.0.0.1]','localhost','sub.localhost']){
  assert.equal(socialConfiguration({relayOrigin:`https://${host}`,key:'00'.repeat(32),redeemUrl:'https://broker.example.test/redeem'}),null);
  assert.equal(socialConfiguration({relayOrigin:'https://relay.example.test',key:'00'.repeat(32),redeemUrl:`https://${host}/redeem`}),null);
 }
});

for (const scenario of ['non-200','oversized-length']) test(`redemption ${scenario} cancels a stalled response before releasing network ownership`,async t=>{
 const closed=deferred();
 const server=createServer(async(req,res)=>{
  for await (const _chunk of req) { /* drain the complete signed request */ }
  res.on('close',closed.resolve);
  res.writeHead(scenario==='non-200'?503:200,{'content-type':'application/json',...(scenario==='oversized-length'?{'content-length':'9000'}:{})});
  res.write('{');
 });
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 t.after(()=>{server.closeAllConnections();server.close();});
 const config=socialConfiguration({relayOrigin:'https://relay.example.test',key:'00'.repeat(32),redeemUrl:`http://127.0.0.1:${server.address().port}/redeem`},true);
 await assert.rejects(redeemTicket(config,'1'.repeat(64),Date.now()));
 let timer;
 const observed=await Promise.race([closed.promise.then(()=>true),new Promise(r=>{timer=setTimeout(()=>r(false),500);})]);
 clearTimeout(timer);assert.equal(observed,true,'rejected response must be closed promptly, not left alive outside the admission bound');
});
