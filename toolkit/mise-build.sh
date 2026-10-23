#!/usr/bin/env bash
# Run one project's canonical build command under mise.
#
# Replaces the flicker HTTP job API: builds run in the caller's terminal, use
# the project's declared toolchain, and participate in mbx-cache when the task
# declares sources/outputs. No queue, polling loop, arbitrary daemon command,
# or fixed timeout.
set -euo pipefail

usage() {
  echo "usage: mise-build.sh <project> <workdir> <command>" >&2
  exit 64
}

[ "$#" -eq 3 ] || usage
project=$1
workdir=$2
command=$3

[ -d "$workdir" ] || { echo "[$project] workdir missing: $workdir" >&2; exit 66; }
printf '[%s] %s\n' "$project" "$command"
cd "$workdir"
exec mise exec -- bash -lc "$command"