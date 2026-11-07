import { createManifestEntry, upsertManifest } from './manifest.mjs';
import { releaseCaptureResources } from './capture.mjs';
import { loadPromptFiles } from './prompts.mjs';
import { labelCapturedMicrophone } from './microphone.mjs';
import { coveredPromptCount } from './progress.mjs';
import { createStartGate } from './start-gate.mjs';
import { encodePcm16Wav, resampleMono, TARGET_SAMPLE_RATE } from './wav.mjs';

const $ = (id) => document.getElementById(id);
const state = { prompts: [], promptIndex: 0, corpusDirectory: null, manifest: { schema_version: 1, utterances: [] }, recording: null, recordingActive: false, capture: null, promptUrl: null, startGate: createStartGate() };
const promptFileInput = $('prompt-files');

function setStatus(message, error = false) { $('status').textContent = message; $('status').className = error ? 'error' : ''; }
function currentPrompt() { return state.prompts[state.promptIndex] ?? null; }
function chunksToSamples(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const result = new Float32Array(length); let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}
function clearPreview() {
  if (state.promptUrl) URL.revokeObjectURL(state.promptUrl);
  state.promptUrl = null; state.recording = null; $('playback').hidden = true; $('playback').removeAttribute('src'); $('save').disabled = true;
}
function renderPrompt() {
  clearPreview();
  const prompt = currentPrompt();
  $('prompt-reference').textContent = prompt ? prompt.reference : 'All loaded prompts have been reached.';
  $('prompt-intent').textContent = prompt?.intent ?? '—';
  $('prompt-slots').textContent = prompt ? JSON.stringify(prompt.slots) : '—';
  $('skip').disabled = !prompt; $('rerecord').disabled = !prompt;
}
function renderProgress() {
  const groups = [['th', 'quiet'], ['th', 'game-audio'], ['en', 'quiet'], ['en', 'game-audio'], ['code-switch', 'quiet'], ['code-switch', 'game-audio']];
  $('progress').replaceChildren(...groups.map(([language, condition]) => {
    const total = state.prompts.filter((prompt) => prompt.language === language).length;
    const saved = coveredPromptCount(state.prompts, state.manifest.utterances, language, condition);
    const item = document.createElement('div'); item.textContent = `${language} / ${condition}: ${saved} / ${total} prompts covered`; return item;
  }));
}
function updateInputState() {
  const promptState = state.prompts.length ? `${state.prompts.length} prompts loaded` : 'prompt files not selected';
  const corpusState = state.corpusDirectory ? `corpus: ${state.corpusDirectory.name}` : 'corpus directory not selected';
  $('input-state').textContent = `${promptState}; ${corpusState}.`;
}
async function readExistingManifest(directory) {
  try {
    const file = await (await directory.getFileHandle('manifest.json')).getFile();
    const data = JSON.parse(await file.text());
    if (!data || !Array.isArray(data.utterances)) throw new Error('manifest.json must contain an utterances array');
    return data;
  } catch (error) {
    if (error.name === 'NotFoundError') return { schema_version: 1, utterances: [] };
    throw error;
  }
}
async function writeFile(directory, name, data) {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable();
  await writable.write(data); await writable.close();
}
function validateSetup() {
  if (!state.corpusDirectory) throw new Error('choose the corpus directory first');
  if (!currentPrompt()) throw new Error('load prompt files and select a prompt first');
  if (!$('speaker').value.trim()) throw new Error('enter a speaker pseudonym');
  if (!$('session').checkValidity()) throw new Error('session id must use lowercase letters, digits, hyphens, or underscores');
  if (!$('game-audio-note').value.trim()) throw new Error('enter the game-audio method and level note');
}
async function populateMicrophones(track) {
  const devices = await navigator.mediaDevices.enumerateDevices();
  const label = labelCapturedMicrophone(track, devices); $('microphone').value = label; return label;
}
function updateMeter(samples) {
  let peak = 0; let sum = 0;
  for (const sample of samples) { const magnitude = Math.abs(sample); peak = Math.max(peak, magnitude); sum += sample * sample; }
  const rms = Math.sqrt(sum / Math.max(1, samples.length)); $('meter').value = peak;
  $('warning').textContent = peak >= 0.98 ? 'Warning: clipping detected; lower microphone input and re-record.' : rms < 0.01 ? 'Warning: signal is very quiet; move closer or raise microphone input.' : '';
}
async function stopCapture() {
  const capture = state.capture; if (!capture) return;
  await releaseCaptureResources(capture); state.capture = null;
  const original = chunksToSamples(capture.chunks);
  if (original.length === 0) { setStatus('No audio samples were captured; nothing was saved.', true); return; }
  const samples = resampleMono(original, capture.context.sampleRate, TARGET_SAMPLE_RATE);
  state.recording = { samples, sampleRate: TARGET_SAMPLE_RATE, mic: capture.mic };
  const wav = encodePcm16Wav(samples); state.promptUrl = URL.createObjectURL(new Blob([wav], { type: 'audio/wav' }));
  $('playback').src = state.promptUrl; $('playback').hidden = false; $('save').disabled = false;
  setStatus(`Captured ${(samples.length / TARGET_SAMPLE_RATE).toFixed(2)} seconds. Play it back, re-record, or save.`);
}
function resetRecordButton() { $('record').textContent = 'Hold Space / Start recording'; $('record').classList.add('danger'); }
async function startRecording({ ptt = false } = {}) {
  let token;
  let stream; let context; let source; let processor; let silent;
  try {
    validateSetup(); clearPreview(); setStatus('Requesting microphone permission…');
    token = state.startGate.start({ ptt }); if (token === null) return;
    $('record').textContent = 'Preparing microphone — click to cancel'; $('record').classList.remove('danger');
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const mic = await populateMicrophones(stream.getAudioTracks()[0]);
    context = new AudioContext({ sampleRate: TARGET_SAMPLE_RATE }); await context.resume();
    source = context.createMediaStreamSource(stream); processor = context.createScriptProcessor(4096, 1, 1); silent = context.createGain(); silent.gain.value = 0;
    const chunks = [];
    processor.onaudioprocess = (event) => { const samples = event.inputBuffer.getChannelData(0); updateMeter(samples); if (state.recordingActive) chunks.push(samples.slice()); };
    source.connect(processor); processor.connect(silent); silent.connect(context.destination);
    if (!state.startGate.canActivate(token)) { await releaseCaptureResources({ stream, source, processor, silent, context }); setStatus(ptt ? 'Push-to-talk was released before capture began; microphone was released.' : 'Microphone setup was cancelled; microphone was released.'); return; }
    state.capture = { stream, context, source, processor, silent, chunks, mic }; state.recordingActive = true;
    state.startGate.finish(token);
    $('record').textContent = 'Recording — release Space / Stop'; $('record').classList.remove('danger'); setStatus('Recording locally.');
  } catch (error) { await releaseCaptureResources({ stream, source, processor, silent, context }); if (token === undefined || state.startGate.canActivate(token)) setStatus(error.message || 'Microphone permission or setup failed.', true); }
  finally { if (token !== undefined) state.startGate.finish(token); if (!state.recordingActive) resetRecordButton(); }
}
async function stopRecording() {
  if (!state.recordingActive) return;
  state.recordingActive = false; resetRecordButton(); await stopCapture();
}
async function saveRecording() {
  try {
    validateSetup(); if (!state.recording?.samples.length) throw new Error('record a non-empty utterance before saving');
    const prompt = currentPrompt(); const entry = createManifestEntry({ prompt, condition: $('condition').value, speaker: $('speaker').value, session: $('session').value, split: $('split').value, mic: state.recording.mic, gameAudioNote: $('game-audio-note').value, recordedAt: new Date().toISOString() });
    await writeFile(state.corpusDirectory, entry.wav, encodePcm16Wav(state.recording.samples));
    state.manifest = upsertManifest(state.manifest, entry);
    await writeFile(state.corpusDirectory, 'manifest.json', JSON.stringify(state.manifest, null, 2));
    setStatus(`Saved ${entry.wav} and updated manifest.json.`); renderProgress(); state.promptIndex += 1; renderPrompt();
  } catch (error) { setStatus(error.message || 'Could not save recording.', true); }
}
async function choosePrompts() {
  try {
    const handles = typeof window.showOpenFilePicker === 'function' ? await window.showOpenFilePicker({ multiple: true, types: [{ description: 'JSON prompt files', accept: { 'application/json': ['.json'] } }] }) : [...promptFileInput.files];
    const groups = await loadPromptFiles(handles); state.prompts = ['th', 'en', 'code-switch'].flatMap((language) => groups.get(language)); state.promptIndex = 0; updateInputState(); renderPrompt(); renderProgress(); setStatus('Prompt files loaded.');
  } catch (error) { if (error.name !== 'AbortError') setStatus(error.message || 'Could not load prompt files.', true); }
}
$('choose-prompts').addEventListener('click', () => { if (typeof window.showOpenFilePicker === 'function') choosePrompts(); else promptFileInput.click(); });
promptFileInput.addEventListener('change', choosePrompts);
$('choose-corpus').addEventListener('click', async () => { try { state.corpusDirectory = await window.showDirectoryPicker({ mode: 'readwrite' }); state.manifest = await readExistingManifest(state.corpusDirectory); updateInputState(); renderProgress(); setStatus('Corpus directory selected.'); } catch (error) { if (error.name !== 'AbortError') setStatus('Directory access was not granted.', true); } });
$('record').addEventListener('click', () => { if (state.recordingActive) stopRecording(); else if (state.startGate.isStarting()) { state.startGate.cancel(); setStatus('Cancelling microphone setup…'); } else startRecording(); });
$('save').addEventListener('click', saveRecording); $('skip').addEventListener('click', () => { state.promptIndex += 1; renderPrompt(); setStatus('Prompt skipped without saving.'); }); $('rerecord').addEventListener('click', () => { clearPreview(); setStatus('Ready to record this prompt again.'); });
document.addEventListener('keydown', (event) => { const editable = /^(INPUT|SELECT|TEXTAREA|BUTTON)$/u.test(document.activeElement?.tagName ?? ''); if (event.code === 'Space' && !event.repeat && !editable) { event.preventDefault(); state.startGate.setPttHeld(true); if (!state.recordingActive) startRecording({ ptt: true }); } });
document.addEventListener('keyup', (event) => { if (event.code === 'Space') { event.preventDefault(); state.startGate.setPttHeld(false); if (state.recordingActive) stopRecording(); else state.startGate.cancelPtt(); } });
renderPrompt(); renderProgress();
