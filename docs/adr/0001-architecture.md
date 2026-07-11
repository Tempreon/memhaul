# ADR 0001 — Architecture: canonical model between source adapters and emitters

- Status: Accepted
- Date: 2026-07-10

## Context

memhaul parses AI-assistant data exports (ChatGPT, Claude, more later) into
clean, human-readable memory files. Two axes will keep growing independently:

- **Sources** we can read (ChatGPT today, Claude today, Gemini / others later).
- **Output formats** we can write (human markdown today, JSON today, an Open
  Memory Protocol / portable-standard format later — see ADR 0002).

If sources wrote formats directly, every `sources × formats` pair would be its own
code path, and adding either axis would touch the other. That is exactly the kind
of coupling that makes a small tool rot.

## Decision

Put a single **canonical memory model** (`src/model/memory.ts`) in the middle:

```
export  ->  SourceAdapter  ->  ExtractedMemory  ->  Emitter  ->  files
            (chatgpt.ts,       (the canonical      (markdown.ts,
             claude.ts)         model)              json.ts, omp.ts)
```

- A `SourceAdapter` only ever produces `ExtractedMemory`. It never knows about
  output formats.
- An `Emitter` only ever consumes `ExtractedMemory`. It never knows which product
  the data came from.
- The `audit` engine also reads only `ExtractedMemory`, so it works identically
  across every source.
- Emitters are **pure**: they return `EmittedFile[]` (path + content) and never
  touch the filesystem or the network. The CLI is the only writer. This keeps
  emitters trivially testable and keeps the "no surprise I/O" promise honest.

The canonical `MemoryItem` carries `{ id, text, kind, source, createdAt?,
updatedAt?, tags?, provenance, confidence? }`. `provenance` (which export file /
path each item came from) is mandatory so every emitted line is auditable back to
the source.

## Consequences

- Adding a new export source = one new `SourceAdapter`, registered once. No
  emitter or audit code changes.
- Adding a new output format (e.g. the OMP emitter in ADR 0002) = one new
  `Emitter`, registered once. No source or audit code changes.
- The `id` is a deterministic hash of normalized content, so re-running over the
  same export yields stable, diffable files.
- Cost: one extra hop and a model both sides must agree on. For a tool whose two
  axes are explicitly designed to grow, that is the cheap direction.
