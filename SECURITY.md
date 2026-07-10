# Security & privacy

memory-porter is built around one promise: **your data stays yours, and stays local.**

## What the tool does with your data

- **`parse` and `audit` make zero network calls.** They read your export from
  disk and write files to disk. Nothing is uploaded, phoned home, or logged to a
  remote service. There is no telemetry, no analytics, no "anonymous usage
  stats" — none.
- The only command that can ever touch the network is **`push`**, and only when
  you run it against a real target without `--dry-run`. In v0.1 the live push is
  not even wired (see `docs/adr/0003-tempreon-push-auth.md`), so v0.1 makes no
  network calls at all. `push --dry-run` shows you exactly what *would* be sent.
- The tool has a single runtime dependency (`fflate`, for unzip). You can read
  every other line of what it does.

## Resource limits

memory-porter is designed to parse *your own* export, which you trust. As a guard against a malformed
or hostile archive, unzipping enforces size ceilings (per-file and total uncompressed) and refuses
anything that looks like a zip bomb, and the directory walker does not follow symlinks. These are
belt-and-suspenders limits, not a sandbox — parse archives you obtained yourself.

## Handle your export like the sensitive thing it is

An AI-assistant export is one of the most sensitive files you own. It can contain
health details, financial information, credentials you pasted into a chat, and
personal information about **other people**. Treat it accordingly:

- The `audit` command exists partly to help you *find* that sensitive and
  third-party content before you do anything else with it.
- Do not commit your export, or the `memory/` output folder, into a public repo.
  The default `.gitignore` in this project already excludes common export and
  output paths.
- The opt-in `audit --card` output is redacted by design so you can share "here's
  what my AI remembers, by category" without leaking the values themselves.
  Always read a card before sharing it.

## Reporting a vulnerability

If you find a security or privacy issue — especially anything where the tool
could leak data off the machine, or where `audit` fails to flag obviously
sensitive content — please open a private report rather than a public issue.

Preferred: open a **private GitHub security advisory** on the repository. Alternatively email
**security@tempreon.com**. We'll acknowledge within a few business days.

Please include: the version, your OS + Node version, a minimal synthetic export
that reproduces it (never send real personal data), and what you expected vs. saw.
