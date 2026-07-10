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
