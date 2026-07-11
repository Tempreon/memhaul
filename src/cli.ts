#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { parseArgs, optString, optBool } from './util/args.js';
import { openArchive } from './util/zip.js';
import { parseExport, describeDetection } from './sources/index.js';
import { getEmitter, AVAILABLE_FORMATS } from './emitters/index.js';
import { runAudit } from './audit/index.js';
import { renderAuditReport, renderAuditCard } from './audit/report.js';
import { TempreonPushTarget } from './push/tempreon.js';
import type { SourceType } from './model/memory.js';
import { bridgeHint } from './bridge.js';
import { VERSION } from './version.js';

const HELP = `memory-porter v${VERSION}
Turn a ChatGPT or Claude data export into clean, human-readable memory files you own.

USAGE
  memory-porter <command> [options]

COMMANDS
  parse <export>      Parse an export into memory files (default: ./memory)
  audit <export>      Report stale / sensitive / contradictory / third-party items
  push  <export>      Push parsed memory to a target (opt-in; v0.1 is dry-run only)
  help                Show this help
  version             Show version

PARSE OPTIONS
  --source <name>     chatgpt | claude | auto   (default: auto-detect)
  --claude            shorthand for --source claude
  --out <dir>         output directory           (default: ./memory)
  --format <name>     ${AVAILABLE_FORMATS.join(' | ')}   (default: markdown)
  --memories <file>   paste of your saved memories (ChatGPT/Claude don't export them)
  --include-derived   also emit memory inferred from conversations (guesses)
  --dry-run           show what would be written; write nothing
  --quiet             only print the summary line

AUDIT OPTIONS
  --source <name>     chatgpt | claude | auto   (default: auto-detect)
  --out <dir>         where to write the report  (default: ./memory)
  --memories <file>   include your pasted saved memories in the audit
  --card              also write a redacted, shareable audit-card.md
  --json              print findings as JSON to stdout (writes nothing)

PUSH OPTIONS
  --to <target>       tempreon                   (default: tempreon)
  --dry-run           show the payload; make no network call

EXAMPLES
  memory-porter parse chatgpt-export.zip
  memory-porter parse claude-export.zip --claude --out ./my-memory
  memory-porter audit chatgpt-export.zip --card
  memory-porter push chatgpt-export.zip --to tempreon --dry-run

Everything runs locally. parse and audit make no network calls. Your export
never leaves your machine unless you explicitly run a real push.
`;

function writeFiles(
  outDir: string,
  files: { path: string; content: string }[],
): string[] {
  const written: string[] = [];
  for (const f of files) {
    const dest = join(outDir, f.path);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, f.content, 'utf-8');
    written.push(dest);
  }
  return written;
}

function resolveSource(
  source: string | undefined,
  claudeFlag: boolean,
): SourceType | undefined {
  if (claudeFlag) return 'claude';
  if (!source || source === 'auto') return undefined;
  if (source === 'chatgpt' || source === 'claude') return source;
  throw new UsageError(`Unknown --source "${source}". Use chatgpt, claude, or auto.`);
}

class UsageError extends Error {}

function requireInput(positional: string[], command: string): string {
  const input = positional[0];
  if (!input) {
    throw new UsageError(
      `\`${command}\` needs a path to an export.\n  e.g. memory-porter ${command} chatgpt-export.zip`,
    );
  }
  return input;
}

/** Read the --memories paste file, if the user supplied one. */
function readMemories(args: ReturnType<typeof parseArgs>): string | undefined {
  const path = optString(args, 'memories');
  if (!path) return undefined;
  try {
    return readFileSync(path, 'utf-8');
  } catch (err) {
    throw new UsageError(`Cannot read --memories file "${path}": ${(err as Error).message}`);
  }
}

