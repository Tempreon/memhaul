#!/usr/bin/env node
/**
 * Claude-export verification harness.
 *
 *   npm run verify:claude -- /path/to/your-claude-export.zip
 *   (or: node --import tsx scripts/verify-claude-export.ts <path>)
 *
 * Point this at your REAL Claude data export. It diffs the export's actual shape
 * against what the Claude adapter assumes, and reports gaps — so you can see
 * whether the researched schema matches reality on your account before trusting it.
 *
 * PRIVACY: this prints only field NAMES, value TYPES, and COUNTS. It never prints
 * the content of any message or memory, and it writes nothing. Do not commit your
 * export — the repo's .gitignore already excludes common export paths.
 */
import { openArchive } from '../src/util/zip.js';
import { parseExport, detectSource } from '../src/sources/index.js';

// What the Claude adapter (src/sources/claude.ts) actually reads:
const ADAPTER_READS = {
  files: ['conversations.json', 'users.json', 'projects.json'],
  conversation: ['uuid', 'name', 'created_at', 'updated_at', 'account', 'project_uuid', 'chat_messages'],
  message: ['uuid', 'sender', 'text', 'content', 'created_at'],
  contentBlock: ['type', 'text'],
  users: ['email_address', 'email', 'full_name', 'name'],
  project: ['uuid', 'name', 'description', 'created_at', 'prompt_template'],
};

function typeOf(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

function keysWithTypes(objs: Record<string, unknown>[]): Map<string, Set<string>> {
  const m = new Map<string, Set<string>>();
  for (const o of objs) {
    if (!o || typeof o !== 'object') continue;
    for (const [k, v] of Object.entries(o)) {
      if (!m.has(k)) m.set(k, new Set());
      m.get(k)!.add(typeOf(v));
    }
  }
  return m;
}

function diffSection(label: string, seen: Map<string, Set<string>>, reads: string[]): void {
  const seenKeys = [...seen.keys()].sort();
  console.log(`\n## ${label}`);
  console.log(`  fields present: ${seenKeys.map((k) => `${k}:${[...seen.get(k)!].join('|')}`).join(', ') || '(none)'}`);
  const missing = reads.filter((r) => !seen.has(r));
  const ignored = seenKeys.filter((k) => !reads.includes(k));
  if (missing.length) console.log(`  ⚠ adapter READS but NOT PRESENT: ${missing.join(', ')}  (adapter degrades to warnings for these)`);
  else console.log('  ✓ every field the adapter reads is present');
  if (ignored.length) console.log(`  ℹ present but adapter IGNORES: ${ignored.join(', ')}  (potential missed data — worth a look)`);
}

function main(): void {
  const path = process.argv[2];
  if (!path) {
    console.error('Usage: npm run verify:claude -- <path-to-claude-export.zip-or-dir>');
    process.exit(2);
  }

  const arc = openArchive(path);
  const files = arc.files();
  console.log('# Claude export verification\n');
  console.log(`Files in export (${files.length}):`);
  for (const f of files.slice(0, 40)) console.log(`  ${f}`);
  if (files.length > 40) console.log(`  … and ${files.length - 40} more`);

  const missingFiles = ADAPTER_READS.files.filter((f) => !arc.find(f));
  const extraFiles = files.map((f) => f.split('/').pop()!).filter((b) => /\.json$/.test(b) && !ADAPTER_READS.files.includes(b));
  if (missingFiles.length) console.log(`\n⚠ files the adapter looks for but not found: ${missingFiles.join(', ')} (expected — Claude exports are thin; adapter handles absence)`);
  if (extraFiles.length) console.log(`ℹ extra .json files the adapter ignores: ${[...new Set(extraFiles)].join(', ')}`);

  const det = detectSource(arc);
  console.log(`\nDetection: source=${det.source ?? '(none)'} confidence=${Math.round(det.confidence * 100)}% scores=${JSON.stringify(det.scores)}`);

  const convPath = arc.find('conversations.json');
  if (!convPath) {
    console.log('\n⚠ No conversations.json — cannot diff conversation schema.');
  } else {
    let convs: unknown;
    try {
      convs = JSON.parse(arc.readText(convPath)!);
    } catch (e) {
      console.log(`\n⚠ conversations.json did not parse: ${(e as Error).message}`);
      convs = [];
    }
    const convArr = (Array.isArray(convs) ? convs : []) as Record<string, unknown>[];
    console.log(`\nconversations.json: ${Array.isArray(convs) ? `array of ${convArr.length}` : `NOT an array (${typeOf(convs)}) — adapter expects an array`}`);
    diffSection('Conversation fields', keysWithTypes(convArr), ADAPTER_READS.conversation);

    const messages: Record<string, unknown>[] = [];
    const blockTypes = new Set<string>();
    const senders = new Set<string>();
    for (const c of convArr) {
      const cm = (c as { chat_messages?: unknown }).chat_messages;
      if (!Array.isArray(cm)) continue;
      for (const m of cm as Record<string, unknown>[]) {
        if (!m || typeof m !== 'object') continue;
        messages.push(m);
        if (typeof m['sender'] === 'string') senders.add(m['sender']);
        const content = m['content'];
        if (Array.isArray(content)) for (const b of content) if (b && typeof b === 'object' && typeof (b as { type?: unknown }).type === 'string') blockTypes.add((b as { type: string }).type);
      }
    }
    diffSection('Message fields', keysWithTypes(messages), ADAPTER_READS.message);
    console.log(`\n  sender values seen: ${[...senders].join(', ') || '(none)'}  (adapter treats "human" as the user)`);
    console.log(`  content block types seen: ${[...blockTypes].join(', ') || '(none/flat text)'}  (adapter extracts text from "text"/flat-text blocks)`);
  }

  // Finally, run the real adapter and report what it produced.
  try {
    const { memory } = parseExport(arc, { source: 'claude', includeDerived: true });
    console.log(`\n## Adapter output`);
    console.log(`  items=${memory.stats.totalItems} byKind=${JSON.stringify(memory.stats.byKind)} conversations=${memory.stats.conversationsSeen}`);
    console.log(`  warnings (${memory.warnings.length}):`);
    for (const w of memory.warnings) console.log(`    - ${w.slice(0, 140)}${w.length > 140 ? '…' : ''}`);
  } catch (e) {
    console.log(`\n⚠ adapter.extract threw: ${(e as Error).message}`);
  }

  console.log('\nDone. Only field names, types, and counts were shown — no memory content, nothing written.');
}

main();
