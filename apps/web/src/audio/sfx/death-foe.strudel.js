// sfx death-foe: 0.35 s, peak -8 dBFS
// A foe dies (#3366), the reward: a quick bright downward pluck.
setcpm(60);
stack(
  s("triangle").freq(1175).penv(-12).pattack(0.12).panchor(0).attack(0.002).decay(0.3).sustain(0),
  s("sine").freq(2350).penv(-12).pattack(0.12).panchor(0).attack(0.002).decay(0.12).sustain(0).gain(0.3),
);
