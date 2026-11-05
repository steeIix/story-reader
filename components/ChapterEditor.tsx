'use client';
import type { Chapter } from '@/lib/types';

export function ChapterEditor({
  chapter,
  onChange,
  onDone,
  onDelete,
}: {
  chapter: Chapter;
  onChange: (p: Partial<Chapter>) => void;
  onDone: () => void;
  onDelete: () => void;
}) {
  const words = chapter.text.trim() ? chapter.text.trim().split(/\s+/).length : 0;
  return (
    <div className="panel editor">
      <input
        className="title-input"
        value={chapter.title}
        onChange={(e) => onChange({ title: e.target.value })}
        placeholder="Chapter title"
      />
      <textarea
        value={chapter.text}
        onChange={(e) => onChange({ text: e.target.value })}
        placeholder={'Paste your chapter here. Each line or paragraph becomes one block.\n\nEma pulled him forward.\n"Inside. Now."'}
        autoFocus={!chapter.text}
      />
      <div className="row between">
        <span className="muted">{words.toLocaleString()} words</span>
        <div className="row">
          <button className="ghost danger" onClick={onDelete}>
            Delete chapter
          </button>
          <button className="primary" onClick={onDone}>
            Read it →
          </button>
        </div>
      </div>
    </div>
  );
}
