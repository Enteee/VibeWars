// sfx death: 0.6 s, peak -6 dBFS
// Anyone dies: a long low fall with a breath of noise. Rare, so it may take
// its time.
setcpm(60);
stack(
  s("sine").freq(260).penv(-28.5).pattack(0.6).panchor(0).attack(0.01).decay(0.59).sustain(0),
  s("pink").attack(0.05).decay(0.55).sustain(0).lpf(900).gain(0.1),
);
