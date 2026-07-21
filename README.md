# memhaul

**Turn your ChatGPT or Claude data export into clean, human-readable memory files you own.**

Local-first. MIT-licensed. Zero telemetry. One dependency. **No network calls** — your export never leaves your machine.

> Here's the thing nobody tells you: **ChatGPT's official data export still doesn't include your saved memories** — you copy them out of Settings by hand, and Gemini's the same (Saved Info never comes out through Google Takeout). **Claude now *does* export your memory**, and memhaul turns that raw `memories.json` into plain Markdown files you own. Either way, memhaul is the tool that should already exist — it pulls together everything the export *does* give you, lets you paste in whatever it *doesn't*, and turns the whole thing into files that are yours to keep, edit, or move.

![memhaul demo — parse a ChatGPT export into owned memory files, then audit them](launch/demo.gif)

---

## 30-second quickstart

> **Not on npm yet.** The examples below write `memhaul …` for readability. Until it's
> published, run it from source (see [Install / develop](#install--develop)): use `node dist/cli.js …`
> (or `npm start -- …`) in place of `memhaul`. Once published, `npx memhaul …` will work
> directly.

```console
$ memhaul parse chatgpt-export.zip
Detected a ChatGPT export (confidence 85%).

1 note(s):
  - ChatGPT does NOT include your Saved Memories in its data export. To bring them in: open
    ChatGPT > Settings > Personalization > Memory > Manage memories, copy the list into a text
    file, and re-run with --memories <file>.

Extracted 4 memory item(s) from your ChatGPT export (0 saved, 2 instructions, 2 profile).
Open memory/README.md to read them.
```

Right away it tells you the thing nobody else does: **your saved memories aren't in the export.** What
it *did* pull out is already clean Markdown:

```
memory/
├── README.md              ← index: what came through, from where
├── custom-instructions.md ← your standing instructions
└── profile.md             ← account facts from the export
```

Add your memories (next section) and you also get `saved-memories.md`; add `--include-derived` and you
get `derived-candidates.md`. Each memory is a plain bullet you can read, edit, or delete, with a note
on exactly where it came from:

```markdown
# Custom instructions

> Standing instructions and preferences you set for the assistant.

- What ChatGPT should know about you: I prefer TypeScript and I work at Acme.
  added 2024-03-09 — source: conversations.json
```

## Memory: Claude exports it now, ChatGPT still doesn't

**Claude** now includes your memory in the data export — a `memories.json` holding your account
memory, per-project memory, and structured memory files (each with its own path and timestamp).
memhaul reads it natively, so a plain `parse` already brings your memory through:

```console
$ memhaul parse claude-export.zip --claude
Extracted 24 memory item(s) from your Claude export (19 saved, 3 instructions, 2 profile).
```

**ChatGPT** ships your whole chat history but **not** your Saved Memories — those still live only in
**Settings → Personalization → Memory**. Copy that list into a text file and pass it in:

```console
$ memhaul parse chatgpt-export.zip --memories my-memories.txt
Extracted 15 memory item(s) from your ChatGPT export (11 saved, 2 instructions, 2 profile).
```

(Don't want to copy by hand? Ask the assistant *"Print all of my saved memories verbatim as a
list"* and save the reply.) The same `--memories` paste also covers **older Claude exports** that
predate `memories.json`; for those, Claude's memory lives in **Settings → Memory**. (Counts above are
illustrative — yours will differ.)

## See what your AI remembers about you — the `audit`

```console
$ memhaul audit chatgpt-export.zip --memories my-memories.txt --card
Audited 17 memory item(s): 6 stale, 1 contradictory, 6 sensitive, 4 third-party.
Wrote memory/audit-report.md
Wrote memory/audit-card.md
```

`audit` reads your memory locally and flags four things, with a plain-English reason for each:

- **Sensitive** — health, financial, credentials, precise location, and other special-category data.
  Secrets (API keys, passwords) are detected and **withheld**, never printed.
- **Third-party** — info about *other people* in your memory (a named family member, someone's phone,
  a minor's age). That's their data, sitting under your account.
- **Contradictions** — two memories that disagree ("lives in Austin" vs "lives in Denver").
- **Possibly stale** — old or time-relative facts ("currently training for a marathon") that drift.

It writes a full local `audit-report.md`, and — with `--card` — a **redacted `audit-card.md`** that
contains *no text from your memory*, only counts and generic examples, so you can safely share
"here's what my AI remembers about me" without leaking the actual values.

## Commands

```
memhaul parse <export>   Parse an export into memory files
memhaul audit <export>   Report stale / sensitive / contradictory / third-party items
memhaul push  <export>   Preview the portable records (v0.1 does not push — see below)
```

Useful flags: `--source chatgpt|claude|auto` (auto-detects by default), `--claude`, `--out <dir>`,
`--format markdown|json`, `--memories <file>`, `--include-derived`, `--dry-run`. Run
`memhaul help` for the full list.

## Your data stays yours

- **v0.1 makes no network calls at all** — not in `parse`, not in `audit`, not in `push`. No telemetry,
  no analytics, no uploads. You can confirm it: there's no `fetch`, no HTTP/socket client, no
  `node:http`/`net`/`dns` — `grep -rn "fetch(" src/` comes up empty, and the only `http` strings in the
  source are doc links and the Tempreon website URL in comments/hints.
- `push` does **not** push in v0.1 — it only previews the portable records that a future version could
  send, and points you at the web flow below (see [`docs/adr/0003`](docs/adr/0003-tempreon-push-auth.md)).
- Reads are non-destructive: your original export is never modified.
- One runtime dependency ([`fflate`](https://github.com/101arrowz/fflate), to unzip). That's the whole
  supply chain.

See [SECURITY.md](SECURITY.md) — and please handle your export like the sensitive file it is.

## Bring it into Tempreon (optional)

memhaul is a standalone tool — the files it writes are yours and it needs nothing else. If you
want that memory *living* inside Claude and ChatGPT (read back automatically, not just sitting in a
folder), that's what [Tempreon](https://tempreon.com/?utm_source=memhaul&utm_medium=referral) does. It's a web flow, not a one-click import and
not something this CLI does for you: you sign up (free), connect Tempreon inside your own assistant, and
bring your memory in there. memhaul itself sends nothing.

## An open format, on purpose

memhaul parses into a small **canonical memory model**, then emits it. Markdown is the default;
JSON is built in. Adding another output format (say, a portable-memory standard like the
[Open Memory Protocol](docs/adr/0002-open-memory-protocol.md)) is a single new emitter — the parsers
never change. The point is portability: your memory shouldn't be trapped in *anyone's* format,
including ours.

## Support & contact

- **Bugs & feature requests:** open a [GitHub issue](https://github.com/Tempreon/memhaul/issues).
  That's the primary support channel — please search existing issues first.
- **General questions:** hello@memhaul.com
- **Security / privacy:** see [SECURITY.md](SECURITY.md) (report privately, don't open a public issue).

## Install / develop

Requires Node 18+ to run (Node 22+ to develop — the test runner uses `node --test` glob support). Until it's on npm, run from source:

```console
git clone https://github.com/Tempreon/memhaul
cd memhaul
npm install
npm run build
node dist/cli.js parse chatgpt-export.zip
# or, without building:
npm start -- parse chatgpt-export.zip
```

```console
npm test          # run the test suite (synthetic fixtures only)
npm run typecheck # strict TypeScript check
```

See [CONTRIBUTING.md](CONTRIBUTING.md). All test fixtures are synthetic — **never commit real
personal data.**

## License

[MIT](LICENSE) © Briggs Ventures LLC

<sub>Built by the team behind [Tempreon](https://tempreon.com). memhaul is a standalone MIT tool and works completely on its own.</sub>
