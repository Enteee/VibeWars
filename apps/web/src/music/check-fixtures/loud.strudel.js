// loud - good.strudel.js without the track-wide postgain.
// layer(n, pat) plays pat only while the director's intensity is >= n.
setcpm(72 / 4);

let P = "<Dm9 Dm9 Cadd9 Cadd9 Bb^7 Bb^7 Am7 Am7>";

stack(
  // 0: the bed
  chord(P)
    .voicing()
    .mode("below:a4")
    .s("sawtooth")
    .attack(1.2)
    .release(2)
    .gain(0.35)
    .lpf(sine.range(800, 2000).slow(16))
    .room(0.9)
    .roomsize(6)
    .orbit(2),
  note("<d2 d2 c2 c2 bb1 bb1 a1 a1>").s("triangle").gain(0.5).release(1),
  n("0 ~ ~ 4 [7 6] ~ 4 ~")
    .slow(2)
    .scale("d4:aeolian")
    .s("sine")
    .gain(0.32)
    .attack(0.1)
    .release(0.8)
    .room(0.8)
    .orbit(2),
  // 1: engaged
  layer(
    1,
    n("0 2 4 [5 4] 2 4 0 ~")
      .chord(P)
      .voicing()
      .mode("above:d4")
      .s("triangle")
      .gain(0.3)
      .clip(1.5)
      .room(0.7)
      .orbit(2),
  ),
  // 2: fighting
  layer(
    2,
    stack(
      s("<white ~ ~ ~> ~ [~ white] ~").lpf(300).gain(0.6),
      s("~ ~ ~ <~ pink>").room(0.6).gain(0.25),
    ),
  ),
).postgain(3);
