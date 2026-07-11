import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openArchive } from '../src/util/zip.js';
import { parseExport, detectSource } from '../src/sources/index.js';
import { parseArgs, optString } from '../src/util/args.js';

/** Write a throwaway export dir with the given files, return its path. */
function exportDir(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'mp-rob-'));
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

test('malformed conversations.json does not crash the ChatGPT adapter', () => {
  // [null] passes Array.isArray but a null element would crash an unguarded loop.
  const dir = exportDir({
    'conversations.json': '[null, {"mapping": {"x": null}}]',
    'user.json': '{"email":"a@b.com"}',
  });
  const { memory } = parseExport(openArchive(dir), { source: 'chatgpt', includeDerived: true });
  assert.equal(memory.source, 'chatgpt');
  assert.ok(memory.account?.email === 'a@b.com');
});

test('malformed conversations.json does not crash the Claude adapter', () => {
  const dir = exportDir({
    'conversations.json': '[null, {"chat_messages": [null, {"sender":"human","text":"hi"}]}]',
  });
  const { memory } = parseExport(openArchive(dir), { source: 'claude', includeDerived: true });
  assert.equal(memory.source, 'claude');
});

test('non-array conversations.json degrades with a warning, not a crash', () => {
  const dir = exportDir({ 'conversations.json': '{"not":"an array"}', 'user.json': '{"email":"a@b.com"}' });
  const { memory } = parseExport(openArchive(dir), { source: 'chatgpt' });
  assert.ok(memory.warnings.some((w) => /not an array/i.test(w)));
});

test('an ambiguous archive (no ChatGPT/Claude marker) does not silently auto-detect', () => {
  const dir = exportDir({ 'conversations.json': '[{"foo":1}]' });
  const d = detectSource(openArchive(dir));
  assert.equal(d.source, undefined, 'below threshold -> undefined');
  assert.throws(() => parseExport(openArchive(dir)), /--source/);
});

test('a value-taking flag with no value is a usage error, not a silent default', () => {
  const a = parseArgs(['--out'], new Set());
  assert.throws(() => optString(a, 'out', 'memory'), /--out requires a value/);
});

test('Claude adapter tolerates a message whose content is a plain string', () => {
  const dir = exportDir({
    'conversations.json': JSON.stringify([
      { chat_messages: [{ sender: 'human', content: 'Remember that I live in Reno.' }] },
    ]),
  });
  const { memory } = parseExport(openArchive(dir), { source: 'claude', includeDerived: true });
  assert.ok(memory.items.some((i) => i.kind === 'derived' && /reno/i.test(i.text)));
});
