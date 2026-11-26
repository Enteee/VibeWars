// sfx stance-on: 0.15 s, peak -14 dBFS
// You entered a stance: a tiny bright steel ping over a short scrape.
setcpm(60);
stack(
  s("triangle").freq(1175).attack(0.002).decay(0.13).sustain(0).lpf(3000),
  s("white").attack(0.002).decay(0.05).sustain(0).bpf(2500).lpf(5000).gain(0.25),
);
