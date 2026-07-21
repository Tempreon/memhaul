import {
  computeStats,
  dedupeItems,
  makeItemId,
  type ExtractedMemory,
  type MemoryItem,
} from '../model/memory.js';
import { VERSION } from '../version.js';
import type { Archive } from '../util/zip.js';
import type { ExtractOptions, SourceAdapter } from './types.js';
import { parseSavedMemoriesText } from './shared.js';

interface RawClaudeMessage {
  uuid?: string;
  text?: string;
  sender?: string; // "human" | "assistant"
  created_at?: string;
  // Authoritative content. Normally an array of typed blocks
  // (text | thinking | tool_use | tool_result | voice_note); tolerated as a
  // plain string for older/variant exports.
  content?: { type?: string; text?: string }[] | string;
}
interface RawClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: RawClaudeMessage[];
}
/** Legacy single `projects.json` array entry (older exports). */
interface RawClaudeProject {
  uuid?: string;
  name?: string;
  description?: string;
  created_at?: string;
  prompt_template?: string; // Claude project "custom instructions"
}
/** One `projects/<uuid>.json` file (2026+ exports — replaced projects.json). */
interface RawClaudeProjectFile {
  uuid?: string;
  name?: string;
  description?: string;
  created_at?: string;
  prompt_template?: string;
  docs?: { uuid?: string; filename?: string; content?: string; created_at?: string }[];
}
/** One structured memory file inside `memories.json` (real path + timestamp). */
interface RawMemoryFile {
  path?: string;
  content?: string;
  updated_at?: string;
}
/** One account's entry in `memories.json` (Claude's exported memory store). */
interface RawMemoriesEntry {
  account_uuid?: string;
  /** Account-level memory document — sectioned markdown. */
  conversations_memory?: string;
  /** Per-project memory, keyed by project uuid. */
  project_memories?: Record<string, string>;
  /** Structured per-file memory. */
  memory_files?: RawMemoryFile[];
}

// Older Claude exports (pre-memory-in-export) carry no memories.json. This note
// only fires when we found no memory in the export AND none was pasted — it tells
// the user their export predates the change and how to bring memory in by hand.
const MEMORY_NOTE =
  "This export has no memories.json, so it predates Claude adding your memory to the export " +
  '(newer exports include it automatically). To bring your Claude memory in from this one: open ' +
  'Claude > Settings > Memory, copy it into a text file, and re-run with `--memories <file>`. ' +
  '(Or ask Claude in chat to write out its memory about you verbatim, and save that.)';

function safeJson<T>(text: string | undefined, warnings: string[], label: string): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    warnings.push(`Could not parse ${label}: ${(err as Error).message}`);
    return undefined;
  }
}

function baseName(path: string): string {
  return path.split('/').pop() ?? path;
}

const CONV_FILE_RE = /^conversations(?:-\d{1,5})?\.json$/i;
/** Every conversation file, chunk- and batch-tolerant, in name order. */
function conversationFiles(archive: Archive): string[] {
  return archive.files().filter((p) => CONV_FILE_RE.test(baseName(p))).sort();
}
/** Every memories.json (one per batch of a multi-batch export), in name order. */
function memoriesFiles(archive: Archive): string[] {
  return archive.files().filter((p) => baseName(p).toLowerCase() === 'memories.json').sort();
}
const PROJECT_FILE_RE = /(?:^|\/)projects\/[^/]+\.json$/i;
/** Every per-project `projects/<uuid>.json` file, in name order. */
function projectFiles(archive: Archive): string[] {
  return archive.files().filter((p) => PROJECT_FILE_RE.test(p)).sort();
}

/** Keep a timestamp string only if it parses as a date; preserve its precision. */
function isoOrUndef(v: unknown): string | undefined {
  if (typeof v !== 'string' || !v.trim()) return undefined;
  return Number.isNaN(new Date(v).getTime()) ? undefined : v;
}

