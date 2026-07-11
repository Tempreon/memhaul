# memory-porter

**Turn your ChatGPT or Claude data export into clean, human-readable memory files you own.**

Local-first. MIT-licensed. Zero telemetry. One dependency. **No network calls** — your export never leaves your machine.

> Here's the thing nobody tells you: **ChatGPT's official data export doesn't include your saved memories.** You have to copy them out of Settings by hand. Claude's the same. memory-porter is the tool that should already exist — it pulls together everything the export *does* give you, lets you paste in the memories it *doesn't*, and turns the whole thing into plain Markdown files that are yours to keep, edit, or move.

---

## 30-second quickstart

> **Not on npm yet.** The examples below write `memory-porter …` for readability. Until it's
> published, run it from source (see [Install / develop](#install--develop)): use `node dist/cli.js …`
> (or `npm start -- …`) in place of `memory-porter`. Once published, `npx memory-porter …` will work
> directly.

```console
$ memory-porter parse chatgpt-export.zip
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

## The memories ChatGPT/Claude won't export

ChatGPT's export ships your whole chat history but **not** your Saved Memories — those live only in
**Settings → Personalization → Memory**. To bring them in, copy that list into a text file and:

```console
$ memory-porter parse chatgpt-export.zip --memories my-memories.txt
Extracted 15 memory item(s) from your ChatGPT export (11 saved, 2 instructions, 2 profile).
```

(Don't want to copy by hand? Ask ChatGPT *"Print all of my saved memories verbatim as a list"* and
save the reply.) Claude is the same story — its memory lives in **Settings → Capabilities → "View and
edit your memory."**

## See what your AI remembers about you — the `audit`

```console
$ memory-porter audit chatgpt-export.zip --memories my-memories.txt --card
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
memory-porter parse <export>   Parse an export into memory files
memory-porter audit <export>   Report stale / sensitive / contradictory / third-party items
memory-porter push  <export>   Preview the portable records (v0.1 does not push — see below)
```

Useful flags: `--source chatgpt|claude|auto` (auto-detects by default), `--claude`, `--out <dir>`,
`--format markdown|json`, `--memories <file>`, `--include-derived`, `--dry-run`. Run
`memory-porter help` for the full list.

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

memory-porter is a standalone tool — the files it writes are yours and it needs nothing else. If you
want that memory *living* inside Claude and ChatGPT (read back automatically, not just sitting in a
folder), that's what [Tempreon](https://tempreon.com) does. It's a web flow, not a one-click import and
not something this CLI does for you: you sign up (free), connect Tempreon inside your own assistant, and
bring your memory in there. memory-porter itself sends nothing.

## An open format, on purpose

memory-porter parses into a small **canonical memory model**, then emits it. Markdown is the default;
JSON is built in. Adding another output format (say, a portable-memory standard like the
[Open Memory Protocol](docs/adr/0002-open-memory-protocol.md)) is a single new emitter — the parsers
never change. The point is portability: your memory shouldn't be trapped in *anyone's* format,
including ours.

## Install / develop

Requires Node 18+ to run (Node 20+ to develop). Until it's on npm, run from source:

```console
git clone https://github.com/Tempreon/memory-porter
cd memory-porter
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
