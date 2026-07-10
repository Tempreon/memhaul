import type { ExtractedMemory, SourceType } from '../model/memory.js';
import type { Archive } from '../util/zip.js';
import { ChatGptAdapter } from './chatgpt.js';
import { ClaudeAdapter } from './claude.js';
import type { Detection, ExtractOptions, SourceAdapter } from './types.js';

/** All registered source adapters. Register a new source here — nothing else changes. */
const ADAPTERS: SourceAdapter[] = [new ChatGptAdapter(), new ClaudeAdapter()];

const DETECT_THRESHOLD = 0.3;

/** Score every adapter against the archive and pick the strongest. */
export function detectSource(archive: Archive): Detection {
  const scores: Record<string, number> = {};
  let source: SourceType | undefined;
  let confidence = 0;
  for (const a of ADAPTERS) {
    const s = a.detect(archive);
    scores[a.source] = Math.round(s * 100) / 100;
    if (s > confidence) {
      confidence = s;
      source = a.source;
    }
  }
  return { source: confidence >= DETECT_THRESHOLD ? source : undefined, confidence, scores };
}

export interface ParseResult {
  memory: ExtractedMemory;
  detection: Detection;
}

export interface ParseOptions extends ExtractOptions {
  /** Force a source instead of auto-detecting. */
  source?: SourceType;
}

/** Open an archive's memory: detect (or use the forced source) and extract. */
export function parseExport(archive: Archive, opts: ParseOptions = {}): ParseResult {
  const detection = detectSource(archive);
  const chosen = opts.source ?? detection.source;
  if (!chosen) {
    throw new Error(
      "Couldn't tell whether this is a ChatGPT or Claude export " +
        `(scores: ${JSON.stringify(detection.scores)}). ` +
        'Pass --source chatgpt or --source claude (or --claude).',
    );
  }
  const adapter = ADAPTERS.find((a) => a.source === chosen);
  if (!adapter) throw new Error(`No adapter registered for source "${chosen}".`);
  return { memory: adapter.extract(archive, opts), detection };
}

/** One-line, human-facing detection summary for the CLI. */
export function describeDetection(d: Detection): string {
  if (!d.source) {
    return `Could not confidently auto-detect the export type (scores: ${JSON.stringify(d.scores)}).`;
  }
  const label = d.source === 'chatgpt' ? 'ChatGPT' : 'Claude';
  return `Detected a ${label} export (confidence ${Math.round(d.confidence * 100)}%).`;
}

export { ADAPTERS };
