'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { getStory, putStory } from './db';
import type { Story } from './types';

export function useStory(id: string) {
  const [story, setStory] = useState<Story | null | undefined>(undefined);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const latest = useRef<Story | null>(null);

  useEffect(() => {
    getStory(id).then((s) => setStory(s ?? null));
  }, [id]);

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    if (latest.current) putStory(latest.current);
  }, []);

  useEffect(() => {
    window.addEventListener('beforeunload', flush);
    return () => {
      window.removeEventListener('beforeunload', flush);
      flush();
    };
  }, [flush]);

  const update = useCallback((fn: (s: Story) => Story) => {
    setStory((prev) => {
      if (!prev) return prev;
      const next = { ...fn(prev), updatedAt: Date.now() };
      latest.current = next;
      clearTimeout(timer.current);
      timer.current = setTimeout(() => putStory(next), 400);
      return next;
    });
  }, []);

  return { story, update };
}

export function downloadJson(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name.replace(/[^\w\- ]+/g, '').trim() + '.story.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
