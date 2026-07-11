# Renaming the project (one-step)

The working name is `memory-porter`. Picking a final name is a single action.

## Name shortlist (availability re-verified 2026-07-11)

| Name | npm | PyPI | GitHub | .com | Verdict |
| --- | --- | --- | --- | --- | --- |
| **memhaul** | free | free | free | unregistered | **clear — recommended** |
| **portamem** | free | free | free | unregistered | **clear — equal backup** |
| memvoy | free | free | free | parked ("coming soon") | mostly-clear (.com owned) |
| memtote | free | free | free | unregistered | mostly-clear (collides with `memote`, a Python CLI) |
| memory-porter | free | free | free | unregistered | clear — safe fallback (working name) |

Recommendation: **memhaul** (clean on every surface, on-theme). `portamem` is the equal backup.
`memvoy`/`memtote` are usable but carry a small residual collision.

## Do the rename

```sh
node scripts/rename.mjs memhaul     # replaces "memory-porter" everywhere in the repo
npm run typecheck && npm test && npm run build   # confirm nothing broke
git add -A && git commit -m "rename: memory-porter -> memhaul"
```

## The two steps a script can't do

1. **GitHub** — rename the repo and repoint your local remote:
   ```sh
   gh repo rename memhaul -R Tempreon/memory-porter
   git remote set-url origin https://github.com/Tempreon/memhaul.git
   git push
   ```
2. **npm** — nothing to do until you publish; the new name is what ships. (If you ever reserved the old
   name on npm, you don't need to unpublish — it was never published.)

That's it. The name flows through the CLI command, the package, all URLs, and the generated-file footer
automatically.
