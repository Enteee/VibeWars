// sfx form-on: 0.50 s, peak -10 dBFS
// You took a form: a deep swell with a faint ash crackle, a low sine rising
// under a hush of noise.
setcpm(60);
stack(
  s("sine").freq(82).penv(7).pattack(0.4).panchor(0).attack(0.18).decay(0.32).sustain(0),
  s("sine").freq(164).penv(7).pattack(0.4).panchor(0).attack(0.2).decay(0.3).sustain(0).gain(0.35),
  s("white").attack(0.15).decay(0.35).sustain(0).hpf(3000).tremolo(37).tremolodepth(1).gain(0.1),
);
