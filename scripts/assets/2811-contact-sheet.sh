#!/usr/bin/env bash
# Builds docs/art/2811-all-options.png: the fifteen 2.5D directions (A-O), labelled, side by side.
set -euo pipefail
cd "$(dirname "$0")/../../docs/art"
font=$(fc-match -f '%{file}' 'DejaVu Sans:bold')
names=("Sunken courtyard" "Tabletop diorama" "Torchlit ruin" "Graphic layers" "Bastion" "Paper theatre" "Blueprint" "Tapestry" "Voxel" "Ink and wash" "Arcane levitation" "Stage set" "Pixel isometric" "Woodcut print" "Storybook meadow")
tmp=$(mktemp -d); trap 'rm -rf "$tmp"' EXIT
i=0
for l in a b c d e f g h i j k l m n o; do
  magick "2811-option-$l.png" -resize 600x -background '#14161c' -fill white -font "$font" -pointsize 26 \
    label:"${l^^} · ${names[$i]}" -gravity center -append -bordercolor '#14161c' -border 8 "$tmp/$l.png"
  i=$((i + 1))
done
magick montage -font "$font" "$tmp"/{a,b,c,d,e,f,g,h,i,j,k,l,m,n,o}.png -tile 3x5 -geometry +0+0 -background '#14161c' \
  -colors 128 -strip 2811-all-options.png
