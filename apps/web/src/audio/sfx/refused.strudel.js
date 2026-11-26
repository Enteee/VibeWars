// sfx refused: 0.16 s, peak -12 dBFS
// The server refused your cast (#68): a tiny falling two-note blip.
setcpm(60);
stack(
  s("square").freq(440).attack(0.003).release(0.04).lpf(3000).gain(0.5).compress(0, 0.03),
  s("square").freq(330).attack(0.003).release(0.05).lpf(3000).gain(0.5).compress(0.08, 0.11),
);
