// still-water - A aeolian, 64 bpm. mood: atmospheric, mysterious.
// A lake at dusk, nothing stirring: a held string chord, soft rings that
// swell and fade one at a time on the water, a low bass held under it all.
// Level 1 adds a harp, muted and far off, that tells a quiet tune.
// Eight sections of eight cycles (4m before it repeats): four chord paths,
// and the rings and the harp turn their figures over section by section.
setcpm(64 / 4)

let A = "<Am9 Am9 F^7 F^7 C^7 C^7 G G>"
let B = "<F^7 F^7 C^7 C^7 Dm7 Dm7 Em7 Em7>"
let C = "<Am9 Am9 Dm7 Dm7 F^7 F^7 Em7 Em7>"
let D = "<Dm7 Dm7 F^7 F^7 G G Em7 G>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, B], [8, D], [8, C], [8, A])

// rings on the water: two a cycle at most, never on the beat twice
let rings = "<[4 ~ ~ ~ ~ ~ 2 ~] [~ ~ ~ 5 ~ ~ ~ ~] [~ 3 ~ ~ ~ ~ ~ ~] ~>"
let ripples = arrange([8, rings], [8, rings.add(1)], [8, rings.rev()], [8, rings],
  [8, rings.add(1).rev()], [8, rings], [8, rings.add(-1)], [8, rings.rev()])
// the harp's tune: a falling line answered by a rising one
let tale = "<[4@2 3 2@3 1@2] [0@6 ~ ~] [1@2 2 4@3 3@2] [2@6 ~ ~] [4@2 5 4@3 2@2] [3@2 2@2 1@4] [0@6 ~ ~] ~>"
let harp = arrange([8, tale], [8, tale.add(2)], [8, tale], [8, tale.add(-2)],
  [8, tale.add(2)], [8, tale.rev()], [8, tale.add(-2)], [8, tale])

stack(
  // 0: the held strings, the rings, the bass
  chord(P).voicing().mode("below:e4")
    .s("triangle").attack(2).clip(1).release(2.5).gain(.1).lpf(800).room(.8).roomsize(6).orbit(2),
  n(ripples).chord(P).voicing().mode("above:e4")
    .s("sine").attack(.12).release(2.5).gain(.14).lpf(1500).room(.8).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("triangle").struct("x ~ ~ ~ ~ ~ ~ ~")
    .attack(.4).release(2.5).gain(.32).lpf(450).room(.5).roomsize(6).orbit(2),
  // 1: the harp tells its tune
  layer(1, n(harp).scale("a3:aeolian")
    .s("harp").gain(.34).lpf(1600).room(.8).roomsize(6).orbit(2))
).postgain(.5)
