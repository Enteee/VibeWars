// sfx death-you: 0.8 s, peak -5 dBFS
// You die (#3366): a low, falling two-note, a fourth down, with a breath of noise.
setcpm(60);
stack(
  s("sine").freq("220 165").attack(0.01).decay(0.4).sustain(0),
  s("sine").freq("110 82.5").attack(0.01).decay(0.4).sustain(0).gain(0.3),
  s("pink").attack(0.05).decay(0.7).sustain(0).lpf(700).gain(0.08),
);
