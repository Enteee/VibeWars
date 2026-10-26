// ember-deep - C aeolian with a phrygian bII (Db) on purpose, 100 bpm.
// mood: dark, action. Volcanic menace: low brass, anvil hits, a grinding ostinato
// that never quite resolves. Db is the heat, and the only note outside the key.
// Ten sections of eight cycles (3m12s before it repeats): four chord
// journeys, and the ostinato and the brass stabs keep changing their notes.
setcpm(100 / 4);

let A = "<Cm9 Db^7 Cm9 Gm7 Fm9 Db^7 Ab^7 Bb>";
let B = "<Fm9 Cm9 Db^7 Cm9 Gm7 Ab^7 Db^7 Bb>";
let C = "<Cm9 Gm7 Ab^7 Bb Cm9 Fm9 Db^7 Gm7>";
let D = "<Db^7 Cm9 Bb Ab^7 Fm9 Gm7 Cm9 Db^7>";
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, D], [8, B], [8, C], [8, A], [8, D], [8, C]);

stack(
  // 0: low brass swells and the sub
  chord(P)
    .voicing()
    .mode("below:g3")
    .s("sawtooth")
    .attack(0.7)
    .release(1.4)
    .gain(0.3)
    .lpf(500)
    .lpenv(3)
    .lpa(0.5)
    .lpd(1.2)
    .room(0.6)
    .roomsize(6)
    .orbit(2),
  note(P.rootNotes(1)).s("sine").attack(0.05).release(1.2).gain(0.4),
  s("anvil:0 ~ ~ ~ ~ ~ ~ ~").slow(2).gain(0.35).room(0.6).roomsize(6).orbit(2),
  // 1: the grinding ostinato
  layer(
    1,
    n("0 0 [0 1] 0 0 3 0 [0 1]".fast(2).add("<0 0 0 0 0 0 3 0 0 0 0 0 -2 0 3 1>"))
      .scale("c2:aeolian")
      .s("sawtooth")
      .decay(0.12)
      .sustain(0.2)
      .release(0.05)
      .gain(0.6)
      .lpf(sine.range(300, 900).slow(8))
      .lpq(6)
      .distort("1:.4"),
  ),
  // 2: war drums and anvil
  layer(
    2,
    stack(
      s("taiko:0 ~ ~ taiko:1 ~ taiko:0 ~ ~").gain(0.8).room(0.4),
      s("anvil:1 ~ ~ ~ ~ anvil:2 ~ ~").gain(0.4).room(0.5),
    ),
  ),
  // 3: brass stabs and the choir
  layer(
    3,
    stack(
      n("0 ~ ~ 0 ~ ~ 4 ~".add("<0 0 2 0 3 0 -1 0 4 2 0 0 -2 0 3 2>"))
        .scale("c3:aeolian")
        .s("sawtooth")
        .attack(0.02)
        .release(0.3)
        .gain(0.4)
        .lpf(1000)
        .lpenv(2)
        .lpd(0.3)
        .room(0.4)
        .roomsize(6)
        .orbit(2),
      chord(P)
        .voicing()
        .mode("below:c5")
        .s("sawtooth")
        .lpq(4)
        .attack(0.4)
        .release(1.5)
        .gain(0.2)
        .lpf(2000)
        .room(0.8)
        .roomsize(6)
        .orbit(2),
    ),
  ),
).postgain(0.27);
