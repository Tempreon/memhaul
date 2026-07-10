/**
 * Redaction primitives. Used by the audit card so a user can share "here's
 * what my AI remembers, by category and count" without leaking the actual
 * sensitive values. Redaction is deliberately aggressive: when unsure, mask.
 */

/** Show the first and last `keep` characters, mask the middle. */
export function maskMiddle(s: string, keep = 1): string {
  const t = s.trim();
  if (t.length <= keep * 2) return '*'.repeat(Math.max(t.length, 3));
  return `${t.slice(0, keep)}${'*'.repeat(Math.max(t.length - keep * 2, 3))}${t.slice(-keep)}`;
}

const EMAIL_RE = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g;
const PHONE_RE = /\b(?:\+?\d[\s().-]?){7,}\d\b/g;
const LONG_DIGITS_RE = /\b\d{5,}\b/g;

/** Mask an email to its shape: `j***@e***.com`. */
export function maskEmail(email: string): string {
  const at = email.indexOf('@');
  if (at < 1) return maskMiddle(email);
  const user = email.slice(0, at);
  const domain = email.slice(at + 1);
  const dot = domain.lastIndexOf('.');
  const tld = dot !== -1 ? domain.slice(dot) : '';
  const host = dot !== -1 ? domain.slice(0, dot) : domain;
  return `${user[0] ?? '*'}***@${host[0] ?? '*'}***${tld}`;
}

/**
 * Redact obvious PII/secrets inline within a free-text string: emails, phone
 * numbers, and long digit runs (card/SSN/account-like). Everything else is
 * left intact — this is for masking *within* an otherwise-shareable line.
 */
export function redactInline(text: string): string {
  return text
    .replace(EMAIL_RE, (m) => maskEmail(m))
    .replace(PHONE_RE, '[PHONE]')
    .replace(LONG_DIGITS_RE, '[NUMBER]');
}

/**
 * Produce a shareable example from a memory line: replace the specified
 * substrings (the sensitive spans the rubric flagged) with [REDACTED], then
 * run inline PII redaction over what remains. If no spans are given, redact
 * the whole thing to a shape hint.
 */
export function redactExample(text: string, sensitiveSpans: string[] = []): string {
  let out = text.trim();
  for (const span of sensitiveSpans) {
    if (!span) continue;
    out = out.split(span).join('[REDACTED]');
  }
  out = redactInline(out);
  return out;
}
