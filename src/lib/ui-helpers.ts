const AVATAR_TONES = [
  'bg-emerald-300/90 text-zinc-950',
  'bg-rose-300/90 text-zinc-950',
  'bg-amber-300/90 text-zinc-950',
  'bg-sky-300/90 text-zinc-950',
  'bg-violet-300/90 text-zinc-950',
  'bg-lime-300/90 text-zinc-950',
  'bg-orange-300/90 text-zinc-950',
  'bg-teal-300/90 text-zinc-950',
] as const;

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'MM';
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase();
}

export function getAvatarTone(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function extractMatchCode(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';
  const pathMatch = trimmed.match(/\/keo\/([A-Za-z0-9]{6})(?:[/?#]|$)/i);
  if (pathMatch?.[1]) {
    return pathMatch[1].toUpperCase();
  }
  return trimmed.replace(/^#/, '').toUpperCase();
}
