// sfx shout: 0.25 s, peak -12 dBFS
// A shout or chant reached you: a short, airy rising swell of filtered
// noise over a soft voice-like tone. No ticks: that is cast-target's.
setcpm(60);
stack(
  s("pink").attack(0.12).decay(0.13).sustain(0).bpf(1200).bandq(2).gain(0.6),
  s("triangle").freq(330).penv(5).pattack(0.25).panchor(0).attack(0.1).decay(0.15).sustain(0).lpf(1800).gain(0.5),
);
