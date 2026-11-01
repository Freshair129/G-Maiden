import { createHmac, randomBytes } from 'node:crypto';

const HEX = /^[a-f0-9]{64}$/;
const ID = /^[a-f0-9]{32}$/;
const localHost = host => host === 'localhost' || host.endsWith('.localhost') || /^127\./.test(host) || host === '[::1]' || /^\[::ffff:7f[0-9a-f]{2}:/.test(host);
function origin(value, allowLoopback) {
  if (typeof value !== 'string' || value.includes('\\')) return null;
  try {
    const url = new URL(value);
    if ((!allowLoopback && localHost(url.hostname)) || url.username || url.password || url.search || url.hash || url.pathname !== '/' ||
        (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(url.hostname)))) return null;
    return url.origin === value ? value : null;
  } catch { return null; }
}
export function socialConfiguration(value, allowLoopback = false) {
  if (!value || !HEX.test(value.key) || !origin(value.relayOrigin, allowLoopback)) return null;
  try {
    const url = new URL(value.redeemUrl);
    if ((!allowLoopback && localHost(url.hostname)) || url.username || url.password || url.search || url.hash ||
        (url.protocol !== 'https:' && !(allowLoopback && url.protocol === 'http:' && ['127.0.0.1','[::1]'].includes(url.hostname)))) return null;
    return Object.freeze({relayOrigin:value.relayOrigin,key:Buffer.from(value.key,'hex'),redeemUrl:url.href});
  } catch { return null; }
}
export function environmentSocialConfiguration(env = process.env) {
 return socialConfiguration({relayOrigin:env.G_PARTY_SOCIAL_RELAY_ORIGIN,key:env.G_PARTY_SOCIAL_HMAC_KEY,redeemUrl:env.G_PARTY_SOCIAL_REDEEM_URL});
}
export function signProof(payload,key) {
 const segment=Buffer.from(JSON.stringify(payload),'utf8').toString('base64url');
 return `${segment}.${createHmac('sha256',key).update(`GPartySocialProof/v1\n${segment}`,'utf8').digest('base64url')}`;
}
export function redeemSignature(raw,key) {return createHmac('sha256',key).update(`GPartySocialRedeem/v1\n${raw}`,'utf8').digest('hex');}
export async function redeemTicket(config,ticket,issuedAtMs) {
 const raw=JSON.stringify({ticket,relayOrigin:config.relayOrigin,nonce:randomBytes(32).toString('hex'),issuedAtMs});
 const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),3000);timer.unref();
 let reader;
 try {
  const response=await fetch(config.redeemUrl,{method:'POST',redirect:'error',signal:controller.signal,headers:{'content-type':'application/json','x-g-party-signature':redeemSignature(raw,config.key)},body:raw});
  reader=response.body?.getReader();
  if (response.status!==200 || !reader || Number(response.headers.get('content-length')??0)>8192) throw Error('social_unavailable');
  let size=0;const chunks=[];
  while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8192)throw Error('social_unavailable');chunks.push(Buffer.from(value));}
  const result=JSON.parse(Buffer.concat(chunks).toString('utf8'));
  if(!result || Object.keys(result).length!==3 || !ID.test(result.roomId) || !ID.test(result.ownerId) || !Number.isSafeInteger(result.generation)||result.generation<1)throw Error('social_unavailable');
  return result;
 } finally {
  // Terminate transport ownership before the caller releases its admission permit,
  // including rejection at headers before any body bytes have been consumed.
  controller.abort();
  try { await reader?.cancel(); } catch { /* abort can already have errored the stream */ }
  clearTimeout(timer);
 }
}
