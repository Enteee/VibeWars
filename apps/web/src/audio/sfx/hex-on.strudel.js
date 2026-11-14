// sfx hex-on: 0.3 s, peak -8 dBFS
// A hex landed on you (#3297): a dark, detuned low dyad with a slow wobble.
// The loudest of the skill cues, because it asks you to act, but tonal and
// without a crack, so it is neither hit-taken's thud nor interrupt's buzz.
setcpm(60);
stack(
  s("sawtooth").freq(110).attack(0.03).decay(0.27).sustain(0).lpf(700).tremolo(6).tremolodepth(0.5),
  s("sawtooth").freq(116.5).attack(0.03).decay(0.27).sustain(0).lpf(700).gain(0.8),
);
