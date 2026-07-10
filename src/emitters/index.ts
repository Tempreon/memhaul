import { MarkdownEmitter } from './markdown.js';
import { JsonEmitter } from './json.js';
import { OmpEmitter } from './omp.js';
import type { Emitter } from './types.js';

/** Registry of output formats. Add a new emitter here to expose it via --format. */
const EMITTERS: Record<string, () => Emitter> = {
  markdown: () => new MarkdownEmitter(),
  json: () => new JsonEmitter(),
  omp: () => new OmpEmitter(),
};

export const AVAILABLE_FORMATS = Object.keys(EMITTERS);

export function getEmitter(format: string): Emitter {
  const factory = EMITTERS[format];
  if (!factory) {
    throw new Error(
      `Unknown format "${format}". Available formats: ${AVAILABLE_FORMATS.join(', ')}.`,
    );
  }
  return factory();
}

export type { Emitter, EmittedFile } from './types.js';
