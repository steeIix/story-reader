'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CharacterPanel } from '@/components/CharacterPanel';
import { ChapterEditor } from '@/components/ChapterEditor';
import { Reader, type Layout } from '@/components/Reader';
import { downloadJson, useStory } from '@/lib/useStory';
import { newChapter, newCharacter, type Chapter } from '@/lib/types';

type View = 'read' | 'edit' | 'characters';

function usePref<T>(key: string, initial: T) {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    try {
      const s = localStorage.getItem(key);
      if (s) setV(JSON.parse(s));
    } catch {}
  }, [key]);
  const set = (x: T) => {
    setV(x);
    try {
      localStorage.setItem(key, JSON.stringify(x));
    } catch {}
  };
  return [v, set] as const;
}

export default function StoryPage() {
  const { id } = useParams<{ id: string }>();
  const { story, update } = useStory(id);
  const [chapterId, setChapterId] = useState<string | null>(null);
  const [view, setView] = useState<View>('read');
  const [layout, setLayout] = usePref<Layout>('pref.layout', 'stage');
  const [smallSize, setSmallSize] = usePref<number>('pref.size', 64);
  const [stageSize, setStageSize] = usePref<number>('pref.stageSize', 260);
  // Stage pictures are much bigger, so they get their own size setting.
  const isStage = layout === 'stage';
  const size = isStage ? stageSize : smallSize;
  const setSize = isStage ? setStageSize : setSmallSize;
  const [showGuesses, setShowGuesses] = usePref<boolean>('pref.guesses', true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (story && !story.chapters.some((c) => c.id === chapterId)) setChapterId(story.chapters[0]?.id ?? null);
  }, [story, chapterId]);

  if (story === undefined) return <div className="center muted">Loading…</div>;
  if (story === null)
    return (
      <div className="center">
        <p>Story not found on this device.</p>
        <Link href="/">← Library</Link>
      </div>
    );

  const chapter = story.chapters.find((c) => c.id === chapterId) ?? null;

  const patchChapter = (cid: string, p: Partial<Chapter>) =>
    update((s) => ({ ...s, chapters: s.chapters.map((c) => (c.id === cid ? { ...c, ...p } : c)) }));

  const addChapter = () => {
    const ch = newChapter(`Chapter ${story.chapters.length + 1}`);
    update((s) => ({ ...s, chapters: [...s.chapters, ch] }));
    setChapterId(ch.id);
    setView('edit');
    setMenuOpen(false);
  };

  const deleteChapter = (cid: string) => {
    if (!confirm('Delete this chapter?')) return;
    update((s) => ({ ...s, chapters: s.chapters.filter((c) => c.id !== cid) }));
    setView('read');
  };

  return (
    <div className="shell">
      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <Link href="/" className="back">
          ← Library
        </Link>
        <input
          className="story-title"
          value={story.title}
          onChange={(e) => update((s) => ({ ...s, title: e.target.value }))}
        />

        <div className="side-head">
          <span>Chapters</span>
          <button className="plus" onClick={addChapter} title="Add chapter">
            +
          </button>
        </div>
        <nav className="chapters">
          {story.chapters.map((c, i) => (
            <button
              key={c.id}
              className={`ch ${c.id === chapterId && view !== 'characters' ? 'on' : ''}`}
              onClick={() => {
                setChapterId(c.id);
                setView('read');
                setMenuOpen(false);
              }}
            >
              <span className="ch-n">{i + 1}</span>
              {c.title || 'Untitled'}
            </button>
          ))}
          {story.chapters.length === 0 && <p className="muted small-p">No chapters yet. Hit + to add one.</p>}
        </nav>

        <button
          className={`ch chars ${view === 'characters' ? 'on' : ''}`}
          onClick={() => {
            setView('characters');
            setMenuOpen(false);
          }}
        >
          <span className="ch-n">☺</span>
          Characters ({story.characters.length})
        </button>

        <button className="ghost export" onClick={() => downloadJson(story.title, story)}>
          ⤓ Export backup
        </button>
      </aside>

      <main className="main">
        <header className="toolbar">
          <button className="ghost menu-btn" onClick={() => setMenuOpen(!menuOpen)}>
            ☰
          </button>
          {view === 'read' && chapter && (
            <>
              <div className="seg">
                <button className={layout === 'chat' ? 'on' : ''} onClick={() => setLayout('chat')}>
                  Chat
                </button>
                <button className={layout === 'margin' ? 'on' : ''} onClick={() => setLayout('margin')}>
                  Margin
                </button>
                <button className={layout === 'stage' ? 'on' : ''} onClick={() => setLayout('stage')}>
                  Stage
                </button>
              </div>
              <label className="slider">
                Picture size
                <input
                  type="range"
                  min={isStage ? 140 : 36}
                  max={isStage ? 420 : 160}
                  step={isStage ? 10 : 1}
                  value={size}
                  onChange={(e) => setSize(+e.target.value)}
                />
              </label>
              <label className="check">
                <input type="checkbox" checked={showGuesses} onChange={(e) => setShowGuesses(e.target.checked)} />
                Show how each was detected
              </label>
              <span className="spacer" />
              <button className="ghost" onClick={() => setView('edit')}>
                ✎ Edit
              </button>
            </>
          )}
        </header>

        {view === 'characters' && <CharacterPanel story={story} update={update} />}

        {view === 'edit' && chapter && (
          <ChapterEditor
            chapter={chapter}
            onChange={(p) => patchChapter(chapter.id, p)}
            onDone={() => setView('read')}
            onDelete={() => deleteChapter(chapter.id)}
          />
        )}

        {view === 'read' && chapter && (
          <Reader
            story={story}
            chapter={chapter}
            layout={layout}
            size={size}
            showGuesses={showGuesses}
            onAddCharacter={(name, key) => {
              const c = { ...newCharacter(name, story.characters.length), pronoun: 'they' as const, aliases: [name.replace(/^(the|a|an|some)\s+/i, '').toLowerCase()] };
              update((s) => ({
                ...s,
                characters: [...s.characters, c],
                chapters: s.chapters.map((ch) =>
                  ch.id === chapter.id ? { ...ch, overrides: { ...ch.overrides, [key]: { speakerId: c.id } } } : ch,
                ),
              }));
            }}
            onOverride={(key, ov) => {
              const overrides = { ...chapter.overrides };
              if (ov) overrides[key] = ov;
              else delete overrides[key];
              patchChapter(chapter.id, { overrides });
            }}
          />
        )}

        {view !== 'characters' && !chapter && (
          <div className="empty">
            <p>Start by adding a chapter.</p>
            <button className="primary" onClick={addChapter}>
              + Add chapter
            </button>
          </div>
        )}
      </main>
    </div>
  );
}
