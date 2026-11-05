// Scores speaker detection against Chapter 1 of ULTRA, labelled by hand.
//   npm run eval        -> shows the misses and the score
//   npm run eval all    -> shows every line
import { readFileSync } from 'node:fs';
import { analyze } from '../lib/parse.ts';

const C = (id: string, name: string, pronoun: string, aliases: string[] = []) => ({
  id, name, aliases, pronoun, color: '', side: 'left', images: [],
});
const chars: any = [
  C('dan', 'Dan', 'he', ['Aniki']),
  C('kenta', 'Kenta', 'he'),
  C('haruto', 'Haruto', 'he'),
  C('aya', 'Aya', 'she'),
  C('mei', 'Mei', 'she'),
  C('hoshino', 'Mrs. Hoshino', 'she', ['Miss Hoshino', 'Hoshino']),
  C('ema', 'Asano Ema', 'she', ['Ema']),
  C('anchor', 'News anchor', 'they', ['anchor']),
];

const text = readFileSync(new URL('./fixtures/ultra-ch1.txt', import.meta.url), 'utf8');
// paragraph index -> acceptable answers ("crowd" = any unlisted group like "The children")
const expected: Record<string, string[]> = JSON.parse(
  readFileSync(new URL('./fixtures/ultra-ch1.expected.json', import.meta.url), 'utf8'),
);

let ok = 0;
let total = 0;
for (const b of analyze(text, chars)) {
  if (!b.isDialogue) continue;
  const got = b.speakerId ?? (b.label ? 'L:' + b.label : '?');
  const want = expected[b.index] ?? [];
  const good = want.some((w) => w === got || (w === 'crowd' && got.startsWith('L:')));
  total++;
  if (good) ok++;
  if (process.argv[2] === 'all' || !good) {
    console.log(
      `${good ? '✓' : '✗'} ${String(b.index + 1).padStart(3)} ${got.padEnd(16)} want ${want.join('/').padEnd(10)} ${b.confidence.padEnd(9)} ${b.text.slice(0, 60)}`,
    );
  }
}
console.log(`${ok}/${total} lines (${Math.round((ok / total) * 100)}%)`);
