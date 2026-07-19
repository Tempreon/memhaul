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
import { parseSavedMemoriesText, unixToIso } from './shared.js';

/** Minimal shapes we read from the export. Everything is optional / defensive. */
interface RawNode {
  id?: string;
  message?: {
    author?: { role?: string };
    create_time?: number | null;
    content?: { content_type?: string; parts?: unknown[]; text?: string };
    metadata?: {
      is_user_system_message?: boolean;
      user_context_message_data?: {
        about_user_message?: string;
        about_model_message?: string;
      };
    };
  } | null;
  parent?: string | null;
  children?: string[];
}
interface RawConversation {
  title?: string;
  create_time?: number;
  update_time?: number;
  current_node?: string;
  mapping?: Record<string, RawNode>;
}

/**
 * All conversation files in the export, chunk-tolerant. The in-app Settings
 * export ships a single `conversations.json`; the Privacy Portal path chunks
 * large histories into `conversations-000.json`, `conversations-001.json`, ….
 * Matching only the exact name would silently drop every chunk after the
 * first, so we glob the documented pattern and merge, in name order.
 */
function conversationFiles(archive: Archive): string[] {
  const chunk = /^conversations(?:-\d{1,5})?\.json$/i;
  return archive
    .files()
    .filter((p) => chunk.test(p.split('/').pop() ?? ''))
    .sort();
}

const MEMORY_MISSING_WARNING =
  'ChatGPT does NOT include your Saved Memories in its data export. To bring them in: ' +
  'open ChatGPT > Settings > Personalization > Memory > Manage memories, copy the list into a ' +
  'text file, and re-run with `--memories <file>`. (Or ask ChatGPT: "Print all of my saved ' +
  'memories verbatim as a list", and save that.) What follows was recovered from the export itself.';

function safeJson<T>(text: string | undefined, warnings: string[], label: string): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    warnings.push(`Could not parse ${label}: ${(err as Error).message}`);
    return undefined;
  }
}

/** Join a node's content into plain text, tolerating every content_type shape. */
function nodeText(node: RawNode): string {
  const c = node.message?.content;
  if (!c) return '';
  if (typeof c.text === 'string') return c.text; // code / execution_output
  if (Array.isArray(c.parts)) {
    return c.parts
      .map((p) => (typeof p === 'string' ? p : '')) // skip image/audio pointer dicts
      .filter(Boolean)
      .join('\n')
      .trim();
  }
  return '';
}

/** Walk current_node -> parent to root, return messages oldest-first. */
function linearThread(conv: RawConversation): RawNode[] {
  const mapping = conv.mapping ?? {};
  const nodes: RawNode[] = [];
  let cursor: string | null | undefined = conv.current_node;
  const guard = new Set<string>();
  while (cursor && mapping[cursor] && !guard.has(cursor)) {
    guard.add(cursor);
    const node: RawNode = mapping[cursor]!;
    if (node.message) nodes.push(node);
    cursor = node.parent ?? null;
  }
  return nodes.reverse();
}

