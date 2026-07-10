import type { ExtractedMemory, MemoryItem } from '../model/memory.js';
import type { PushResult, PushTarget } from './types.js';

/**
 * A neutral, portable representation of a memory record — what memory-porter
 * would hand to any hosted memory service. Intentionally generic: no vendor
 * internals, no proprietary fields. A service maps this onto its own schema.
 */
export interface PortableMemoryRecord {
  text: string;
  kind: MemoryItem['kind'];
  source: MemoryItem['source'];
  created_at?: string;
  tags?: string[];
  provenance: { file: string; path?: string };
}

export function toPortableRecords(memory: ExtractedMemory): PortableMemoryRecord[] {
  return memory.items.map((i) => ({
    text: i.text,
    kind: i.kind,
    source: i.source,
    ...(i.createdAt ? { created_at: i.createdAt } : {}),
    ...(i.tags?.length ? { tags: i.tags } : {}),
    provenance: {
      file: i.provenance.file,
      ...(i.provenance.path ? { path: i.provenance.path } : {}),
    },
  }));
}

/**
 * Push target for Tempreon.
 *
 * v0.1 status: the mapping is real and `--dry-run` shows exactly what would be
 * sent, but the live push is INTENTIONALLY not wired. There is not yet a clean,
 * documented public auth story for a third-party CLI to write memory into a
 * user's Tempreon account (see docs/adr/0003-tempreon-push-auth.md). Rather than
 * invent a token scheme we'd have to break, v0.1 ships the interface + dry run
 * and defers the live path.
 *
 * This keeps the headline guarantee true: memory-porter makes NO network calls
 * in v0.1.
 */
export class TempreonPushTarget implements PushTarget {
  readonly name = 'tempreon';

  async push(
    memory: ExtractedMemory,
    opts: { dryRun: boolean },
  ): Promise<PushResult> {
    const records = toPortableRecords(memory);

    if (opts.dryRun) {
      return {
        ok: true,
        target: this.name,
        itemsPushed: 0,
        dryRun: true,
        message:
          `Dry run: ${records.length} memory record(s) would be sent to Tempreon. ` +
          'No network call was made. Re-run without --dry-run once push is enabled.',
        preview: {
          endpoint: '(not configured — see docs/adr/0003-tempreon-push-auth.md)',
          count: records.length,
          records,
        },
      };
    }

    throw new Error(
      'Live Tempreon push is not enabled in v0.1. The payload mapping is ready ' +
        '(try `--dry-run` to see exactly what would be sent), but the third-party ' +
        'auth story is still being designed — see docs/adr/0003-tempreon-push-auth.md. ' +
        'Until then, your memory stays in the local files memory-porter wrote.',
    );
  }
}
