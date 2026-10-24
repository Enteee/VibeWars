#!/usr/bin/env bash
# Generates every VibeWars sound effect from synthesis. No samples.
#
#   scripts/assets/sfx.sh
#
# Writes apps/web/public/sfx/<id>.mp3, one per SOUND_IDS entry in
# apps/web/src/audio/sound-ids.ts. The output is committed; re-run this after
# changing anything here and commit both. The sound rules are written down in
# docs/art/art-direction.md ("Sound"). Change them there first, then here.
#
# Needs sox and ffmpeg (with libmp3lame), both in devenv. Output is mono MP3,
# 22.05 kHz, 48 kbit/s: it decodes in every browser's Web Audio, and every
# file stays under 10 KB. Noise is generated in sox's repeatable mode and
# ffmpeg runs bit-exact, so a re-run produces the same bytes.

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/apps/web/public/sfx"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

rate=22050

# synth <file> <sox synth/effect args...>
# One mono layer at the working rate. Noise and square layers start 6 dB
# down, so the filters after them have headroom and do not clip.
synth() {
  local file="$1"
  shift
  sox -R -n -r "$rate" -c 1 -b 16 "$tmp/$file" "$@"
}

# finish <id> <peak dBFS> <layer files...>
# Mixes the layers, fades both ends 5 ms so nothing clicks, sets the peak
# level, and encodes the MP3. Peak levels differ on purpose: interrupt is the
# loudest, and the sounds that fire most often are the quietest.
finish() {
  local name="$1" peak="$2"
  shift 2
  local layers=()
  for f in "$@"; do layers+=("$tmp/$f"); done
  if [ "${#layers[@]}" -gt 1 ]; then
    sox -R -m "${layers[@]}" "$tmp/$name.wav" fade q 0.005 -0 0.005 gain -n "$peak"
  else
    sox -R "${layers[0]}" "$tmp/$name.wav" fade q 0.005 -0 0.005 gain -n "$peak"
  fi
  ffmpeg -loglevel error -y -i "$tmp/$name.wav" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact -id3v2_version 0 \
    -codec:a libmp3lame -b:a 48k -ac 1 -ar "$rate" "$out/$name.mp3"
}

rm -rf "$out"
mkdir -p "$out"

# cast-self: you start a cast. A soft rising shimmer. It fires on every cast
# you make, so it is the quietest sound in the set.
synth cs-a.wav synth 0.25 sine 520:1040 fade q 0.03 0.25 0.15
synth cs-b.wav synth 0.25 sine 780:1560 fade q 0.05 0.25 0.15 gain -10
finish cast-self -16 cs-a.wav cs-b.wav

# cast-target: your target starts a cast, the interrupt cue. Two sharp, high
# ticks, unlike anything else in the set, so it cuts through a busy fight.
synth ct-a.wav synth 0.04 square 2400:2200 gain -6 lowpass 6000 fade q 0.001 0.04 0.035 pad 0 0.03 repeat 1
synth ct-b.wav synth 0.01 whitenoise gain -6 highpass 3000 fade q 0.0005 0.01 0.009 gain -6 pad 0 0.06 repeat 1
finish cast-target -4 ct-a.wav ct-b.wav

# hit-dealt: you damaged someone. Short and dry: a filtered crack over a quick
# mid-pitch drop. It fires often, so there is little pitch to tire of.
synth hd-a.wav synth 0.05 whitenoise gain -6 highpass 900 lowpass 4000 fade q 0.001 0.05 0.045 pad 0 0.07
synth hd-b.wav synth 0.12 sine 260:120 fade q 0.002 0.12 0.10 gain -2
finish hit-dealt -6 hd-a.wav hd-b.wav

# hit-taken: you were damaged. Lower and duller than hit-dealt, so you can
# tell giving from taking with your eyes on the skill bar.
synth ht-a.wav synth 0.20 sine 130:48 fade q 0.003 0.20 0.17
synth ht-b.wav synth 0.08 brownnoise gain -6 lowpass 600 fade q 0.002 0.08 0.07 gain -4 pad 0 0.12
finish hit-taken -5 ht-a.wav ht-b.wav

# heal: you were healed. A soft, bright two-note chime, a fifth apart.
synth he-a.wav synth 0.32 sine 1318.5 fade q 0.008 0.32 0.28
synth he-b.wav synth 0.26 sine 1975.5 fade q 0.008 0.26 0.24 gain -3 pad 0.06 0
finish heal -12 he-a.wav he-b.wav

# interrupt: a cast broken, yours or one you broke. The loudest sound and the
# only harsh timbre: a broadband crack into a buzzy falling square. Set
# 1.2 dB under the -1 dBFS limit, because MP3 encoding overshoots the peak.
synth in-a.wav synth 0.03 whitenoise gain -6 highpass 500 fade q 0.0005 0.03 0.028 pad 0 0.22
synth in-b.wav synth 0.25 square 720:160 gain -6 tremolo 30 90 lowpass 5000 fade q 0.002 0.25 0.12 gain -3
finish interrupt -2.2 in-a.wav in-b.wav

# interrupt-missed: your interrupt hit nothing. A muted low click: "wasted".
synth im-a.wav synth 0.02 brownnoise gain -6 lowpass 1200 fade q 0.0005 0.02 0.018 pad 0 0.08
synth im-b.wav synth 0.10 sine 320:260 fade q 0.002 0.10 0.08 gain -4
finish interrupt-missed -14 im-a.wav im-b.wav

# death: anyone dies. A long low fall with a breath of noise. Rare, so it may
# take its time.
synth de-a.wav synth 0.60 sine 260:50 fade q 0.01 0.60 0.40
synth de-b.wav synth 0.60 pinknoise gain -6 lowpass 900 fade q 0.05 0.60 0.50 gain -14
finish death -6 de-a.wav de-b.wav

# refused: the server refused your cast (#68). A tiny falling two-note blip.
synth re-a.wav synth 0.07 square 440 gain -6 lowpass 3000 fade q 0.003 0.07 0.04 pad 0 0.09
synth re-b.wav synth 0.08 square 330 gain -6 lowpass 3000 fade q 0.003 0.08 0.05 pad 0.08 0
finish refused -12 re-a.wav re-b.wav

# weapon-swing: your weapon attack missed (#161). A dry, airy whoosh: band-
# passed noise that swells and dies, with no pitch, because swings repeat.
synth ws-a.wav synth 0.16 whitenoise gain -6 bandpass 1400 1.2q fade h 0.06 0.16 0.09
synth ws-b.wav synth 0.16 pinknoise gain -6 lowpass 700 fade h 0.07 0.16 0.08 gain -6
finish weapon-swing -14 ws-a.wav ws-b.wav

# bow-release: you fire a ranged weapon (#161). A soft low pluck with a tiny
# snap: a string, not a hit, so it never sounds like hit-dealt.
synth br-a.wav synth 0.18 pluck 147 fade q 0.001 0.18 0.14
synth br-b.wav synth 0.012 whitenoise gain -6 highpass 2500 fade q 0.0005 0.012 0.01 gain -8 pad 0 0.168
finish bow-release -13 br-a.wav br-b.wav

total=0
for f in "$out"/*.mp3; do
  bytes="$(wc -c <"$f")"
  total=$((total + bytes))
  printf '%6d B  %s\n' "$bytes" "${f#"$root"/}"
done
printf '%6d B  total\n' "$total"
