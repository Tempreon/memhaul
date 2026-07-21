<!-- Thanks! Three checks before review: -->

- [ ] `npm run typecheck && npm test` are green, and parsing changes come with a synthetic
      fixture + test (`test/fixtures/` — invented data only, never real exports or memories)
- [ ] Nothing here breaks the core guarantees: `parse`/`audit` make zero network calls,
      secrets stay whole-line-withheld, output stays deterministic
- [ ] Everything in this PR (code, fixture text, comments) is written as public content

**What does this change, and why?**
