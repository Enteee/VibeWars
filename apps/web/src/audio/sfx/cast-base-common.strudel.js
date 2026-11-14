// sfx cast-base-common: 0.35 s, peak -12 dBFS
// A skill of no profession is cast (#3298): a plain soft tone, a fifth.
setcpm(60);
stack(
  s("sine").freq(196).attack(0.05).decay(0.3).sustain(0),
  s("triangle").freq(294).attack(0.05).decay(0.28).sustain(0).gain(0.35),
);
