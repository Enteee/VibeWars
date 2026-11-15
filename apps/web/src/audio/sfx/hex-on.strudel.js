// sfx hex-on: 0.3 s, peak -8 dBFS
// A hex landed on you: a dark, detuned low dyad with a slow wobble. The
// loudest of the skill cues, because you must react to it, but soft-edged:
// no crack like interrupt, no thud like hit-taken.
setcpm(60);
stack(
  s("sawtooth").freq(98).attack(0.03).decay(0.27).sustain(0).lpf(700).tremolo(7).tremolodepth(0.6),
  s("sawtooth").freq(103.8).attack(0.03).decay(0.27).sustain(0).lpf(700).gain(0.8),
);
