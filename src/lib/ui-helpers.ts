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

/**
 * Splits a group-booking display_name into individual participant names
 * on commas, semicolons, newlines, `+`, or `&`, collapsing extra whitespace.
 */
export function splitParticipantNames(rawName: string): string[] {
  if (!rawName || typeof rawName !== 'string') return [];
  return rawName
    .split(/[,;\n\r+&]+/)
    .map((part) => part.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

export interface PosterRosterItem {
  displayName: string;
  slots: number;
  status: string;
}

/**
 * Expands multi-person group bookings into individual roster poster entries
 * while preserving single-person multi-slot bookings and total slot counts.
 */
export function expandRosterForPoster(
  roster: PosterRosterItem[]
): PosterRosterItem[] {
  const expanded: PosterRosterItem[] = [];

  for (const entry of roster) {
    const names = splitParticipantNames(entry.displayName);
    if (names.length <= 1) {
      expanded.push({
        displayName: names[0] ?? entry.displayName.trim(),
        slots: entry.slots,
        status: entry.status,
      });
      continue;
    }

    const extraSlots = Math.max(0, entry.slots - names.length);
    for (let idx = 0; idx < names.length; idx += 1) {
      expanded.push({
        displayName: names[idx],
        slots: idx === 0 ? 1 + extraSlots : 1,
        status: entry.status,
      });
    }
  }

  return expanded;
}

/**
 * Sanitizes raw numeric text input by stripping non-digits and leading zeros
 * (e.g. "015" -> "15", "03" -> "3", "000" -> "0") and clamping to [0, max].
 */
export function sanitizeIntegerInput(
  raw: string,
  max: number
): { text: string; value: number | null } {
  const digits = raw.replace(/[^0-9]/g, '');
  if (digits === '') {
    return { text: '', value: null };
  }
  const stripped = digits.replace(/^0+(?=\d)/, '');
  const parsed = Number.parseInt(stripped, 10);
  if (!Number.isFinite(parsed)) {
    return { text: '', value: null };
  }
  const clamped = Math.min(max, Math.max(0, parsed));
  return { text: String(clamped), value: clamped };
}
