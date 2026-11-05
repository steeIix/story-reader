'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar } from '@/components/Avatar';
import { deleteStory, listStories, putStory } from '@/lib/db';
import { newStory, type Story } from '@/lib/types';

export default function Library() {
  const router = useRouter();
  const [stories, setStories] = useState<Story[] | null>(null);
  const refresh = () => listStories().then((s) => setStories(s.sort((a, b) => b.updatedAt - a.updatedAt)));
  useEffect(() => {
    refresh();
  }, []);

  const create = async () => {
    const s = newStory('Untitled story');
    await putStory(s);
    router.push(`/story/${s.id}`);
  };

  const importFile = async (f: File | undefined) => {
    if (!f) return;
    try {
      const s = JSON.parse(await f.text()) as Story;
      if (!s.id || !Array.isArray(s.chapters) || !Array.isArray(s.characters)) throw new Error();
      await putStory(s);
      refresh();
    } catch {
      alert("That file doesn't look like a story backup.");
    }
  };

  return (
    <div className="library">
      <header className="lib-head">
        <div>
          <h1>Story Shelf</h1>
          <p className="muted">Paste chapters in, and each line of dialogue shows the character saying it.</p>
        </div>
        <div className="row">
          <label className="ghost btn-like">
            Import backup
            <input type="file" accept=".json" hidden onChange={(e) => importFile(e.target.files?.[0])} />
          </label>
          <button className="primary" onClick={create}>
            + New story
          </button>
        </div>
      </header>

      {stories?.length === 0 && (
        <div className="empty">
          <p>No stories yet.</p>
          <button className="primary" onClick={create}>
            + Create your first story
          </button>
        </div>
      )}

      <div className="shelf">
        {stories?.map((s) => (
          <div key={s.id} className="book">
            <Link href={`/story/${s.id}`} className="book-link">
              <h2>{s.title || 'Untitled'}</h2>
              <p className="muted">
                {s.chapters.length} chapter{s.chapters.length === 1 ? '' : 's'} · {s.characters.length} character
                {s.characters.length === 1 ? '' : 's'}
              </p>
              <div className="cast">
                {s.characters.slice(0, 6).map((c) => (
                  <Avatar key={c.id} char={c} size={34} />
                ))}
              </div>
            </Link>
            <button
              className="ghost danger"
              onClick={async () => {
                if (!confirm(`Delete "${s.title}"? This can't be undone.`)) return;
                await deleteStory(s.id);
                refresh();
              }}
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
