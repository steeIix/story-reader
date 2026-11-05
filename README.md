# Story Shelf

A story reader that shows a picture of the character speaking next to each line of dialogue.

- **Stories → chapters → characters.** Use the **+** in the sidebar to add a chapter, paste the text in, and hit *Read it*.
- **Automatic speaker detection** for `"…"`, `“…”`, `「…」` and `『…』` quotes. It works out the speaker from:
  1. speech tags: `"Go," Ema said` / `"Go," she whispered` (uses each character's pronoun)
  2. action beats: `Ema pulled him forward.` followed by `"Inside. Now."`
  3. quotes that carry on into the next paragraph
  4. back-and-forth turn-taking when a line has no tag at all
- **Fix anything with a click.** Click any picture to change the speaker or choose a different expression. Hover over any
  narration line and press **+** to attach a character to it (good for thoughts and telepathy, e.g. `Saiko...`).
- **Three layouts.** *Stage* (the default) shows big speech bubbles with the character's full art standing beside them; *Chat* uses small round pictures; *Margin* keeps the prose as it is and puts the picture beside it. Stage has its own picture-size slider (140–420px).
- **Transparent art.** Upload PNG or WebP cut-outs and they stand on their own with no box around them. Empty transparent edges are trimmed automatically, and images with a solid background are marked *has a background* so you know they'll show as a framed picture.
- **Expressions.** Give a character several images (default, angry, hurt…) and pick one for each line.
- Everything is saved in your browser (IndexedDB). Use **Export backup** / **Import backup** to move a story between
  devices.

## Run locally

```bash
npm install
npm run dev        # http://localhost:3000
npm test           # checks the speaker detection against a sample scene
```

## Deploy to Vercel

**Option A: GitHub**
1. Push this folder to a new GitHub repo.
2. On vercel.com go to *Add New → Project*, import the repo, and click **Deploy**. No settings or env vars are needed.

**Option B: CLI**
```bash
npm i -g vercel
vercel          # follow the prompts, then `vercel --prod`
```

## Where things are

| File | What it does |
| --- | --- |
| `lib/parse.ts` | Dialogue detection and speaker attribution (tune the speech verbs here) |
| `components/Reader.tsx` | Chat and margin layouts, and the speaker picker |
| `components/CharacterPanel.tsx` | Characters, aliases, pronouns, image uploads |
| `lib/db.ts` | Browser storage |

## Ideas for later

- Sync across devices: replace `lib/db.ts` with Vercel Postgres/Supabase plus Vercel Blob for the images.
- One-click background removal for JPG art.
- Auto-pick an expression from words in the action beat (e.g. "snapped" → angry).
- Support single-quote dialogue (`'Hello,' she said`), which is common in British books.
