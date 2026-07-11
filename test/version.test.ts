import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { VERSION } from '../src/version.js';

test('VERSION is derived from package.json — single source of truth, no drift', () => {
  const pkg = JSON.parse(
    readFileSync(fileURLToPath(new URL('../package.json', import.meta.url)), 'utf-8'),
  ) as { version: string };
  assert.equal(VERSION, pkg.version);
  // Guard against silently falling back if the read path ever breaks.
  assert.notEqual(VERSION, '0.0.0');
});
