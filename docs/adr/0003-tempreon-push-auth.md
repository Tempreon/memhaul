# ADR 0003 — Tempreon push: auth design (why v0.1 is dry-run only)

- Status: **Accepted** (2026-07-11, fork F6 ratified). **Decision: v0.1 launches on the *web-import
  path*, not a CLI push. `push` stays dry-run and does nothing over the network; device-code OAuth
  (option 1 below) moves to the post-launch roadmap.** In place of a live push, the CLI points the user
  at the real Tempreon web signup/import flow (see "The web-import path" below and ADR context in the
  README). v0.1 therefore makes **no network calls at all**.
- Date: 2026-07-10 (documented) · 2026-07-11 (ratified F6)

## Context

memhaul's optional last step is `push`: send the parsed memory to a hosted memory service the
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
Selecting a real push errors with a pointer to this ADR. This keeps memhaul's headline guarantee
literally true: **v0.1 makes no network calls at all.**

`PushTarget` (`src/push/types.ts`) is the seam. When the auth story lands, implementing live push is a
change inside `TempreonPushTarget.push()` and nowhere else.

## The web-import path (v0.1 launch path — F6)

v0.1 does not push. Instead the CLI, after `parse`, and in the `push --dry-run` output, points the user
at Tempreon's real web flow. That flow today is **not one-click** and the copy must not imply otherwise:

1. Sign up at **https://tempreon.com** (free tier, no card). *(Verified 2026-07-11: `app.tempreon.com`
   now 308-redirects to the apex `tempreon.com`, so the apex is the canonical public link — not the
   `app.` subdomain.)*
2. Build a short "Core Imprint" (~15-min conversation) in the app.
3. Connect Tempreon as an MCP **Bridge** inside your own Claude or ChatGPT.
4. Run Tempreon's memory-import prompt in that bridged assistant — it stores each memory via the
   assistant's `remember` calls. (There is no server-side ingestion; the memory lands through your
   connected assistant.)

The CLI hint therefore says something like *"want this memory living across Claude and ChatGPT? →
https://tempreon.com"* — an invitation to the web flow, **never** a claim of a one-click import or an
automatic push from the CLI. The files memhaul wrote are what the user pastes/imports.

## Options for the live auth story (post-launch roadmap)

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
   MCP server, memhaul could hand records to that trusted channel rather than authenticating
   itself. Cleanest trust story (no new credential), but couples the CLI to an MCP client being present.

## Recommendation (post-launch)

When live CLI push is picked up after launch, target **option 1 (device-code OAuth with a scoped,
revocable `memory:write`)**; allow **option 2 (env-var PAT)** as an interim for power users if option 1
slips. Do **not**
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
