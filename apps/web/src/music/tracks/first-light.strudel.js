// first-light - D lydian, 76 bpm. mood: atmospheric, adventurous.
// Pastoral morning before everything went wrong: harp over warm strings, the
// raised 4th (G#) as hope. Level 0 is the morning, level 1 the walk.
// Eight phrases of eight cycles (3m22s before it repeats): the chords change
// in four ways.
setcpm(76 / 4);

let A = "<D^9 E Bm7 A D^9 E F#m7 A>";
let B = "<Bm7 C#m7 D^9 E F#m7 Bm7 E A>";
let C = "<D^9 F#m7 Bm7 C#m7 D^9 E A D^9>";
let D = "<F#m7 Bm7 E A D^9 C#m7 Bm7 E>";
// phrase order: A B A C | A' D B A
let P = arrange([8, A], [8, B], [8, A], [8, C], [8, A], [8, D], [8, B], [8, A]);

stack(
  // 0: strings and a soft bass
  chord(P)
    .voicing()
    .mode("below:a4")
    .s("supersaw")
    .unison(3)
    .detune(0.25)
    .attack(1.4)
    .clip(0.9)
    .release(0.25)
    .gain(0.18)
    .lpf(sine.range(700, 1800).slow(16))
    .room(0.8)
    .roomsize(6)
    .orbit(2),
  note(P.rootNotes(2)).s("triangle").attack(0.08).release(1.2).gain(0.45),
  // 1: the harp starts walking, a frame drum keeps time far off
  layer(
    1,
    stack(
      n("0 2 4 [5 4] 2 4 6 [4 2]")
        .chord(P)
        .voicing()
        .mode("above:d3")
        .s("harp")
        .gain(0.55)
        .room(0.6)
        .roomsize(6)
        .orbit(2),
      s("frame:3 ~ ~ ~ frame:3 ~ [~ frame:3] ~").gain(0.35).room(0.4),
    ),
  ),
).postgain(0.4);
