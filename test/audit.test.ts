import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats,
  makeItemId,
  type ExtractedMemory,
  type MemoryItem,
} from '../src/model/memory.js';
import { runAudit } from '../src/audit/index.js';
import { renderAuditReport, renderAuditCard } from '../src/audit/report.js';

const NOW = '2026-07-10T00:00:00Z';

function item(text: string, createdAt?: string): MemoryItem {
  return {
    id: makeItemId('chatgpt', 'saved_memory', text, createdAt),
    text,
    kind: 'saved_memory',
    source: 'chatgpt',
    ...(createdAt ? { createdAt } : {}),
    provenance: { file: 'test' },
  };
}

function mem(items: MemoryItem[]): ExtractedMemory {
  return { source: 'chatgpt', generatorVersion: 'test', items, warnings: [], stats: computeStats(items) };
}

const SECRET = 'User API key is sk-abcdefghijklmnopqrstuvwxyz0123456789.';
const PENICILLIN = 'User is allergic to penicillin.';

const items = [
  item('User works at Globex.', '2024-01-01T00:00:00Z'), // stale by age
  item(PENICILLIN, '2024-01-01T00:00:00Z'), // durable -> NOT stale; sensitive health
  item('User is currently between jobs.'), // stale by volatility
  item('User lives in Austin.'), // contradiction with next
  item('User lives in Denver.'),
  item("User's daughter Emma is 7 years old."), // third-party minor + drift stale
  item(SECRET), // secret
  item("User's salary is $185,000 per year."), // financial
  item('Reach jordan@example.com for scheduling.'), // third-party contact
  item('User was convicted of a felony in 2015.'), // legal
];

test('flags each category with the right counts', () => {
  const r = runAudit(mem(items), { now: NOW });
  assert.ok(r.counts.sensitive >= 4, `sensitive=${r.counts.sensitive}`);
  assert.ok(r.counts.third_party_pii >= 2, `third_party=${r.counts.third_party_pii}`);
  assert.ok(r.counts.contradictory >= 1, `contradictory=${r.counts.contradictory}`);
  assert.ok(r.counts.stale >= 3, `stale=${r.counts.stale}`);
});

test('durable facts (allergy) are not flagged stale by age', () => {
  const r = runAudit(mem(items), { now: NOW });
  const penId = makeItemId('chatgpt', 'saved_memory', PENICILLIN, '2024-01-01T00:00:00Z');
  const stale = r.findings.filter((f) => f.itemId === penId && f.category === 'STALE');
  assert.equal(stale.length, 0);
  // but it IS flagged sensitive (health)
  assert.ok(r.findings.some((f) => f.itemId === penId && f.subtype === 'health'));
});

test('detects the Austin/Denver location contradiction', () => {
  const r = runAudit(mem(items), { now: NOW });
  assert.ok(
    r.findings.some((f) => f.category === 'CONTRADICTORY' && f.subtype === 'mutually-exclusive'),
  );
});

test('an unrelated negated clause does not manufacture a false contradiction', () => {
  // "used to work at IBM" must not flip the polarity of the "lives in Boston" fact.
  const a = item('Bob lives in Boston. He used to work at IBM.', '2020-01-01T00:00:00Z');
  const b = item('Bob lives in Boston.', '2021-01-01T00:00:00Z');
  const r = runAudit(mem([a, b]), { now: NOW });
  assert.equal(r.findings.filter((f) => f.category === 'CONTRADICTORY').length, 0);
});

test('two same-dated different ages are a contradiction, not a "superseded" update', () => {
  const a = item('Alex is 9 years old', '2022-01-01T00:00:00Z');
  const b = item('Alex is 8 years old', '2022-01-01T00:00:00Z');
  const r = runAudit(mem([a, b]), { now: NOW });
  assert.ok(r.findings.some((f) => f.category === 'CONTRADICTORY'), 'real conflict surfaced');
  assert.ok(!r.findings.some((f) => f.subtype === 'superseded'), 'not silently suppressed');
});

test('a genuine age advance over time is treated as superseded, not a conflict', () => {
  const a = item('Alex is 8 years old', '2020-01-01T00:00:00Z');
  const b = item('Alex is 10 years old', '2022-01-01T00:00:00Z');
  const r = runAudit(mem([a, b]), { now: NOW });
  assert.ok(r.findings.some((f) => f.subtype === 'superseded'), 'aged up -> superseded');
  assert.ok(!r.findings.some((f) => f.category === 'CONTRADICTORY'), 'not a conflict');
});

test('is deterministic given a fixed now', () => {
  const a = runAudit(mem(items), { now: NOW });
  const b = runAudit(mem(items), { now: NOW });
  assert.deepEqual(a.findings, b.findings);
});

test('the shareable card leaks no raw memory text', () => {
  const m = mem(items);
  const card = renderAuditCard(runAudit(m, { now: NOW }), m);
  for (const leak of ['penicillin', 'sk-abc', 'Emma', '185,000', 'jordan@', 'Denver', 'Globex', 'felony']) {
    assert.ok(!card.includes(leak), `card leaked "${leak}"`);
  }
  assert.match(card, /withheld/i); // secret warning present
  assert.match(card, /audit summary/i);
});

test('the local report withholds credential items but keeps other values', () => {
  const m = mem(items);
  const report = renderAuditReport(runAudit(m, { now: NOW }), m);
  assert.ok(!report.includes('sk-abcdefghijklmnopqrstuvwxyz'), 'secret withheld');
  assert.match(report, /withheld/i);
  assert.match(report, /penicillin/); // non-secret value kept in the LOCAL report
});

test('a multi-word secret is withheld entirely, not partially masked', () => {
  // The regex only spans "recovery phrase is abandon"; a naive per-span mask would
  // print the remaining 11 seed words. The whole item must be withheld.
  const phrase =
    'My recovery phrase is abandon ability able about above absent absorb abstract absurd abuse access';
  const seedWords = ['ability', 'able', 'about', 'above', 'absent', 'absorb', 'abstract', 'absurd', 'abuse', 'access'];
  const m2 = mem([item(phrase)]);
  const report = renderAuditReport(runAudit(m2, { now: NOW }), m2);
  for (const w of seedWords) {
    assert.ok(!report.includes(w), `leaked seed word "${w}"`);
  }
  assert.match(report, /withheld/i);
});
