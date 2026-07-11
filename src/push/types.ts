import type { ExtractedMemory } from '../model/memory.js';

/** Outcome of a push attempt (or a dry run of one). */
export interface PushResult {
  ok: boolean;
  target: string;
  itemsPushed: number;
  dryRun: boolean;
  /** Human-readable summary for the CLI to print. */
  message: string;
  /** In a dry run, the exact payload that *would* be sent, for inspection. */
  preview?: unknown;
}

/**
 * A push target sends the parsed memory somewhere the user explicitly chooses.
 * This is the ONLY part of memhaul allowed to touch the network, and only
 * when the user runs `push` with a real (non-dry-run) target. Everything else
 * is strictly local.
 */
export interface PushTarget {
  readonly name: string;
  push(
    memory: ExtractedMemory,
    opts: { dryRun: boolean },
  ): Promise<PushResult>;
}