function cmdParse(argv: string[]): number {
  const args = parseArgs(
    argv,
    new Set(['claude', 'include-derived', 'dry-run', 'quiet', 'verbose']),
  );
  const input = requireInput(args.positional, 'parse');
  const source = resolveSource(optString(args, 'source'), optBool(args, 'claude'));
  const outDir = optString(args, 'out', 'memory')!;
  const format = optString(args, 'format', 'markdown')!;
  const includeDerived = optBool(args, 'include-derived');
  const dryRun = optBool(args, 'dry-run');
  const quiet = optBool(args, 'quiet');

  const emitter = getEmitter(format);
  const archive = openArchive(input);
  const { memory, detection } = parseExport(archive, {
    source,
    includeDerived,
    savedMemoriesText: readMemories(args),
  });

  if (!quiet && !source) {
    process.stderr.write(describeDetection(detection) + '\n');
  }

  const files = emitter.emit(memory);

  if (dryRun) {
    process.stdout.write(
      `Dry run — would write ${files.length} file(s) to ${outDir}/:\n`,
    );
    for (const f of files) process.stdout.write(`  ${join(outDir, f.path)}\n`);
  } else {
    writeFiles(outDir, files);
  }

  if (!quiet && memory.warnings.length) {
    process.stderr.write(`\n${memory.warnings.length} note(s):\n`);
    for (const w of memory.warnings) process.stderr.write(`  - ${w}\n`);
  }

  const s = memory.stats;
  const verb = dryRun ? 'Would extract' : 'Extracted';
  process.stdout.write(
    `\n${verb} ${s.totalItems} memory item(s) from your ${label(memory.source)} export ` +
      `(${s.byKind.saved_memory} saved, ${s.byKind.custom_instruction} instructions, ` +
      `${s.byKind.profile} profile${s.byKind.derived ? `, ${s.byKind.derived} derived` : ''}).\n`,
  );
  if (!dryRun) {
    process.stdout.write(`Open ${join(outDir, 'README.md')} to read them.\n`);
  }
  if (!quiet) process.stdout.write(bridgeHint() + '\n');
  return 0;
}

function cmdAudit(argv: string[]): number {
  const args = parseArgs(argv, new Set(['card', 'json', 'quiet', 'claude']));
  const input = requireInput(args.positional, 'audit');
  const source = resolveSource(optString(args, 'source'), optBool(args, 'claude'));
  const outDir = optString(args, 'out', 'memory')!;
  const asJson = optBool(args, 'json');
  const withCard = optBool(args, 'card');

  const archive = openArchive(input);
  const { memory } = parseExport(archive, {
    source,
    includeDerived: true,
    savedMemoriesText: readMemories(args),
  });
  const report = runAudit(memory);

  if (asJson) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    return report.findings.length ? 3 : 0;
  }

  const written: string[] = [];
  written.push(...writeFiles(outDir, [
    { path: 'audit-report.md', content: renderAuditReport(report, memory) },
  ]));
  if (withCard) {
    written.push(...writeFiles(outDir, [
      { path: 'audit-card.md', content: renderAuditCard(report, memory) },
    ]));
  }

  const c = report.counts;
  process.stdout.write(
    `Audited ${memory.stats.totalItems} memory item(s): ` +
      `${c.stale} stale, ${c.contradictory} contradictory, ` +
      `${c.sensitive} sensitive, ${c.third_party_pii} third-party.\n`,
  );
  for (const w of written) process.stdout.write(`Wrote ${w}\n`);
  if (withCard) {
    process.stdout.write(
      'The card is redacted and safe to share. Read it before you do.\n',
    );
  }
  // Non-zero exit when there are findings, so scripts can gate on it.
  return report.findings.length ? 3 : 0;
}

async function cmdPush(argv: string[]): Promise<number> {
  const args = parseArgs(argv, new Set(['dry-run', 'quiet', 'claude']));
  const input = requireInput(args.positional, 'push');
  const source = resolveSource(optString(args, 'source'), optBool(args, 'claude'));
  const to = optString(args, 'to', 'tempreon')!;
  const dryRun = optBool(args, 'dry-run');

  if (to !== 'tempreon') {
    throw new UsageError(`Unknown push target "${to}". Only "tempreon" exists in v0.1.`);
  }

  const archive = openArchive(input);
  const { memory } = parseExport(archive, {
    source,
    savedMemoriesText: readMemories(args),
  });
  const target = new TempreonPushTarget();
  const result = await target.push(memory, { dryRun });

  process.stdout.write(result.message + '\n');
  if (dryRun && result.preview) {
    process.stdout.write('\nPayload preview:\n');
    process.stdout.write(JSON.stringify(result.preview, null, 2) + '\n');
  }
  return result.ok ? 0 : 1;
}

function label(source: SourceType): string {
  return source === 'chatgpt' ? 'ChatGPT' : 'Claude';
}

async function main(argv: string[]): Promise<number> {
  const [command, ...rest] = argv;

  switch (command) {
    case 'parse':
      return cmdParse(rest);
    case 'audit':
      return cmdAudit(rest);
    case 'push':
      return cmdPush(rest);
    case 'version':
    case '--version':
    case '-v':
      process.stdout.write(`memory-porter v${VERSION}\n`);
      return 0;
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      process.stdout.write(HELP);
      return command === undefined ? 1 : 0;
    default:
      process.stderr.write(`Unknown command "${command}".\n\n${HELP}`);
      return 2;
  }
}

main(process.argv.slice(2))
  .then((code) => process.exit(code))
  .catch((err) => {
    const isUsage = err instanceof UsageError;
    process.stderr.write(`\nmemory-porter: ${(err as Error).message}\n`);
    process.exit(isUsage ? 2 : 1);
  });
