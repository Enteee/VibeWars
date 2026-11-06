// victory - a fanfare: brass calls on the tonic, climbs to the octave
// over timpani, and holds it for the hymn to take over.
stack(
  n("<[0 0 0 2] [4@3 2] [4 5 6 7] [7@3 ~]>").scale(KEY)
    .s("sawtooth").attack(.03).release(.3).gain(.4)
    .lpf(700).lpenv(3).lpa(.05).lpd(.5).room(.6),
  n("<[-7,-3] [-5,-3] [-3,0] [0,4]>").scale(KEY)
    .s("sawtooth").attack(.2).release(.4).gain(.2).lpf(1200).room(.6),
  s("<[timp:2*4] [timp:2*4] [timp:2*8] [crash:0 ~ ~ ~]>").gain(.3)
).postgain(.4)
