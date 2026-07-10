import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, optString, optBool } from '../src/util/args.js';
import { maskEmail, redactInline } from '../src/util/redact.js';
import { parseSavedMemoriesText, unixToIso } from '../src/sources/shared.js';

test('parseArgs handles booleans, values, =, positionals, and --', () => {
  const a = parseArgs(
    ['export.zip', '--out', 'mem', '--format=json', '--dry-run', '--', '--not-a-flag'],
    new Set(['dry-run']),
  );
  assert.deepEqual(a.positional, ['export.zip', '--not-a-flag']);
  assert.equal(optString(a, 'out'), 'mem');
  assert.equal(optString(a, 'format'), 'json');
  assert.equal(optBool(a, 'dry-run'), true);
});

test('a boolean flag does not swallow the following positional', () => {
  const a = parseArgs(['--claude', 'export.zip'], new Set(['claude']));
  assert.equal(optBool(a, 'claude'), true);
  assert.deepEqual(a.positional, ['export.zip']);
});

test('maskEmail preserves shape only', () => {
  assert.equal(maskEmail('jordan.smith@company.com'), 'j***@c***.com');
});

test('redactInline masks emails, phones, and long digit runs', () => {
  const out = redactInline('mail me at a@b.com or 415-555-1234, zip 90210');
  assert.ok(!out.includes('a@b.com'));
  assert.ok(out.includes('[PHONE]'));
  assert.ok(out.includes('[NUMBER]')); // 90210 is too short to look like a phone
});

test('parseSavedMemoriesText strips bullets and framing', () => {
  const lines = parseSavedMemoriesText(
    'Here are your saved memories:\n- Likes tea\n2. Lives in Austin\n• Uses a Mac\n\n  \n',
  );
  assert.deepEqual(lines, ['Likes tea', 'Lives in Austin', 'Uses a Mac']);
});

test('unixToIso tolerates seconds and rejects junk', () => {
  assert.equal(unixToIso(1704067200), '2024-01-01T00:00:00.000Z');
  assert.equal(unixToIso('nope' as unknown), undefined);
  assert.equal(unixToIso(undefined), undefined);
});
