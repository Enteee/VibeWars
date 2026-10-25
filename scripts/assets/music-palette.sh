#!/usr/bin/env bash
# Builds the music sound palette: real instruments for the Strudel tracks.
#
#   scripts/assets/music-palette.sh
#
# Writes apps/web/public/music/samples/<sound>/<key>.mp3 and strudel.json, the
# Strudel sample map. Everything is cut from the Versilian Community Sample
# Library (VCSL, CC0 1.0, https://github.com/sgossner/VCSL). Strings, brass,
# choir and bass are NOT here: the tracks synthesise those with Strudel's
# built-in oscillators, at zero bytes. The palette rules are written down in
# docs/art/art-direction.md ("Music"). Change them there first, then here.
#
# Needs curl, sox, ffmpeg (libmp3lame) and jq, all in devenv. Output is mono
# MP3, 32 kHz, 40 kbit/s, so the whole palette stays far under its 3 MB
# budget. The script prints the total and fails above the budget.
# Re-running downloads again and produces the same bytes (ffmpeg runs
# bit-exact).

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
out="$root/apps/web/public/music/samples"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

vcsl="https://raw.githubusercontent.com/sgossner/VCSL/master"
budget=3000000

rm -rf "$out"
mkdir -p "$out"
echo '{}' >"$tmp/map.json"

# cut <sound> <key> <seconds> <peak dBFS> <VCSL path>
# Downloads one recording, keeps the first <seconds> with a short fade at both
# ends, normalises the peak, and encodes it as <sound>/<key>.mp3. The key is
# a note name for pitched sounds (Strudel picks the nearest and transposes) or
# an index for a set of hits.
cut() {
  local sound="$1" key="$2" secs="$3" peak="$4" path="$5"
  local url="$vcsl/${path// /%20}"
  url="${url//#/%23}"
  url="${url//,/%2C}"
  local file="${key//#/s}.mp3" # a # in a URL starts the fragment
  mkdir -p "$out/$sound"
  curl -fsSL "$url" -o "$tmp/in.wav" || { echo "cannot fetch $path" >&2; exit 1; }
  ffmpeg -loglevel error -y -i "$tmp/in.wav" -t "$secs" -ac 1 -ar 32000 -c:a pcm_s16le "$tmp/raw.wav"
  sox "$tmp/raw.wav" "$tmp/cut.wav" fade q 0.002 -0 0.15 gain -n "$peak"
  ffmpeg -loglevel error -y -i "$tmp/cut.wav" \
    -map_metadata -1 -fflags +bitexact -flags:a +bitexact -id3v2_version 0 \
    -codec:a libmp3lame -b:a 40k -ac 1 "$out/$sound/$file"
  jq --arg s "$sound" --arg k "$key" --arg f "$sound/$file" \
    'if ($k | test("^[0-9]+$")) then .[$s] = ((.[$s] // []) + [$f]) else .[$s][$k] = $f end' "$tmp/map.json" >"$tmp/map.next" && mv "$tmp/map.next" "$tmp/map.json"
}

aero="Aerophones/Edge-blown Aerophones"
cho="Chordophones/Composite Chordophones"
zit="Chordophones/Zithers"
idio="Idiophones/Struck Idiophones"
memb="Membranophones/Struck Membranophones"

# harp: concert harp, plucked. One recording per fourth or so.
for n in A2 E3 D4 G5 D6; do
  cut harp "${n,,}" 3.5 -3 "$cho/Concert Harp/KSHarp_${n}_mf1.wav"
done
# whistle: soprano recorder, the stand-in for a tin whistle.
for n in C4 E4 G#4 D5 F#5 C6; do
  cut whistle "${n,,}" 1.8 -3 "$aero/Baroque Soprano Recorder/Sustain/SopRecorder_Sus_${n}_rr1_Main.wav"
done
# recorder: alto recorder with vibrato, the breathy wooden flute.
for n in F3 C4 E4 G#4 D5; do
  cut recorder "${n,,}" 1.8 -3 "$aero/Baroque Alto Recorder/SusVib/AltRecorder_SusVib_${n}_rr1_Main.wav"
