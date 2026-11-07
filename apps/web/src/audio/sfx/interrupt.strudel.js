// sfx interrupt: 0.25 s, peak -2.2 dBFS
// A cast broken, yours or one you broke. The loudest cue and the only harsh
// timbre: a broadband crack into a buzzy falling square. Set 1.2 dB under
// the -1 dBFS limit, because MP3 encoding overshoots the peak.
setcpm(60);
stack(
  s("white").attack(0.0005).decay(0.0295).sustain(0).hpf(500).gain(0.5).compress(0, 0.03),
  s("square")
    .freq(720)
    .penv(-26)
    .pattack(0.25)
    .panchor(0)
    .attack(0.002)
    .decay(0.12)
    .sustain(0.5)
    .tremolo(30)
    .tremolodepth(0.9)
    .lpf(5000)
    .gain(0.7),
);
