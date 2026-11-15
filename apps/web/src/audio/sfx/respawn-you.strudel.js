// sfx respawn-you: 0.6 s, peak -10 dBFS
// You are back (#3366): a rising airy chime over a soft breath.
setcpm(60);
stack(
  s("sine").freq(660).penv(7).pattack(0.45).panchor(0).attack(0.06).decay(0.54).sustain(0),
  s("sine").freq(495).penv(7).pattack(0.45).panchor(0).attack(0.1).decay(0.5).sustain(0).gain(0.4),
  s("white").attack(0.15).decay(0.45).sustain(0).hpf(4000).lpf(6000).gain(0.05),
);
