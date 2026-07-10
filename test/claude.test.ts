import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { openArchive } from '../src/util/zip.js';
import { parseExport, detectSource } from '../src/sources/index.js';

const dir = fileURLToPath(new URL('./fixtures/claude-export', import.meta.url));

test('auto-detects a Claude export by chat_messages, not ChatGPT', () => {
  const d = detectSource(openArchive(dir));
  assert.equal(d.source, 'claude');
  assert.ok((d.scores['claude'] ?? 0) > (d.scores['chatgpt'] ?? 0));
});

test('parses conversations and warns that Claude memory is not exported', () => {
  const { memory } = parseExport(openArchive(dir), { source: 'claude' });
  assert.equal(memory.source, 'claude');
  assert.equal(memory.stats.conversationsSeen, 2);
  assert.ok(memory.warnings.some((w) => /memory is NOT included/i.test(w)));
});

test('derived candidates from human messages (opt-in), reading content blocks and flat text', () => {
  const on = parseExport(openArchive(dir), { source: 'claude', includeDerived: true }).memory.items.filter(
    (i) => i.kind === 'derived',
  );
  assert.ok(on.some((i) => /portland/i.test(i.text)), 'from a content-block message');
  assert.ok(on.some((i) => /priya/i.test(i.text)), 'from a flat-text message');
});
