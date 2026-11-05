import type { Character, Override, Pronoun } from './types';

export type Part = { text: string; quoted: boolean };

/**
 * How the speaker was decided:
 *  manual    – you picked it
 *  tag       – a speech tag like `"…," Ema said` / `she whispered`
 *  beat      – an action line by that character right before/around the quote
 *  continued – the previous paragraph's quote never closed (multi-paragraph speech)
 *  turn      – back-and-forth guess: the other person in the conversation
 *  none      – couldn't tell
 */
export type Confidence = 'manual' | 'tag' | 'beat' | 'continued' | 'turn' | 'none';

export type Block = {
  key: string;
  index: number;
  text: string;
  parts: Part[];
  isDialogue: boolean;
  speakerId: string | null;
  imageId?: string;
  confidence: Confidence;
};

// Straight quotes, curly quotes, and Japanese-style brackets. An unclosed quote runs to the end of the paragraph.
const QUOTE_RE = /“[^”]*(?:”|$)|"[^"]*(?:"|$)|「[^」]*(?:」|$)|『[^』]*(?:』|$)/g;
const CLOSERS: Record<string, string> = { '“': '”', '"': '"', '「': '」', '『': '』' };

const SPEECH_VERBS = new Set(
  `said says say asked asks replied replies answered answers shouted shouts yelled yells screamed
  whispered whispers muttered mutters murmured murmurs called calls cried cries added adds continued
  began snapped hissed growled laughed sighed breathed demanded insisted offered admitted warned
  gasped groaned mumbled exclaimed interrupted repeated told tells spoke speaks croaked rasped
  stammered stuttered barked roared pleaded begged agreed argued explained protested responded
  retorted whimpered sobbed chuckled grunted announced declared ordered commanded urged wheezed
  coughed managed panted shrieked bellowed purred teased joked`.split(/\s+/).filter(Boolean),
);

const SUBJECT_PRONOUNS: Record<string, Pronoun> = { he: 'he', she: 'she', they: 'they' };

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function hash(s: string) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

export function splitParts(p: string): { parts: Part[]; openEnded: boolean } {
  const parts: Part[] = [];
  let last = 0;
  let openEnded = false;
  for (const m of p.matchAll(QUOTE_RE)) {
    const start = m.index!;
    if (start > last) parts.push({ text: p.slice(last, start), quoted: false });
    const q = m[0];
    const closed = q.length > 1 && q.endsWith(CLOSERS[q[0]]);
    if (!closed) openEnded = true;
    if (q.length > 1) parts.push({ text: q, quoted: true });
    last = start + q.length;
  }
  if (last < p.length) parts.push({ text: p.slice(last), quoted: false });
  return { parts, openEnded };
}

type Mention = { id: string; start: number; end: number };

export function buildMatcher(chars: Character[]) {
  const termToId = new Map<string, string>();
  for (const c of chars) {
    const terms = [c.name, ...c.aliases];
    const first = c.name.trim().split(/\s+/)[0];
    if (first && first !== c.name.trim()) terms.push(first);
    for (const t of terms) {
      const tt = t.trim();
      if (tt && !termToId.has(tt)) termToId.set(tt, c.id);
    }
  }
  const terms = [...termToId.keys()].sort((a, b) => b.length - a.length);
  if (!terms.length) return (_: string): Mention[] => [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (text: string): Mention[] =>
    [...text.matchAll(re)].map((m) => ({ id: termToId.get(m[0])!, start: m.index!, end: m.index! + m[0].length }));
}

function resolvePronoun(p: Pronoun, history: string[], byId: Map<string, Character>): string | null {
  for (let i = history.length - 1; i >= 0; i--) {
    if (byId.get(history[i])?.pronoun === p) return history[i];
  }
  const only = [...byId.values()].filter((c) => c.pronoun === p);
  return only.length === 1 ? only[0].id : null;
}

/** Find a speech tag: a speech verb close to a name or a subject pronoun. */
function findTag(narr: string, ms: Mention[], history: string[], byId: Map<string, Character>): string | null {
  const words = [...narr.matchAll(/\p{L}+/gu)];
  let best: { id: string; dist: number } | null = null;
  for (const w of words) {
    if (!SPEECH_VERBS.has(w[0].toLowerCase())) continue;
    const vs = w.index!;
    const ve = vs + w[0].length;
    const distTo = (s: number, e: number) => (e <= vs ? vs - e : s >= ve ? s - ve : 0);
    for (const m of ms) {
      const d = distTo(m.start, m.end);
      if (d <= 24 && (!best || d < best.dist)) best = { id: m.id, dist: d };
    }
    for (const p of words) {
      const pr = SUBJECT_PRONOUNS[p[0].toLowerCase()];
      if (!pr) continue;
      const d = distTo(p.index!, p.index! + p[0].length);
      if (d > 14 || (best && d >= best.dist)) continue;
      const id = resolvePronoun(pr, history, byId);
      if (id) best = { id, dist: d };
    }
  }
  return best?.id ?? null;
}

/** Who a line of narration is "about": leading pronoun, else the first named character. */
function subjectOf(narr: string, ms: Mention[], history: string[], byId: Map<string, Character>): string | null {
  const lead = narr.replace(/^[\s¶,.…—–\-]+/u, '');
  const first = lead.match(/^\p{L}+/u)?.[0];
  const pr = first ? SUBJECT_PRONOUNS[first.toLowerCase()] : undefined;
  if (pr) {
    const id = resolvePronoun(pr, history, byId);
    if (id) return id;
  }
  return ms[0]?.id ?? null;
}

export function splitParagraphs(text: string) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function analyze(text: string, characters: Character[], overrides: Record<string, Override> = {}): Block[] {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const mentionsIn = buildMatcher(characters);
  const occurrences = new Map<string, number>();
  const history: string[] = []; // character ids, in order they were last mentioned/spoke
  const speakers: string[] = []; // dialogue speakers in order
  let prev: { isDialogue: boolean; speakerId: string | null; openEnded: boolean; subject: string | null } | null = null;
  const blocks: Block[] = [];

  splitParagraphs(text).forEach((p, index) => {
    const h = hash(p);
    const n = occurrences.get(h) ?? 0;
    occurrences.set(h, n + 1);
    const key = `${h}-${n}`;

    const { parts, openEnded } = splitParts(p);
    const isDialogue = parts.some((x) => x.quoted);
    const narr = parts.map((x) => (x.quoted ? ' ¶ ' : x.text)).join('');
    const ms = mentionsIn(narr);

    let speakerId: string | null = null;
    let confidence: Confidence = 'none';
    const set = (id: string | null, c: Confidence) => {
      if (!speakerId && id) {
        speakerId = id;
        confidence = c;
      }
    };

    if (isDialogue) {
      if (prev?.isDialogue && prev.openEnded && parts[0]?.quoted) set(prev.speakerId, 'continued');
      set(findTag(narr, ms, history, byId), 'tag');
      if (narr.replace(/[\s¶]/g, '').length > 0) set(subjectOf(narr, ms, history, byId), 'beat');
      if (prev && !prev.isDialogue) set(prev.subject, 'beat');
      if (prev?.isDialogue && prev.speakerId) {
        const last = prev.speakerId;
        const partner =
          [...speakers].reverse().find((s) => s !== last) ?? [...history].reverse().find((s) => s !== last) ?? null;
        set(partner, 'turn');
      }
    }

    const subject = isDialogue ? speakerId : subjectOf(narr, ms, history, byId);

    let imageId: string | undefined;
    const ov = overrides[key];
    if (ov && (ov.speakerId === null || byId.has(ov.speakerId))) {
      speakerId = ov.speakerId;
      imageId = ov.imageId;
      confidence = 'manual';
    }

    blocks.push({ key, index, text: p, parts, isDialogue, speakerId, imageId, confidence });

    for (const m of ms) history.push(m.id);
    if (speakerId) {
      history.push(speakerId);
      speakers.push(speakerId);
    }
    prev = { isDialogue: isDialogue || !!speakerId, speakerId, openEnded, subject: speakerId ?? subject };
  });

  return blocks;
}

const STOP = new Set(
  `The A An And But Or So He She They It I We You His Her Their Its My Your Our This That These Those Then There
  Here When While What Who Why How Where If As At In On Of For To From With Without No Not Yes Yeah Oh Okay OK Come
  Now Inside Together Just Even Still After Before Again One Two Three Once Maybe Please Sorry Hey Well Somewhere
  Nothing Something Everything Everyone Someone Mr Mrs Ms Dr God Chapter Him Them Me Us All Some Each Every Any Another
  Only Then Than Too Very Did Do Does Is Was Were Are Be Been Had Has Have Can Could Would Should Will Shall May Might
  Must Let Get Got Go Went Look Looked See Saw Wait Stop Run Help Good Bad Great Right Left Why Because Though Although
  Until Through Across Behind Beneath Above Below Around Over Under Into Onto Upon Like Ah Uh Um Hmm Huh Wow Damn Shit
  Thank Thanks Hello Hi Goodbye Bye Sir Ma'am Monday Tuesday Wednesday Thursday Friday Saturday Sunday`.split(/\s+/),
);

/** Capitalized words that show up a lot — likely character names you haven't added yet. */
export function suggestNames(text: string, characters: Character[], limit = 8): { name: string; count: number }[] {
  const known = new Set(characters.flatMap((c) => [c.name, ...c.aliases, c.name.split(/\s+/)[0]]));
  const counts = new Map<string, number>();
  for (const m of text.matchAll(/(?<![\p{L}])\p{Lu}\p{Ll}+(?![\p{L}])/gu)) {
    const w = m[0];
    if (STOP.has(w) || known.has(w)) continue;
    counts.set(w, (counts.get(w) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, c]) => c >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([name, count]) => ({ name, count }));
}
