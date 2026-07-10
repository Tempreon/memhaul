import type { ExtractedMemory, MemoryItem, MemoryKind } from '../model/memory.js';
import type { Emitter, EmittedFile } from './types.js';

/** Display metadata per kind: filename + human heading + one-line description. */
const KIND_FILES: Record<
  MemoryKind,
  { file: string; heading: string; blurb: string }
> = {
  saved_memory: {
    file: 'saved-memories.md',
    heading: 'Saved memories',
    blurb: 'Facts the assistant chose to remember about you across chats.',
  },
  custom_instruction: {
    file: 'custom-instructions.md',
    heading: 'Custom instructions',
    blurb: 'Standing instructions and preferences you set for the assistant.',
  },
  profile: {
    file: 'profile.md',
    heading: 'Profile',
    blurb: 'Account facts found in the export.',
  },
  derived: {
    file: 'derived-candidates.md',
    heading: 'Derived candidates',
    blurb:
      'Memory-like statements inferred from your conversations — NOT things the platform explicitly stored. Review before trusting.',
  },
};

/** Stable ordering so re-runs produce diffable files. */
function sortItems(items: MemoryItem[]): MemoryItem[] {
  return [...items].sort((a, b) => {
    const at = a.createdAt ?? '';
    const bt = b.createdAt ?? '';
    if (at !== bt) return at < bt ? -1 : 1;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

function fmtDate(iso?: string): string | undefined {
  if (!iso) return undefined;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString().slice(0, 10);
}

/** Render one item as a markdown bullet with an auditable provenance line. */
function renderItem(item: MemoryItem): string {
  const lines: string[] = [];
  lines.push(`- ${item.text.trim()}`);

  const meta: string[] = [];
  const created = fmtDate(item.createdAt);
  if (created) meta.push(`added ${created}`);
  if (item.confidence !== undefined) {
    meta.push(`confidence ${Math.round(item.confidence * 100)}%`);
  }
  if (item.tags?.length) meta.push(item.tags.map((t) => `#${t}`).join(' '));

  const prov = item.provenance.path
    ? `${item.provenance.file} · ${item.provenance.path}`
    : item.provenance.file;
  meta.push(`source: ${prov}`);
  meta.push(`id: \`${item.id}\``);

  lines.push(`  <sub>${meta.join(' — ')}</sub>`);
  return lines.join('\n');
}

function renderKindFile(
  memory: ExtractedMemory,
  kind: MemoryKind,
  items: MemoryItem[],
): string {
  const { heading, blurb } = KIND_FILES[kind];
  const out: string[] = [];
  out.push(`# ${heading}`);
  out.push('');
  out.push(`> ${blurb}`);
  out.push('');
  out.push(
    `_${items.length} item${items.length === 1 ? '' : 's'} from your ${labelSource(memory.source)} export._`,
  );
  out.push('');
  for (const item of sortItems(items)) {
    out.push(renderItem(item));
    out.push('');
  }
  out.push('---');
  out.push(FOOTER);
  out.push('');
  return out.join('\n');
}

function labelSource(source: ExtractedMemory['source']): string {
  return source === 'chatgpt' ? 'ChatGPT' : 'Claude';
}

const FOOTER =
  '\n<sub>Generated locally by [memory-porter](https://github.com/Tempreon/memory-porter). ' +
  'Your data never left this machine. Edit these files freely — they are yours.</sub>';

function renderIndex(
  memory: ExtractedMemory,
  present: MemoryKind[],
): string {
  const out: string[] = [];
  out.push('# Your memory');
  out.push('');
  out.push(
    `This folder is a clean, human-readable copy of the memory **${labelSource(memory.source)}** ` +
      'held about you, extracted from your data export. Everything here lives on your machine. ' +
      'Read it, edit it, keep it, delete it — it is yours.',
  );
  out.push('');

  // Summary table.
  out.push('## What came through');
  out.push('');
  out.push('| Memory | Count |');
  out.push('| --- | ---: |');
  for (const kind of present) {
    out.push(`| ${KIND_FILES[kind].heading} | ${memory.stats.byKind[kind]} |`);
  }
  out.push(`| **Total** | **${memory.stats.totalItems}** |`);
  if (memory.stats.conversationsSeen !== undefined) {
    out.push('');
    out.push(
      `_Read from an export containing ${memory.stats.conversationsSeen} conversation${
        memory.stats.conversationsSeen === 1 ? '' : 's'
      }._`,
    );
  }
  out.push('');

  // Files.
  if (present.length) {
    out.push('## Files');
    out.push('');
    for (const kind of present) {
      out.push(
        `- [\`${KIND_FILES[kind].file}\`](${KIND_FILES[kind].file}) — ${KIND_FILES[kind].blurb}`,
      );
    }
    out.push('');
  }

  // Provenance / account.
  const provBits: string[] = [];
  provBits.push(`Source: **${labelSource(memory.source)}**`);
  if (memory.exportedAt) {
    const d = fmtDate(memory.exportedAt);
    if (d) provBits.push(`Export dated: ${d}`);
  }
  if (memory.account?.email) provBits.push(`Account: ${memory.account.email}`);
  out.push('## Provenance');
  out.push('');
  out.push(provBits.map((b) => `- ${b}`).join('\n'));
  out.push(`- Extracted by memory-porter v${memory.generatorVersion}`);
  out.push('');

  // Warnings — honesty about what we could not parse.
  if (memory.warnings.length) {
    out.push('## Notes & warnings');
    out.push('');
    out.push(
      'memory-porter is conservative: when in doubt it tells you rather than guessing.',
    );
    out.push('');
    for (const w of memory.warnings) out.push(`- ${w}`);
    out.push('');
  }

  out.push('---');
  out.push(FOOTER);
  out.push('');
  return out.join('\n');
}

/**
 * The default, human-first emitter. Produces a small folder of markdown:
 * an index README plus one file per kind of memory present.
 */
export class MarkdownEmitter implements Emitter {
  readonly format = 'markdown';

  emit(memory: ExtractedMemory): EmittedFile[] {
    const files: EmittedFile[] = [];

    const kinds: MemoryKind[] = [
      'saved_memory',
      'custom_instruction',
      'profile',
      'derived',
    ];
    const present = kinds.filter((k) =>
      memory.items.some((i) => i.kind === k),
    );

    files.push({ path: 'README.md', content: renderIndex(memory, present) });

    for (const kind of present) {
      const items = memory.items.filter((i) => i.kind === kind);
      files.push({
        path: KIND_FILES[kind].file,
        content: renderKindFile(memory, kind, items),
      });
    }

    return files;
  }
}
