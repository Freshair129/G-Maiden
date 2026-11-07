import { basename } from 'node:path';

const wavPath = process.argv[2] ?? '';
const name = basename(wavPath);

if (name.startsWith('timeout')) {
  await new Promise((resolve) => setTimeout(resolve, 20_000));
  process.stdout.write('{"transcript":"hello maiden"}\n');
} else if (name.startsWith('error')) {
  process.stderr.write('synthetic decoder error\n');
  process.exitCode = 9;
} else if (name.startsWith('no-speech')) {
  process.stdout.write('{"transcript":""}\n');
} else {
  process.stdout.write('{"transcript":"hello maiden","intent":"ask_status","slots":{"lane":"mid"}}\n');
}
