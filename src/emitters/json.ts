import type { ExtractedMemory } from '../model/memory.js';
import type { Emitter, EmittedFile } from './types.js';

/**
 * Emits the canonical model verbatim as a single pretty-printed JSON file.
 * Useful for piping into other tools and for anyone who wants the structured
 * form rather than prose. Doubles as proof that the model is the real
 * interface: markdown and json are just two views of the same extraction.
 */
export class JsonEmitter implements Emitter {
  readonly format = 'json';

  emit(memory: ExtractedMemory): EmittedFile[] {
    return [
      { path: 'memory.json', content: JSON.stringify(memory, null, 2) + '\n' },
    ];
  }
}