const DERIVE_DIRECTIVE =
  /\b(?:please\s+)?(?:remember(?:\s+that)?|note\s+that|keep in mind(?:\s+that)?|for future reference|don'?t forget(?:\s+that)?|make a note(?:\s+that)?)\b[:,]?\s+(.{4,240})/i;

export class ChatGptAdapter implements SourceAdapter {
  readonly source = 'chatgpt' as const;

  detect(archive: Archive): number {
    const convPaths = conversationFiles(archive);
    if (!convPaths.length) return 0;
    // A bare conversations file is NOT enough on its own — it stays below the
    // detection threshold so an ambiguous archive falls through to "pass
    // --source" rather than silently being treated as ChatGPT.
    let score = 0.15;
    // Chunked conversations-NNN.json files only ever come from ChatGPT's
    // Privacy Portal export, so more than one chunk is itself a marker.
    if (convPaths.length > 1) score += 0.15;
    // ChatGPT-specific sibling files are positive markers.
    if (archive.find('user.json')) score += 0.15;
    if (archive.find('message_feedback.json') || archive.find('model_comparisons.json')) score += 0.15;
    // The decisive ChatGPT marker: conversations are objects with a "mapping" tree.
    const text = archive.readText(convPaths[0]!);
    if (text) {
      const head = text.slice(0, 4000);
      if (/^\s*\[/.test(head) && head.includes('"mapping"')) score += 0.4;
      else if (head.includes('"chat_messages"')) score -= 0.4; // looks like Claude
    }
    return Math.max(0, Math.min(1, score));
  }

  extract(archive: Archive, opts: ExtractOptions = {}): ExtractedMemory {
    const warnings: string[] = [];
    const items: MemoryItem[] = [];

    // --- Profile from user.json ---
    const userPath = archive.find('user.json');
    const user = safeJson<Record<string, unknown>>(
      userPath ? archive.readText(userPath) : undefined,
      warnings,
      'user.json',
    );
    const account: ExtractedMemory['account'] = {};
    if (user) {
      if (typeof user['email'] === 'string') account.email = user['email'];
      if (typeof user['name'] === 'string') account.name = user['name'];
      if (user['chatgpt_plus_user'] === true) account.plan = 'ChatGPT Plus';
      for (const [k, label] of [
        ['email', 'Email'],
        ['name', 'Name'],
        ['phone_number', 'Phone'],
      ] as const) {
        const v = user[k];
        if (typeof v === 'string' && v.trim()) {
          items.push(profileItem(`${label}: ${v.trim()}`, 'user.json', k));
        }
      }
    }

    // --- Conversations: custom instructions + count + derived ---
    // Merge every conversation file (single or Privacy-Portal chunks), in
    // name order, so nothing after chunk 000 is silently dropped.
    const convPaths = conversationFiles(archive);
    const convList: RawConversation[] = [];
    for (const path of convPaths) {
      const parsed = safeJson<RawConversation[]>(archive.readText(path), warnings, path);
      if (parsed === undefined) continue;
      if (!Array.isArray(parsed)) {
        warnings.push(`${path} was not an array; skipping it.`);
        continue;
      }
      convList.push(...parsed);
    }
    if (convPaths.length > 1) {
      warnings.push(
        `Merged ${convPaths.length} conversation files (a chunked Privacy Portal export).`,
      );
    }

    // Latest custom instructions across all conversations.
    let latestCi: { at: number; about_user?: string; about_model?: string; title?: string } | undefined;
    for (const conv of convList) {
      if (!conv || typeof conv !== 'object') continue;
      const mapping = conv.mapping ?? {};
      for (const node of Object.values(mapping)) {
        if (!node) continue;
        const meta = node.message?.metadata;
        if (meta?.is_user_system_message && meta.user_context_message_data) {
          const at = node.message?.create_time ?? conv.update_time ?? conv.create_time ?? 0;
          if (!latestCi || at > latestCi.at) {
            latestCi = {
              at,
              about_user: meta.user_context_message_data.about_user_message,
              about_model: meta.user_context_message_data.about_model_message,
              title: conv.title,
            };
          }
        }
      }
    }
    if (latestCi) {
      const iso = unixToIso(latestCi.at);
      const note = 'reconstructed from your chats; may be older than your current settings';
      if (latestCi.about_user?.trim()) {
        items.push(
          instructionItem(
            `What ChatGPT should know about you: ${latestCi.about_user.trim()}`,
            iso,
            note,
          ),
        );
      }
      if (latestCi.about_model?.trim()) {
        items.push(
          instructionItem(
            `How ChatGPT should respond: ${latestCi.about_model.trim()}`,
            iso,
            note,
          ),
        );
      }
    }

    // --- Saved memories (must be pasted; not in the export) ---
    if (opts.savedMemoriesText && opts.savedMemoriesText.trim()) {
      const lines = parseSavedMemoriesText(opts.savedMemoriesText);
      for (const text of lines) items.push(savedItem(text));
      if (!lines.length) {
        warnings.push('The --memories file was provided but no memory lines were found in it.');
      }
    } else {
      warnings.push(MEMORY_MISSING_WARNING);
    }

    // --- Derived candidates (opt-in) ---
    if (opts.includeDerived) {
      const seen = new Set<string>();
      for (const conv of convList) {
        if (!conv || typeof conv !== 'object') continue;
        for (const node of linearThread(conv)) {
          if (node.message?.author?.role !== 'user') continue;
          const m = nodeText(node).match(DERIVE_DIRECTIVE);
          if (m && m[1]) {
            const text = m[1].trim().replace(/\s+/g, ' ');
            if (seen.has(text.toLowerCase())) continue;
            seen.add(text.toLowerCase());
            items.push(
              derivedItem(text, unixToIso(node.message?.create_time), conv.title),
            );
          }
        }
      }
    }

    const deduped = dedupeItems(items);
    return {
      source: 'chatgpt',
      generatorVersion: VERSION,
      ...(Object.keys(account).length ? { account } : {}),
      items: deduped,
      warnings,
      stats: computeStats(deduped, convList.length),
    };
  }
}

// --- item constructors ---

function profileItem(text: string, file: string, path: string): MemoryItem {
  return {
    id: makeItemId('chatgpt', 'profile', text, path),
    text,
    kind: 'profile',
    source: 'chatgpt',
    provenance: { file, path },
  };
}

function instructionItem(text: string, createdAt: string | undefined, note: string): MemoryItem {
  return {
    id: makeItemId('chatgpt', 'custom_instruction', text),
    text,
    kind: 'custom_instruction',
    source: 'chatgpt',
    ...(createdAt ? { createdAt } : {}),
    provenance: { file: 'conversations.json', note },
  };
}

function savedItem(text: string): MemoryItem {
  return {
    id: makeItemId('chatgpt', 'saved_memory', text),
    text,
    kind: 'saved_memory',
    source: 'chatgpt',
    provenance: { file: '(pasted saved memories)', note: 'from Settings > Memory' },
  };
}

function derivedItem(text: string, createdAt: string | undefined, title?: string): MemoryItem {
  return {
    id: makeItemId('chatgpt', 'derived', text),
    text,
    kind: 'derived',
    source: 'chatgpt',
    ...(createdAt ? { createdAt } : {}),
    confidence: 0.4,
    provenance: {
      file: 'conversations.json',
      ...(title ? { path: title } : {}),
      note: 'inferred from a "remember that…" style message; verify before trusting',
    },
  };
}
