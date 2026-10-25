// ashen-fields - D aeolian, 66 bpm. mood: melancholy, atmospheric.
// The same land after the fire: a lone cello line over low strings, a harp that
// only touches the chord now and then, a great deal of air between the notes.
setcpm(66 / 4)

let P = "<Dm9 Bb^7 Gm9 Am7 Dm9 Bb^7 F^7 Am7>"

stack(
  // 0: low strings and the cello
  chord(P).voicing().mode("below:g3")
    .s("supersaw").unison(2).detune(.2).attack(2).release(3).gain(.2)
    .lpf(sine.range(500, 1100).slow(32)).room(.9).roomsize(9).orbit(2),
  n("0 ~ ~ ~ 2 ~ 1 ~ ~ ~ ~ ~ [0 -1] ~ ~ ~").slow(2).scale("d3:aeolian")
    .s("sawtooth").attack(.25).release(1.6).gain(.5).vib("5.2:.2")
    .lpf(900).lpenv(2).lpa(.3).lpd(.8).room(.8).roomsize(7).orbit(2),
  // 1: a harp touches the chord, high and far
  layer(1, n("~ ~ ~ 4 ~ ~ 2 ~ ~ ~ ~ ~ ~ 6 ~ ~").slow(2).chord(P).voicing().mode("above:d4")
    .s("harp").gain(.55).room(.9).roomsize(8).orbit(2))
).postgain(.85)
