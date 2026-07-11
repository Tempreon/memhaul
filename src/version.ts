import { readFileSync } from 'node:fs';

/**
 * The version, read from package.json — the single source of truth. Deriving it
 * (rather than duplicating a literal) means the CLI's `--version`, the
 * `generatorVersion` stamped into output, and the published package can never
 * drift apart. package.json is always present at the package root, both in the
 * repo (src/version.ts -> ../package.json) and in the published tarball
 * (dist/version.js -> ../package.json), and npm always ships it.
 */
function readVersion(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf-8'),
    ) as { version?: unknown };
    return typeof pkg.version === 'string' ? pkg.version : '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export const VERSION = readVersion();
