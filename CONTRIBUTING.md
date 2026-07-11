# Contributing

Thanks for looking. memory-porter is intentionally small and intends to stay that
way. The best contributions keep it simple, local, and trustworthy.

## Principles (please don't break these)

1. **Local-first, zero telemetry.** `parse` and `audit` must never make a network
   call. The only networked code path is `push`, and only on an explicit,
   non-dry-run invocation.
2. **Minimal dependencies.** One runtime dependency today (`fflate`). Adding a
   runtime dependency needs a real justification — a reviewer should be able to
   read what the tool does.
3. **Never commit real personal data.** All test fixtures are synthetic. See
   `test/fixtures/`.
4. **Be conservative, and say so.** When the parser or audit is unsure, it should
   emit a warning rather than guess. Honesty beats coverage.

## Adding an export source

Implement `SourceAdapter` (`src/sources/types.ts`) and register it. Add a
synthetic fixture under `test/fixtures/` and a test. Emitters and audit do not
change — that's the point of the architecture (see `docs/adr/0001-architecture.md`).

## Checking an adapter against a real export

Export formats drift. To diff a real export's actual shape against what the Claude
adapter assumes (field names / types / counts only — never your data, nothing
written):

```sh
npm run verify:claude -- /path/to/your-claude-export.zip
```

Never commit a real export; the `.gitignore` already excludes common export paths.

## Adding an output format

Implement `Emitter` (`src/emitters/types.ts`) and register it in
`src/emitters/index.ts`. Emitters must be pure (no fs / no network).

## Dev workflow

```sh
npm install
npm run typecheck
npm test
npm run build
```

Requires Node 20+ for development (the built CLI runs on Node 18+).

## Commit / PR conventions

- Keep PRs focused. One source, one format, or one fix at a time.
- Include or update a synthetic fixture + test for any parsing change.
- Run `npm run typecheck && npm test` before opening a PR.
