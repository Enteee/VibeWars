// sfx stance-on: 0.15 s, peak -14 dBFS
// You took a stance: a tiny bright steel ping over a short, quiet scrape.
setcpm(60);
stack(
  s("sine").freq(2093).attack(0.002).decay(0.13).sustain(0),
  s("white").attack(0.002).decay(0.05).sustain(0).hpf(3000).lpf(6000).gain(0.08),
);
