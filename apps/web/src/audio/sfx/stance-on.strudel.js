// sfx stance-on: 0.15 s, peak -14 dBFS
// You entered a stance: a tiny bright steel ping over a short scrape.
setcpm(60);
stack(
  s("triangle").freq(2637).attack(0.002).decay(0.13).sustain(0).lpf(6000),
  s("white").attack(0.002).decay(0.05).sustain(0).bpf(3500).gain(0.25),
);
