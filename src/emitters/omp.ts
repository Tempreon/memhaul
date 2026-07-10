import type { ExtractedMemory } from '../model/memory.js';
import type { Emitter, EmittedFile } from './types.js';

/**
 * Open Memory Protocol emitter — INTENTIONALLY NOT WIRED in v0.1.
 *
 * The whole emitter layer exists so that aligning memory-porter's output with a
 * portable-memory standard is a drop-in: implement `emit()` here against the
 * canonical model and register it in the emitter registry. Nothing else moves.
 *
 * Whether we adopt OMP as our canonical format (vs. keeping our own and
 * treating OMP as one export target) is an open product decision — see
 * docs/adr/0002-open-memory-protocol.md. Until that's made, selecting this
 * format fails loudly and points at the ADR rather than shipping an
 * unratified schema that we might have to break later.
 */
export class OmpEmitter implements Emitter {
  readonly format = 'omp';

  emit(_memory: ExtractedMemory): EmittedFile[] {
    throw new Error(
      'The Open Memory Protocol emitter is not implemented in v0.1. ' +
        'The extension point is ready but the format mapping is an open decision — ' +
        'see docs/adr/0002-open-memory-protocol.md. ' +
        'Use `--format markdown` (default) or `--format json` for now.',
    );
  }
}
