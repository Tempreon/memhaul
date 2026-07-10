# ADR 0003 — Tempreon push: auth design (why v0.1 is dry-run only)

- Status: **Open — auth story not yet designed.** v0.1 ships the interface + dry-run; live push is off.
- Date: 2026-07-10

## Context

memory-porter's optional last step is `push`: send the parsed memory to a hosted memory service the
user chooses. Tempreon is the first (and, in v0.1, only) target. `push` is the **one** command allowed
to touch the network, and only on an explicit, non-dry-run run.

The blocker for a *live* push is not the payload — that's done and inspectable via `push --dry-run`
(`src/push/tempreon.ts`, `toPortableRecords()` produces a clean, vendor-neutral record shape). The
blocker is **auth**: there is no clean, documented way for a third-party open-source CLI to write
memory into a user's Tempreon account today.

Tempreon's surfaces are OAuth 2.1 at the app layer and a Streamable-HTTP MCP endpoint. Neither is
designed for "an untrusted CLI on a user's laptop obtains scoped write access to that user's account."
Inventing a token scheme now — before that story exists — would mean shipping something we'd have to
break, and asking users to paste long-lived credentials into a CLI, which is exactly the kind of thing
this tool's whole ethos argues against.

## Decision

**v0.1 ships the interface, the payload mapping, and `--dry-run`. The live network call is not wired.**
Selecting a real push errors with a pointer to this ADR. This keeps memory-porter's headline guarantee
literally true: **v0.1 makes no network calls at all.**

`PushTarget` (`src/push/types.ts`) is the seam. When the auth story lands, implementing live push is a
change inside `TempreonPushTarget.push()` and nowhere else.

## Options for the live auth story (for a later decision)

1. **Device-authorization OAuth (RFC 8628) — recommended shape.** CLI opens a browser to a Tempreon
   consent screen, user approves a *scoped, revocable* `memory:write` grant, CLI receives a short-lived
   token via the device-code flow. No secret is ever typed into the terminal; the user sees exactly what
   they're granting and can revoke it. This is the standard "CLI writes to my account" pattern (gh, aws
   sso) and fits Tempreon's existing OAuth 2.1 layer. **Requires Tempreon to add a device-code endpoint
   + a `memory:write` scope + a consent screen.**
2. **User-scoped personal access token.** User generates a token in Tempreon settings, sets
   `TEMPREON_TOKEN` in their env (never a flag — flags leak into shell history). Simplest to build; weaker
   because it's long-lived and copy-pasteable. Acceptable as an interim if scoped narrowly and revocable.
3. **Push *through* the user's existing MCP session.** If the user already has Tempreon connected as an
   MCP server, memory-porter could hand records to that trusted channel rather than authenticating
   itself. Cleanest trust story (no new credential), but couples the CLI to an MCP client being present.

## Recommendation

Target **option 1 (device-code OAuth with a scoped, revocable `memory:write`)** for the first live
release; allow **option 2 (env-var PAT)** as an interim for power users if option 1 slips. Do **not**
accept a token via a command-line flag. Whichever is chosen, `push` must: default to `--dry-run`, print
the exact records before sending, send only what the user parsed, and never transmit anything the
`audit` step flagged as a secret without an explicit override.

## Open questions for the Tempreon side

- Is there (or will there be) a device-code endpoint and a `memory:write` scope for third-party clients?
- What is the public, documented record shape for writing memory — does `toPortableRecords()` map cleanly
  onto it, or does Tempreon expect its own schema?
- Rate limits / batch semantics for a bulk first import (a real export can be hundreds of items)?
- Should `push` refuse to send items the audit flags as secrets/third-party PII by default?

Until these are answered, dry-run is the honest default.
