import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { openArchive } from '../src/util/zip.js';
import { parseExport, detectSource } from '../src/sources/index.js';

const dir = fileURLToPath(new URL('./fixtures/claude-export', import.meta.url));
const enc = (s: string): Uint8Array => new TextEncoder().encode(s);

test('auto-detects a Claude export by chat_messages, not ChatGPT', () => {
  const d = detectSource(openArchive(dir));
  assert.equal(d.source, 'claude');
  assert.ok((d.scores['claude'] ?? 0) > (d.scores['chatgpt'] ?? 0));
});

test('parses native memory from memories.json: account doc, memory_files, per-project memory', () => {
  const { memory } = parseExport(openArchive(dir), { source: 'claude' });
  assert.equal(memory.source, 'claude');
  assert.equal(memory.stats.conversationsSeen, 2);

  const saved = memory.items.filter((i) => i.kind === 'saved_memory');
  assert.ok(saved.length > 0, 'native memory produced saved items with no --memories paste');

  // The account-level document, split into lines through the shared paste parser.
  assert.ok(saved.some((i) => /TypeScript for new services/i.test(i.text)), 'account memory line');

  // memory_files carry a real path (ideal provenance) and a timestamp.
  const coding = saved.find((i) => /two-space indentation/i.test(i.text));
  assert.ok(coding, 'memory_files item present');
  assert.equal(coding!.provenance.path, 'preferences/coding.md');
  assert.ok(coding!.updatedAt, 'memory_files item carries its updated_at');

  // Per-project memory joined to the project's name; an unknown uuid still emits.
  assert.ok(saved.some((i) => i.provenance.path === 'project: CLI Tools'), 'project memory joined to name');
  assert.ok(saved.some((i) => i.provenance.path === 'project proj-unknown-99'), 'unknown project uuid kept, not dropped');

  // The stale "memory is NOT included" claim must not appear when memory is present.
  assert.ok(!memory.warnings.some((w) => /no memories\.json/i.test(w)), 'no fallback note when native memory present');
});

test('reads project instructions from projects/<uuid>.json', () => {
  const { memory } = parseExport(openArchive(dir), { source: 'claude' });
  const ci = memory.items.filter((i) => i.kind === 'custom_instruction').map((i) => i.text);
  assert.ok(ci.some((t) => /copy-pasteable shell commands/i.test(t)), 'prompt_template read from projects/ dir');
});

test('derived candidates from human messages (opt-in), reading content blocks and flat text', () => {
  const on = parseExport(openArchive(dir), { source: 'claude', includeDerived: true }).memory.items.filter(
    (i) => i.kind === 'derived',
  );
  assert.ok(on.some((i) => /portland/i.test(i.text)), 'from a content-block message');
  assert.ok(on.some((i) => /priya/i.test(i.text)), 'from a flat-text message');
});

test('paste is additive to native memory and de-duplicates exact overlap', () => {
  const { memory } = parseExport(openArchive(dir), {
    source: 'claude',
    savedMemoriesText: '- Prefers TypeScript for new services.\n- Drinks oat-milk lattes.',
  });
  const saved = memory.items.filter((i) => i.kind === 'saved_memory');
  assert.ok(saved.some((i) => /oat-milk lattes/i.test(i.text)), 'a fresh pasted line is added');
  const overlap = saved.filter((i) => /Prefers TypeScript for new services/i.test(i.text));
  assert.equal(overlap.length, 1, 'a line present both natively and in the paste is deduped');
});

test('an older export without memories.json warns, then accepts a --memories paste', () => {
  const old = mkdtempSync(join(tmpdir(), 'mp-claude-old-'));
  writeFileSync(
    join(old, 'conversations.json'),
    JSON.stringify([{ uuid: 'c1', name: 'x', chat_messages: [{ sender: 'human', text: 'hi' }] }]),
  );

  const noPaste = parseExport(openArchive(old), { source: 'claude' }).memory;
  assert.equal(noPaste.items.filter((i) => i.kind === 'saved_memory').length, 0);
  assert.ok(noPaste.warnings.some((w) => /no memories\.json/i.test(w)), 'fallback note fires');
  assert.ok(noPaste.warnings.some((w) => /Settings > Memory/i.test(w)), 'points at the current UI path');

  const withPaste = parseExport(openArchive(old), {
    source: 'claude',
    savedMemoriesText: '- I moved to Denver.\n- I use pnpm.',
  }).memory;
  assert.ok(
    withPaste.items.some((i) => i.kind === 'saved_memory' && /Denver/i.test(i.text)),
    'pasted memory comes through',
  );
  assert.ok(!withPaste.warnings.some((w) => /no memories\.json/i.test(w)), 'no fallback note once memory is present');
});

test('merges sibling -batch-NNNN.zip files instead of reading only the first', () => {
  const home = mkdtempSync(join(tmpdir(), 'mp-claude-batch-'));
  writeFileSync(
    join(home, 'export-batch-0000.zip'),
    zipSync({
      'conversations.json': enc(JSON.stringify([{ uuid: 'a', chat_messages: [{ sender: 'human', text: 'hi' }] }])),
      'memories.json': enc(JSON.stringify([{ conversations_memory: '- Batch zero fact.' }])),
    }),
  );
  writeFileSync(
    join(home, 'export-batch-0001.zip'),
    zipSync({
      'conversations.json': enc(JSON.stringify([{ uuid: 'b', chat_messages: [{ sender: 'human', text: 'yo' }] }])),
      'memories.json': enc(JSON.stringify([{ memory_files: [{ path: 'p.md', content: 'Batch one fact.' }] }])),
    }),
  );

  // Pointing at batch 0000 must pull in 0001 too.
  const { memory } = parseExport(openArchive(join(home, 'export-batch-0000.zip')), { source: 'claude' });
  assert.equal(memory.stats.conversationsSeen, 2, 'conversations from both batches counted');
  assert.ok(memory.warnings.some((w) => /Merged 2 conversation files/i.test(w)));
  assert.ok(memory.warnings.some((w) => /Merged 2 memories\.json files/i.test(w)));

  const saved = memory.items.filter((i) => i.kind === 'saved_memory').map((i) => i.text);
  assert.ok(saved.some((t) => /Batch zero fact/i.test(t)), 'memory from batch 0');
  assert.ok(saved.some((t) => /Batch one fact/i.test(t)), 'memory from batch 1');
});