function messageText(m: RawClaudeMessage): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();
  if (typeof m.content === 'string') return m.content.trim();
  if (Array.isArray(m.content)) {
    return m.content
      .map((b) => (b && typeof b.text === 'string' ? b.text : '')) // text/voice_note blocks; skips thinking/tool_*
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

const DERIVE_DIRECTIVE =
  /\b(?:please\s+)?(?:remember(?:\s+that)?|note\s+that|keep in mind(?:\s+that)?|for future reference|don'?t forget(?:\s+that)?|make a note(?:\s+that)?)\b[:,]?\s+(.{4,240})/i;

export class ClaudeAdapter implements SourceAdapter {
  readonly source = 'claude' as const;

  detect(archive: Archive): number {
    let score = 0;
    const convPath = conversationFiles(archive)[0];
    if (convPath) {
      const head = archive.readText(convPath)?.slice(0, 4000) ?? '';
      if (head.includes('"chat_messages"')) score += 0.6;
      if (head.includes('"mapping"')) score -= 0.5; // that's ChatGPT
    }
    // memories.json and the per-project projects/ directory are Claude-only
    // markers on current exports; projects.json is the legacy single-file form.
    if (archive.find('memories.json')) score += 0.2;
    if (archive.find('projects.json') || projectFiles(archive).length) score += 0.25;
    if (archive.find('users.json')) score += 0.15;
    return Math.max(0, Math.min(1, score));
  }

  extract(archive: Archive, opts: ExtractOptions = {}): ExtractedMemory {
    const warnings: string[] = [];
    const items: MemoryItem[] = [];

    // --- Profile from users.json ---
    const usersPath = archive.find('users.json');
    const users = safeJson<Record<string, unknown> | Record<string, unknown>[]>(
      usersPath ? archive.readText(usersPath) : undefined,
      warnings,
      'users.json',
    );
    const user = Array.isArray(users) ? users[0] : users;
    const account: ExtractedMemory['account'] = {};
    if (user && typeof user === 'object') {
      const email = (user as Record<string, unknown>)['email_address'] ?? (user as Record<string, unknown>)['email'];
      const name = (user as Record<string, unknown>)['full_name'] ?? (user as Record<string, unknown>)['name'];
      if (typeof email === 'string') {
        account.email = email;
        items.push(profileItem(`Email: ${email}`, 'users.json', 'email_address'));
      }
      if (typeof name === 'string') {
        account.name = name;
        items.push(profileItem(`Name: ${name}`, 'users.json', 'full_name'));
      }
    }

    // --- Projects: names (to join project memory) + custom instructions ---
    // uuid -> display name, populated from both the legacy projects.json array
    // and the newer per-project projects/<uuid>.json files.
    const projectNames = new Map<string, string>();

    const legacyProjects =
      safeJson<RawClaudeProject[]>(
        archive.find('projects.json') ? archive.readText(archive.find('projects.json')!) : undefined,
        warnings,
        'projects.json',
      ) ?? [];
    for (const p of Array.isArray(legacyProjects) ? legacyProjects : []) {
      if (!p || typeof p !== 'object') continue;
      if (typeof p.uuid === 'string' && typeof p.name === 'string') projectNames.set(p.uuid, p.name);
      if (typeof p.prompt_template === 'string' && p.prompt_template.trim()) {
        items.push(
          instructionItem(
            `Project "${p.name ?? 'Untitled'}" instructions: ${p.prompt_template.trim()}`,
            p.created_at,
            'projects.json',
          ),
        );
      }
    }

    for (const path of projectFiles(archive)) {
      const proj = safeJson<RawClaudeProjectFile>(archive.readText(path), warnings, path);
      if (!proj || typeof proj !== 'object') continue;
      if (typeof proj.uuid === 'string' && typeof proj.name === 'string') projectNames.set(proj.uuid, proj.name);
      if (typeof proj.prompt_template === 'string' && proj.prompt_template.trim()) {
        items.push(
          instructionItem(
            `Project "${proj.name ?? 'Untitled'}" instructions: ${proj.prompt_template.trim()}`,
            proj.created_at,
            path,
          ),
        );
      }
      // `docs` (project knowledge files) are deliberately not emitted as memory:
      // they can be large and are project material, not memory about the user.
      // The universal-sweep fallback (issue #13) is the right home for them.
    }

    // --- Native memory store from memories.json (2026+ exports) ---
    const memPaths = memoriesFiles(archive);
    let nativeMemoryItems = 0;
    for (const memPath of memPaths) {
      const parsed = safeJson<RawMemoriesEntry[] | RawMemoriesEntry>(
        archive.readText(memPath),
        warnings,
        memPath,
      );
      const entries = Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;

        // Account-level memory document: sectioned markdown. Split it through the
        // shared paste parser so #12's section-tolerance improves this path too,
        // instead of growing a second, divergent splitter here.
        if (typeof entry.conversations_memory === 'string' && entry.conversations_memory.trim()) {
          for (const text of parseSavedMemoriesText(entry.conversations_memory)) {
            items.push(nativeSavedItem(text, memPath, 'account memory'));
            nativeMemoryItems++;
          }
        }

        // Structured per-file memory — real paths + timestamps, ideal provenance.
        for (const f of entry.memory_files ?? []) {
          if (!f || typeof f.content !== 'string' || !f.content.trim()) continue;
          items.push(
            nativeSavedItem(f.content.trim(), memPath, (f.path ?? '').trim() || 'memory file', isoOrUndef(f.updated_at)),
          );
          nativeMemoryItems++;
        }

        // Per-project memory, joined to the project's name where we have it.
        const pm = entry.project_memories;
        if (pm && typeof pm === 'object' && !Array.isArray(pm)) {
          for (const [uuid, value] of Object.entries(pm)) {
            if (typeof value !== 'string' || !value.trim()) continue;
            const name = projectNames.get(uuid);
            const label = name ? `project: ${name}` : `project ${uuid}`;
            for (const text of parseSavedMemoriesText(value)) {
              items.push(nativeSavedItem(text, memPath, label));
              nativeMemoryItems++;
            }
          }
        }
      }
    }
    if (memPaths.length > 1) {
      warnings.push(`Merged ${memPaths.length} memories.json files (a multi-batch export).`);
    }

    // --- Conversations: count + derived (chunk- and batch-tolerant) ---
    const convPaths = conversationFiles(archive);
    const convList: RawClaudeConversation[] = [];
    for (const path of convPaths) {
      const parsed = safeJson<RawClaudeConversation[]>(archive.readText(path), warnings, path);
      if (parsed === undefined) continue;
      if (!Array.isArray(parsed)) {
        warnings.push(`${path} was not an array; skipping it.`);
        continue;
      }
      convList.push(...parsed);
    }
    if (convPaths.length > 1) {
      warnings.push(`Merged ${convPaths.length} conversation files (a chunked or multi-batch export).`);
    }

    if (opts.includeDerived) {
      const seen = new Set<string>();
      for (const conv of convList) {
        if (!conv || typeof conv !== 'object') continue;
        for (const m of conv.chat_messages ?? []) {
          if (!m) continue;
          if (m.sender !== 'human') continue;
          const match = messageText(m).match(DERIVE_DIRECTIVE);
          if (match && match[1]) {
            const text = match[1].trim().replace(/\s+/g, ' ');
            if (seen.has(text.toLowerCase())) continue;
            seen.add(text.toLowerCase());
            items.push(derivedItem(text, m.created_at, conv.name));
          }
        }
      }
    }

    // --- Saved memories (paste) — additive; supplements or stands in for the
    // native store (older exports, or a fresher hand copy). Warn only when we
    // ended up with no memory from anywhere. ---
    const pasted = opts.savedMemoriesText?.trim() ? parseSavedMemoriesText(opts.savedMemoriesText) : [];
    for (const text of pasted) items.push(savedItem(text));
    if (opts.savedMemoriesText?.trim() && !pasted.length) {
      warnings.push('The --memories file was provided but no memory lines were found in it.');
    }
    if (nativeMemoryItems === 0 && !pasted.length) {
      warnings.push(MEMORY_NOTE);
    }

    const deduped = dedupeItems(items);
    return {
      source: 'claude',
      generatorVersion: VERSION,
      ...(Object.keys(account).length ? { account } : {}),
      items: deduped,
      warnings,
      stats: computeStats(deduped, convList.length),
    };
  }
}

function profileItem(text: string, file: string, path: string): MemoryItem {
  return {
    id: makeItemId('claude', 'profile', text, path),
    text,
    kind: 'profile',
    source: 'claude',
    provenance: { file, path },
  };
}
function instructionItem(text: string, createdAt: string | undefined, file: string): MemoryItem {
  return {
    id: makeItemId('claude', 'custom_instruction', text, file),
    text,
    kind: 'custom_instruction',
    source: 'claude',
    ...(createdAt ? { createdAt } : {}),
    provenance: { file },
  };
}
/** A memory item read straight from Claude's exported memory store. */
function nativeSavedItem(
  text: string,
  file: string,
  path: string,
  updatedAt?: string,
): MemoryItem {
  return {
    id: makeItemId('claude', 'saved_memory', text, path),
    text,
    kind: 'saved_memory',
    source: 'claude',
    ...(updatedAt ? { updatedAt } : {}),
    provenance: { file, path, note: 'from your Claude memory, included in the export' },
  };
}
function savedItem(text: string): MemoryItem {
  return {
    id: makeItemId('claude', 'saved_memory', text),
    text,
    kind: 'saved_memory',
    source: 'claude',
    provenance: { file: '(pasted saved memories)' },
  };
}
function derivedItem(text: string, createdAt: string | undefined, title?: string): MemoryItem {
  return {
    id: makeItemId('claude', 'derived', text),
    text,
    kind: 'derived',
    source: 'claude',
    ...(createdAt ? { createdAt } : {}),
    confidence: 0.4,
    provenance: {
      file: 'conversations.json',
      ...(title ? { path: title } : {}),
      note: 'inferred from a "remember that…" style message; verify before trusting',
    },
  };
}
