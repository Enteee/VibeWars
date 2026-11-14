// sfx hex-on: 0.30 s, peak -8 dBFS
// A hex landed on you, the cue to react: a dark detuned low dyad with a slow
// wobble. Low and smooth, with no crack, so it is never an interrupt.
setcpm(60);
stack(
  s("sawtooth").freq(110).attack(0.01).decay(0.29).sustain(0).lpf(500).tremolo(9).tremolodepth(0.6),
  s("sawtooth")
    .freq(116.5)
    .attack(0.01)
    .decay(0.29)
    .sustain(0)
    .lpf(500)
    .tremolo(9)
    .tremolodepth(0.6),
);
