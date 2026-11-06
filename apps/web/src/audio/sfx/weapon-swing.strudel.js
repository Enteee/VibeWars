// sfx weapon-swing: 0.16 s, peak -14 dBFS
// Your weapon attack missed (#161): a dry, airy whoosh, band-passed noise that
// swells and dies. No pitch, because swings repeat.
setcpm(60);
stack(
  s("white").attack(0.06).decay(0.1).sustain(0).bpf(1400).bpq(1.2).gain(0.5),
  s("pink").attack(0.07).decay(0.09).sustain(0).lpf(700).gain(0.25),
);
