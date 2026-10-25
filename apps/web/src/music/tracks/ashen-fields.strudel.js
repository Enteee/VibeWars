// ashen-fields - D aeolian, 66 bpm. mood: melancholy, atmospheric.
// The same land after the fire: a lone cello line over low strings, a harp that
// only touches the chord now and then, a great deal of air between the notes.
// Eight phrases of eight cycles (3m52s before it repeats): four chord
// journeys, and the cello says something new in every phrase.
setcpm(66 / 4)

let A = "<Dm9 Bb^7 Gm9 Am7 Dm9 Bb^7 F^7 Am7>"
let B = "<Gm9 Dm9 Bb^7 Am7 Gm9 F^7 Am7 Dm9>"
let C = "<Bb^7 F^7 Gm9 Dm9 Bb^7 Am7 Gm9 Dm9>"
let D = "<Dm9 Am7 Dm9 Am7 Gm9 Dm9 Bb^7 Am7>"
// phrase order: A B A C | A D B A
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, A], [8, D], [8, B], [8, A])

// Two cycles per line, four lines per phrase.
let line = (a, b, c, d) => cat(n(a), n(b), n(c), n(d)).slow(2)
let cello = arrange(
  [8, line("0 ~ ~ ~ 2 ~ 1 ~ ~ ~ ~ ~ [0 -1] ~ ~ ~", "~ ~ 3 ~ ~ ~ 2 ~ 1 ~ ~ ~ ~ ~ 0 ~", "0 ~ 1 ~ ~ ~ 3 ~ ~ ~ ~ ~ 2 ~ ~ ~", "~ ~ ~ ~ 4 ~ ~ ~ 3 ~ 2 ~ ~ ~ 0 ~")],
  [8, line("3 ~ ~ ~ 4 ~ ~ ~ 5 ~ ~ ~ 4 ~ 3 ~", "~ ~ 2 ~ ~ ~ 3 ~ ~ ~ 4 ~ ~ ~ ~ ~", "5 ~ ~ ~ [4 3] ~ 2 ~ ~ ~ 1 ~ ~ ~ ~ ~", "~ ~ ~ ~ 0 ~ ~ ~ 2 ~ ~ ~ 1 ~ ~ ~")],
  [8, line("~ ~ 0 ~ ~ ~ 2 ~ ~ ~ 4 ~ ~ ~ 3 ~", "2 ~ ~ ~ ~ ~ 1 ~ 0 ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ 3 ~ 2 ~ ~ ~ 1 ~ 0 ~ ~ ~", "-1 ~ ~ ~ ~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~")],
  [8, line("4 ~ ~ ~ ~ ~ 3 ~ 4 ~ ~ ~ 5 ~ ~ ~", "6 ~ ~ ~ 5 ~ ~ ~ 4 ~ 3 ~ ~ ~ ~ ~", "~ ~ 2 ~ ~ ~ 4 ~ ~ ~ 3 ~ ~ ~ 2 ~", "1 ~ ~ ~ ~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~")],
  [8, line("0 ~ ~ 1 ~ ~ 2 ~ ~ ~ ~ ~ 1 ~ ~ ~", "~ ~ 3 ~ ~ ~ ~ ~ 2 ~ 1 ~ 0 ~ ~ ~", "~ ~ ~ ~ 4 ~ ~ 3 ~ ~ 2 ~ ~ ~ ~ ~", "3 ~ ~ ~ 2 ~ ~ ~ 1 ~ ~ ~ 0 ~ ~ ~")],
  [8, line("~ ~ ~ ~ 2 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ 0 ~ ~ ~ ~ ~ ~ ~ 1 ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ 2 ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~")],
  [8, line("2 ~ ~ 3 ~ ~ 4 ~ ~ 5 ~ ~ 4 ~ ~ ~", "~ ~ 3 ~ ~ ~ 5 ~ ~ ~ 6 ~ ~ ~ 5 ~", "4 ~ ~ ~ 3 ~ ~ 2 ~ ~ 1 ~ ~ ~ ~ ~", "~ ~ ~ ~ 0 ~ ~ ~ ~ ~ 1 ~ ~ ~ 0 ~")],
  [8, line("0 ~ ~ ~ 2 ~ 1 ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ 0 ~ ~ ~ -1 ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ 0 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")]
)

// the harp answers where the cello rests: a different pick in each phrase
let touch = arrange(
  [8, line("~ ~ ~ 4 ~ ~ 2 ~ ~ ~ ~ ~ ~ 6 ~ ~", "~ ~ ~ ~ ~ 3 ~ ~ ~ ~ 5 ~ ~ ~ ~ ~", "~ 2 ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 3 ~", "~ ~ ~ ~ ~ ~ 6 ~ ~ ~ ~ 4 ~ ~ ~ ~")],
  [8, line("~ 4 ~ ~ ~ ~ ~ 6 ~ ~ ~ ~ 5 ~ ~ ~", "~ ~ ~ 2 ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~", "~ ~ 6 ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 2 ~", "~ ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ ~ 5 ~ ~ ~")],
  [8, line("~ ~ ~ 5 ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ ~ ~", "~ 6 ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~ 2 ~ ~", "~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 6 ~ ~ ~ ~", "~ ~ 2 ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~")],
  [8, line("~ ~ 2 ~ ~ ~ 4 ~ ~ ~ ~ ~ 6 ~ ~ ~", "~ ~ ~ ~ 5 ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ ~", "6 ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 2 ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~")],
  [8, line("~ ~ ~ 4 ~ ~ ~ ~ ~ 6 ~ ~ ~ ~ ~ ~", "~ 3 ~ ~ ~ ~ 5 ~ ~ ~ ~ ~ ~ ~ 4 ~", "~ ~ ~ ~ ~ 2 ~ ~ ~ ~ ~ ~ 4 ~ ~ ~", "~ ~ 6 ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~ ~")],
  [8, line("~ ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 2 ~ ~ ~ ~ ~", "~ ~ ~ 6 ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ 4 ~ ~ ~")],
  [8, line("~ 2 ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ 6 ~ ~ ~", "~ ~ ~ ~ 5 ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ ~", "~ ~ 4 ~ ~ ~ ~ ~ ~ 6 ~ ~ ~ ~ 5 ~", "~ ~ ~ ~ ~ ~ 3 ~ ~ ~ ~ ~ 2 ~ ~ ~")],
  [8, line("~ ~ ~ 4 ~ ~ ~ ~ ~ ~ ~ ~ ~ 2 ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ 4 ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~", "~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~ ~")]
)

stack(
  // 0: low strings and the cello
  chord(P).voicing().mode("below:g3")
    .s("supersaw").unison(2).detune(.2).attack(2).release(3).gain(.16)
    .lpf(sine.range(500, 1100).slow(32)).room(.9).roomsize(8).orbit(2),
  cello.scale("d3:aeolian")
    .s("sawtooth").attack(.25).release(1.6).gain(.5).vib("5.2:.2")
    .lpf(900).lpenv(2).lpa(.3).lpd(.8).room(.8).roomsize(8).orbit(2),
  // 1: a harp touches the chord, high and far
  layer(1, touch.chord(P).voicing().mode("above:d4")
    .s("harp").gain(.4).room(.9).roomsize(8).orbit(2))
).postgain(.85)
