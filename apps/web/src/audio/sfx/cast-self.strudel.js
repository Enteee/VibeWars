// sfx cast-self: 0.25 s, peak -16 dBFS
// You start a cast: a soft rising shimmer. It fires on every cast you make,
// so it is the quietest cue in the set.
setcpm(60);
stack(
  s("sine").freq(520).penv(12).pattack(0.25).panchor(0).attack(0.03).decay(0.22).sustain(0),
  s("sine")
    .freq(780)
    .penv(12)
    .pattack(0.25)
    .panchor(0)
    .attack(0.05)
    .decay(0.2)
    .sustain(0)
    .gain(0.32),
);
