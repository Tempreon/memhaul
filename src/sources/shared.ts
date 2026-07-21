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

// ChatGPT's two custom-instruction prompts, as they appear in the UI. Matched
// leniently (leading marker allowed, trailing text/"?" allowed) so a paste that
// happens to include the labels is split into the right two buckets.
const ABOUT_USER_LABEL = /^[-*•#>\s]*what would you like chatgpt to know about you\b.*$/i;
const ABOUT_MODEL_LABEL = /^[-*•#>\s]*how would you like chatgpt to respond\b.*$/i;

/** One line to a clean single-line string (internal newlines → spaces). */
function collapseBlock(s: string): string {
  return s.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').trim();
}

/**
 * Parse a pasted custom-instructions blob into framed instruction strings.
 *
 * ChatGPT's export used to embed custom instructions in conversation metadata;
 * newer exports don't, so the user pastes them from Settings > Personalization
 * > Custom instructions. Two shapes are handled: a paste that includes the UI's
 * two question labels (split into the "about you" / "how to respond" buckets),
 * and — the common case — an unlabeled paste of one or more blank-line-separated
 * blocks, each kept verbatim as its own instruction. No box identity is guessed
 * for the unlabeled shape; the text is preserved as-is.
 */
export function parseCustomInstructionsText(text: string): string[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  // Labeled shape: peel content under each recognized question label.
  const labeled: string[] = [];
  let frame: ((s: string) => string) | null = null;
  let buf: string[] = [];
  const flush = () => {
    const body = collapseBlock(buf.join('\n'));
    if (frame && body.length >= 3) labeled.push(frame(body));
    buf = [];
  };
  for (const rawLine of trimmed.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (ABOUT_USER_LABEL.test(line)) {
      flush();
      frame = (s) => `What ChatGPT should know about you: ${s}`;
    } else if (ABOUT_MODEL_LABEL.test(line)) {
      flush();
      frame = (s) => `How ChatGPT should respond: ${s}`;
    } else if (frame) {
      buf.push(line);
    }
  }
  flush();
  if (labeled.length) return labeled;

  // Unlabeled shape: one instruction per blank-line-separated block, verbatim.
  return trimmed
    .split(/\n\s*\n/)
    .map((block) => collapseBlock(block))
    .filter((block) => block.length >= 3)
    .map((block) => `Custom instruction: ${block}`);
}
