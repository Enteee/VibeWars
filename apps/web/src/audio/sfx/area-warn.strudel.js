// sfx area-warn: 0.35 s, peak -9 dBFS
// A harmful skill area appeared on or beside you: one low violet pulse, a
// pitched drone falling a fourth. Step out.
setcpm(60);
stack(
  s("sine").freq(196).penv(-5).pattack(0.35).panchor(0).attack(0.04).decay(0.31).sustain(0),
  s("triangle").freq(392).penv(-5).pattack(0.35).panchor(0).attack(0.06).decay(0.25).sustain(0).lpf(1200).gain(0.35),
);
