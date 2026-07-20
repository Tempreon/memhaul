# launch/demo.tape — render with: vhs launch/demo.tape
# Requires: `npm run build` first, and a synthetic export + memories paste.
# For a quick render against the repo's synthetic fixtures, replace the file
# paths below with:  test/fixtures/chatgpt-export  and  test/fixtures/saved-memories.txt
# and prefix commands with `node dist/cli.js` if memhaul isn't installed globally.
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

Type "# it also shows what your AI quietly remembers about you:"
Enter
Sleep 1200

Type "memhaul audit chatgpt-export.zip --memories my-memories.txt --card"
Enter
Sleep 3500
