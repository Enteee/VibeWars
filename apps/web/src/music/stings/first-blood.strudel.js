// first-blood - a low brass hit: a dark chord stabbed once with a taiko,
// then let ring.
stack(
  n("[-7,-3,0] ~ ~ ~").scale(KEY)
    .s("sawtooth").attack(.01).release(.8).gain(.4)
    .lpf(300).lpenv(4).lpa(.01).lpd(.4).room(.4),
  s("taiko:0 ~ ~ ~").gain(.5),
  s("gong:0 ~ ~ ~").gain(.2)
).postgain(.4)
