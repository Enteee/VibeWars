// first-blood - a low brass hit: a dark chord stabbed once with a taiko,
// then let ring.
stack(
  n("[-7,-3,0] ~ ~ ~")
    .scale(KEY)
    .s("sawtooth")
    .attack(0.01)
    .release(0.8)
    .gain(0.4)
    .lpf(300)
    .lpenv(4)
    .lpa(0.01)
    .lpd(0.4)
    .room(0.4),
  s("taiko:0 ~ ~ ~").gain(0.5),
  s("gong:0 ~ ~ ~").gain(0.2),
).postgain(0.4);
