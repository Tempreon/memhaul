#!/bin/bash
# Replays the launch/demo-storyboard.md beats for the recording.
type_cmd() {
  printf '\033[1;35m❯\033[0m '
  local s="$1"
  for ((i=0; i<${#s}; i++)); do
    printf '%s' "${s:$i:1}"
    sleep 0.045
  done
  printf '\n'
  sleep 0.3
}
type_comment() {
  printf '\033[2m'
  local s="$1"
  for ((i=0; i<${#s}; i++)); do
    printf '%s' "${s:$i:1}"
    sleep 0.03
  done
  printf '\033[0m\n'
}

type_comment "# ChatGPT won't export your saved memories. So I built the tool that fixes that."
sleep 1.5

type_cmd "memhaul parse chatgpt-export.zip --memories my-memories.txt"
memhaul parse chatgpt-export.zip --memories my-memories.txt
sleep 2.5

type_cmd "ls memory/"
ls memory/
sleep 1.8

type_cmd "head -24 memory/saved-memories.md"
head -24 memory/saved-memories.md
sleep 3.0

type_comment "# it also shows you what your AI quietly remembers:"
sleep 1.2

type_cmd "memhaul audit chatgpt-export.zip --memories my-memories.txt --card"
memhaul audit chatgpt-export.zip --memories my-memories.txt --card
sleep 3.5
