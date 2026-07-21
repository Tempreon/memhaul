import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openArchive } from '../src/util/zip.js';
import { parseExport, detectSource } from '../src/sources/index.js';

const dir = fileURLToPath(new URL('./fixtures/chatgpt-export', import.meta.url));
const memoriesText = readFileSync(
  fileURLToPath(new URL('./fixtures/saved-memories.txt', import.meta.url)),
  'utf-8',
);
const instructionsText = readFileSync(
  fileURLToPath(new URL('./fixtures/chatgpt-instructions.txt', import.meta.url)),
  'utf-8',
);

/** A minimal fresh-style export: a conversation with no custom-instruction metadata. */
function freshExportDir(): string {
  const d = mkdtempSync(join(tmpdir(), 'mp-gpt-fresh-'));
  writeFileSync(
    join(d, 'conversations.json'),
    JSON.stringify([
      {
        title: 'hi',
        mapping: {
          root: {
            id: 'root',
            message: { author: { role: 'user' }, content: { content_type: 'text', parts: ['hello'] } },
            children: [],
          },
        },
      },
    ]),
  );
  return d;
}

test('auto-detects a ChatGPT export by its mapping tree', () => {
  const d = detectSource(openArchive(dir));
  assert.equal(d.source, 'chatgpt');
  assert.ok(d.confidence >= 0.7, `confidence was ${d.confidence}`);
});

test('extracts profile, latest custom instructions, and conversation count', () => {
  const { memory } = parseExport(openArchive(dir), { source: 'chatgpt' });
  assert.equal(memory.source, 'chatgpt');
  assert.equal(memory.account?.email, 'sam.rivers@example.com');
  assert.equal(memory.account?.plan, 'ChatGPT Plus');
  assert.equal(memory.stats.conversationsSeen, 2);

  const ci = memory.items.filter((i) => i.kind === 'custom_instruction').map((i) => i.text);
  // The newest conversation's instructions win; the older ones are dropped.
  assert.ok(ci.some((t) => t.includes('I prefer TypeScript and I work at Acme.')), 'latest about_user');
  assert.ok(ci.some((t) => t.includes('friendly, direct tone')), 'latest about_model');
  assert.ok(!ci.some((t) => t.includes('vegetarian')), 'older instruction should be superseded');

  const profile = memory.items.filter((i) => i.kind === 'profile');
  assert.ok(profile.some((i) => i.text.includes('sam.rivers@example.com')));
});

test('warns that ChatGPT does not export saved memories when none are pasted', () => {
  const { memory } = parseExport(openArchive(dir), { source: 'chatgpt' });
  assert.equal(memory.items.filter((i) => i.kind === 'saved_memory').length, 0);
  assert.ok(memory.warnings.some((w) => /does NOT include your Saved Memories/i.test(w)));
});

test('a fresh export with no custom-instruction metadata warns and points at --instructions', () => {
  const { memory } = parseExport(openArchive(freshExportDir()), { source: 'chatgpt' });
  assert.equal(memory.items.filter((i) => i.kind === 'custom_instruction').length, 0, 'metadata path finds nothing');
  assert.ok(memory.warnings.some((w) => /no longer include them/i.test(w)), 'honest gap warning');
  assert.ok(memory.warnings.some((w) => /--instructions <file>/.test(w)), 'points at the paste route');
});

test('--instructions paste brings custom instructions in from a fresh export', () => {
  const { memory } = parseExport(openArchive(freshExportDir()), {
    source: 'chatgpt',
    customInstructionsText: instructionsText,
  });
  const ci = memory.items.filter((i) => i.kind === 'custom_instruction');
  assert.ok(ci.length >= 2, `got ${ci.length} instructions`);
  assert.ok(ci.some((i) => /Go and Postgres/i.test(i.text)));
  assert.ok(ci.some((i) => /concise and direct/i.test(i.text)));
  assert.ok(ci.every((i) => i.provenance.file === '(pasted custom instructions)'));
  assert.ok(!memory.warnings.some((w) => /no longer include them/i.test(w)), 'no gap warning once pasted');
});

