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
  content?: { type?: string; text?: string }[];
}
interface RawClaudeConversation {
  uuid?: string;
  name?: string;
  created_at?: string;
  updated_at?: string;
  chat_messages?: RawClaudeMessage[];
}
interface RawClaudeProject {
  uuid?: string;
  name?: string;
  description?: string;
  created_at?: string;
  prompt_template?: string; // Claude project "custom instructions"
}

const MEMORY_NOTE =
  "Claude's memory is NOT included in the data export. To bring it in: open Claude > Settings > " +
  'Capabilities > "View and edit your memory", copy it into a text file, and re-run with ' +
  '`--memories <file>`. (Or ask Claude in chat to write out its memory about you verbatim, and save ' +
  'that.) The export also does not include project instructions or knowledge. What follows was ' +
  'recovered from the export itself.';

function safeJson<T>(text: string | undefined, warnings: string[], label: string): T | undefined {
  if (text === undefined) return undefined;
  try {
    return JSON.parse(text) as T;
  } catch (err) {
    warnings.push(`Could not parse ${label}: ${(err as Error).message}`);
    return undefined;
  }
}

function messageText(m: RawClaudeMessage): string {
  if (typeof m.text === 'string' && m.text.trim()) return m.text.trim();
  if (Array.isArray(m.content)) {
    return m.content
      .map((b) => (b && typeof b.text === 'string' ? b.text : ''))
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
    const convPath = archive.find('conversations.json');
    if (convPath) {
      const head = archive.readText(convPath)?.slice(0, 4000) ?? '';
      if (head.includes('"chat_messages"')) score += 0.6;
      if (head.includes('"mapping"')) score -= 0.5; // that's ChatGPT
    }
    if (archive.find('projects.json')) score += 0.25;
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

    // --- Project custom instructions ---
    const projPath = archive.find('projects.json');
    const projects =
      safeJson<RawClaudeProject[]>(
        projPath ? archive.readText(projPath) : undefined,
        warnings,
        'projects.json',
      ) ?? [];
    for (const p of Array.isArray(projects) ? projects : []) {
      if (!p || typeof p !== 'object') continue;
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

    // --- Conversations: count + derived ---
    const convPath = archive.find('conversations.json');
    const conversations =
      safeJson<RawClaudeConversation[]>(
        convPath ? archive.readText(convPath) : undefined,
        warnings,
        'conversations.json',
      ) ?? [];
    const convList = Array.isArray(conversations) ? conversations : [];

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

    // --- Saved memories (paste) ---
    if (opts.savedMemoriesText && opts.savedMemoriesText.trim()) {
      for (const text of parseSavedMemoriesText(opts.savedMemoriesText)) items.push(savedItem(text));
    } else {
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
    id: makeItemId('claude', 'custom_instruction', text),
    text,
    kind: 'custom_instruction',
    source: 'claude',
    ...(createdAt ? { createdAt } : {}),
    provenance: { file },
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
