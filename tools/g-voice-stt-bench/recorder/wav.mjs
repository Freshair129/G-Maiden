const PCM16_SAMPLE_RATE = 16_000;

export function resampleMono(samples, inputRate, outputRate = PCM16_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array)) throw new TypeError('samples must be a Float32Array');
  if (!Number.isFinite(inputRate) || inputRate <= 0) throw new RangeError('inputRate must be positive');
  if (!Number.isFinite(outputRate) || outputRate <= 0) throw new RangeError('outputRate must be positive');
  if (samples.length === 0) return new Float32Array();
  if (inputRate === outputRate) return samples.slice();

  const outputLength = Math.max(1, Math.round(samples.length * outputRate / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let index = 0; index < outputLength; index += 1) {
    const position = index * ratio;
    const left = Math.min(Math.floor(position), samples.length - 1);
    const right = Math.min(left + 1, samples.length - 1);
    const fraction = position - left;
    output[index] = samples[left] + (samples[right] - samples[left]) * fraction;
  }
  return output;
}

export function encodePcm16Wav(samples, sampleRate = PCM16_SAMPLE_RATE) {
  if (!(samples instanceof Float32Array)) throw new TypeError('samples must be a Float32Array');
  if (!Number.isInteger(sampleRate) || sampleRate <= 0) throw new RangeError('sampleRate must be a positive integer');

  const dataBytes = samples.length * 2;
  const bytes = new Uint8Array(44 + dataBytes);
  const view = new DataView(bytes.buffer);
  const writeAscii = (offset, value) => {
    for (let index = 0; index < value.length; index += 1) bytes[offset + index] = value.charCodeAt(index);
  };
  writeAscii(0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(8, 'WAVE');
  writeAscii(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeAscii(36, 'data');
  view.setUint32(40, dataBytes, true);
  for (let index = 0; index < samples.length; index += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[index]));
    const pcm = clamped < 0 ? Math.round(clamped * 32_768) : Math.round(clamped * 32_767);
    view.setInt16(44 + index * 2, pcm, true);
  }
  return bytes;
}

export const TARGET_SAMPLE_RATE = PCM16_SAMPLE_RATE;
