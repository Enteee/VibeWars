// short-loop - D aeolian, 72 bpm. Every voice comes round every 8 cycles, so
// the whole track repeats after 27 s: the form rule must fail it (#427).
setcpm(72 / 4);

stack(
  note("<d2 d2 c2 c2 bb1 bb1 a1 a1>").s("triangle").gain(0.5).release(1),
  n("0 ~ 2 4 [5 4] ~ 2 ~")
    .slow(2)
    .scale("d4:aeolian")
    .s("sine")
    .gain(0.32)
    .attack(0.1)
    .release(0.8),
  layer(1, n("0 2 4 2").scale("d3:aeolian").s("triangle").gain(0.25)),
  layer(2, s("<white ~ ~ ~> ~ [~ white] ~").lpf(300).gain(0.5)),
).postgain(0.5);
