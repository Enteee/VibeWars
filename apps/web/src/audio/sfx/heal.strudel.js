// sfx heal: 0.32 s, peak -12 dBFS
// You were healed: a soft, bright two-note chime, a fifth apart.
setcpm(60);
stack(
  s("sine").freq(1318.5).attack(0.008).release(0.28).compress(0, 0.04),
  s("sine").freq(1975.5).attack(0.008).release(0.24).gain(0.7).compress(0.06, 0.08),
);
