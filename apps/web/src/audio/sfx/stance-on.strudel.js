// sfx stance-on: 0.15 s, peak -14 dBFS
// You entered a stance (#3297): a tiny bright steel ping over a short scrape.
setcpm(60);
stack(
  s("triangle").freq(2093).attack(0.015).decay(0.12).sustain(0),
  s("white").attack(0.01).decay(0.05).sustain(0).hpf(4000).gain(0.25).compress(0, 0.06),
);
