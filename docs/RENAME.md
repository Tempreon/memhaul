# Renaming the project

The project was renamed **`memory-porter` → `memhaul`** on 2026-07-11 (memhaul.com and the
`@memhaul.com` inboxes are the project's own). This doc is retained in case it's ever renamed again.

## One-step rename

`scripts/rename.mjs` replaces every literal occurrence of the current name (`memhaul`) with a new one
across all tracked text files (package name, `bin`, URLs, docs, the generated-file footer). It skips
itself, `node_modules`, `dist`, and binary/extension-less files.

```sh
node scripts/rename.mjs <new-name>                 # in-repo rename
npm run typecheck && npm test && npm run build     # confirm nothing broke
git add -A && git commit -m "rename: memhaul -> <new-name>"
```

`<new-name>` must be a valid npm/GitHub name: lowercase letters, digits, hyphens; no leading hyphen.

## The two steps the script can't do

1. **GitHub** — rename the repo and repoint the local remote:
   ```sh
   gh repo rename <new-name> -R Tempreon/memhaul
   git remote set-url origin https://github.com/Tempreon/<new-name>.git
   git push
   ```
2. **npm** — nothing until you publish; the new name is what ships.

The name flows through the CLI command, the package, all URLs, and the generated-file footer
automatically.
