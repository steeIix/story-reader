'use client';

export type ProcessedImage = { src: string; transparent: boolean };

/**
 * Read an uploaded image, trim away empty transparent edges, and shrink it so stories stay small.
 * WebP keeps the transparency, so cut-out character art stays a cut-out.
 */
export async function processImage(file: File, max = 900): Promise<ProcessedImage> {
  const src = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result as string);
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
  if (file.type === 'image/gif') return { src, transparent: true }; // keep animation
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });

  // Look at the alpha channel at full size: is there transparency, and where does the art actually sit?
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  const probe = document.createElement('canvas');
  probe.width = w;
  probe.height = h;
  const pctx = probe.getContext('2d', { willReadFrequently: true })!;
  pctx.drawImage(img, 0, 0);
  const data = pctx.getImageData(0, 0, w, h).data;
  let minX = w, minY = h, maxX = -1, maxY = -1, clear = 0;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const a = data[(y * w + x) * 4 + 3];
      if (a < 250) clear++;
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  const transparent = clear / (w * h) > 0.02;
  let sx = 0, sy = 0, sw = w, sh = h;
  if (transparent && maxX >= 0) {
    const pad = Math.round(Math.max(w, h) * 0.01);
    sx = Math.max(0, minX - pad);
    sy = Math.max(0, minY - pad);
    sw = Math.min(w, maxX + pad + 1) - sx;
    sh = Math.min(h, maxY + pad + 1) - sy;
  }

  const scale = Math.min(1, max / Math.max(sw, sh));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(sw * scale));
  canvas.height = Math.max(1, Math.round(sh * scale));
  canvas.getContext('2d')!.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
  return { src: canvas.toDataURL('image/webp', 0.9), transparent };
}

/** Older stories saved images without the transparency flag; work it out once from the image itself. */
export async function detectTransparency(src: string): Promise<boolean> {
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const i = new Image();
    i.onload = () => resolve(i);
    i.onerror = reject;
    i.src = src;
  });
  const c = document.createElement('canvas');
  c.width = Math.min(200, img.naturalWidth);
  c.height = Math.round((c.width / img.naturalWidth) * img.naturalHeight) || 1;
  const ctx = c.getContext('2d', { willReadFrequently: true })!;
  ctx.drawImage(img, 0, 0, c.width, c.height);
  const d = ctx.getImageData(0, 0, c.width, c.height).data;
  let clear = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i] < 250) clear++;
  return clear / (c.width * c.height) > 0.02;
}
