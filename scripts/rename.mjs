#!/usr/bin/env node
// One-step local rename: replaces every literal "memory-porter" with your chosen
// name across all tracked text files (package.json, README, src, docs, launch,
// workflows, lockfile). Does NOT touch GitHub/npm — see docs/RENAME.md for the
// two manual steps that must be done in those UIs/CLIs.
//
//   node scripts/rename.mjs <new-name>
//
// <new-name> must be a valid npm/GitHub name: lowercase letters, digits, hyphens,
// not starting with a hyphen.
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const OLD = 'memory-porter';
const repoRoot = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const selfPath = fileURLToPath(import.meta.url);

const NEW = process.argv[2];
if (!NEW) {
  console.error('Usage: node scripts/rename.mjs <new-name>');
  process.exit(2);
}
if (!/^[a-z0-9][a-z0-9-]*$/.test(NEW)) {
  console.error(`Invalid name "${NEW}". Use lowercase letters, digits and hyphens; no leading hyphen.`);
  process.exit(2);
}
if (NEW === OLD) {
  console.error(`Name is already "${OLD}"; nothing to do.`);
  process.exit(0);
}

const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'out', 'memory']);
// Only known text extensions — never touch extension-less or binary files.
const TEXT_EXT = new Set(['.json', '.md', '.ts', '.js', '.mjs', '.yml', '.yaml', '.txt', '.tape']);

function walk(dir) {
  const files = [];
  for (const name of readdirSync(dir)) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    if (full === selfPath) continue; // don't rewrite this script mid-run
    const st = statSync(full);
    if (st.isDirectory()) files.push(...walk(full));
    else if (st.isFile() && TEXT_EXT.has(extname(name))) files.push(full);
  }
  return files;
}

let changedFiles = 0;
let changedHits = 0;
for (const file of walk(repoRoot)) {
  const before = readFileSync(file, 'utf-8');
  if (!before.includes(OLD)) continue;
  const hits = before.split(OLD).length - 1;
  writeFileSync(file, before.split(OLD).join(NEW), 'utf-8');
  changedFiles++;
  changedHits += hits;
  console.log(`  ${file.replace(repoRoot + '/', '')} (${hits})`);
}

console.log(`\nRenamed "${OLD}" -> "${NEW}" in ${changedHits} place(s) across ${changedFiles} file(s).`);
console.log('\nStill on you (not scriptable — see docs/RENAME.md):');
console.log(`  1. GitHub: gh repo rename ${NEW} -R Tempreon/${OLD}   (then: git remote set-url origin https://github.com/Tempreon/${NEW}.git)`);
console.log('  2. npm: nothing until you publish — the new name ships with the package.');
console.log('\nThen: npm run typecheck && npm test && npm run build');
