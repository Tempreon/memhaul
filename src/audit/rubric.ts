/**
 * The audit rubric: deterministic, no-ML, no-network, fully explainable.
 *
 * Every finding is produced by a single regex/keyword rule and carries a
 * plain-English `why`. There is no scoring model — a rule matches or it does
 * not. Given the same (items, config) the output is byte-identical, which is
 * why `config.now` is injected rather than read from the clock. Bias is toward
 * explainability and low false-positives over recall: we would rather miss a
 * problem than cry wolf, and we say so in the docs.
 *
 * See docs/adr/0004-audit-rubric.md for the rationale and honest limits.
 */
import type { MemoryItem } from '../model/memory.js';
import type { AuditCategory, AuditConfig, Finding, Span } from './types.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDate(iso?: string): Date | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? undefined : d;
}

/** Whole months from a to b (UTC), floored. */
function monthsBetween(a: Date, b: Date): number {
  let months =
    (b.getUTCFullYear() - a.getUTCFullYear()) * 12 +
    (b.getUTCMonth() - a.getUTCMonth());
  if (b.getUTCDate() < a.getUTCDate()) months -= 1;
  return months;
}

/** Deterministic Luhn check — keeps card-number false positives near zero. */
function luhn(digits: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let d = digits.charCodeAt(i) - 48;
    if (d < 0 || d > 9) return false;
    if (alt) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
    alt = !alt;
  }
  return sum % 10 === 0;
}

interface Match {
  value: string;
  start: number;
  end: number;
}

/** Collect all matches of a global regex, with positions. */
function scan(text: string, re: RegExp): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(re)) {
    if (m.index === undefined) continue;
    out.push({ value: m[0], start: m.index, end: m.index + m[0].length });
  }
  return out;
}

