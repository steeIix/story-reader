'use client';
import { useEffect, useMemo, useState } from 'react';
import { detectTransparency, processImage } from '@/lib/image';
import { suggestNames } from '@/lib/parse';
import { newCharacter, uid, type Character, type Pronoun, type Story } from '@/lib/types';
import { Avatar } from './Avatar';

export function CharacterPanel({ story, update }: { story: Story; update: (fn: (s: Story) => Story) => void }) {
  const [name, setName] = useState('');
  const allText = useMemo(() => story.chapters.map((c) => c.text).join('\n'), [story.chapters]);
  const suggestions = useMemo(() => suggestNames(allText, story.characters), [allText, story.characters]);

  const add = (n: string) => {
    const nm = n.trim();
    if (!nm) return;
    update((s) => ({ ...s, characters: [...s.characters, newCharacter(nm, s.characters.length)] }));
    setName('');
  };
  const patch = (id: string, p: Partial<Character>) =>
    update((s) => ({ ...s, characters: s.characters.map((c) => (c.id === id ? { ...c, ...p } : c)) }));
  const remove = (id: string) => {
    if (!confirm('Remove this character? Lines will be re-detected without them.')) return;
    update((s) => ({ ...s, characters: s.characters.filter((c) => c.id !== id) }));
  };

  return (
    <div className="panel">
      <h1>Characters</h1>
      <p className="muted">
        Add everyone who talks. The reader looks for these names (and aliases) around each quote to work out who's
        speaking. Set the right pronoun so lines like <i>"…," she said</i> work.
      </p>
      <p className="muted">
        For pictures, PNG or WebP art with a transparent background works best: it stands on its own next to the
        speech bubble. Empty edges are trimmed automatically.
      </p>

      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          add(name);
        }}
      >
        <input placeholder="Character name, e.g. Ema" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="primary" type="submit">
          + Add
        </button>
      </form>

      {suggestions.length > 0 && (
        <div className="suggest">
          <span className="muted">Names found in your chapters:</span>
          {suggestions.map((s) => (
            <button key={s.name} className="chip" onClick={() => add(s.name)}>
              + {s.name} <span className="muted">×{s.count}</span>
            </button>
          ))}
        </div>
      )}

      <div className="char-list">
        {story.characters.map((c) => (
          <CharacterCard key={c.id} c={c} patch={(p) => patch(c.id, p)} remove={() => remove(c.id)} />
        ))}
      </div>
    </div>
  );
}

function CharacterCard({ c, patch, remove }: { c: Character; patch: (p: Partial<Character>) => void; remove: () => void }) {
  const [aliases, setAliases] = useState(c.aliases.join(', '));
  const [busy, setBusy] = useState(false);

  // Images saved before transparency was tracked: check them once.
  useEffect(() => {
    const unknown = c.images.filter((i) => i.transparent === undefined);
    if (!unknown.length) return;
    let cancelled = false;
    Promise.all(unknown.map(async (i) => [i.id, await detectTransparency(i.src).catch(() => true)] as const)).then(
      (res) => {
        if (cancelled) return;
        const map = new Map(res);
        patch({ images: c.images.map((i) => (map.has(i.id) ? { ...i, transparent: map.get(i.id) } : i)) });
      },
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [c.images]);

  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const imgs = await Promise.all(
        [...files].map(async (f, i) => ({
          id: uid(),
          label: c.images.length === 0 && i === 0 ? 'default' : f.name.replace(/\.[^.]+$/, '').slice(0, 20),
          ...(await processImage(f)),
        })),
      );
      patch({ images: [...c.images, ...imgs] });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="char-card" style={{ borderTopColor: c.color }}>
      <div className="char-top">
        <div className="char-preview">
          <span className="checker char-art">
            <Avatar char={c} size={150} shape="figure" />
          </span>
          <div className="mini-bubble" style={{ ['--c' as string]: c.color }}>
            <span className="tail" aria-hidden="true" />
            <b style={{ color: c.color }}>{c.name || 'Name'}</b>
            “…”
          </div>
        </div>
        <div className="char-fields">
          <input className="name-input" value={c.name} onChange={(e) => patch({ name: e.target.value })} />
          <label>
            Also called (comma separated)
            <input
              placeholder="nicknames, surname, titles…"
              value={aliases}
              onChange={(e) => setAliases(e.target.value)}
              onBlur={() =>
                patch({
                  aliases: aliases
                    .split(',')
                    .map((a) => a.trim())
                    .filter(Boolean),
                })
              }
            />
          </label>
          <div className="row small">
            <label>
              Pronoun
              <select value={c.pronoun} onChange={(e) => patch({ pronoun: e.target.value as Pronoun })}>
                <option value="he">he</option>
                <option value="she">she</option>
                <option value="they">they</option>
                <option value="it">it</option>
              </select>
            </label>
            <label>
              Stands on the
              <select value={c.side} onChange={(e) => patch({ side: e.target.value as 'left' | 'right' })}>
                <option value="left">left</option>
                <option value="right">right</option>
              </select>
            </label>
            <label>
              Color
              <input type="color" value={c.color} onChange={(e) => patch({ color: e.target.value })} />
            </label>
          </div>
        </div>
      </div>

      <div className="images">
        {c.images.map((img, i) => (
          <div key={img.id} className={`img-tile ${i === 0 ? 'default' : ''}`}>
            <span className="checker tile-art">
              <Avatar char={c} imageId={img.id} size={110} shape="figure" />
            </span>
            {img.transparent === false && (
              <small className="warn" title="This picture has a solid background, so it shows as a box. Use a PNG or WebP with a transparent background for a cut-out.">
                has a background
              </small>
            )}
            <input
              value={img.label}
              onChange={(e) =>
                patch({ images: c.images.map((x) => (x.id === img.id ? { ...x, label: e.target.value } : x)) })
              }
            />
            <div className="img-actions">
              {i > 0 && (
                <button
                  className="ghost"
                  title="Make default"
                  onClick={() => patch({ images: [img, ...c.images.filter((x) => x.id !== img.id)] })}
                >
                  ★
                </button>
              )}
              <button
                className="ghost"
                title="Remove"
                onClick={() => patch({ images: c.images.filter((x) => x.id !== img.id) })}
              >
                ✕
              </button>
            </div>
          </div>
        ))}
        <label className="img-tile upload">
          <input type="file" accept="image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
          <span>{busy ? '…' : '+'}</span>
          <small>{c.images.length ? 'add expression' : 'add image'}</small>
        </label>
      </div>
      <button className="ghost danger" onClick={remove}>
        Remove character
      </button>
    </div>
  );
}
