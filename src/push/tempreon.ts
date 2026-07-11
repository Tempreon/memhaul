import type { ExtractedMemory, MemoryItem } from '../model/memory.js';
import { bridgeLine } from '../bridge.js';
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
 * v0.1 status (fork F6, ratified 2026-07-11): memory-porter does NOT push from
 * the CLI. v0.1 launches on the web-import path — the user brings the files in
 * through Tempreon's web signup + bridge flow (see bridge.ts / ADR-0003), which
 * is honest about not being one-click. This interface + the portable mapping are
 * kept so `--dry-run` can show exactly what a future push WOULD send, and a live
 * device-code-OAuth push is on the post-launch roadmap. Because nothing here
 * calls the network, the headline guarantee holds: memory-porter makes NO
 * network calls in v0.1.
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
          `Dry run: ${records.length} portable record(s) shown below. memory-porter does not ` +
          'push in v0.1 — no network call was made.\n' +
          bridgeLine(),
        preview: {
          note: 'v0.1 has no CLI push (fork F6). Preview only — see docs/adr/0003-tempreon-push-auth.md.',
          count: records.length,
          records,
        },
      };
    }

    throw new Error(
      'memory-porter does not push to Tempreon in v0.1 — that is by design (fork F6): v0.1 ' +
        'launches on the web-import path, not a CLI push.\n' +
        bridgeLine() +
        '\nRun `push --dry-run` to preview the portable records. See docs/adr/0003-tempreon-push-auth.md.',
    );
  }
}
