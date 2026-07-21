import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  computeStats,
  makeItemId,
  type ExtractedMemory,
  type MemoryItem,
} from '../src/model/memory.js';
import { getEmitter, AVAILABLE_FORMATS } from '../src/emitters/index.js';

function m(): ExtractedMemory {
  const items: MemoryItem[] = [
    {
      id: makeItemId('chatgpt', 'saved_memory', 'User likes tea.'),
      text: 'User likes tea.',
      kind: 'saved_memory',
      source: 'chatgpt',
      provenance: { file: '(pasted saved memories)' },
    },
    {
      id: makeItemId('chatgpt', 'profile', 'Email: a@b.com'),
      text: 'Email: a@b.com',
      kind: 'profile',
      source: 'chatgpt',
      provenance: { file: 'user.json', path: 'email' },
    },
  ];
  return {
    source: 'chatgpt',
    generatorVersion: '0.1.0',
    account: { email: 'a@b.com' },
    items,
    warnings: ['a warning'],
    stats: computeStats(items, 3),
  };
}

test('markdown emitter writes an index and one file per present kind', () => {
  const files = getEmitter('markdown').emit(m());
  const paths = files.map((f) => f.path);
  assert.ok(paths.includes('README.md'));
  assert.ok(paths.includes('saved-memories.md'));
  assert.ok(paths.includes('profile.md'));
  assert.ok(!paths.includes('custom-instructions.md'), 'no file for absent kind');

  const readme = files.find((f) => f.path === 'README.md')!.content;
  assert.match(readme, /Your memory/);
  assert.match(readme, /a warning/); // warnings surfaced
  assert.match(readme, /\| \*\*Total\*\* \| \*\*2\*\* \|/);

  const saved = files.find((f) => f.path === 'saved-memories.md')!.content;
  assert.match(saved, /User likes tea\./);
  assert.match(saved, /source: \(pasted saved memories\)/);
});

test('markdown output is deterministic', () => {
  const a = getEmitter('markdown').emit(m());
  const b = getEmitter('markdown').emit(m());
  assert.deepEqual(a, b);
});

test('markdown renders an updated date when an item carries updatedAt', () => {
  const items: MemoryItem[] = [
    {
      id: makeItemId('claude', 'saved_memory', 'Uses two-space indentation.', 'preferences/coding.md'),
      text: 'Uses two-space indentation.',
      kind: 'saved_memory',
      source: 'claude',
      updatedAt: '2026-05-14T10:00:00.000000Z',
      provenance: { file: 'memories.json', path: 'preferences/coding.md' },
    },
  ];
  const memory: ExtractedMemory = {
    source: 'claude',
    generatorVersion: '0.1.0',
    items,
    warnings: [],
    stats: computeStats(items, 0),
  };
  const saved = getEmitter('markdown').emit(memory).find((f) => f.path === 'saved-memories.md')!.content;
  assert.match(saved, /updated 2026-05-14/);
  assert.match(saved, /memories\.json · preferences\/coding\.md/);
});

test('json emitter round-trips the model', () => {
  const files = getEmitter('json').emit(m());
  assert.equal(files.length, 1);
  const parsed = JSON.parse(files[0]!.content) as ExtractedMemory;
  assert.equal(parsed.items.length, 2);
  assert.equal(parsed.source, 'chatgpt');
});

test('unknown format throws with the list of available formats', () => {
  assert.throws(() => getEmitter('nope'), /Available formats/);
  assert.ok(AVAILABLE_FORMATS.includes('markdown'));
});

test('the OMP emitter is a wired-but-unimplemented extension point', () => {
  assert.ok(AVAILABLE_FORMATS.includes('omp'));
  assert.throws(() => getEmitter('omp').emit(m()), /not implemented in v0\.1|adr\/0002/i);
});