function normalizeValue(v: string): string {
  return v
    .toLowerCase()
    .replace(/[.,;:!?'"()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function effectiveDate(item: MemoryItem): Date | undefined {
  return parseDate(item.updatedAt ?? item.createdAt);
}

// ---------------------------------------------------------------------------
// 1) STALE
// ---------------------------------------------------------------------------

const DURABLE =
  /\b(allergic|allerg(y|ies)|blood type|born (on|in)|date of birth|birthday|citizen(ship)?|nationality|native (language|speaker)|left-?handed|right-?handed|celiac|type\s?[12]\s?diabet(es|ic))\b/i;

const AGE_STATED =
  /\b(?:is|was|turned|aged)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:years?\s*old|yo|y\/o)\b/i;
const GRADE_STATED =
  /\b(?:in|entering|starting|going into)\s+(pre-?k|kindergarten|\d{1,2}(?:st|nd|rd|th)\s+grade|freshman|sophomore|junior|senior|(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth|eleventh|twelfth)\s+grade)\b/i;

const VOLATILE_FAMILIES: { re: RegExp }[] = [
  { re: /\b(currently|right now|at the moment|these days|nowadays|as of (now|today)|this (year|month|week|quarter|semester|season))\b/i },
  { re: /\b(my|his|her|their) current\b|\bcurrently (working|employed|living|staying|studying|enrolled|based)\b|\bnew (job|role|apartment|place|car|phone|manager)\b/i },
  { re: /\b(planning to|plans to|going to|about to|intends? to|hoping to|thinking about|considering|will (soon|be))\b/i },
  { re: /\b(temporarily|for now|until further notice|on a (diet|cleanse|break)|training for|job ?hunting|looking for (a )?(new )?(job|role|place)|between jobs|on leave|recovering from|studying for|expecting|pregnant)\b/i },
];

function firstMatch(text: string, re: RegExp): string | undefined {
  const m = text.match(re);
  return m ? m[0] : undefined;
}

function staleFinding(item: MemoryItem, cfg: AuditConfig): Finding | null {
  const eff = effectiveDate(item);
  const ageMonths = eff ? monthsBetween(eff, new Date(cfg.now)) : undefined;
  const knownDate = eff !== undefined;

  // S-drift (age/grade), highest confidence.
  const drift = firstMatch(item.text, AGE_STATED) ?? firstMatch(item.text, GRADE_STATED);
  if (drift && (!knownDate || (ageMonths ?? 0) >= cfg.driftMonths)) {
    const isGrade = GRADE_STATED.test(item.text) && !AGE_STATED.test(item.text);
    const noun = isGrade ? 'school grade' : 'an age';
    const why = knownDate
      ? `States ${noun} ("${drift.trim()}") recorded ${ageMonths} months ago — ${
          isGrade ? 'grades advance each year' : 'ages advance over time'
        }, so this value is probably out of date. Verify or update.`
      : `States ${noun} ("${drift.trim()}") with no record date — ages and grades drift, so this may be stale. Verify.`;
    return { itemId: item.id, category: 'STALE', subtype: 'drift', why };
  }

  // S-volatility (time-relative wording).
  for (const fam of VOLATILE_FAMILIES) {
    const v = firstMatch(item.text, fam.re);
    if (v && (!knownDate || (ageMonths ?? 0) >= cfg.volatileMonths)) {
      const why = knownDate
        ? `Uses time-relative wording ("${v.trim()}") and was recorded ${ageMonths} months ago — statements about a current or temporary situation go out of date quickly. Confirm it still holds.`
        : `Uses time-relative wording ("${v.trim()}") with no record date — "current" facts change; verify before relying on it.`;
      return { itemId: item.id, category: 'STALE', subtype: 'volatility', why };
    }
  }

  // S-age (pure age), lowest confidence, suppressed for durable facts.
  if (knownDate && (ageMonths ?? 0) >= cfg.staleMonths && !DURABLE.test(item.text)) {
    const date = eff!.toISOString().slice(0, 10);
    return {
      itemId: item.id,
      category: 'STALE',
      subtype: 'age',
      why: `Recorded ${date} (${ageMonths} months ago) with no update since; it may be out of date. Reconfirm or refresh.`,
    };
  }

  return null;
}

// ---------------------------------------------------------------------------
// 3) SENSITIVE (defined before third-party because that reuses HEALTH)
// ---------------------------------------------------------------------------

const HEALTH =
  /\b(diagnos(?:ed|is)|disease|disorder|syndrome|cancer|tumou?r|HIV|AIDS|diabet(?:es|ic)|depress(?:ion|ed)|anxiety|bipolar|schizophreni\w*|therapy|therapist|psychiatr\w*|medication|prescri(?:bed|ption)|dose|\d+\s?mg\b|allerg(?:y|ic)|asthma|epilep\w*|seizure|pregnan\w*|miscarriage|abortion|STD|STI|chronic|surgery|chemo|remission|blood pressure|cholesterol|addiction|rehab|sober|relapse|disabilit\w*|autis\w*|ADHD|PTSD)\b/gi;
/** Non-global twin of HEALTH for stateless `.test()` calls (global .test mutates lastIndex). */
const HEALTH_ANY = new RegExp(HEALTH.source, 'i');

const FINANCIAL_WORDS =
  /\b(salary|income|net worth|in debt|bankrupt(?:cy)?|mortgage|loan|credit score|savings|401\(?k\)?|IRA|pension|bank account|routing number|account (?:number|balance)|earns?)\b/gi;
const FINANCIAL_AMOUNT = /\$\s?\d[\d,]{2,}\b|\b\d+\s?(?:k|thousand|million|dollars)\b/gi;

const SECRET_LABELED =
  /\b(password|passwd|pwd|passphrase|secret|api[\s_-]?key|access[\s_-]?token|token|private key|seed phrase|recovery phrase|pin)\b\s*(?:is|:|=|are)\s*\S+/gi;
const SECRET_VENDOR =
  /\bsk-[A-Za-z0-9]{20,}\b|\bsk_(?:live|test)_[A-Za-z0-9]{16,}\b|\brk_live_[A-Za-z0-9]{16,}\b|\bxox[baprs]-[A-Za-z0-9-]{10,}\b|\bAKIA[0-9A-Z]{16}\b|\bAIza[0-9A-Za-z_\-]{35}\b|\bgh[posu]_[A-Za-z0-9]{36,}\b|\bgithub_pat_[A-Za-z0-9_]{22,}\b|-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/g;
const SSN = /\b\d{3}-\d{2}-\d{4}\b/g;
const CARD_CANDIDATE = /\b(?:\d[ -]?){13,19}\b/g;

const LOC_STREET =
  /\b\d{1,5}\s+(?:[A-Z][a-z]+\s){0,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Lane|Ln|Drive|Dr|Court|Ct|Way|Place|Pl|Terrace|Circle|Cir)\.?\b/g;
const LOC_UNIT = /\b(?:apt|apartment|unit|suite|ste)\.?\s*#?\s*\w+\b/gi;
const LOC_GPS = /[-+]?\d{1,3}\.\d{3,},\s*[-+]?\d{1,3}\.\d{3,}/g;

const ORIENTATION =
  /\b(lesbian|bisexual|pansexual|asexual|homosexual|transgender|non-?binary|LGBTQ\+?)\b/gi;
const ORIENTATION_CTX = /\b(?:is|identifies as|orientation is)\s+(gay|straight|bi|queer|trans)\b/gi;
const RELIGION =
  /\b(Christian|Catholic|Protestant|Muslim|Islam(?:ic)?|Jewish|Judaism|Hindu|Buddhist|Sikh|atheist|agnostic|evangelical|Mormon|devout|attends? (?:church|mosque|synagogue|temple))\b/g;
const POLITICAL =
  /\b(Democrat|Republican|liberal|conservative|progressive|libertarian|socialist|communist|left-wing|right-wing|voted for|political party)\b/gi;
const LEGAL =
  /\b(arrested|convicted|conviction|felony|misdemeanor|lawsuit|sued|settlement|custody battle|restraining order|probation|parole|criminal record|DUI|DWI|indicted|charged with|immigration status|visa status|undocumented|deportation|asylum)\b/gi;

interface SensitiveResult {
  findings: Finding[];
  spans: Span[];
}

function sensitiveFindings(item: MemoryItem): SensitiveResult {
  const findings: Finding[] = [];
  const spans: Span[] = [];
  const text = item.text;

  const add = (
    subtype: string,
    placeholder: string,
    why: string,
    matches: Match[],
    secret = false,
  ) => {
    if (!matches.length) return;
    for (const m of matches) spans.push({ start: m.start, end: m.end, placeholder, secret });
    findings.push({ itemId: item.id, category: 'SENSITIVE', subtype, why });
  };

  // Secrets — highest severity, value NEVER echoed.
  const secretMatches: Match[] = [
    ...scan(text, SECRET_LABELED),
    ...scan(text, SECRET_VENDOR),
    ...scan(text, SSN),
    ...scan(text, CARD_CANDIDATE).filter((m) => {
      const digits = m.value.replace(/\D/g, '');
      return digits.length >= 13 && digits.length <= 19 && luhn(digits);
    }),
  ];
  if (secretMatches.length) {
    for (const m of secretMatches)
      spans.push({ start: m.start, end: m.end, placeholder: '[REDACTED]', secret: true });
    findings.push({
      itemId: item.id,
      category: 'SENSITIVE',
      subtype: 'secrets',
      why: 'Contains what looks like a credential (API key, password, SSN, or card number). Secrets must never be stored in memory or shared — remove it and rotate the credential.',
    });
  }

  add('health', '[HEALTH]', `Mentions health information, a special category of personal data. Consider whether it belongs in stored memory.`, scan(text, HEALTH));

  const finAmount = scan(text, FINANCIAL_AMOUNT);
  const finWords = scan(text, FINANCIAL_WORDS);
  if (finAmount.length || finWords.length) {
    for (const m of finAmount) spans.push({ start: m.start, end: m.end, placeholder: '[AMOUNT]' });
    for (const m of finWords) spans.push({ start: m.start, end: m.end, placeholder: '[FINANCIAL]' });
    findings.push({ itemId: item.id, category: 'SENSITIVE', subtype: 'financial', why: 'Mentions financial information, which is sensitive.' });
  }

  const loc = [...scan(text, LOC_STREET), ...scan(text, LOC_UNIT), ...scan(text, LOC_GPS)];
  add('precise-location', '[ADDRESS]', 'Contains a precise location (street address, unit, or coordinates), which is sensitive. City-level detail is usually enough.', loc);

  const identity = [...scan(text, ORIENTATION), ...scan(text, ORIENTATION_CTX), ...scan(text, RELIGION), ...scan(text, POLITICAL)];
  add('identity', '[IDENTITY]', 'Mentions orientation, religion, or political affiliation — special-category personal data.', identity);

  add('legal', '[LEGAL]', 'Mentions a legal matter (criminal, litigation, or immigration), which is sensitive.', scan(text, LEGAL));

  return { findings, spans };
}

// ---------------------------------------------------------------------------
// 4) THIRD-PARTY PII
// ---------------------------------------------------------------------------

const NAME_STOPLIST = new Set(
  [
    'User', 'I', 'My', "I'm", 'Im',
    'January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December',
    'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    'Austin', 'London', 'Paris', 'America', 'Europe', 'Texas', 'California', 'York',
    'TypeScript', 'JavaScript', 'Python', 'React', 'Google', 'Apple', 'Slack', 'GitHub', 'ChatGPT', 'Claude', 'OpenAI', 'Anthropic',
  ].map((s) => s),
);

const RELATIONSHIP =
  /\b(wife|husband|spouse|partner|son|daughter|kid|child(?:ren)?|mother|mom|father|dad|parent|brother|sister|sibling|friend|colleague|co-?worker|boss|manager|neighbou?r|boyfriend|girlfriend|fianc[eé]{1,2}|aunt|uncle|cousin|grand(?:mother|father|son|daughter)|niece|nephew|in-law|roommate|nanny|babysitter|doctor|therapist)\b/i;
const NAME_CANDIDATE = /\b[A-Z][a-z]{1,}\b/g;
const EMAIL = /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g;
const PHONE = /\b(?:\+?\d{1,2}[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}\b/g;
const MINOR_REL = /\b(son|daughter|kid|child|niece|nephew|grandson|granddaughter|student)\b/i;

function findNames(text: string, ownerNames: Set<string>): Match[] {
  const out: Match[] = [];
  for (const m of scan(text, NAME_CANDIDATE)) {
    // Skip sentence-initial capitalization and known non-names.
    if (m.start === 0) continue;
    if (NAME_STOPLIST.has(m.value)) continue;
    if (ownerNames.has(m.value.toLowerCase())) continue;
    out.push(m);
  }
  return out;
}

function thirdPartyFindings(item: MemoryItem, cfg: AuditConfig): SensitiveResult {
  const findings: Finding[] = [];
  const spans: Span[] = [];
  const text = item.text;
  const owners = new Set((cfg.ownerNames ?? []).map((n) => n.toLowerCase()));
  const ownerEmails = new Set((cfg.ownerEmails ?? []).map((e) => e.toLowerCase()));
  const ownerPhones = new Set((cfg.ownerPhones ?? []).map((p) => p.replace(/\D/g, '')));

  const names = findNames(text, owners);
  const hasRelationship = RELATIONSHIP.test(text);

  // Third-party contact details (email / phone not the owner's).
  const emails = scan(text, EMAIL).filter((m) => !ownerEmails.has(m.value.toLowerCase()));
  const phones = scan(text, PHONE).filter((m) => !ownerPhones.has(m.value.replace(/\D/g, '')));
  if (emails.length || phones.length) {
    for (const m of emails) spans.push({ start: m.start, end: m.end, placeholder: '[EMAIL]' });
    for (const m of phones) spans.push({ start: m.start, end: m.end, placeholder: '[PHONE]' });
    findings.push({ itemId: item.id, category: 'THIRD_PARTY_PII', subtype: 'contact', why: 'Contains contact details (email or phone) for someone other than you.' });
  }

  // A named third party AND a relationship word are required for these subtypes.
  if (names.length && hasRelationship) {
    for (const m of names) spans.push({ start: m.start, end: m.end, placeholder: '[NAME]' });

    const isMinor =
      MINOR_REL.test(text) && (/\b(\d{1,2})\s*(?:years?\s*old|yo)\b/i.test(text) || AGE_STATED.test(text) || GRADE_STATED.test(text));
    if (isMinor) {
      findings.push({ itemId: item.id, category: 'THIRD_PARTY_PII', subtype: 'minor', why: 'Identifies a minor and their age or grade — data about children is especially sensitive; keep it minimal.' });
    } else if (HEALTH_ANY.test(text)) {
      findings.push({ itemId: item.id, category: 'THIRD_PARTY_PII', subtype: 'third-party-health', why: "Describes another person's health, which is their private data, not yours." });
    } else {
      findings.push({ itemId: item.id, category: 'THIRD_PARTY_PII', subtype: 'relationship', why: 'Names another person and their relationship to you — information about third parties is their data, stored under your account.' });
    }
  }

  return { findings, spans };
}

// ---------------------------------------------------------------------------
// 2) CONTRADICTORY
// ---------------------------------------------------------------------------

interface Fact {
  itemId: string;
  subject: string;
  slot: string;
  value: string;
  polarity: '+' | '-';
  singleValued: boolean;
  createdAt?: string;
  numeric?: number;
}

const NEG = /\b(not|never|no longer|doesn'?t|does not|isn'?t|is not|dislikes?|hates?|stopped|quit|used to)\b/i;

const SLOTS: {
  slot: string;
  re: RegExp;
  single: boolean;
  numeric?: boolean;
  bucket?: boolean;
}[] = [
  // Note: value classes deliberately exclude '.' so a capture stops at a
  // sentence boundary ("lives in Boston. He used to…" -> "Boston"), while a
  // space still allows multi-word values ("New York"). Crossing sentences would
  // make otherwise-equal facts differ and manufacture false contradictions.
  { slot: 'location', re: /\b(?:lives?|living|based|resides?|located)\s+in\s+([A-Z][\w '-]+)/, single: true },
  { slot: 'employer', re: /\b(?:works?|working|employed)\s+(?:at|for)\s+([A-Z][\w '&-]+)/, single: true },
  { slot: 'role', re: /\b(?:is|works as|serves as)\s+(?:an?\s+)?([\w -]*(?:engineer|manager|designer|developer|nurse|teacher|doctor|lawyer|founder|ceo|cto|coo|analyst|consultant|accountant|architect))\b/i, single: true },
  { slot: 'marital', re: /\b(married|single|divorced|engaged|widowed)\b/i, single: true },
  { slot: 'age', re: /\b(?:is|was|turned|aged)\s+(\d{1,2})\b|\b(\d{1,2})\s*(?:years?\s*old|yo)\b/i, single: true, numeric: true },
  { slot: 'preference', re: /\b(?:prefers?|favou?rite\s+\w+\s+is|likes? using|goes with)\s+([\w .+#-]+)/i, single: true, bucket: true },
];

const BUCKET_MAP: Record<string, string> = {};
for (const l of ['typescript', 'javascript', 'python', 'rust', 'go', 'golang', 'java', 'c#', 'ruby', 'php', 'kotlin', 'swift']) BUCKET_MAP[l] = 'languages';
for (const e of ['vscode', 'vim', 'neovim', 'emacs', 'jetbrains', 'intellij', 'sublime']) BUCKET_MAP[e] = 'editors';
for (const o of ['macos', 'mac', 'windows', 'linux', 'ubuntu']) BUCKET_MAP[o] = 'os';
for (const b of ['coffee', 'tea', 'espresso', 'matcha']) BUCKET_MAP[b] = 'beverage';

function subjectOf(text: string): string {
  // "User's <REL> <Name>" or "<Name> is/has ..." -> the name; else "user".
  const rel = text.match(
    /\b(?:user'?s?|my)\s+(wife|husband|son|daughter|mother|mom|father|dad|brother|sister|friend|colleague|boss|partner)\s+([A-Z][a-z]+)/i,
  );
  if (rel && rel[2]) return normalizeValue(rel[2]);
  const lead = text.match(/^([A-Z][a-z]+)\s+(?:is|was|has|lives|works|prefers)/);
  if (lead && lead[1] && !NAME_STOPLIST.has(lead[1])) return normalizeValue(lead[1]);
  return 'user';
}

function extractFacts(item: MemoryItem): Fact[] {
  const facts: Fact[] = [];
  const subject = subjectOf(item.text);
  for (const s of SLOTS) {
    const m = item.text.match(s.re);
    if (!m) continue;
    const raw = (m[1] ?? m[2] ?? m[0]).trim();
    let value = normalizeValue(raw);
    let slot = s.slot;
    if (s.bucket) {
      const bucket = BUCKET_MAP[value] ?? `other:${value}`;
      slot = `preference:${bucket}`;
    }
    // Negation: NEG (which includes "no longer"/"used to") within the clause
    // BEFORE the trigger only — testing whole-text would flip every slot's
    // polarity from one unrelated negated clause, manufacturing false conflicts.
    const before = item.text.slice(0, m.index ?? 0);
    const polarity: '+' | '-' = NEG.test(before) ? '-' : '+';
    facts.push({
      itemId: item.id,
      subject,
      slot,
      value,
      polarity,
      singleValued: s.single,
      createdAt: item.createdAt,
      ...(s.numeric ? { numeric: Number(value.replace(/\D/g, '')) } : {}),
    });
  }
  return facts;
}

function yearsBetween(a?: string, b?: string): number | undefined {
  const da = parseDate(a);
  const db = parseDate(b);
  if (!da || !db) return undefined;
  return Math.round(monthsBetween(da, db) / 12);
}

function contradictionFindings(items: MemoryItem[]): { findings: Finding[]; supersededStale: Finding[] } {
  const facts = items.flatMap(extractFacts);
  const groups = new Map<string, Fact[]>();
  for (const f of facts) {
    const key = `${f.subject}|${f.slot}`;
    (groups.get(key) ?? groups.set(key, []).get(key)!).push(f);
  }

  const findings: Finding[] = [];
  const supersededStale: Finding[] = [];
  const seenPairs = new Set<string>();

  for (const [key, group] of groups) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const a = group[i]!;
        const b = group[j]!;
        if (a.itemId === b.itemId) continue;
        const pairKey = [a.itemId, b.itemId].sort().join('|') + '|' + key;
        if (seenPairs.has(pairKey)) continue;

        const slotLabel = key.split('|')[1]!.replace('preference:', '');

        // Time-drift tie-break for age: an OLDER record with a LOWER age that has
        // since plausibly aged up is an update, not a conflict. Requires strictly
        // distinct dates, positive elapsed time, and a non-decreasing age — so two
        // same-dated ages (or a decreasing age) fall through to a real contradiction.
        if (a.slot === 'age' && a.numeric !== undefined && b.numeric !== undefined && a.createdAt && b.createdAt) {
          const ta = new Date(a.createdAt).getTime();
          const tb = new Date(b.createdAt).getTime();
          if (!Number.isNaN(ta) && !Number.isNaN(tb) && ta !== tb) {
            const older = ta < tb ? a : b;
            const newer = older === a ? b : a;
            const yrs = yearsBetween(older.createdAt, newer.createdAt) ?? 0;
            const oldAge = older.numeric ?? 0;
            const newAge = newer.numeric ?? 0;
            if (yrs > 0 && newAge >= oldAge && Math.abs(newAge - oldAge - yrs) <= 1) {
              supersededStale.push({
                itemId: older.itemId,
                category: 'STALE',
                subtype: 'superseded',
                relatedItemId: newer.itemId,
                why: `Superseded: a newer record states the age is ${newAge}; this older value (${oldAge}) has since advanced with time.`,
              });
              seenPairs.add(pairKey);
              continue;
            }
          }
        }

        if (a.value === b.value && a.polarity !== b.polarity) {
          findings.push({
            itemId: a.itemId,
            relatedItemId: b.itemId,
            category: 'CONTRADICTORY',
            subtype: 'negation',
            why: `These conflict about "${a.value}": one affirms it, the other negates it. One is likely outdated — reconfirm.`,
          });
          seenPairs.add(pairKey);
        } else if (a.singleValued && a.value !== b.value && a.polarity === '+' && b.polarity === '+') {
          findings.push({
            itemId: a.itemId,
            relatedItemId: b.itemId,
            category: 'CONTRADICTORY',
            subtype: 'mutually-exclusive',
            why: `Both describe the same "${slotLabel}" but disagree — "${a.value}" vs "${b.value}". A single ${slotLabel} can't hold both; one is likely stale or wrong.`,
          });
          seenPairs.add(pairKey);
        }
      }
    }
  }

  return { findings, supersededStale };
}

// ---------------------------------------------------------------------------
// Assemble
// ---------------------------------------------------------------------------

const SEVERITY: Record<AuditCategory, number> = {
  SENSITIVE: 0,
  THIRD_PARTY_PII: 1,
  CONTRADICTORY: 2,
  STALE: 3,
};

/** Run every rule over the items and return a deterministically-sorted list. */
export function runRubric(items: MemoryItem[], cfg: AuditConfig): {
  findings: Finding[];
  spansByItem: Map<string, Span[]>;
} {
  const findings: Finding[] = [];
  const spansByItem = new Map<string, Span[]>();
  const addSpans = (itemId: string, spans: Span[]) => {
    if (!spans.length) return;
    const cur = spansByItem.get(itemId) ?? [];
    cur.push(...spans);
    spansByItem.set(itemId, cur);
  };

  // Per-item rules.
  const staleSuppressedByContradiction = new Set<string>();
  const { findings: contra, supersededStale } = contradictionFindings(items);

  for (const item of items) {
    const sens = sensitiveFindings(item);
    findings.push(...sens.findings);
    addSpans(item.id, sens.spans);

    const tp = thirdPartyFindings(item, cfg);
    findings.push(...tp.findings);
    addSpans(item.id, tp.spans);
  }

  // Superseded-age items get a STALE(superseded) instead of a fresh stale rule.
  for (const s of supersededStale) staleSuppressedByContradiction.add(s.itemId);
  findings.push(...supersededStale);

  for (const item of items) {
    if (staleSuppressedByContradiction.has(item.id)) continue;
    const stale = staleFinding(item, cfg);
    if (stale) findings.push(stale);
  }

  findings.push(...contra);

  // Deterministic sort.
  findings.sort((a, b) => {
    if (a.itemId !== b.itemId) return a.itemId < b.itemId ? -1 : 1;
    if (SEVERITY[a.category] !== SEVERITY[b.category]) return SEVERITY[a.category] - SEVERITY[b.category];
    return (a.subtype ?? '') < (b.subtype ?? '') ? -1 : 1;
  });

  return { findings, spansByItem };
}
