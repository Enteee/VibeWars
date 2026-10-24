#!/usr/bin/env bash
# Generates every VibeWars sound effect from synthesis. No samples.
#
#   scripts/assets/sfx.sh
#
# Writes apps/web/public/sfx/<name>.mp3. The output is committed; re-run this
# after changing anything here and commit both. The sound rules are written
# down in docs/art/art-direction.md ("Sound"). Change them there first, then
# here.
#
# Needs sox and ffmpeg (with libmp3lame). Output is mono MP3, 22.05 kHz,
# 48 kbit/s: it decodes in every browser's Web Audio, and every file stays
# well under 10 KB. Noise is generated in sox's repeatable mode, so a re-run
# produces the same bytes.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/apps/web/public/sfx"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rate=22050

# synth <file> <sox synth/effect args...>
# One mono layer at the working rate.
synth() {
  local file="$1"
  shift
  sox -R -n -r "$rate" -c 1 -b 16 "$tmp/$file" "$@"
}

# finish <name> <peak dBFS> <layer files...>
# Mixes the layers, sets the peak level, and encodes the MP3. Peak levels
# differ on purpose: the sounds that fire most often are the quietest.
finish() {
  local name="$1" peak="$2"
  shift 2
  local layers=()
  for f in "$@"; do layers+=("$tmp/$f"); done
  if [ "${#layers[@]}" -gt 1 ]; then
    sox -R -m "${layers[@]}" "$tmp/$name.wav" gain -n "$peak"
  else
    sox -R "${layers[0]}" "$tmp/$name.wav" gain -n "$peak"
  fi
  ffmpeg -loglevel error -y -i "$tmp/$name.wav" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact -id3v2_version 0 \
    -codec:a libmp3lame -b:a 48k -ac 1 -ar "$rate" "$out/$name.mp3"
}

rm -rf "$out"
mkdir -p "$out"

# cast-start: a soft rising shimmer. Fires on every cast, so it is short and
# quiet; it says "something is coming", not "something happened".
synth cs-a.wav synth 0.20 sine 520:1040 fade q 0.02 0.20 0.12
synth cs-b.wav synth 0.20 sine 780:1560 fade q 0.04 0.20 0.12 gain -10
finish cast-start -14 cs-a.wav cs-b.wav

# cast-complete: a bright two-note pluck, a fifth apart. The payoff of
# cast-start, so it shares its register.
synth cc-a.wav synth 0.30 pluck 1046.5 fade q 0 0.30 0.25
synth cc-b.wav synth 0.30 pluck 1568 fade q 0 0.30 0.25 delay 0.04 trim 0 0.30
finish cast-complete -10 cc-a.wav cc-b.wav

# hit: a dull thump under a short noise crack. The most frequent sound in a
# fight: very short, low, and no pitch for the ear to tire of.
synth hit-a.wav synth 0.14 sine 140:55 fade q 0.002 0.14 0.11
synth hit-b.wav synth 0.06 brownnoise fade q 0.001 0.06 0.05 lowpass 2400 pad 0 0.08
finish hit -8 hit-a.wav hit-b.wav

# interrupt: a buzzy square that drops and is cut off dead. The one sound a
# player must never mistake for another, so it is the only harsh timbre and
# the only one that ends without a fade.
synth int-a.wav synth 0.22 square 660:180 tremolo 30 90 gain -4 lowpass 5000 fade q 0.005 0.22 0
synth int-b.wav synth 0.22 sawtooth 667:183 gain -4 lowpass 5000 fade q 0.005 0.22 0 gain -6
finish interrupt -6 int-a.wav int-b.wav

# death: a long low fall with a breath of noise. Rare, so it may take its
# time and sit lowest of all.
synth die-a.wav synth 0.70 sine 260:50 fade q 0.01 0.70 0.45
synth die-b.wav synth 0.70 pinknoise fade q 0.05 0.70 0.6 lowpass 900 gain -14
finish death -7 die-a.wav die-b.wav

for f in "$out"/*.mp3; do
  printf '%6d B  %s\n' "$(wc -c <"$f")" "${f#"$root"/}"
done
