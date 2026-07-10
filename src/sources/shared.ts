/** Helpers shared across source adapters. */

/** Convert a Unix epoch timestamp (seconds, possibly fractional) to ISO 8601. */
export function unixToIso(t: unknown): string | undefined {
  if (typeof t !== 'number' || !Number.isFinite(t)) return undefined;
  const ms = t < 1e12 ? t * 1000 : t; // tolerate seconds or milliseconds
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? undefined : d.toISOString();
}

const HEADER_LINE =
  /^(here (are|is)|these are|your saved|saved memories|memory|memories|below (are|is))\b.*:?\s*$/i;

/**
 * Parse a pasted "saved memories" blob into one memory per line.
 *
 * Handles the two ways a user obtains ChatGPT's memory list: copy-pasting the
 * Settings > Memory screen, or pasting the output of asking ChatGPT to "print
 * all my saved memories as a list". Strips bullet/number prefixes and drops
 * obvious framing lines ("Here are your saved memories:").
 */
export function parseSavedMemoriesText(text: string): string[] {
  const out: string[] = [];
  for (const rawLine of text.split(/\r?\n/)) {
    let line = rawLine.trim();
    if (!line) continue;
    // Strip common list markers: -, *, •, "1.", "1)", "- [ ]".
    line = line
      .replace(/^[-*•‣◦]\s+/, '')
      .replace(/^\d+[.)]\s+/, '')
      .replace(/^\[[ x]\]\s+/i, '')
      .trim();
    if (!line || line.length < 3) continue;
    if (HEADER_LINE.test(line)) continue;
    out.push(line);
  }
  return out;
}
