import type { Character } from '@/lib/types';

/** Stand-in figure for a character with no picture yet. */
function Silhouette({ color, unknown }: { color: string; unknown?: boolean }) {
  return (
    <svg viewBox="0 0 200 240" className="silhouette" aria-hidden="true">
      <g
        fill={unknown ? 'none' : color}
        stroke={unknown ? '#6a6a78' : 'none'}
        strokeWidth={unknown ? 5 : 0}
        strokeDasharray={unknown ? '12 10' : undefined}
      >
        <path d="M16 240 C20 178 60 150 100 150 C140 150 180 178 184 240 Z" />
        <circle cx="100" cy="82" r="44" opacity={unknown ? 1 : 0.8} />
      </g>
      {unknown && (
        <text x="100" y="98" textAnchor="middle" fontSize="48" fill="#9a97a3" fontFamily="sans-serif">
          ?
        </text>
      )}
    </svg>
  );
}

export function Avatar({
  char,
  imageId,
  size,
  shape = 'round',
}: {
  char?: Character | null;
  imageId?: string;
  size: number | string;
  shape?: 'round' | 'card' | 'figure';
}) {
  const img = char ? (char.images.find((i) => i.id === imageId) ?? char.images[0]) : undefined;

  if (shape === 'figure') {
    // Big, frameless art. Transparent images stand on their own; others get a soft rounded frame.
    const style = { height: size, ['--c' as string]: char?.color ?? '#8b8b99' };
    if (img) {
      return (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          className={`figure ${img.transparent === false ? 'boxed' : ''}`}
          src={img.src}
          alt={char!.name}
          style={style}
          draggable={false}
        />
      );
    }
    return (
      <span className="figure placeholder" style={style}>
        <Silhouette color={char?.color ?? '#8b8b99'} unknown={!char} />
      </span>
    );
  }

  const n = typeof size === 'number' ? size : 64;
  const style = { width: n, height: shape === 'card' ? Math.round(n * 1.15) : n };
  if (!char) {
    return (
      <div className={`avatar ${shape} unknown`} style={style}>
        ?
      </div>
    );
  }
  if (img) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={`avatar ${shape}`} src={img.src} alt={char.name} style={{ ...style, borderColor: char.color }} />;
  }
  const initials = char.name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <div className={`avatar ${shape}`} style={{ ...style, background: char.color, fontSize: n * 0.38 }}>
      {initials}
    </div>
  );
}