done
# strum: strumstick, a plucked folk lute with a dry, woody pluck.
cut strum a2 2 -3 "$cho/Strumstick/Finger/Strumstick_Finger_Str2_Main_A2_vl2_rr1.wav"
cut strum d3 2 -3 "$cho/Strumstick/Finger/Strumstick_Finger_Str2_Main_D3_vl2_rr1.wav"
cut strum a3 2 -3 "$cho/Strumstick/Finger/Strumstick_Finger_Str3_Main_A3_vl2_rr1.wav"
cut strum e4 2 -3 "$cho/Strumstick/Finger/Strumstick_Finger_Str3_Main_E4_vl2_rr1.wav"
cut strum a4 1.5 -3 "$cho/Strumstick/Finger/Strumstick_Finger_Str3_Main_A4_vl2_rr1.wav"
# pizz: bowed psaltery, plucked: pizzicato strings.
# (each note has a different take number on disk)
for take in C4:rr1 E4:rr2 G#4:rr3 C5:rr1 E5:rr1; do
  n="${take%%:*}"
  cut pizz "${n,,}" 1.2 -3 "$zit/Psaltery, Bowed and Plucked/Pluck/BowedPsaltery_${n}_Main_Pluck_${take##*:}.wav"
done
# bells: tubular bells.
cut bells c3 4 -4 "$idio/Tubular Bells 1/chimes_C3_f_rr1.wav"
cut bells e3 4 -4 "$idio/Tubular Bells 1/chimes_E3_ff_rr2.wav"
cut bells g#3 4 -4 "$idio/Tubular Bells 1/chimes_G#3_ff_rr1.wav"
cut bells c4 4 -4 "$idio/Tubular Bells 1/chimes_C4_ff_rr2.wav"
cut bells e4 4 -4 "$idio/Tubular Bells 1/chimes_E4_ff_rr2.wav"

# Unpitched hits, an array in the sample map: s("sound:0"), s("sound:1"), ...
# (A map with note-name keys is pitched; one with numeric keys must be an array.)
# timp: three timpani, tuned differently.
cut timp 0 2.5 -2 "$memb/Timpani 2/Hit/Timpani1A_hit_v3_rr1_main.wav"
cut timp 1 2.5 -2 "$memb/Timpani 2/Hit/Timpani1B_hit_v3_rr1_main.wav"
cut timp 2 2.5 -2 "$memb/Timpani 2/Hit/Timpani1C_hit_v3_rr1_main.wav"
# taiko: the concert bass drum, struck hard and soft; the war drum.
cut taiko 0 2.5 -2 "$memb/Bass Drum 2/bassdrum_hit_ff.wav"
cut taiko 1 2.5 -2 "$memb/Bass Drum 2/bassdrum_hit_mp1.wav"
# frame: a hand frame drum, open and muted, big and small: the bodhran.
cut frame 0 0.9 -3 "$memb/Frame Drum/HDrumL_Hit_v3_rr1_Sum.wav"
cut frame 1 0.6 -3 "$memb/Frame Drum/HDrumL_HitMuted_v3_rr1_Sum.wav"
cut frame 2 0.7 -3 "$memb/Frame Drum/HDrumS_Hit_v3_rr1_Sum.wav"
cut frame 3 0.5 -3 "$memb/Frame Drum/HDrumS_HitMuted_v2_rr1_Sum.wav"
# snare: rope-tension snare, a stick hit and a full hit.
cut snare 0 0.6 -3 "$memb/Snare Drum, Rope Tension/RopeSnare_stick_Main_vl1_rr1.wav"
cut snare 1 0.7 -3 "$memb/Snare Drum, Rope Tension/Hi/RopeSnare_hi_sn_Main_vl3_rr1.wav"
# crash: clash cymbals, long and short.
cut crash 0 3.5 -3 "$idio/Clash Cymbals 1/cymbal_crash1_mf1.wav"
cut crash 1 1.2 -3 "$idio/Clash Cymbals 1/cymbal_crash1_short1.wav"
# swell: a bowed suspended cymbal, the rise before a drop.
cut swell 0 5 -4 "$idio/Suspended Cymbal 1/susCymb1_bow_17.wav"
# anvil: three anvil hits, for the metal in the dark tracks.
cut anvil 0 1.5 -3 "$idio/Anvil/Anvil_Hit1_v3_rr1_Mid.wav"
cut anvil 1 1.5 -3 "$idio/Anvil/Anvil_Hit2_v2_rr1_Mid.wav"
cut anvil 2 1.5 -3 "$idio/Anvil/Anvil_Hit3_v3_rr1_Mid.wav"
# gong: a soft gong stroke.
cut gong 0 5 -4 "$idio/Gong 1/gong_p.wav"

# The sample map. Paths are relative to strudel.json, so the host can serve the
# directory from anywhere.
jq -S . "$tmp/map.json" >"$out/strudel.json"

bytes="$(find "$out" -name '*.mp3' -printf '%s\n' | awk '{s+=$1} END {print s}')"
echo "palette: $(find "$out" -name '*.mp3' | wc -l) files, $bytes bytes (budget $budget)"
[ "$bytes" -le "$budget" ] || { echo "palette is over budget" >&2; exit 1; }
