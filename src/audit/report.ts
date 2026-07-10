import type { ExtractedMemory, MemoryItem } from '../model/memory.js';
import type { AuditCategory, AuditReport, Finding, Span } from './types.js';

const CATEGORY_LABEL: Record<AuditCategory, string> = {
  SENSITIVE: 'Sensitive',
  THIRD_PARTY_PII: 'Third-party info',
  CONTRADICTORY: 'Contradictions',
  STALE: 'Possibly stale',
};

const CATEGORY_ORDER: AuditCategory[] = [
  'SENSITIVE',
  'THIRD_PARTY_PII',
  'CONTRADICTORY',
  'STALE',
];

const SECRET_WITHHELD = '[withheld — this item contains a credential]';

/**
 * Item text as it is safe to show in the LOCAL report. If the item contains ANY
 * secret span, the WHOLE item is withheld — never a partial mask. This honors
 * the `Span.secret` contract (types.ts) and closes an entire leak class: a
 * multi-word secret (a seed/recovery phrase, a spaces-containing password, a
 * second key the regex only partially spans) can't survive by having its
 * un-matched bytes printed. Non-secret sensitive values (health, finance) are
 * shown — this is the user's own data, on the user's own machine.
 */
function safeItemText(text: string, spans: Span[] = []): string {
  return spans.some((s) => s.secret) ? SECRET_WITHHELD : text;
}

function byId(memory: ExtractedMemory): Map<string, MemoryItem> {
  return new Map(memory.items.map((i) => [i.id, i]));
}

function dateOf(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
// Full local report — safe to keep, not to publish. Shows real values (users'
// own data), but never re-prints a raw credential.
// ---------------------------------------------------------------------------

export function renderAuditReport(report: AuditReport, memory: ExtractedMemory): string {
  const items = byId(memory);
  const out: string[] = [];
  const c = report.counts;
  const total = report.findings.length;

  out.push('# Memory audit');
  out.push('');
  out.push(
    `Audited **${memory.stats.totalItems}** memory item(s) from your ${
      memory.source === 'chatgpt' ? 'ChatGPT' : 'Claude'
    } export on ${dateOf(report.config.now)}. Found **${total}** thing(s) worth a look.`,
  );
  out.push('');
  out.push('| Category | Count |');
  out.push('| --- | ---: |');
  for (const cat of CATEGORY_ORDER) {
    const n =
      cat === 'SENSITIVE' ? c.sensitive
      : cat === 'THIRD_PARTY_PII' ? c.third_party_pii
      : cat === 'CONTRADICTORY' ? c.contradictory
      : c.stale;
    out.push(`| ${CATEGORY_LABEL[cat]} | ${n} |`);
  }
  out.push('');
  out.push(
    '> This report stays on your machine. It shows your real values (except credentials, ' +
      'which are masked). To share a safe summary instead, run with `--card`.',
  );
  out.push('');

  for (const cat of CATEGORY_ORDER) {
    const findings = report.findings.filter((f) => f.category === cat);
    if (!findings.length) continue;
    out.push(`## ${CATEGORY_LABEL[cat]} (${findings.length})`);
    out.push('');
    for (const f of findings) {
      out.push(renderFinding(f, items, report));
    }
    out.push('');
  }

  out.push('---');
  out.push('## How to read this');
  out.push('');
  out.push(
    '- **Sensitive / Third-party**: consider whether it belongs in memory your assistant can read back at any time.\n' +
      '- **Contradictions**: two items disagree; one is probably out of date. "Needs review", not "wrong".\n' +
      '- **Possibly stale**: old or time-relative ("currently…") facts that drift. Reconfirm or refresh.',
  );
  out.push('');
  out.push(
    `_Thresholds: stale after ${report.config.staleMonths} months, ` +
      `time-relative after ${report.config.volatileMonths}, ` +
      `age/grade drift after ${report.config.driftMonths}. ` +
      'The audit is deterministic and runs entirely offline. It favors few false alarms over ' +
      'catching everything — see docs/adr/0004-audit-rubric.md for its honest limits._',
  );
  out.push('');
  return out.join('\n');
}

function renderFinding(
  f: Finding,
  items: Map<string, MemoryItem>,
  report: AuditReport,
): string {
  const item = items.get(f.itemId);
  const text = item ? safeItemText(item.text, report.spans[f.itemId]) : '(item not found)';
  const lines: string[] = [];
  const tag = f.subtype ? ` _(${f.subtype})_` : '';
  lines.push(`- **${truncate(text, 160)}**${tag}`);
  lines.push(`  ${f.why}`);
  if (f.relatedItemId) {
    const other = items.get(f.relatedItemId);
    if (other) {
      lines.push(
        `  ↔ conflicts with: "${truncate(safeItemText(other.text, report.spans[f.relatedItemId]), 120)}"`,
      );
    }
  }
  lines.push(`  <sub>id: \`${f.itemId}\`</sub>`);
  return lines.join('\n');
}

function truncate(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1) + '…';
}

// ---------------------------------------------------------------------------
// Shareable card — SAFE BY CONSTRUCTION. Contains no text from your memory:
// only counts, category/subtype breakdowns, and fixed illustrative examples.
// ---------------------------------------------------------------------------

const ILLUSTRATIVE: Record<string, string> = {
  SENSITIVE: 'e.g. a health detail, a dollar amount, or a home address',
  THIRD_PARTY_PII: 'e.g. a named family member, or someone else\'s phone number',
  CONTRADICTORY: 'e.g. two different cities recorded for where you live',
  STALE: 'e.g. "currently training for a marathon", recorded 14 months ago',
};

function subtypeBreakdown(findings: Finding[], category: AuditCategory): string[] {
  const counts = new Map<string, number>();
  for (const f of findings) {
    if (f.category !== category) continue;
    const key = f.subtype ?? 'other';
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)).map(([k, n]) => `${k} ${n}`);
}

export function renderAuditCard(report: AuditReport, memory: ExtractedMemory): string {
  const c = report.counts;
  const total = report.findings.length;
  const hasSecrets = report.findings.some((f) => f.subtype === 'secrets');
  const out: string[] = [];

  out.push('# What my AI remembers — audit summary');
  out.push('');
  out.push(
    `A local audit of **${memory.stats.totalItems}** memory items from a ` +
      `${memory.source === 'chatgpt' ? 'ChatGPT' : 'Claude'} export flagged **${total}** for review.`,
  );
  out.push('');

  for (const cat of CATEGORY_ORDER) {
    const n =
      cat === 'SENSITIVE' ? c.sensitive
      : cat === 'THIRD_PARTY_PII' ? c.third_party_pii
      : cat === 'CONTRADICTORY' ? c.contradictory
      : c.stale;
    if (n === 0) continue;
    const breakdown = subtypeBreakdown(report.findings, cat);
    out.push(`- **${CATEGORY_LABEL[cat]}: ${n}**` + (breakdown.length ? ` — ${breakdown.join(' · ')}` : ''));
    out.push(`  <sub>${ILLUSTRATIVE[cat]}</sub>`);
  }
  out.push('');

  if (hasSecrets) {
    out.push(
      '> ⚠️ A credential-like string (API key / password / card number) was detected and **withheld**. ' +
        'Remove it from your memory and rotate the credential.',
    );
    out.push('');
  }

  out.push('---');
  out.push(
    '<sub>Generated locally by memory-porter. This card contains **no text from your memory** — ' +
      'only counts and generic examples. Safe to share. Nothing was sent anywhere.</sub>',
  );
  out.push('');
  return out.join('\n');
}
