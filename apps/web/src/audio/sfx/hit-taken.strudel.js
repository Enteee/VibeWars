// sfx hit-taken: 0.2 s, peak -5 dBFS
// You were damaged. Lower and duller than hit-dealt, so you can tell giving
// from taking with your eyes on the skill bar.
setcpm(60);
stack(
  s("sine").freq(130).penv(-17.5).pattack(0.2).panchor(0).attack(0.003).decay(0.197).sustain(0),
  s("brown").attack(0.002).decay(0.078).sustain(0).lpf(600).gain(0.3).compress(0, 0.08),
);
