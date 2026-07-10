# ADR 0004 — The audit rubric: deterministic, explainable, honest about limits

- Status: Accepted
- Date: 2026-07-10

## Context

`audit` flags four kinds of problems in a user's memory: **stale**, **contradictory**, **sensitive**,
and **third-party PII**. This runs over the most sensitive file a person owns. Three constraints
follow directly:

1. It must run **100% locally** — no network, no model calls. (Sending memory to a classifier to find
   sensitive data would defeat the purpose.)
2. It must be **reproducible** — the same input yields byte-identical findings.
3. Every finding must carry a **plain-English "why"** the user can judge.

## Decision

A **deterministic, no-ML rubric**: regex + small keyword tables + a couple of arithmetic helpers.
No scoring model — a rule matches or it doesn't. `now` is injected (not read from the clock) so audits
are reproducible and testable. Findings sort deterministically (by item id, then severity, then
subtype). Implementation: `src/audit/rubric.ts`.

- **STALE** — three rules, most-specific first: *age/grade drift* (a stated age/grade in an old record),
  *time-relative wording* ("currently", "planning to"), and *pure age* (old with no update). A
  durable-fact suppression list (allergies, blood type, birthday, citizenship…) prevents flagging
  lifelong facts as stale just because the record is old.
- **CONTRADICTORY** — extract simple `{subject, slot, value, polarity}` facts (location, employer, role,
  marital, age, preference), then flag same-slot disagreements (negation, or mutually-exclusive values).
  An age time-drift tie-break turns "was 6, now 8, two years apart" into a *supersede*, not a conflict.
- **SENSITIVE** — per-subtype keyword/regex families: health, financial, precise location,
  orientation/religion/politics, legal, and **secrets** (labeled secrets, vendor-shaped API keys,
  SSNs, and Luhn-checked card numbers). Secret values are **never echoed** — not in findings, not in the
  report, not in the card.
- **THIRD-PARTY PII** — a capitalized name near a relationship/contact/health/minor term, excluding the
  owner (name/email read from the export account). Subtypes: relationship, third-party-health, contact,
  minor.

The shareable **card** (`audit --card`) is safe by construction: it contains **no text from the user's
memory** — only per-category counts, subtype breakdowns, and fixed generic examples. (We deliberately
chose counts-only over redacted-real-examples: getting surgical span-masking exactly right is
error-prone, and a leak here is the worst-case failure for a privacy tool. Redacted real examples are a
possible future addition, not v0.1.) The full local `audit-report.md` shows real values (the user's own
data, on the user's machine) but still masks credentials.

## Honest limits (documented on purpose, surfaced in `--help` and the report)

This is a heuristic. It is biased toward **few false alarms over total recall** — it would rather miss a
problem than cry wolf.

- **No coreference / world knowledge.** "my sister" and "Sarah" aren't linked; "NYC" ≠ "New York City";
  "Google" ≠ "Alphabet". These are missed (false negatives).
- **Contradictions are "needs review", never "wrong".** Two homes, two jobs, or "TypeScript for
  frontend + Python for data" can legitimately trip the single-value assumption. Findings say "one is
  likely stale or wrong", not "this is wrong".
- **Coverage is intentionally narrow.** Only items that produce a structured fact triple are compared;
  the ~8 extractors miss a lot. That's the deliberate explainability/recall trade.
- **Name detection is a capitalization heuristic** with a finite stoplist — it misses lowercase names
  and can over-trigger on capitalized non-names. Without a configured owner name it runs conservatively.

## Consequences

- The rubric is unit-tested against synthetic fixtures with a fixed `now`, including a
  determinism check and a "the card leaks no raw text" check.
- Improving recall means adding rules/keywords — never adding a network call or a model. That invariant
  is the product.
- We invite contributors to sharpen the heuristics (see the "specific ask" in the launch materials):
  what counts as sensitive is exactly the kind of judgment a community improves.
