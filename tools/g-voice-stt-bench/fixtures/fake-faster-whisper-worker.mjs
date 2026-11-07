import { createInterface } from 'node:readline';

const input = createInterface({ input: process.stdin, crlfDelay: Infinity });

for await (const line of input) {
  const request = JSON.parse(line);
  if (request.id === 'timeout') {
    await new Promise((resolve) => setTimeout(resolve, 20_000));
    process.stdout.write(`${JSON.stringify({ id: request.id, transcript: 'hello maiden' })}\n`);
  } else if (request.id === 'error') {
    process.stdout.write(`${JSON.stringify({ id: request.id, error: 'synthetic decoder error' })}\n`);
  } else if (request.id === 'environment') {
    const offline = process.env.HF_HUB_OFFLINE === '1' && process.env.TRANSFORMERS_OFFLINE === '1';
    process.stdout.write(`${JSON.stringify({ id: request.id, transcript: offline ? 'offline enabled' : 'offline missing' })}\n`);
  } else {
    process.stdout.write(`${JSON.stringify({ id: request.id, transcript: 'hello maiden' })}\n`);
  }
}
