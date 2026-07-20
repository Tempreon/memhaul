# launch/

Public launch assets and the mechanical go-live checklist for memhaul.

## Demo assets

- `demo.gif` — the demo embedded at the top of the README (recorded against synthetic fixtures only).
- `demo.tape` — [VHS](https://github.com/charmbracelet/vhs) tape; re-record with `vhs launch/demo.tape` (run `npm run build` first).
- `demo.sh` — a shell replay of the storyboard beats, for recording without VHS.
- `demo-storyboard.md` — the shot list both recordings follow.

## Contact

- **General:** hello@memhaul.com
- **Security:** report privately via a GitHub security advisory, or security@memhaul.com. See [`../SECURITY.md`](../SECURITY.md).
- **Maintainer:** brandon@memhaul.com

## Launch-week checklist

- [ ] **301 redirect** `memhaul.com` → the repository (registrar).
- [ ] **Publish to npm:** add the `NPM_TOKEN` repository secret, then `git tag v0.1.0 && git push origin v0.1.0`.
- [ ] **Make the repository public.**
- [ ] **Enable private vulnerability reporting** (Settings → Security). Only available once the repo is public.
- [ ] **Enable branch protection on `main`** (only configurable once public): require the status checks
      `build-and-test (22)` and `build-and-test (24)`, require a linear history, and disallow force pushes.
- [ ] **After the npm publish:** remove the "Not on npm yet" note from the README quickstart so the
      `memhaul …` / `npx memhaul …` examples read true (issue #4).
