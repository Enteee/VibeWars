// sfx cast-motif-signet: 0.15 s, peak -14 dBFS
// A signet, stance or form is used (#3298): a dry metallic tap.
setcpm(60);
stack(
  s("square").freq(1800).attack(0.002).decay(0.06).sustain(0).lpf(4000).gain(0.5),
  s("sine").freq(2710).attack(0.002).decay(0.14).sustain(0),
);
