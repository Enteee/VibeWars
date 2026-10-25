// ember-deep - C aeolian with a phrygian bII (Db) on purpose, 100 bpm.
// mood: dark, action. Volcanic menace: low brass, anvil hits, a grinding ostinato
// that never quite resolves. Db is the heat, and the only note outside the key.
setcpm(100 / 4)

let P = "<Cm9 Db^7 Cm9 Gm7 Fm9 Db^7 Ab^7 Bb>"

stack(
  // 0: low brass swells and the sub
  chord(P).voicing().mode("below:g3")
    .s("sawtooth").attack(.7).release(1.4).gain(.3)
    .lpf(500).lpenv(3).lpa(.5).lpd(1.2).room(.6).roomsize(6).orbit(2),
  note("<c1 db1 c1 g1 f1 db1 ab1 bb1>").s("sine").attack(.05).release(1.2).gain(.4),
  s("anvil:0 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(.35).room(.6).orbit(2),
  // 1: the grinding ostinato
  layer(1, n("0 0 [0 1] 0 0 3 0 [0 1]").scale("c2:aeolian").fast(2)
      .s("sawtooth").decay(.12).sustain(.2).release(.05).gain(.6)
      .lpf(sine.range(300, 900).slow(8)).lpq(6).distort("1:.4")),
  // 2: war drums and anvil
  layer(2, stack(
    s("taiko:0 ~ ~ taiko:1 ~ taiko:0 ~ ~").gain(.8).room(.4),
    s("anvil:1 ~ ~ ~ ~ anvil:2 ~ ~").gain(.4).room(.5))),
  // 3: brass stabs and the choir
  layer(3, stack(
    n("0 ~ ~ 0 ~ ~ 4 ~").scale("c3:aeolian").s("sawtooth").attack(.02).release(.3).gain(.4)
      .lpf(1500).lpenv(2).lpd(.3).room(.4).orbit(2),
    chord(P).voicing().mode("below:c5").s("sawtooth").vowel("o").attack(.4).release(1.5).gain(.2)
      .lpf(2000).room(.8).orbit(2)))
).postgain(.27)
