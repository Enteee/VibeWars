// lantern-road - F major, 68 bpm. mood: atmospheric, adventurous.
// The road out of town at evening, lanterns lit along it: a lute strums a
// slow walking pattern, warm strings hold the chord, a soft bass leans on
// each bar. Level 1 adds a harp that hums a low, unhurried tune.
// Eight sections of eight cycles (3m46s before it repeats): four chord walks;
// the tune is hummed, lifted, hummed again and set down a step lower.
setcpm(68 / 4)

let A = "<F^7 F^7 Dm7 Dm7 Bb^7 Bb^7 C C>"
let B = "<Bb^7 Bb^7 F^7 F^7 Gm7 Gm7 C C>"
let C = "<Dm7 Dm7 Am7 Am7 Bb^7 Bb^7 Gm7 C>"
let D = "<Gm7 Gm7 Am7 Am7 Bb^7 Bb^7 C C>"
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, B], [8, A], [8, D], [8, A])

// the tune: a line that climbs and settles, an answer that falls, then rest
let tune = "<[0@2 1 2@5] [4@3 2@2 1@3] ~ ~ [2@2 3 4@5] [3@2 1@2 0@4] ~ ~>"
let hum = arrange([8, tune], [8, tune.add(2)], [8, tune], [8, tune.add(-1)],
  [8, tune.add(2)], [8, tune], [8, tune.add(-1)], [8, tune])

stack(
  // 0: the strings, the bass a bar, the lute walking
  chord(P).voicing().mode("below:f4")
    .s("triangle").attack(1.5).clip(1).release(2).gain(.1).lpf(900).room(.7).roomsize(6).orbit(2),
  note(P.rootNotes(2)).s("triangle").struct("x ~ ~ ~ ~ ~ ~ ~").attack(.2).release(2).gain(.33).lpf(450),
  n("0 ~ 1 ~ 2 ~ 1 ~").chord(P).voicing().mode("below:c4")
    .s("strum").gain(.34).lpf(1800).room(.7).roomsize(6).orbit(2),
  // 1: the harp hums the tune, low
  layer(1, n(hum).scale("f3:major")
    .s("harp").gain(.36).lpf(1800).room(.7).roomsize(6).orbit(2))
).postgain(.45)
