#!/bin/sh
# portcullis.svg: shut (iron grid fills the footprint) vs open (dark gap, jambs, stub at lintel)
bars() { x0=$1; for i in 0 1 2 3 4 5 6 7; do x=$((x0+8+i*16)); printf '<path d="M%d,64 v66" stroke="#3b4759" stroke-width="4"/><path d="M%d,130 l-3,8 h6z" fill="#a9bbd0"/>' $x $x; done; }
cat <<SVG
<svg xmlns="http://www.w3.org/2000/svg" width="360" height="220" viewBox="0 0 360 220"><rect width="360" height="220" fill="#26303f"/>
<rect x="30" y="50" width="140" height="100" fill="#10151c" fill-opacity="0.4"/>
<rect x="30" y="56" width="140" height="8" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
$(bars 36)
<rect x="34" y="60" width="132" height="76" fill="none" stroke="#a9bbd0" stroke-width="2.5"/>
<rect x="190" y="50" width="140" height="100" fill="#10151c" fill-opacity="0.4"/>
<rect x="190" y="56" width="140" height="8" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="194" y="64" width="132" height="76" fill="#0b0f14"/>
<rect x="190" y="60" width="10" height="84" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="320" y="60" width="10" height="84" fill="#4b5a70" stroke="#a9bbd0" stroke-width="2"/>
<rect x="194" y="140" width="132" height="6" fill="#6a6560"/>
<g stroke="#3b4759" stroke-width="4"><path d="M206,64 v19 M222,64 v19 M238,64 v19 M254,64 v19 M270,64 v19 M286,64 v19 M302,64 v19"/></g>
<g font-family="DejaVu Sans, sans-serif" font-size="11" fill="#d7dee8"><text x="40" y="36">shut: iron grid fills the gap</text><text x="200" y="36">open: dark gap, bars up</text></g></svg>
SVG
