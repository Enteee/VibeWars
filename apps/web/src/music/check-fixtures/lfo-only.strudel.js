// lfo-only - D aeolian, 72 bpm. The notes repeat every 4 cycles; only a
// 64-cycle sine on the filter moves. Controls do not count as variation, so
// the form rule must still fail it (#427).
setcpm(72 / 4)

stack(
  note("<d2 c2 bb1 a1>").s("sawtooth").gain(.4).release(1)
    .lpf(sine.range(300, 3000).slow(64)),
  n("0 2 4 [5 4]").scale("d4:aeolian").s("sine").gain(.3)
    .lpf(sine.range(800, 4000).slow(64)),
  layer(1, n("0 4").scale("d3:aeolian").s("triangle").gain(.25)),
  layer(2, s("white*2").lpf(sine.range(200, 900).slow(64)).gain(.3))
).postgain(.5)
