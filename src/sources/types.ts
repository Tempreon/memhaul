import type { ExtractedMemory, SourceType } from '../model/memory.js';
import type { Archive } from '../util/zip.js';

/** Options that influence how much an adapter extracts. */
export interface ExtractOptions {
  /**
   * Include `derived` memory candidates inferred from conversation content.
   * Off by default: these are guesses, not things the platform stored, so the
   * user opts in explicitly (`--include-derived`).
   */
  includeDerived?: boolean;
  /**
   * Raw text of the user's saved memories, pasted from a file. Needed for
   * ChatGPT, whose export does NOT contain the saved-memory store — the user
   * copies it from Settings > Personalization > Memory (or a "print my
   * memories" prompt) into a text file and passes `--memories <file>`. Also the
   * fallback for older Claude exports predating memories.json. Where a source
   * already includes memory in the export, this is additive (deduped), not
   * ignored — a fresher hand copy can supplement it.
   */
  savedMemoriesText?: string;
  /**
   * Raw text of the user's custom instructions, pasted from a file. Newer
   * ChatGPT exports no longer embed custom instructions in conversation
   * metadata, so the user copies them from Settings > Personalization > Custom
   * instructions into a text file and passes `--instructions <file>`. Additive
   * to anything the metadata path still recovers from older exports.
   */
  customInstructionsText?: string;
}

/**
 * A source adapter knows how to recognize and parse one product's data export
 * into the canonical model. ChatGPT and Claude each get one. Adding a third
 * export source (Gemini, a note-taking app, ...) means writing one of these
 * and registering it — emitters and the audit engine don't change.
 */
export interface SourceAdapter {
  readonly source: SourceType;
  /**
   * How strongly this archive looks like this source's export, 0..1. Used for
   * auto-detection when the user doesn't pass `--source`. Should be cheap:
   * look at filenames and maybe peek at one file's shape, don't parse fully.
   */
  detect(archive: Archive): number;
  /** Fully parse the archive into the canonical model. */
  extract(archive: Archive, opts?: ExtractOptions): ExtractedMemory;
}

/** Result of auto-detecting which source an archive came from. */
export interface Detection {
  source: SourceType | undefined;
  confidence: number;
  /** Per-adapter scores, for transparency in --verbose / errors. */
  scores: Record<string, number>;
}
