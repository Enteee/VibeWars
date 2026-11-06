// sfx cast-target: 0.14 s, peak -4 dBFS
// Your target starts a cast, the interrupt cue: two sharp, high ticks, unlike
// anything else in the set, so it cuts through a busy fight. The only cue
// with ticks.
setcpm(60);
const tick = (at) =>
  stack(
    s("square")
      .freq(2400)
      .penv(-1.5)
      .pattack(0.04)
      .panchor(0)
      .attack(0.001)
      .decay(0.039)
      .sustain(0)
      .lpf(6000)
      .gain(0.5)
      .compress(at, at + 0.04),
    s("white")
      .attack(0.0005)
      .decay(0.0095)
      .sustain(0)
      .hpf(3000)
      .gain(0.25)
      .compress(at, at + 0.01),
  );
stack(tick(0), tick(0.07));