test('pasted instructions are additive to metadata-recovered ones (older export)', () => {
  const { memory } = parseExport(openArchive(dir), {
    source: 'chatgpt',
    customInstructionsText: 'Always use metric units.',
  });
  const ci = memory.items.filter((i) => i.kind === 'custom_instruction').map((i) => i.text);
  assert.ok(ci.some((t) => /I prefer TypeScript and I work at Acme/.test(t)), 'metadata instruction still present');
  assert.ok(ci.some((t) => /Always use metric units/i.test(t)), 'pasted instruction added');
});

test('includes pasted saved memories and skips framing lines', () => {
  const { memory } = parseExport(openArchive(dir), {
    source: 'chatgpt',
    savedMemoriesText: memoriesText,
  });
  const saved = memory.items.filter((i) => i.kind === 'saved_memory');
  assert.ok(saved.length >= 8, `got ${saved.length} saved memories`);
  assert.ok(saved.some((i) => i.text.includes('allergic to penicillin')));
  assert.ok(!saved.some((i) => /here are your saved/i.test(i.text)), 'header line stripped');
});

test('derived candidates are opt-in only', () => {
  const off = parseExport(openArchive(dir), { source: 'chatgpt' }).memory.items.filter(
    (i) => i.kind === 'derived',
  );
  assert.equal(off.length, 0);

  const on = parseExport(openArchive(dir), { source: 'chatgpt', includeDerived: true }).memory.items.filter(
    (i) => i.kind === 'derived',
  );
  assert.ok(on.some((i) => i.text.includes('Emma')), 'derived from "remember that"');
  assert.ok(on.some((i) => /subaru/i.test(i.text)), 'derived from multimodal "note that"');
  assert.ok(on.every((i) => (i.confidence ?? 1) < 1), 'derived items carry sub-1 confidence');
});

test('item ids are stable across runs (diffable output)', () => {
  const a = parseExport(openArchive(dir), { source: 'chatgpt', savedMemoriesText: memoriesText }).memory;
  const b = parseExport(openArchive(dir), { source: 'chatgpt', savedMemoriesText: memoriesText }).memory;
  assert.deepEqual(
    a.items.map((i) => i.id),
    b.items.map((i) => i.id),
  );
});

// --- Chunked Privacy Portal exports (conversations-000.json, -001.json, …) ---

const chunkedDir = fileURLToPath(
  new URL('./fixtures/chatgpt-export-chunked', import.meta.url),
);

test('detects a chunked Privacy Portal export with no plain conversations.json', () => {
  const d = detectSource(openArchive(chunkedDir));
  assert.equal(d.source, 'chatgpt');
  assert.ok(d.confidence >= 0.7, `confidence was ${d.confidence}`);
});

test('merges every conversation chunk instead of silently dropping all but the first', () => {
  const { memory } = parseExport(openArchive(chunkedDir), {
    source: 'chatgpt',
    includeDerived: true,
  });
  // One conversation lives in each chunk — both must be seen.
  assert.equal(memory.stats.conversationsSeen, 2);
  assert.ok(memory.warnings.some((w) => /Merged 2 conversation files/i.test(w)));

  // The NEWER chunk's custom instructions win across the chunk boundary.
  const ci = memory.items.filter((i) => i.kind === 'custom_instruction').map((i) => i.text);
  assert.ok(ci.some((t) => t.includes('switched from vinyl to streaming')), 'newest about_user wins');
  assert.ok(!ci.some((t) => t.includes('I collect vinyl records')), 'older chunk CI superseded');

  // Derived extraction reaches into chunk 000 too.
  const derived = memory.items.filter((i) => i.kind === 'derived').map((i) => i.text);
  assert.ok(derived.some((t) => t.includes('Rega Planar 3')), 'derived item from chunk 000');
});
