# Demo GIF storyboard

> **Recorded 2026-07-19** → [`demo.gif`](demo.gif) (516 KB, synthetic fixtures only). The shipped
> GIF was captured with **asciinema + agg** via [`demo.sh`](demo.sh) — vhs hung against the local
> Chrome on the recording machine, so the storyboard's named alternative was used. Beats below were
> followed as written; the only content change is `head -24` instead of `cat` on
> `saved-memories.md` so the file listing fits one screen. Re-record with:
> `asciinema rec --cols 110 --rows 32 -c "bash demo.sh" demo.cast && agg --theme dracula --font-size 20 demo.cast demo.gif`
> (run from a staging dir holding `chatgpt-export.zip` + `my-memories.txt` built from
> `test/fixtures/`, with `memhaul` on PATH via `npm link`).

A ~25-second terminal recording for the top of the README and the Show HN thread. The whole story is:
**messy export in → clean, owned memory out → "wait, it also audits it?"**

> **Capture note:** the actual GIF must be rendered on a machine with the repo built (or in CI). The
> recommended tool is [VHS](https://github.com/charmbracelet/vhs) — deterministic, produces a small GIF,
> and the `.tape` below is runnable as-is (`vhs launch/demo.tape`). asciinema + agg is an alternative.
> **Use the synthetic fixture** (`test/fixtures/chatgpt-export`) — never a real export in a public GIF.

## The beats (what the viewer sees)

1. **(0–4s)** A title card / comment: *"ChatGPT won't export your memories. So I built this."*
2. **(4–10s)** `memhaul parse` runs. One clean summary line prints: *17 items extracted*. The
   `memory/` folder appears (`ls`), full of readable `.md` files.
3. **(10–16s)** `cat memory/saved-memories.md` — the viewer sees actual, human-readable memory bullets
   with provenance. The "owned, editable, plain text" payoff.
4. **(16–24s)** `memhaul audit … --card` runs. It flags *sensitive / third-party / contradictory /
   stale*, and prints the reassurance that a **credential was detected and withheld**. Beat: it's not
   just a converter, it shows you what your AI quietly knows about you.
5. **(24–25s)** Final frame rests on the audit summary line. Optional lower-third: repo URL + "MIT ·
   local · no telemetry".

## Pacing / craft

- Keep total under ~25s and the GIF under ~2 MB (HN/README friendly).
- Type at a human speed; pause ~1s on each command's output so it's readable when it loops.
- No cursor thrash, no long paths on screen — `cd` into the repo first, off camera.
- The emotional arc is *relief* (finally, my memory in files I own) then *mild alarm→trust* (it found a
  leaked API key and hid it). End on trust.

## Runnable VHS tape

The tape lives at [`demo.tape`](demo.tape). It assumes the repo is built (`npm run build`) and run from
the repo root. Before recording, generate a synthetic memories paste (or reuse
`test/fixtures/saved-memories.txt`) so the saved-memory and audit beats are populated.

```tape
# launch/demo.tape — render with: vhs launch/demo.tape
Output launch/demo.gif
Set FontSize 20
Set Width 1100
Set Height 640
Set Theme "Dracula"
Set TypingSpeed 55ms
Set PlaybackSpeed 1.0

Type "# ChatGPT won't export your saved memories. So I built the tool that fixes that."
Enter
Sleep 1500

Type "memhaul parse chatgpt-export.zip --memories my-memories.txt"
Enter
Sleep 2500

Type "ls memory/"
Enter
Sleep 1800

Type "cat memory/saved-memories.md"
Enter
Sleep 3000

Type "# it also shows you what your AI quietly remembers:"
Enter
Sleep 1200
Type "memhaul audit chatgpt-export.zip --memories my-memories.txt --card"
Enter
Sleep 3500
```

> Swap `chatgpt-export.zip`/`my-memories.txt` for the synthetic fixture paths when recording
> (`node dist/cli.js` if not yet installed globally). Keep the on-screen values fake.
