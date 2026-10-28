#!/usr/bin/env bash
# pixel-mic-capture — capture the Pixel's microphone over ADB as raw PCM.
#
# The Pixel doubles as a measurement instrument: place it at the listening
# position and capture what the room actually sounds like. That is the only
# way to see what arrives at a speaker — everything upstream of the
# loudspeaker is a proxy, and a proxy that has already been proven wrong.
#
# The capture path avoids installing an APK: MicCapture.java is compiled to
# dex on the host, pushed to /data/local/tmp, and run under app_process as the
# adb shell user, which holds RECORD_AUDIO by default on stock Android.
#
# Usage:
#   pixel-mic-capture <seconds> [out.wav]     capture N seconds to a wav
#   pixel-mic-capture --serial <S> <seconds>  target a specific adb serial
#   pixel-mic-capture --build                  (re)build the dex only
#
# The wired transport is preferred when the phone is plugged in (stable
# transport id, no wireless port rotation); the LAN wireless endpoint is used
# as fallback.
#
# Requires: adb, javac, d8 (android sdk build-tools), python3 (wav wrap).

set -uo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
SRC="${REPO_DIR}/mic/MicCapture.java"
BUILD_DIR="${REPO_DIR}/mic/.build"
DEX="${BUILD_DIR}/classes.dex"
REMOTE_DEX="/data/local/tmp/MicCapture.dex"
REMOTE_PCM="/data/local/tmp/mic.pcm"

ANDROID_JAR="${ANDROID_JAR:-$(ls -d /opt/android-sdk/platforms/android-* 2>/dev/null | sort -V | tail -1)/android.jar}"
D8="${D8:-$(ls -d /opt/android-sdk/build-tools/* 2>/dev/null | sort -V | tail -1)/d8}"

PIXEL_SERIAL="${PIXEL_SERIAL:-}"
PIXEL_WIRELESS_HOST="${PIXEL_WIRELESS_HOST:-10.0.0.77}"

log() { printf '%s\n' "$*" >&2; }
die() { log "pixel-mic-capture: $*"; exit 1; }

build_dex() {
  [ -f "$SRC" ] || die "missing source: $SRC"
  [ -n "$ANDROID_JAR" ] && [ -f "$ANDROID_JAR" ] || die "android.jar not found (set ANDROID_JAR)"
  [ -x "$D8" ] || die "d8 not found (set D8)"
  mkdir -p "$BUILD_DIR"
  # Rebuild only when the source is newer than the dex.
  if [ -f "$DEX" ] && [ "$DEX" -nt "$SRC" ]; then
    return 0
  fi
  log "building mic capture dex ..."
  javac -source 8 -target 8 -bootclasspath "$ANDROID_JAR" -nowarn \
    -d "$BUILD_DIR" "$SRC" || die "javac failed"
  "$D8" --min-api 34 --output "$BUILD_DIR" "$BUILD_DIR/MicCapture.class" || die "d8 failed"
  [ -f "$DEX" ] || die "dex not produced at $DEX"
}

# resolve_serial: prefer an explicit serial, then the wired Pixel, then LAN.
resolve_serial() {
  if [ -n "$PIXEL_SERIAL" ]; then
    printf '%s\n' "$PIXEL_SERIAL"
    return 0
  fi
  # Wired: a serial that is not host:port and looks like a USB transport.
  local s
  s="$(adb devices | awk 'NR>1 && $2=="device" {print $1}' | grep -E '^[A-Z0-9]{8,}$' | head -1)"
  if [ -n "$s" ]; then
    printf '%s\n' "$s"
    return 0
  fi
  # LAN wireless fallback: first host:port entry.
  s="$(adb devices | awk 'NR>1 && $2=="device" && $1 ~ /:/ {print $1}' | head -1)"
  if [ -n "$s" ]; then
    printf '%s\n' "$s"
    return 0
  fi
  return 1
}

SERIAL=""
SECONDS_ARG=""
OUT=""
BUILD_ONLY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --serial) SERIAL="$2"; shift 2 ;;
    --build)  BUILD_ONLY=1; shift ;;
    -h|--help)
      sed -n '2,22p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'
      exit 0 ;;
    *) break ;;
  esac
done

if [ "$BUILD_ONLY" = "1" ]; then
  build_dex
  log "dex built: $DEX"
  exit 0
fi

SECONDS_ARG="${1:-5}"
case "$SECONDS_ARG" in
  ''|*[!0-9]*) die "seconds must be a positive integer" ;;
esac
OUT="${2:-mic-capture-$(date +%Y%m%d-%H%M%S).wav}"

build_dex

if [ -z "$SERIAL" ]; then
  SERIAL="$(resolve_serial)" || die "no Pixel reachable over adb (plug in USB or start the keepalive)"
fi
log "using adb serial: $SERIAL"

adb -s "$SERIAL" get-state 2>/dev/null | grep -q device || die "adb device $SERIAL not ready"

adb -s "$SERIAL" push "$DEX" "$REMOTE_DEX" >/dev/null 2>&1 || die "push failed"

log "recording ${SECONDS_ARG}s ..."
adb -s "$SERIAL" shell \
  "CLASSPATH=${REMOTE_DEX} app_process /data/local/tmp MicCapture 48000 ${SECONDS_ARG} ${REMOTE_PCM}" \
  2>&1 | sed 's/^/  /'

RAW_OUT="${OUT%.wav}.raw"
adb -s "$SERIAL" pull "$REMOTE_PCM" "$RAW_OUT" >/dev/null 2>&1 || die "pull failed"

python3 - "$RAW_OUT" "$OUT" <<'PY'
import sys, wave
raw, out = sys.argv[1], sys.argv[2]
with wave.open(out, 'wb') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(48000)
    with open(raw, 'rb') as f:
        w.writeframes(f.read())
PY

rm -f "$RAW_OUT"
log "wrote $OUT"
