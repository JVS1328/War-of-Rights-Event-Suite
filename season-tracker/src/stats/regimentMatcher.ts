/**
 * Regiment matching, ported from log-analyzer (LogAnalyzer.jsx L189–321).
 *
 * Players are linked to their real community regiment by parsing the regiment
 * tag out of their in-game name (e.g. "[51stNY]Vol.x" → "51STNY"), optionally
 * overridden by a user-supplied regiment list. Purely string-based — no roster
 * data required.
 */

export interface RegimentListEntry {
  label: string;
  /** Uppercased match patterns. */
  patterns: string[];
}

export const UNTAGGED = 'UNTAGGED';

/** Strip trailing company suffixes, dots, pipes, and all internal spaces. */
export function normalizeRegimentTag(tag: string): string {
  if (!tag) return tag;
  return tag
    .replace(/\([A-Z0-9*]+\)$/i, '') // (A), (B), (WB)
    .replace(/\.[A-Z0-9*\s]+$/i, '') // .A, .B, .I*, .CG, . C
    .replace(/\|+$/, '') // trailing pipes
    .replace(/\s+/g, '') // all spaces: "23rd NYV" -> "23rdNYV"
    .trim();
}

/** Extract an (uppercased, normalized) regiment tag from a player name. */
export function extractRegimentTag(playerName: string): string {
  // Outer tag before a bracket/brace wins (CB[8th OH] -> CB).
  const outerBracketPatterns = [/^([A-Z]{2,})\[/, /^([A-Z]{2,})\{/];
  for (const pattern of outerBracketPatterns) {
    const match = playerName.match(pattern);
    if (match?.[1]) return normalizeRegimentTag(match[1].trim().toUpperCase());
  }

  // Standard bracket / brace / paren tags.
  const bracketPatterns = [/^\[([^\]]+)\]/, /^\{([^}]+)\}/, /^\(([^)]+)\)/];
  for (const pattern of bracketPatterns) {
    const match = playerName.match(pattern);
    if (match?.[1]) return normalizeRegimentTag(match[1].trim().toUpperCase());
  }

  // Delimiter-prefixed tags.
  const delimiterPatterns = [/^([A-Z0-9]+)-/, /^([A-Z0-9]+)\|/, /^([A-Z]{2,})-/, /^([A-Z]+\d+[A-Z]*)\s/];
  for (const pattern of delimiterPatterns) {
    const match = playerName.match(pattern);
    if (match?.[1]) return normalizeRegimentTag(match[1].trim().toUpperCase());
  }

  // Fallback: first word, if it looks like a tag.
  const firstWord = playerName.split(/[\s[{(\-]/)[0];
  if (firstWord && firstWord.length <= 10 && /[A-Z]/.test(firstWord)) {
    return normalizeRegimentTag(firstWord.toUpperCase());
  }

  return UNTAGGED;
}

/**
 * Parse the regiment-list textarea. Each line is either `pattern` or
 * `label = pat1, pat2`. Labels are normalized; patterns are uppercased.
 */
export function parseRegimentList(text: string): RegimentListEntry[] {
  if (!text) return [];
  const entries: RegimentListEntry[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    let label: string;
    let patterns: string[];
    const eqIdx = line.indexOf('=');
    if (eqIdx >= 0) {
      label = line.slice(0, eqIdx).trim();
      const rhs = line.slice(eqIdx + 1).trim();
      patterns = rhs.split(',').map((p) => p.trim()).filter(Boolean);
      if (!label || patterns.length === 0) continue;
    } else {
      label = line;
      patterns = [line];
    }
    const normalizedLabel = normalizeRegimentTag(label) || label;
    const upperPatterns = patterns.map((p) => p.toUpperCase()).filter(Boolean);
    if (upperPatterns.length === 0) continue;
    entries.push({ label: normalizedLabel, patterns: upperPatterns });
  }
  return entries;
}

const isBoundary = (ch: string | undefined) => ch === undefined || !/[A-Z0-9]/.test(ch);

/**
 * Best (label) match for a player name against a parsed regiment list.
 * Match rule: case-insensitive substring with non-alphanumeric (or edge)
 * boundaries on both sides. Longest pattern wins; ties broken by entry order.
 */
export function matchPlayerToRegimentList(
  playerName: string,
  parsedList: RegimentListEntry[],
): string | null {
  if (!playerName || !parsedList || parsedList.length === 0) return null;
  const upper = playerName.toUpperCase();
  let best: { label: string; length: number; entryIndex: number } | null = null;

  for (const [i, entry] of parsedList.entries()) {
    for (const pattern of entry.patterns) {
      if (!pattern) continue;
      let from = 0;
      while (from <= upper.length - pattern.length) {
        const idx = upper.indexOf(pattern, from);
        if (idx < 0) break;
        const before = idx === 0 ? undefined : upper[idx - 1];
        const after = idx + pattern.length >= upper.length ? undefined : upper[idx + pattern.length];
        if (isBoundary(before) && isBoundary(after)) {
          if (
            !best ||
            pattern.length > best.length ||
            (pattern.length === best.length && i < best.entryIndex)
          ) {
            best = { label: entry.label, length: pattern.length, entryIndex: i };
          }
          break;
        }
        from = idx + 1;
      }
    }
  }
  return best ? best.label : null;
}

/**
 * Resolve a player's regiment: an explicit list match takes precedence,
 * otherwise fall back to the name-tag heuristic.
 */
export function resolveRegiment(playerName: string, parsedList: RegimentListEntry[] = []): string {
  const listMatch = matchPlayerToRegimentList(playerName, parsedList);
  return listMatch ?? extractRegimentTag(playerName);
}

/**
 * A player → season regiment label lookup, or null when the player belongs to
 * none. Manual assignments and season aliases live above this module, so a
 * caller that has a season in hand supplies its own resolver; one that doesn't
 * falls back to {@link tagRegimentResolver}.
 *
 * Steam id leads because it survives a name change — and because a player moved
 * to another unit by hand keeps the old tag in their in-game name.
 */
export type RegimentResolver = (steamId: string | null, name: string) => string | null;

/** The name-tag-only resolver: what a player's own name says they are. */
export const tagRegimentResolver: RegimentResolver = (_steamId, name) => {
  const tag = extractRegimentTag(name);
  return tag === UNTAGGED ? null : tag;
};
