// first-light - D lydian, 76 bpm. mood: atmospheric, adventurous.
// Pastoral morning before everything went wrong: a recorder over harp and warm
// strings, the raised 4th (G#) as hope. Level 0 is the morning, level 1 the walk.
// Eight phrases of eight cycles (3m22s before it repeats): the chords change
// in four ways, and the recorder tells a different tale in each phrase.
setcpm(76 / 4)

let A = "<D^9 E Bm7 A D^9 E F#m7 A>"
let B = "<Bm7 C#m7 D^9 E F#m7 Bm7 E A>"
let C = "<D^9 F#m7 Bm7 C#m7 D^9 E A D^9>"
let D = "<F#m7 Bm7 E A D^9 C#m7 Bm7 E>"
// phrase order: A B A C | A' D B A
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, A], [8, D], [8, B], [8, A])

// Two cycles per line, four lines per phrase.
let lead = (a, b, c, d) => cat(n(a), n(b), n(c), n(d)).slow(2)
let tale = arrange(
  [8, lead("0 ~ ~ 4 [3 2] ~ 1 ~ 0 ~ ~ 5 [4 3] 2 ~ ~", "~ ~ 2 ~ 4 ~ [5 4] ~ 3 ~ ~ ~ 2 ~ 1 ~", "0 ~ 1 2 ~ ~ 4 ~ [3 2] 1 ~ ~ 0 ~ ~ ~", "~ ~ ~ ~ 2 ~ 4 5 ~ ~ 6 ~ [5 4] 3 ~ ~")],
  [8, lead("4 ~ ~ 5 ~ 6 ~ ~ 7 ~ ~ ~ 6 ~ 5 ~", "~ ~ 4 ~ [5 6] ~ 7 ~ ~ ~ 6 ~ 5 ~ ~ ~", "2 ~ 4 ~ ~ 5 ~ ~ [6 5] 4 ~ ~ 2 ~ ~ ~", "~ ~ ~ ~ 0 ~ 2 ~ 4 ~ ~ ~ 3 ~ 2 ~")],
  [8, lead("0 ~ 2 ~ 4 ~ ~ ~ ~ ~ 3 ~ 2 ~ ~ ~", "~ ~ ~ ~ ~ ~ 5 ~ 4 ~ ~ ~ 2 ~ ~ ~", "1 ~ ~ 2 ~ ~ 4 ~ ~ ~ 3 2 1 ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~")],
  [8, lead("~ ~ 5 ~ ~ 4 ~ 3 ~ ~ 2 ~ ~ ~ ~ ~", "6 ~ ~ 5 ~ ~ 4 ~ [3 2] ~ ~ ~ 4 ~ ~ ~", "~ ~ 2 ~ 3 ~ 4 ~ ~ 5 ~ ~ 6 ~ ~ ~", "7 ~ ~ ~ ~ ~ 5 ~ ~ ~ 4 ~ 2 ~ ~ ~")],
  [8, lead("0 ~ ~ 4 ~ 3 ~ 2 ~ ~ 1 ~ ~ ~ ~ ~", "~ ~ 1 ~ 2 ~ ~ 4 ~ ~ 5 ~ 4 ~ ~ ~", "2 ~ ~ ~ 4 ~ ~ [5 6] ~ ~ 4 ~ ~ ~ 2 ~", "0 ~ ~ ~ ~ ~ 1 ~ ~ ~ ~ 2 ~ ~ ~ ~")],
  [8, lead("~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 3 ~ ~ ~ ~ ~", "2 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~ ~ ~ ~ ~", "~ ~ 0 ~ ~ ~ 2 ~ ~ ~ 4 ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ 3 ~ ~ ~ 2 ~ ~ ~")],
  [8, lead("4 ~ 5 ~ ~ 6 ~ ~ 5 ~ 4 ~ ~ ~ 2 ~", "~ ~ 3 ~ 4 ~ 5 ~ ~ ~ 7 ~ ~ ~ 6 ~", "5 ~ ~ 4 ~ ~ 2 ~ ~ 3 ~ 4 ~ ~ ~ ~", "~ ~ 2 ~ ~ ~ 0 ~ 1 ~ ~ ~ 2 ~ ~ ~")],
  [8, lead("0 ~ ~ 4 [3 2] ~ 1 ~ 0 ~ ~ ~ ~ ~ ~ ~", "~ ~ 2 ~ 1 ~ 0 ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")]
)

stack(
  // 0: strings, a soft bass, the flute
  chord(P).voicing().mode("below:a4")
    .s("supersaw").unison(3).detune(.25).attack(1.4).release(2.2).gain(.18)
    .lpf(sine.range(700, 1800).slow(16)).room(.8).roomsize(7).orbit(2),
  note(P.rootNotes(2)).s("triangle").attack(.08).release(1.2).gain(.45),
  tale.scale("d5:lydian")
    .s("recorder").gain(.5).attack(.08).release(.6).room(.7).roomsize(7).orbit(2),
  // 1: the harp starts walking, a frame drum keeps time far off
  layer(1, stack(
    n("0 2 4 [5 4] 2 4 6 [4 2]").chord(P).voicing().mode("above:d3")
      .s("harp").gain(.55).room(.6).roomsize(7).orbit(2),
    s("frame:3 ~ ~ ~ frame:3 ~ [~ frame:3] ~").gain(.35).room(.4)))
).postgain(.4)
