# ADR 0002 — Open Memory Protocol alignment (OPEN — owner's call)

- Status: **Open / deferred.** This ADR documents the mapping and the tradeoff. It does **not** decide.
- Date: 2026-07-10

## Context

memory-porter emits a small canonical memory model through a pluggable emitter layer
(ADR 0001). A natural question: should we align our output format with a portable-memory
*standard* and position as a reference implementation, or ship our own format and treat any
standard as one export target among several?

The candidate most often named is the **Open Memory Protocol (OMP)**. This ADR records what OMP
actually is as of mid-2026, a concrete field-level mapping from our model to it, and the honest
tradeoff — so the decision can be made deliberately, not by default.

## What OMP actually is (mid-2026)

- A **draft (v0.1), single-maintainer** spec (`SMJAI/open-memory-protocol`, Apache-2.0): a
  reference server, TS/Python SDKs, and an MCP adapter — all by the same author. ~dozens of
  stars, no external PRs, no foundation, no multi-vendor governance, **no independent adoption**
  (contemporary coverage lists OpenAI/Cursor/Copilot/Gemini as *pending*, i.e. not integrated).
  The repo's README badge ("spec-v0.4") and the spec doc ("v0.1 Draft") disagree — itself a
  maturity signal.
- **The name is contested.** At least three other efforts use "OMP"/"memory protocol"
  (`open-mem/omp`, Agent Memory Protocol, Universal Memory Protocol), and mem0's "OpenMemory" is a
  *product/server*, not a portability format (and is itself superseded by mem0's self-hosted server).
- **Verdict: there is no consensus, industry-blessed portable-memory standard right now.** OMP is
  the most *spec-shaped* candidate for file/interchange mapping; mem0 is the most *adopted* but is a
  store, not a format. Neither is safe to anchor the architecture on.

## OMP v0.1 memory object (the mapping target)

| Field | Type | Req | Notes |
|---|---|---|---|
| `id` | string | Yes | `mem_` + 16 alphanumerics |
| `content` | string | Yes | max 10,000 chars |
| `type` | enum | Yes | `episodic` \| `semantic` \| `procedural` (cognitive taxonomy) |
| `source` | object | Yes | `{ tool (req), session_id?, user_id?, timestamp (ISO, req) }` |
| `tags` | string[] | Yes | ≤20 tags, ≤50 chars each |
| `created_at` / `updated_at` | string | Yes | ISO-8601 UTC |
| `expires_at` | string \| null | Yes | required-nullable |
| `namespace` | string | No | ≤100 chars |
| `embedding` | number[] | No | vector (roadmap) |
| `metadata` | Record | No | ≤10 keys |

## Mapping: our canonical model → OMP

| Canonical | → OMP | Fidelity / gap |
|---|---|---|
| `id` | `id` | **Lossy** — OMP mandates `mem_`+16-alnum. Mint an OMP id; keep ours in `metadata.origin_id`. |
| `text` | `content` | Clean, but **10k cap** — need a truncate/split policy for long instructions. |
| `kind` (`saved_memory`/`custom_instruction`/`profile`/`derived`) | `type` | **Worst mismatch.** OMP `type` is *cognitive*; ours is *role/origin*. Emit `type: "semantic"`, carry real kind in `metadata.kind`. Lossy without the metadata escape hatch. |
| `source` | `source.tool` | Fits. Derive required `source.timestamp` from `createdAt`. |
| `createdAt` / `updatedAt` | `created_at` / `updated_at` | Clean. |
| `tags` | `tags` | Enforce ≤20 / ≤50. |
| `provenance {file,path}` | `metadata.provenance` | **No first-class provenance in OMP** — demoted to metadata. |
| `confidence` | `metadata.confidence` | **No confidence field** — metadata-only, not queryable. |
| — | `expires_at` | Emit `null` (we have no source). |
| — | `namespace`, `embedding` | Unused / omit. |

The four fields where a naive "OMP == our model" assumption silently loses fidelity: `kind`, `id`,
`confidence`, `provenance`.

## The tradeoff (owner's call)

- **Posture A — adopt OMP's schema as canonical / reference impl.** Forces a clean interface now; if
  a standard consolidates, we're early. But we'd anchor on a v0.1, single-maintainer, unadopted draft
  whose `type` taxonomy fights our `kind` and whose model demotes our `confidence`/`provenance` to
  metadata — so "conformance" is cosmetic while the real signal lives in `metadata`.
- **Posture B — ship our own format; keep the emitter seam; treat OMP/mem0 as export targets.** Zero
  dependency on an unsettled ecosystem; `kind`/`confidence`/`provenance` stay first-class. The
  interface work is the *same* work that makes an OMP emitter cheap later — so we get the "no rework"
  property without adopting anyone's draft. Cost: we're a fast-follower if a standard consolidates.

**The one-line tradeoff:** the portability insurance comes almost entirely from **the emitter seam,
not from which schema sits at the center.** Adopting OMP as canonical buys little today (nothing to
interoperate with) and costs taxonomy fidelity; documenting the mapping (this ADR) buys the
future-proofing at near-zero cost.

## Recommendation (informative, not binding)

Lean **Posture B** for v0.1 — which is also what we shipped: own markdown-first format, a format-agnostic
emitter layer, and an `OmpEmitter` stub (`src/emitters/omp.ts`) that fails loudly and points here.
Whether/when to implement that emitter, and whether to ever call ourselves an OMP reference
implementation, is the owner's decision. Revisit if/when a portable-memory standard shows real
multi-vendor adoption.

## Consequence for the code

The canonical model already carries an extension-friendly shape (`tags`, `provenance`, `confidence`,
optional timestamps). If we implement the OMP emitter, it lives entirely in `src/emitters/omp.ts` and
must (a) mint OMP ids while preserving `origin_id` in metadata, (b) map `kind → metadata.kind` with
`type: "semantic"`, (c) enforce the 10k/20-tag caps, and (d) label its output "best-effort OMP v0.x
mapping, not certified compatibility."
