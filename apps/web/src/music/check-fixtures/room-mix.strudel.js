// room-mix - D aeolian, 72 bpm. The long fixture, but the melody and the
// answer share orbit 2 with two room sizes, and the bass sits on orbit 2
// with none: superdough would rebuild the reverb on every change (#420).
// Fails "one room per orbit" at every level, and nothing else.
setcpm(72 / 4)

stack(
  note("<d2!16 c2!16 bb1!16 a1!16>").s("triangle").gain(.5).release(1).orbit(2),
  n("<[0 ~ 2 4] [5 4 ~ 2]>").scale("d4:aeolian")
    .s("sine").gain(.3).attack(.1).release(.8).orbit(2).room(.4).roomsize(7),
  n("<[~ ~ 7 ~]!16 [~ 9 ~ 7]!16 [~ ~ 4 ~]!16 [~ 6 ~ 5]!16>").scale("d4:aeolian")
    .s("sine").gain(.2).release(.6).orbit(2).room(.4).roomsize(6),
  layer(1, n("0 2 4 2").scale("d3:aeolian").s("triangle").gain(.2)),
  layer(2, s("<white ~ ~ ~> ~ [~ white] ~").lpf(300).gain(.5))
).postgain(.45)
