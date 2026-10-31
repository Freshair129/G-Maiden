// Observe the actual native WebView and Rust events, without a second event renderer.
import { mkdir, writeFile, readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';
const out = resolve(process.argv[2]);
const port = Number(process.argv[3] ?? 9237);
await mkdir(out, { recursive: true });
const pause = ms => new Promise(done => setTimeout(done, ms));
async function connect(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done, reject) => { ws.onopen = done; ws.onerror = reject; });
  let serial = 0;
  const pending = new Map();
  ws.onmessage = ({ data }) => {
    const value = JSON.parse(data);
    const reply = pending.get(value.id);
    if (reply) { pending.delete(value.id); clearTimeout(reply.timer); value.error ? reply.reject(value.error) : reply.resolve(value.result); }
  };
  const rpc = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++serial;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Native CDP timeout: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); ws.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await rpc('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  return { ws, rpc, evaluate };
}
const pages = new Map();
let overlay;
let control;
const deadline = Date.now() + 60000;
while (Date.now() < deadline && (!overlay || !control)) {
  try {
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    for (const target of targets.filter(target => target.type === 'page' && target.webSocketDebuggerUrl)) {
      let page = pages.get(target.id);
      if (!page) { page = await connect(target); pages.set(target.id, page); }
      const label = await page.evaluate('window.__TAURI_INTERNALS__?.metadata?.currentWindow?.label');
      if (label === 'control') { control = page; await page.evaluate('window.__TAURI_INTERNALS__.invoke("set_overlay_visible",{visible:true}).then(()=>true)'); }
      if (label === 'overlay') overlay = page;
    }
  } catch { /* Native WebView initialization can precede its debugger endpoint. */ }
  if (!overlay) await pause(250);
}
if (!overlay || !control) throw new Error('Actual native control/overlay WebViews were not exposed');
await overlay.rpc('Page.enable');
await overlay.evaluate(`(async()=>{
  window.__gannNativeEvidence=[];
  const handler=window.__TAURI_INTERNALS__.transformCallback(e=>window.__gannNativeEvidence.push({at:Date.now(),...e.payload}));
  await window.__TAURI_INTERNALS__.invoke('plugin:event|listen',{event:'announcer-media-playback',target:{kind:'Any'},handler});
  return true;
})()`);
await writeFile(resolve(out, 'observer-ready.json'), JSON.stringify({ ready: true }));
const samples = [];
const captured = new Set();
let commandId = 0;
const limit = Date.now() + 120000;
while (Date.now() < limit) {
  try { await access(resolve(out, 'observer-stop')); break; } catch { /* Owned stop signal. */ }
  try {
    const command = JSON.parse(await readFile(resolve(out, 'observer-command.json'), 'utf8'));
    if (command.id > commandId) {
      const result = await control.evaluate(`window.__TAURI_INTERNALS__.invoke(${JSON.stringify(command.command)},${JSON.stringify(command.args)}).then(value=>({ok:true,value}))`);
      commandId = command.id;
      await writeFile(resolve(out, 'observer-command-result.json'), JSON.stringify({ id: commandId, ...result }));
    }
  } catch (error) { if (error.code !== 'ENOENT' && !(error instanceof SyntaxError)) throw error; }
  const sample = await overlay.evaluate(`({at:Date.now(),events:window.__gannNativeEvidence,
    videos:[...document.querySelectorAll('video[data-playback-id]')].map(v=>({id:v.dataset.playbackId,url:v.currentSrc||v.src,time:v.currentTime,ready:v.readyState,muted:v.muted,paused:v.paused,error:v.error?.code??null,opacity:v.style.opacity,frames:v.getVideoPlaybackQuality?.().totalVideoFrames??0}))})`);
  samples.push(sample);
  for (const video of sample.videos) {
    if (captured.has(video.id) || video.ready < 2 || video.time <= 0 || video.opacity === '0') continue;
    const screenshot = await overlay.rpc('Page.captureScreenshot', { format: 'png', fromSurface: true });
    await writeFile(resolve(out, `native-playback-${video.id}.png`), Buffer.from(screenshot.data, 'base64'));
    captured.add(video.id);
  }
  await writeFile(resolve(out, 'observer-evidence.json'), JSON.stringify({ samples, captured: [...captured] }));
  await pause(200);
}
for (const page of pages.values()) page.ws.close();
