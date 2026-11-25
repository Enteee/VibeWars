// quiet-hearth - G major, 72 bpm. mood: atmospheric, melancholy.
// The back room of an inn between fights: a harp turning slowly over warm
// strings, a low bass once a bar, nothing in a hurry. Level 1 adds a soft
// recorder tune and a lute that hums along under it.
// Eight sections of eight cycles (3m33s before it repeats): four chord walks;
// the tune is sung, moved up, sung again and brought home a step lower.
setcpm(72 / 4)

let A = "<G^7 G^7 Em7 Em7 C^7 C^7 D D>"
let B = "<C^7 C^7 G^7 G^7 Am7 Am7 D D>"
let C = "<Em7 Em7 Bm7 Bm7 C^7 C^7 Am7 D>"
let D = "<Am7 Am7 Bm7 Bm7 C^7 C^7 D D>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, B], [8, A], [8, D], [8, A])

// the tune: two lines of two cycles, then two bars of rest
let tune = "<[0@3 2 4@4] [3@2 2@2 1@4] ~ ~ [4@3 5 4@2 2@2] [1@4 0@4] ~ ~>"
let voice = arrange([8, tune], [8, tune.add(2)], [8, tune], [8, tune.add(-1)],
  [8, tune.add(2)], [8, tune], [8, tune.add(-1)], [8, tune])

stack(
  // 0: warm strings, a bass note a bar, the harp turning
  chord(P).voicing().mode("below:g4")
    .s("triangle").attack(1.5).clip(1).release(2).gain(.1).lpf(1000).room(.7).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("triangle").struct("x ~ ~ ~ ~ ~ ~ ~").attack(.1).release(2).gain(.35).lpf(500),
  n("0 ~ 2 ~ 4 ~ 2 ~").chord(P).voicing().mode("above:g3")
    .s("harp").gain(.42).room(.7).roomsize(6).orbit(2),
  // 1: the recorder sings, the lute hums along
  layer(1, stack(
    n(voice).scale("g3:major")
      .s("recorder").gain(.38).attack(.15).release(.9).lpf(2200).room(.7).roomsize(6).orbit(2),
    n("~ ~ 1 ~ ~ ~ 2 ~").chord(P).voicing().mode("below:d4")
      .s("strum").gain(.3).room(.7).roomsize(6).orbit(2)))
).postgain(.45)
