export async function releaseCaptureResources({ stream, source, processor, silent, context } = {}) {
  for (const node of [processor, source, silent]) {
    try { node?.disconnect?.(); } catch { /* Continue releasing the remaining local resources. */ }
  }
  for (const track of stream?.getTracks?.() ?? []) {
    try { track.stop(); } catch { /* A stopped track is already released. */ }
  }
  if (context && context.state !== 'closed') {
    try { await context.close(); } catch { /* Closing an already-lost context needs no retry. */ }
  }
}
