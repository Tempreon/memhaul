import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, optString, optBool } from '../src/util/args.js';
import { maskEmail, redactInline } from '../src/util/redact.js';
import { parseCustomInstructionsText, parseSavedMemoriesText, unixToIso } from '../src/sources/shared.js';

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

test('parseCustomInstructionsText: unlabeled blocks become one instruction each', () => {
  const out = parseCustomInstructionsText(
    'I prefer Go and Postgres.\nI work in Mountain time.\n\nBe concise and direct.',
  );
  assert.deepEqual(out, [
    'Custom instruction: I prefer Go and Postgres. I work in Mountain time.',
    'Custom instruction: Be concise and direct.',
  ]);
});

test('parseCustomInstructionsText: labeled paste splits into the two ChatGPT boxes', () => {
  const out = parseCustomInstructionsText(
    'What would you like ChatGPT to know about you to provide better responses?\n' +
      'I am a backend engineer.\n\n' +
      'How would you like ChatGPT to respond?\n' +
      'Keep it short.',
  );
  assert.deepEqual(out, [
    'What ChatGPT should know about you: I am a backend engineer.',
    'How ChatGPT should respond: Keep it short.',
  ]);
});

test('parseCustomInstructionsText: empty or whitespace paste yields nothing', () => {
  assert.deepEqual(parseCustomInstructionsText('   \n\n  '), []);
});

test('unixToIso tolerates seconds and rejects junk', () => {
  assert.equal(unixToIso(1704067200), '2024-01-01T00:00:00.000Z');
  assert.equal(unixToIso('nope' as unknown), undefined);
  assert.equal(unixToIso(undefined), undefined);
});
