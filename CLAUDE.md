# CLAUDE.md — memhaul agent stewardship charter

This repo is primarily maintained by AI agents operating on behalf of the maintainer. If you
are an agent working here, this file is your operating contract. Humans: everything below is
also just good contributor hygiene.

## What this is

memhaul is a standalone, local-first, MIT-licensed CLI that turns a ChatGPT or Claude data
export into human-readable memory files the user owns. It is complete on its own and must
always remain so.

## Inviolable commitments

These are public promises the tool has made. They are not editable conventions — changing any
of them requires the repository owner's explicit, recorded sign-off, never a routine PR:

1. **`parse` and `audit` make zero network calls.** No telemetry, no analytics, no uploads.
2. **`push` never sends anything without an explicit, unambiguous user action** (v0.1: it
   never sends anything at all — dry-run only).
3. **Printed URLs carry only constant strings** — never user data, ids, or anything varying.
4. **Secrets are never echoed** — the whole-line withhold contract in the audit/report layer.
5. **No real personal data enters this repo, ever.** Test fixtures are synthetic by policy.
   When verifying against real exports (maintainer machines only), report counts and shapes,
   never contents.
6. **The tool stays complete.** No feature is degraded to push anyone toward anything.

## Working conventions

- **Never push directly to `main`.** Branch → PR → CI green → merge. Rebase-merge; keep
  history linear.
- **Everything here is public or will be** — issues, PR bodies, commit messages, this file.
  Write accordingly: no internal tracker references, no private version numbers, no
  strategy notes.
- **Keep the README true.** If a claim stops matching the code (install status, guarantees,
  supported sources), fixing the mismatch is priority zero.
- **Deterministic tests only** — fixtures in, bytes out. `npm test` and `npm run typecheck`
  must be green before any merge.
- Adding an output format = one new emitter behind `src/emitters/`; parsers never change for
  a format (see `docs/adr/0002`).
- Export formats drift. When a parser bug is reported, first check whether the vendor's
  export format changed before assuming the code was always wrong — and fix by widening
  tolerance, not by chasing exact shapes.

## Maintenance standard

- Aim to acknowledge new issues within a week; an unanswered tracker signals abandonment,
  which is worse than a "not planned" answer.
- Dependency policy: the runtime dependency count is a feature. It is `fflate` and nothing
  else unless the owner signs off. Dev-dependency and CI updates are routine.
- Roadmap issues carry their own decision context (assessments, revisit triggers). Honor
  the recorded triggers instead of re-litigating or silently closing them.

## Dev quickstart

```console
npm install
npm run typecheck && npm test   # must both be green
npm run build                    # dist/cli.js
node dist/cli.js parse test/fixtures/chatgpt-export --memories test/fixtures/saved-memories.txt
```
