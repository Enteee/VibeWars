// clash-of-banners - A dorian, 140 bpm. mood: action, epic.
// A 4v4 skirmish. Driving war drums, a string ostinato in sixteenths, short
// brass stabs. Even the calm level keeps moving: this is a fight track.
// Fourteen sections of eight cycles (3m12s before it repeats): four chord
// journeys, and the bass riff, the stabs and the whistle never repeat a bar.
setcpm(140 / 4);

let A = "<Am7 D7 Am7 G^7 Am7 D7 Em7 Am7>";
let B = "<Am7 G^7 C^7 D7 Am7 Em7 D7 G^7>";
let C = "<Em7 Am7 D7 G^7 C^7 D7 Bm7 Em7>";
let D = "<Am7 C^7 G^7 D7 Em7 G^7 D7 Am7>";
let P = arrange(
  [8, A],
  [8, B],
  [8, A],
  [8, C],
  [8, D],
  [8, B],
  [8, C],
  [8, A],
  [8, D],
  [8, B],
  [8, C],
  [8, D],
  [8, B],
  [8, A],
);

// the whistle's tune: eight cycles
let tune =
  "<[7 ~ 6 4 ~ 4 2 ~] [4 ~ 2 0 ~ 0 2 4] [6 ~ 4 2 ~ 2 0 ~] [2 ~ 4 6 ~ 7 6 4] [7 ~ 7 6 ~ 4 6 7] [4 ~ 6 4 ~ 2 0 ~] [2 4 6 4 2 ~ 0 ~] [0 ~ ~ 2 4 ~ ~ ~]>";
let whistle = arrange(
  [8, tune],
  [8, tune.add(2)],
  [8, tune.rev()],
  [8, tune.add(-2)],
  [8, tune.add(3)],
  [8, tune.rev().add(2)],
  [8, tune],
  [8, tune.add(-2).rev()],
  [8, tune.add(2).rev()],
  [8, tune.add(3)],
  [8, tune.rev()],
  [8, tune.add(-2)],
  [8, tune.add(2)],
  [8, tune],
);

stack(
  // 0: sixteenth-note string pulse on the root, a bass line
  n("0 0 [0 7] 0 0 [0 7] 0 0 0 [0 7] 0 [4 3] 0 0 [2 0]".add("<0 0 1 0 0 0 -1 0 0 2 0 0 -2 0 0 3>"))
    .scale("a2:dorian")
    .s("sawtooth")
    .decay(0.1)
    .sustain(0)
    .release(0.05)
    .gain(0.45)
    .lpf(ref(() => 600 + INTENSITY * 500))
    .roomsize(6)
    .orbit(2),
  chord(P)
    .voicing()
    .mode("below:e4")
    .s("supersaw")
    .unison(3)
    .detune(0.2)
    .attack(0.1)
    .release(0.6)
    .gain(0.22)
    .lpf(1400)
    .room(0.4)
    .roomsize(6)
    .orbit(2),
  s("timp:1 ~ ~ ~ timp:1 ~ ~ ~").gain(0.5).room(0.3),
  // 1: frame drums drive the offbeat, the lute stabs
  layer(
    1,
    stack(
      s("~ frame:0 ~ frame:2 ~ frame:0 ~ frame:2").gain(0.45),
      n("<0 ~ 2 ~>*4").chord(P).voicing().mode("above:a3").s("strum").gain(0.5).room(0.3),
    ),
  ),
  // 2: war drums, snare, brass stabs
  layer(
    2,
    stack(
      s("taiko:0 ~ taiko:1 taiko:0 ~ taiko:1 taiko:0 ~").gain(0.8).room(0.3),
      s("~ ~ snare:0 ~ ~ ~ snare:1 ~").gain(0.4),
      n("[0 ~ ~ 0 ~ ~ 2 ~] [~ ~ 4 ~ ~ 2 ~ ~]".add("<0 2 0 3 4 0 -2 0>"))
        .scale("a3:dorian")
        .s("sawtooth")
        .attack(0.01)
        .release(0.2)
        .gain(0.5)
        .lpf(1000)
        .lpenv(2)
        .lpd(0.15)
        .room(0.3)
        .roomsize(6)
        .orbit(2),
    ),
  ),
  // 3: crash on the bar, the whistle screams the tune
  layer(
    3,
    stack(
      s("crash:1 ~ ~ ~ ~ ~ ~ ~").gain(0.35),
      n(whistle)
        .scale("a3:dorian")
        .s("whistle")
        .gain(0.5)
        .attack(0.02)
        .release(0.3)
        .lpf(2800)
        .room(0.4)
        .roomsize(6)
        .orbit(2),
    ),
  ),
).postgain(0.31);
