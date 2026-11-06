// sfx objective-theirs: 0.48 s, peak -9 dBFS
// The foe scored (#1387): the same fifth falling, an octave down and duller,
// so it reads as the other side of the same news.
setcpm(60);
stack(
  s("sawtooth").freq(392).attack(0.01).release(0.06).lpf(1200).gain(0.5).compress(0, 0.12),
  s("sawtooth").freq(261.63).attack(0.01).release(0.22).lpf(900).gain(0.5).compress(0.16, 0.26),
  s("sine").freq(130.81).attack(0.02).release(0.3).gain(0.4).compress(0, 0.18),
);
