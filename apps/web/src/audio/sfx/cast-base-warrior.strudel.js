// sfx cast-base-warrior: 0.4 s, peak -12 dBFS
// A Warrior casts (#3298): a low drum hit under a short grunt of noise.
setcpm(60);
stack(
  s("sine").freq(82).penv(-7).pattack(0.12).panchor(0).attack(0.004).decay(0.36).sustain(0),
  s("brown").attack(0.01).decay(0.16).sustain(0).lpf(420).gain(0.5),
);
