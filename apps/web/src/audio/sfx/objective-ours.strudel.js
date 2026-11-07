// sfx objective-ours: 0.48 s, peak -8 dBFS
// Your team scored an objective (#1387): a short, bright rising fifth, C5
// then G5, a soft brass over a sine. The one fanfare.
setcpm(60);
stack(
  s("sawtooth").freq(523.25).attack(0.01).release(0.06).lpf(2600).gain(0.5).compress(0, 0.12),
  s("sawtooth").freq(783.99).attack(0.01).release(0.22).lpf(3200).gain(0.5).compress(0.16, 0.26),
  s("sine").freq(1567.98).attack(0.02).release(0.3).gain(0.2).compress(0, 0.18),
);
