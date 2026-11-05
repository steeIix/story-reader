'use client';
import { useMemo, useState } from 'react';
import { analyze, type Block, type Confidence } from '@/lib/parse';
import type { Chapter, Character, Override, Story } from '@/lib/types';
import { Avatar } from './Avatar';

const CONF_LABEL: Record<Confidence, string> = {
  manual: 'set by you',
  tag: 'speech tag',
  beat: 'action beat',
  continued: 'continued quote',
  turn: 'turn-taking guess',
  none: 'unknown',
};
const isGuess = (c: Confidence) => c === 'turn' || c === 'beat';

/** Someone the text names but who isn't in the cast: shown with a plain grey figure. */
function standIn(label: string): Character {
  return { id: `~${label}`, name: label, aliases: [], pronoun: 'they', color: '#8b8b99', side: 'left', images: [] };
}

export type Layout = 'chat' | 'margin' | 'stage';

export function Reader({
  story,
  chapter,
  layout,
  size,
  showGuesses,
  onOverride,
  onAddCharacter,
}: {
  story: Story;
  chapter: Chapter;
  layout: Layout;
  size: number;
  showGuesses: boolean;
  onOverride: (key: string, ov: Override | undefined) => void;
  /** Put an unlisted speaker (e.g. "The children") in the cast and give them this line. */
  onAddCharacter?: (name: string, key: string) => void;
}) {
  const blocks = useMemo(
    () => analyze(chapter.text, story.characters, chapter.overrides),
    [chapter.text, chapter.overrides, story.characters],
  );
  const byId = useMemo(() => new Map(story.characters.map((c) => [c.id, c])), [story.characters]);
  const [picking, setPicking] = useState<string | null>(null);

  const lines = blocks.filter((b) => b.isDialogue || b.speakerId);
  const unknown = lines.filter((b) => !b.speakerId && !b.label).length;

  if (!chapter.text.trim()) {
    return <div className="empty">This chapter is empty. Click <b>Edit</b> to paste your text in.</div>;
  }

  return (
    <article className={`reader ${layout}`} style={{ ['--av' as string]: `${size}px`, ['--fig' as string]: `${size}px` }}>
      <h1 className="chapter-title">{chapter.title}</h1>
      <p className="stats">
        {lines.length} spoken lines · {lines.length - unknown} matched to a character
        {unknown > 0 && <> · <span className="warn">{unknown} unknown</span></>}
        {story.characters.length === 0 && <> · add characters to match speakers</>}
      </p>

      {blocks.map((b) => {
        const char = b.speakerId ? byId.get(b.speakerId) : b.label ? standIn(b.label) : null;
        const spoken = b.isDialogue || !!b.speakerId;
        const open = picking === b.key;
        const toggle = () => setPicking(open ? null : b.key);
        return (
          <div key={b.key} className="block-wrap">
            {spoken ? (
              <Line b={b} char={char} layout={layout} size={size} showGuesses={showGuesses} onPick={toggle} />
            ) : (
              <div className="narr-row">
                <p className="narr">
                  <Text b={b} />
                </p>
                <button className="add-speaker" title="Show a character next to this line" onClick={toggle}>
                  +
                </button>
              </div>
            )}
            {open && (
              <SpeakerPicker
                characters={story.characters}
                block={b}
                onAddCharacter={
                  b.label && onAddCharacter
                    ? () => {
                        onAddCharacter(b.label!, b.key);
                        setPicking(null);
                      }
                    : undefined
                }
                onPick={(ov) => {
                  onOverride(b.key, ov);
                  setPicking(null);
                }}
                onClose={() => setPicking(null)}
              />
            )}
          </div>
        );
      })}
    </article>
  );
}

function Text({ b }: { b: Block }) {
  if (!b.isDialogue) return <>{b.text}</>;
  return (
    <>
      {b.parts.map((p, i) =>
        p.quoted ? (
          <span key={i} className="q">
            {p.text}
          </span>
        ) : (
          <span key={i} className="beat">
            {p.text}
          </span>
        ),
      )}
    </>
  );
}

