/**
 * Public library API. `memhaul` is primarily a CLI, but the parse/emit/
 * audit pipeline is usable programmatically too. Everything is local and pure;
 * nothing here touches the network.
 */
export * from './model/memory.js';
export type { Archive } from './util/zip.js';
export { openArchive } from './util/zip.js';

export type { SourceAdapter, ExtractOptions, Detection } from './sources/types.js';
export {
  parseExport,
  detectSource,
  describeDetection,
  ADAPTERS,
  type ParseOptions,
  type ParseResult,
} from './sources/index.js';

export type { Emitter, EmittedFile } from './emitters/types.js';
export { getEmitter, AVAILABLE_FORMATS } from './emitters/index.js';

export { runAudit } from './audit/index.js';
export type { AuditReport, Finding, AuditCategory, Span } from './audit/types.js';
export { renderAuditReport, renderAuditCard } from './audit/report.js';

export type { PushTarget, PushResult } from './push/types.js';
export { TempreonPushTarget, toPortableRecords } from './push/tempreon.js';

export { VERSION } from './version.js';
