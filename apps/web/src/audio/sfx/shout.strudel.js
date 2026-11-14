// sfx shout: 0.25 s, peak -12 dBFS
// A shout or chant of yours or an ally's reached you (#3297): a short, airy
// rising swell, breath over a soft tone, with no ticks.
setcpm(60);
stack(
  s("white").attack(0.12).decay(0.13).sustain(0).hpf(900).lpf(3000).gain(0.4),
  s("sine").freq(392).penv(5).pattack(0.25).panchor(0).attack(0.1).decay(0.15).sustain(0),
);