function Line({
  b,
  char,
  layout,
  size,
  showGuesses,
  onPick,
}: {
  b: Block;
  char: Character | null | undefined;
  layout: Layout;
  size: number;
  showGuesses: boolean;
  onPick: () => void;
}) {
  const guess = showGuesses && isGuess(b.confidence);
  const thought = !b.isDialogue; // a non-quoted line you assigned (thoughts, telepathy, signs…)
  const color = char?.color ?? '#8b8b99';
  const who = (
    <span className="who" style={{ color }}>
      {char?.name ?? 'Who said this?'}
      {showGuesses && <span className={`conf ${guess ? 'guess' : ''}`}>{CONF_LABEL[b.confidence]}</span>}
    </span>
  );

  if (layout === 'stage') {
    return (
      <div
        className={`sline side-${char?.side ?? 'left'} ${!char ? 'nobody' : ''} ${b.label ? 'extra' : ''} ${
          showGuesses && (b.confidence === 'turn' || !char) ? 'is-guess' : ''
        } ${thought ? 'thought' : ''}`}
        style={{ ['--c' as string]: color }}
      >
        <button className="figure-btn" onClick={onPick} title="Change speaker or expression">
          <Avatar char={char} imageId={b.imageId} size="var(--fig)" shape="figure" />
        </button>
        <div className="sbubble">
          <span className="tail" aria-hidden="true" />
          {who}
          <div className="said">
            <Text b={b} />
          </div>
          {thought && (
            <span className="dots" aria-hidden="true">
              <i />
              <i />
            </span>
          )}
        </div>
      </div>
    );
  }

  if (layout === 'margin') {
    return (
      <div className={`mrow ${guess ? 'is-guess' : ''}`}>
        <p className={`narr ${thought ? 'thought' : ''}`} style={{ borderLeftColor: color }}>
          <Text b={b} />
        </p>
        <button className="mimg" onClick={onPick} title="Change speaker">
          <Avatar char={char} imageId={b.imageId} size={size} shape="card" />
          {who}
        </button>
      </div>
    );
  }

  return (
    <div className={`line side-${char?.side ?? 'left'} ${guess ? 'is-guess' : ''}`}>
      <button className="avatar-btn" onClick={onPick} title="Change speaker" style={{ width: size }}>
        <Avatar char={char} imageId={b.imageId} size={size} />
      </button>
      <div
        className={`bubble ${thought ? 'thought' : ''}`}
        style={{ borderColor: color, background: `color-mix(in srgb, ${color} 14%, var(--panel))` }}
      >
        {who}
        <div className="said">
          <Text b={b} />
        </div>
      </div>
    </div>
  );
}

function SpeakerPicker({
  characters,
  block,
  onPick,
  onClose,
  onAddCharacter,
}: {
  characters: Character[];
  block: Block;
  onAddCharacter?: () => void;
  onPick: (ov: Override | undefined) => void;
  onClose: () => void;
}) {
  const [chosen, setChosen] = useState<string | null>(block.speakerId);
  const chosenChar = characters.find((c) => c.id === chosen);
  return (
    <div className="picker">
      <div className="picker-head">
        <span>Who is speaking?</span>
        <button className="ghost" onClick={onClose}>
          ✕
        </button>
      </div>
      {characters.length === 0 && <p className="muted">Add characters first (Characters tab).</p>}
      <div className="picker-chars">
        {characters.map((c) => (
          <button
            key={c.id}
            className={`chip ${chosen === c.id ? 'on' : ''}`}
            onClick={() => (c.images.length > 1 ? setChosen(c.id) : onPick({ speakerId: c.id }))}
          >
            <Avatar char={c} size={28} />
            {c.name}
          </button>
        ))}
      </div>
      {chosenChar && chosenChar.images.length > 1 && (
        <>
          <div className="picker-sub">Expression</div>
          <div className="picker-chars">
            {chosenChar.images.map((img) => (
              <button
                key={img.id}
                className={`expr ${block.imageId === img.id ? 'on' : ''}`}
                onClick={() => onPick({ speakerId: chosenChar.id, imageId: img.id })}
              >
                <span className="checker expr-art">
                  <Avatar char={chosenChar} imageId={img.id} size={96} shape="figure" />
                </span>
                {img.label}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="picker-foot">
        {onAddCharacter && (
          <button className="ghost" onClick={onAddCharacter}>
            + Add “{block.label}” to the cast
          </button>
        )}
        {block.confidence === 'manual' && (
          <button className="ghost" onClick={() => onPick(undefined)}>
            ↺ Back to automatic
          </button>
        )}
        <button className="ghost" onClick={() => onPick({ speakerId: null })}>
          No speaker (plain text)
        </button>
      </div>
    </div>
  );
}
