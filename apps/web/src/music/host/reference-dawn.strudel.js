// reference-dawn - D aeolian, 72 bpm. mood: atmospheric, adventurous.
// layer(n, pat) plays pat only while the director's intensity is >= n.
// Spike (#368): built-in synths only, plus one self-hosted sample (ping).
setcpm(72 / 4);

let P = "<Dm9 Dm9 Cadd9 Cadd9 Bb^7 Bb^7 Am7 Am7>";

stack(
  // 0: the bed - strings, bass, a distant flute
  chord(P)
    .voicing()
    .mode("below:a4")
    .s("sawtooth")
    .attack(1.2)
    .release(2)
    .gain(0.2)
    .lpf(sine.range(800, 2000).slow(16))
    .room(0.9)
    .roomsize(8)
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
  // 1: engaged - the harp starts moving
  layer(
    1,
    n("0 2 4 [5 4] 2 4 0 ~")
      .chord(P)
      .voicing()
      .mode("above:d4")
      .s("triangle")
      .decay(0.4)
      .sustain(0)
      .gain(0.3)
      .room(0.7)
      .orbit(2),
  ),
  // 2: fighting - drums, and the self-hosted sample
  layer(
    2,
    stack(
      note("<d1 ~ ~ ~> ~ [~ d1] ~").s("sine").penv(24).pdecay(0.08).decay(0.3).sustain(0).gain(0.8),
      s("~ ~ ~ <~ white>").decay(0.12).sustain(0).hpf(1500).room(0.6).gain(0.25),
      s("~ ping ~ ~").gain(0.3),
    ),
  ),
).postgain(0.38);
