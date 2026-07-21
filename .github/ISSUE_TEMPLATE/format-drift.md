---
name: "Format drift report"
about: "An export parsed weirdly, incompletely, or not at all — the vendor probably changed the format"
title: "[drift] "
labels: format-drift
---

Export formats change constantly — these reports are how memhaul keeps up. Thank you.

**Rule one: shapes, never contents.** Paste file *names*, field *names*, counts, and error
messages. Never paste conversation text, memory items, or anything personal from your export.

**Which source?** (ChatGPT / Claude / other:)

**Roughly when did you request the export?** (month/year is enough)

**What happened?** (detection failed / crashed / items missing / warning looked wrong)

**File list of the archive** (e.g. `unzip -l export.zip` — file names only):

```
paste here
```

**CLI output** (the summary/warnings memhaul printed — these are already content-free):

```
paste here
```

**If detection failed:** the output of `memhaul parse <export> --source <chatgpt|claude>`
(forcing the source) often narrows it down.
