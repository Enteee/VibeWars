// long - D aeolian, 72 bpm. Four 16-cycle sections, each with its own bass
// and its own answer to a 2-cycle melody: 64 cycles, 213 s, before it comes
// round, at every level. Passes the form rules (#427).
setcpm(72 / 4)

stack(
  // 0: one root per section
  note("<d2!16 c2!16 bb1!16 a1!16>").s("triangle").gain(.5).release(1),
  n("<[0 ~ 2 4] [5 4 ~ 2]>").scale("d4:aeolian")
    .s("sine").gain(.3).attack(.1).release(.8),
  // the answer changes with the section
  n("<[~ ~ 7 ~]!16 [~ 9 ~ 7]!16 [~ ~ 4 ~]!16 [~ 6 ~ 5]!16>").scale("d4:aeolian")
    .s("sine").gain(.2).release(.6),
  // 1: engaged
  layer(1, n("0 2 4 2").scale("d3:aeolian").s("triangle").gain(.2)),
  // 2: fighting
  layer(2, s("<white ~ ~ ~> ~ [~ white] ~").lpf(300).gain(.5))
).postgain(.45)
