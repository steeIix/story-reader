// Quick check of the speaker detection: `npm test`
import { analyze } from '../lib/parse.ts';
import type { Character } from '../lib/types.ts';

const chars: Character[] = [
  { id: 'dan', name: 'Dan', aliases: [], pronoun: 'he', color: '', side: 'right', images: [] },
  { id: 'ema', name: 'Ema', aliases: [], pronoun: 'she', color: '', side: 'left', images: [] },
];

const text = `And somewhere beyond the city, the surviving A.E.G.I.S. forces were still attempting to understand what had happened.
Dan stumbled.
Ema caught him before he fell.
"Come on!"
"Yeah..."
They reached the van.
Ema grabbed the rear door with her good hand.
Dan braced himself against the frame.
Blood dripped from his mouth onto the metal step.
He looked once more toward his shoulder.
The small crimson mouth remained silent.
Saiko...
He waited.
No reply came.
Ema pulled him forward.
"Inside. Now."
Dan forced one trembling leg onto the step.
"You first," he said.
"Don't argue with me, Dan," Ema snapped.
“Fine.”
She shoved him through the doors. “And stay down.”`;

const expected: Record<string, string> = {
  '"Come on!"': 'ema',
  '"Yeah..."': 'dan',
  '"Inside. Now."': 'ema',
  '"You first," he said.': 'dan',
  '"Don\'t argue with me, Dan," Ema snapped.': 'ema',
  '“Fine.”': 'dan',
  'She shoved him through the doors. “And stay down.”': 'ema',
};

let fail = 0;
for (const b of analyze(text, chars)) {
  if (!b.isDialogue) continue;
  const want = expected[b.text];
  const ok = want === b.speakerId;
  if (!ok) fail++;
  console.log(`${ok ? '✓' : '✗'} ${b.text.padEnd(55)} → ${b.speakerId ?? '?'} (${b.confidence})${ok ? '' : ` expected ${want}`}`);
}
process.exit(fail ? 1 : 0);
