export type Pronoun = 'he' | 'she' | 'they' | 'it';

export type CharacterImage = {
  id: string;
  label: string; // e.g. "default", "angry", "hurt"
  src: string; // data URL (resized on upload)
  transparent?: boolean; // has a see-through background (cut-out art)
};

export type Character = {
  id: string;
  name: string;
  aliases: string[]; // other names the text uses: nicknames, surnames, titles
  pronoun: Pronoun;
  color: string;
  side: 'left' | 'right';
  images: CharacterImage[]; // first image is the default
};

/** A manual correction for one paragraph. speakerId null = "no speaker / plain narration". */
export type Override = { speakerId: string | null; imageId?: string };

export type Chapter = {
  id: string;
  title: string;
  text: string;
  overrides: Record<string, Override>;
  createdAt: number;
};

export type Story = {
  id: string;
  title: string;
  characters: Character[];
  chapters: Chapter[];
  updatedAt: number;
};

export const uid = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

const PALETTE = ['#e2725b', '#5b9be2', '#9b6bd6', '#4fb28a', '#d6a83a', '#d65b9b', '#5bc4d6', '#8a9a5b'];

export function newStory(title: string): Story {
  return { id: uid(), title, characters: [], chapters: [], updatedAt: Date.now() };
}

export function newChapter(title: string, text = ''): Chapter {
  return { id: uid(), title, text, overrides: {}, createdAt: Date.now() };
}

export function newCharacter(name: string, index: number): Character {
  return {
    id: uid(),
    name,
    aliases: [],
    pronoun: 'they',
    color: PALETTE[index % PALETTE.length],
    side: index % 2 === 0 ? 'left' : 'right',
    images: [],
  };
}
