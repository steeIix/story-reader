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
  /** Someone not in your cast, taken from the text: "The children", "A tall boy". */
  label?: string;
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
      if (!tt) continue;
      const forms = [tt, tt.toUpperCase()];
      if (tt === tt.toLowerCase()) forms.push(tt[0].toUpperCase() + tt.slice(1));
      for (const f of forms) if (!termToId.has(f)) termToId.set(f, c.id);
    }
  }
  const terms = [...termToId.keys()].sort((a, b) => b.length - a.length);
  if (!terms.length) return (_: string): Mention[] => [];
  const re = new RegExp(`(?<![\\p{L}\\p{N}])(?:${terms.map(escapeRe).join('|')})(?![\\p{L}\\p{N}])`, 'gu');
  return (text: string): Mention[] =>
    [...text.matchAll(re)].map((m) => ({ id: termToId.get(m[0])!, start: m.index!, end: m.index! + m[0].length }));
}

function resolvePronoun(p: Pronoun, history: string[], byId: Map<string, Character>): string | null {
  // "they" is usually a group, so it only means a they-character mentioned in the last few beats.
  const stop = p === 'they' ? Math.max(0, history.length - 4) : 0;
  for (let i = history.length - 1; i >= stop; i--) {
    if (byId.get(history[i])?.pronoun === p) return history[i];
  }
  if (p === 'they') return null;
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

// "The woman", "the old man", "the boy": after a character is introduced, these usually mean that character.
const DESCRIPTOR = /^the\s+(?:[\p{Ll}-]+\s+){0,2}?(woman|girl|lady|man|boy|guy)(?![\p{L}])/iu;
const DESCRIPTOR_PRONOUN: Record<string, Pronoun> = { woman: 'she', girl: 'she', lady: 'she', man: 'he', boy: 'he', guy: 'he' };

/** Who a line of narration is "about": leading pronoun or "the woman", else the first named character. */
function subjectOf(narr: string, ms: Mention[], history: string[], byId: Map<string, Character>): string | null {
  const lead = narr.replace(/^[\s¶,.…—–\-]+/u, '');
  const first = lead.match(/^\p{L}+/u)?.[0];
  const pr = first ? SUBJECT_PRONOUNS[first.toLowerCase()] : undefined;
  if (pr) {
    const id = resolvePronoun(pr, history, byId);
    if (id) return id;
  }
  const leadAt = narr.length - lead.length;
  if (ms[0] && ms[0].start <= leadAt + 4) return ms[0].id; // "Dan …", "Mrs. Hoshino …"
  const d = lead.match(DESCRIPTOR);
  if (d) {
    const id = resolvePronoun(DESCRIPTOR_PRONOUN[d[1].toLowerCase()], history, byId);
    if (id) return id;
  }
  return ms[0]?.id ?? null;
}

/** Names used to address someone: "Shut up, Kenta!", "Dan!", "Thank you, Dan." (not "Miss Hoshino would…"). */
function vocatives(quoted: string, mentionsIn: (t: string) => Mention[]): string[] {
  const out: string[] = [];
  for (const m of mentionsIn(quoted)) {
    const punctAfter = /^\s*[,!?.…—]/.test(quoted.slice(m.end));
    const atStart = /^["“「『]?\s*$/.test(quoted.slice(0, m.start));
    const commaBefore = /,\s*$/.test(quoted.slice(0, m.start));
    if ((atStart && punctAfter) || commaBefore) out.push(m.id);
  }
  return out;
}

// ---- Speakers who aren't in the cast ("The children erupted." / "a guard shouted") ----
const ARTICLES = 'the|a|an|some|several|another|one of the|two of the|both|two|three|four';
const NOT_NOUN = new Set(
  `was were is are had has have who that which with and or but of at in on to from by for as into onto out up down
  back over just then still also all only now began started stood sat looked turned stepped walked ran came went
  seemed could would should will can did does do suddenly finally quickly slowly`.split(/\s+/),
);
const VERB_ALT = [...SPEECH_VERBS].join('|');
const TAG_BEFORE = new RegExp(`(?:^|[\\s,¶—–-])(${ARTICLES})\\s+((?:\\p{Ll}[\\p{L}'’-]*\\s+){0,2}\\p{Ll}[\\p{L}'’-]*)\\s+(?:\\p{Ll}+ly\\s+)?(?:${VERB_ALT})(?![\\p{L}])`, 'iu');
const TAG_AFTER = new RegExp(`(?:${VERB_ALT})\\s+(${ARTICLES})\\s+((?:\\p{Ll}[\\p{L}'’-]*\\s*){1,3})`, 'iu');
const LEAD = new RegExp(`^(${ARTICLES})\\s+((?:\\p{Ll}[\\p{L}'’-]*\\s*){1,4})`, 'iu');

/** Trim a noun phrase like "tall boy pushed to" down to "tall boy". */
function trimNoun(words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    const lw = w.toLowerCase();
    if (NOT_NOUN.has(lw) || SPEECH_VERBS.has(lw) || /ly$/.test(lw)) break;
    if (out.length && (/ed$/.test(lw) || /[^s]s$/.test(lw))) break; // "children erupted", "crowd roars"
    out.push(w);
    if (/ed$/.test(lw) && out.length === 1) break;
  }
  return out;
}

function makeLabel(article: string, rest: string): string | null {
  const noun = trimNoun(rest.trim().split(/\s+/));
  if (!noun.length) return null;
  const lab = `${article} ${noun.join(' ')}`.replace(/\s+/g, ' ').trim();
  return lab[0].toUpperCase() + lab.slice(1).toLowerCase();
}

/** "…," a guard shouted  /  shouted the old man */
function labelTag(narr: string): string | null {
  const m = narr.match(TAG_BEFORE);
  if (m) {
    const lab = makeLabel(m[1], m[2]);
    if (lab) return lab;
  }
  const a = narr.match(TAG_AFTER);
  return a ? makeLabel(a[1], a[2]) : null;
}

// Words for people (and voices). An action line only names an unlisted speaker if it ends in one of these,
// so "The van door slammed." never becomes a speaker.
const PERSON = new Set(
  `child children kid kids boy boys girl girls man men woman women person people guy guys lady ladies gentleman
  crowd group voice voices stranger strangers figure figures guard guards soldier soldiers officer officers agent agents
  student students teacher teachers driver drivers doctor doctors nurse nurses medic medics captain commander
  leader leaders king queen prince princess knight knights priest priests merchant merchants villager villagers
  townsfolk onlooker onlookers bystander bystanders civilian civilians reporter reporters announcer operator
  pilot pilots sergeant lieutenant general major colonel chief boss clerk shopkeeper waiter waitress bartender
  mother father mom dad mum parent parents brother sister son daughter grandmother grandfather old elder elders
  twins twin teen teens teenager teenagers youth baby toddler fan fans friend friends classmate classmates
  enemy enemies thug thugs bandit bandits recruit recruits trooper troopers survivor survivors scientist scientists
  researcher researchers technician technicians witch wizard mage mages monster creature thing mouth one others
  someone somebody everyone everybody`.split(/\s+/),
);

/** "The children erupted." -> "The children" */
function labelLead(narr: string): string | null {
  const lead = narr.replace(/^[\s¶,.…—–\-]+/u, '');
  const m = lead.match(LEAD);
  if (!m) return null;
  const lab = makeLabel(m[1], m[2]);
  const last = lab?.split(' ').pop()?.toLowerCase();
  return lab && last && PERSON.has(last) ? lab : null;
}

export function splitParagraphs(text: string) {
  return text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

type Info = {
  isDialogue: boolean; // quoted, or a line you assigned to someone
  subject: string | null; // narration: who it's about
  subjectLabel: string | null; // narration: an unlisted person it's about ("The children")
  addressed: Set<string>; // dialogue: anyone named inside the quotes
  vocatives: string[]; // dialogue: anyone spoken to by name
};

const LOOK_BACK = 4; // narration paragraphs to search back for the speaker
const LOOK_AHEAD = 4;
const REPLY_WINDOW = 7;
// Lines that answer a call: "What?", "Yeah?", "Coming!"
const REPLY_START = /^["“「『]\s*(what|yeah|yes|yep|huh|hm+|coming|i'?m coming|hey|sup|mm+|uh|eh|oh|sorry|here|no|nope|okay|ok|sure|fine)\b/i;

/** A line that is only someone's name: "Dan!", "Aniki." */
function isSummons(b: Block, mentionsIn: (t: string) => Mention[]): boolean {
  const q = b.parts.filter((x) => x.quoted).map((x) => x.text).join(' ');
  let rest = q;
  for (const m of mentionsIn(q).reverse()) rest = rest.slice(0, m.start) + rest.slice(m.end);
  return rest.replace(/[\p{P}\s]/gu, '').length <= 3; // allow "Oi", "Hey"
}

export function analyze(text: string, characters: Character[], overrides: Record<string, Override> = {}): Block[] {
  // Pass 1 finds who each narration line is about; pass 2 can then look ahead at it while assigning turns.
  const first = run(text, characters, overrides, null);
  return run(text, characters, overrides, first.info).blocks;
}

function run(
  text: string,
  characters: Character[],
  overrides: Record<string, Override>,
  ahead: Info[] | null,
): { blocks: Block[]; info: Info[] } {
  const byId = new Map(characters.map((c) => [c.id, c]));
  const mentionsIn = buildMatcher(characters);
  const occurrences = new Map<string, number>();
  // Character ids in the order they were mentioned. Each paragraph's subject/speaker is pushed last,
  // so "he"/"she" prefer whoever the scene is following.
  const history: string[] = [];
  const speakers: string[] = []; // named dialogue speakers in order
  const blocks: Block[] = [];
  const info: Info[] = [];
  const openEnded: boolean[] = [];

  splitParagraphs(text).forEach((p, index) => {
    const h = hash(p);
    const n = occurrences.get(h) ?? 0;
    occurrences.set(h, n + 1);
    const key = `${h}-${n}`;

    const { parts, openEnded: open } = splitParts(p);
    const isDialogue = parts.some((x) => x.quoted);
    const narr = parts.map((x) => (x.quoted ? ' ¶ ' : x.text)).join('');
    const hasBeat = narr.replace(/[\s¶]/g, '').length > 0;
    const ms = mentionsIn(narr);
    const quoted = parts.filter((x) => x.quoted).map((x) => x.text).join(' ');
    // People named inside the quote are being talked to/about ("EMA!"), so they're unlikely to be the speaker.
    const addressed = new Set(mentionsIn(quoted).map((m) => m.id));
    const voc = isDialogue ? vocatives(quoted, mentionsIn) : [];

    let speakerId: string | null = null;
    let label: string | undefined;
    let confidence: Confidence = 'none';
    const done = () => !!speakerId || !!label;
    const set = (id: string | null | undefined, c: Confidence, allowAddressed = false) => {
      if (done() || !id || (!allowAddressed && addressed.has(id))) return;
      speakerId = id;
      confidence = c;
    };
    const setLabel = (l: string | null | undefined, c: Confidence) => {
      if (done() || !l) return;
      label = l;
      confidence = c;
    };

    const prevI = index - 1;
    const prev = info[prevI];
    const prevB = blocks[prevI];

    if (isDialogue) {
      // 1. A quote that carries on from the previous paragraph.
      if (prev?.isDialogue && openEnded[prevI] && parts[0]?.quoted) {
        set(prevB.speakerId, 'continued', true);
        setLabel(prevB.label, 'continued');
      }
      // 2. Speech tags: `"…," Ema said`, `she whispered`, `a guard shouted`.
      set(findTag(narr, ms, history, byId), 'tag', true);
      if (hasBeat) setLabel(labelTag(narr), 'tag');
      // 3. An action in the same paragraph: `Ema grinned. "…"`.
      if (hasBeat) {
        set(subjectOf(narr, ms, history, byId), 'beat');
        setLabel(labelLead(narr), 'beat');
      }
      // 3b. Someone was spoken to by name a moment ago, then a little narration: they answer.
      //     `"…, Dan." / Dan looked over his shoulder. / "Relax, old lady."`
      //     After a bare summons ("Dan!") the caller usually carries on, unless this line is a reply ("What?").
      if (!done() && !prev?.isDialogue) {
        let j = prevI;
        while (j >= 0 && index - j <= REPLY_WINDOW && !info[j].isDialogue) j--;
        if (j >= 0 && index - j <= REPLY_WINDOW && info[j].isDialogue) {
          const v = info[j].vocatives.find((x) => x !== blocks[j].speakerId);
          if (v && (!isSummons(blocks[j], mentionsIn) || REPLY_START.test(quoted))) set(v, 'turn');
        }
      }
      // 4. The narration just before: walk back over it to the nearest person who isn't being spoken to.
      for (let j = prevI, k = 0; j >= 0 && k < LOOK_BACK && !done() && !info[j].isDialogue; j--, k++) {
        set(info[j].subject, 'beat');
        if (j === prevI) setLabel(info[j].subjectLabel, 'beat');
      }
      // 4b. A short pause in someone's speech: `"…" / The footage changed. / "…"` -> same speaker carries on.
      if (!done() && !prev?.isDialogue) {
        let j = prevI;
        while (j >= 0 && index - j <= LOOK_BACK && !info[j].isDialogue) j--;
        if (j >= 0 && index - j <= LOOK_BACK && info[j].isDialogue) set(blocks[j].speakerId, 'turn');
      }
      // 5. Back-and-forth with the line before.
      if (prev?.isDialogue) {
        const last = prevB.speakerId;
        const ok = (s: string) => s !== last && !addressed.has(s);
        set(prev.vocatives.find(ok), 'turn'); // whoever was just spoken to by name answers
        if (prevB.label) setLabel(prevB.label, 'turn'); // a crowd keeps shouting
        // An outburst is usually followed by the shouter's own action: `"THANKS, ANIKI!" / Kenta hugged him.`
        if (last && ahead && /[!！]["”」』]?\s*$/.test(quoted) && ahead[index + 1] && !ahead[index + 1].isDialogue) {
          const nx = ahead[index + 1];
          if (nx.subject && nx.subject !== last) set(nx.subject, 'turn');
          else if (!nx.subject) setLabel(nx.subjectLabel, 'turn');
        }
        if (last) set([...speakers].reverse().find(ok) ?? [...history].reverse().find(ok), 'turn');
      }
    }

    // 6. Look-ahead, for lines with no clue at all: `From the doorway came a voice. / "…" / Mrs. Hoshino stood there.`
    if (isDialogue && ahead && !done() && !(prev?.isDialogue && prevB.speakerId)) {
      for (let j = index + 1, k = 0; j < ahead.length && k < LOOK_AHEAD && !ahead[j].isDialogue && !done(); j++, k++) {
        set(ahead[j].subject, 'turn');
        if (j === index + 1) setLabel(ahead[j].subjectLabel, 'turn');
      }
    }

    const subject = isDialogue ? speakerId : subjectOf(narr, ms, history, byId);
    const subjectLabel = isDialogue || subject ? null : labelLead(narr);

    let imageId: string | undefined;
    const ov = overrides[key];
    if (ov && (ov.speakerId === null || byId.has(ov.speakerId))) {
      speakerId = ov.speakerId;
      label = undefined;
      imageId = ov.imageId;
      confidence = 'manual';
    }

    blocks.push({ key, index, text: p, parts, isDialogue, speakerId, label, imageId, confidence });
    info.push({
      isDialogue: isDialogue || !!speakerId,
      subject: speakerId ?? subject,
      subjectLabel,
      addressed,
      vocatives: voc,
    });
    openEnded.push(open);

    for (const id of addressed) if (id !== speakerId) history.push(id);
    for (const m of ms) history.push(m.id);
    if (speakerId) {
      history.push(speakerId);
      speakers.push(speakerId);
    } else if (subject) history.push(subject);
  });

  return { blocks, info };
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
