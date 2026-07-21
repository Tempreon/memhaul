import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { zipSync } from 'fflate';
import { openArchive } from '../src/util/zip.js';
import { parseExport } from '../src/sources/index.js';

const fixtureDir = fileURLToPath(new URL('./fixtures/chatgpt-export', import.meta.url));

function makeZip(): string {
  const conv = readFileSync(join(fixtureDir, 'conversations.json'));
  const user = readFileSync(join(fixtureDir, 'user.json'));
  // Nest under a top folder, as real exports sometimes do.
  const zipped = zipSync({
    'chatgpt-export/conversations.json': new Uint8Array(conv),
    'chatgpt-export/user.json': new Uint8Array(user),
  });
  const dir = mkdtempSync(join(tmpdir(), 'mp-zip-'));
  const path = join(dir, 'export.zip');
  writeFileSync(path, zipped);
  return path;
}

test('reads a .zip and finds nested files case-insensitively', () => {
  const arc = openArchive(makeZip());
  assert.ok(arc.files().some((p) => p.endsWith('conversations.json')));
  assert.ok(arc.find('CONVERSATIONS.JSON'), 'find is case-insensitive');
  assert.match(arc.readText(arc.find('user.json')!)!, /sam\.rivers@example\.com/);
});

test('parses end-to-end from a zip', () => {
  const { memory, detection } = parseExport(openArchive(makeZip()));
  assert.equal(detection.source, 'chatgpt');
  assert.equal(memory.stats.conversationsSeen, 2);
});

test('reads an unzipped directory', () => {
  const arc = openArchive(fixtureDir);
  assert.ok(arc.find('conversations.json'));
});

test('a bad path throws a helpful error', () => {
  assert.throws(() => openArchive('/no/such/path.zip'), /Cannot read/);
});

test('merges sibling -batch-NNNN.zip files, keeping colliding paths from every batch', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const home = mkdtempSync(join(tmpdir(), 'mp-batch-'));
  writeFileSync(join(home, 'x-batch-0000.zip'), zipSync({ 'a.json': enc('0'), 'shared.json': enc('zero') }));
  writeFileSync(join(home, 'x-batch-0001.zip'), zipSync({ 'b.json': enc('1'), 'shared.json': enc('one') }));

  // Pointed at any one batch, we see files from all of them.
  const arc = openArchive(join(home, 'x-batch-0000.zip'));
  const files = arc.files();
  assert.ok(files.includes('a.json') && files.includes('b.json'), 'files from both batches');
  // The colliding basename survives twice (the later batch under a stem prefix),
  // so a basename glob still finds every copy and nothing is silently dropped.
  assert.equal(files.filter((p) => p.endsWith('shared.json')).length, 2);
});

test('a lone -batch-NNNN.zip with no siblings opens normally', () => {
  const enc = (s: string) => new TextEncoder().encode(s);
  const home = mkdtempSync(join(tmpdir(), 'mp-batch1-'));
  writeFileSync(join(home, 'solo-batch-0000.zip'), zipSync({ 'a.json': enc('0') }));
  const arc = openArchive(join(home, 'solo-batch-0000.zip'));
  assert.deepEqual(arc.files(), ['a.json']);
});
