import type { ExtractedMemory } from '../model/memory.js';

/** A single file an emitter wants written, path relative to the output dir. */
export interface EmittedFile {
  path: string;
  content: string;
}

/**
 * An emitter turns the canonical model into output files. It is PURE — it
 * returns file contents and never touches the filesystem or the network. The
 * CLI is the only thing that writes to disk. That keeps emitters trivially
 * testable and keeps the "no surprise I/O" guarantee honest.
 *
 * To add a new output format (e.g. an Open Memory Protocol conformant emitter,
 * see docs/adr/0002), implement this interface. Nothing upstream changes.
 */
export interface Emitter {
  /** Stable identifier for the format, used by `--format`. */
  readonly format: string;
  emit(memory: ExtractedMemory): EmittedFile[];
}
