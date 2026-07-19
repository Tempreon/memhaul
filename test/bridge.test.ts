import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bridgeHint, bridgeLine, TEMPREON_URL } from '../src/bridge.js';
import { TempreonPushTarget } from '../src/push/tempreon.js';
import {
  computeStats,
  makeItemId,
  type ExtractedMemory,
} from '../src/model/memory.js';

test('bridge copy is honest: apex URL, no app subdomain, no one-click claim', () => {
  assert.equal(TEMPREON_URL, 'https://tempreon.com');
  for (const s of [bridgeHint(), bridgeLine()]) {
    assert.ok(s.includes('https://tempreon.com'), 'points at the apex domain');
    assert.ok(!/app\.tempreon\.com/.test(s), 'never links the app subdomain (it redirects)');
  }
  assert.match(bridgeLine(), /not a one-click/i);
  // The multi-line hint must not *promise* a one-click/automatic import.
  assert.ok(!/one[- ]click import|automatic(ally)? import|instantly? import/i.test(bridgeHint()));
  assert.match(bridgeHint(), /sends nothing/i); // reinforces the CLI pushes nothing
});

test('bridge links carry static channel attribution and nothing user-specific', () => {
  for (const s of [bridgeHint(), bridgeLine()]) {
    assert.ok(s.includes('utm_source=memhaul'), 'visits are attributable to the CLI channel');
    // The attribution must stay constant — no ids, versions, or anything per-user.
    assert.ok(!/utm_(content|term|campaign)|user|uid|session/i.test(s.split('tempreon.com')[1] ?? ''));
  }
});

function oneItemMemory(): ExtractedMemory {
  const items = [
    {
      id: makeItemId('chatgpt', 'saved_memory', 'x'),
      text: 'x',
      kind: 'saved_memory' as const,
      source: 'chatgpt' as const,
      provenance: { file: 't' },
    },
  ];
  return { source: 'chatgpt', generatorVersion: 't', items, warnings: [], stats: computeStats(items) };
}

test('push --dry-run makes no network call, returns a preview, and points at the web flow', async () => {
  const result = await new TempreonPushTarget().push(oneItemMemory(), { dryRun: true });
  assert.equal(result.dryRun, true);
  assert.equal(result.itemsPushed, 0);
  assert.ok(result.preview, 'shows the portable-record preview');
  assert.match(result.message, /does not push|no network/i);
  assert.match(result.message, /tempreon\.com/);
});

test('live push (non-dry-run) refuses in v0.1 by design (F6)', async () => {
  await assert.rejects(
    () => new TempreonPushTarget().push(oneItemMemory(), { dryRun: false }),
    /does not push|F6|web-import/i,
  );
});
