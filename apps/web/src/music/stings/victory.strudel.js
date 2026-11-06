// victory - a fanfare: brass calls on the tonic, climbs to the octave
// over timpani, and holds it for the hymn to take over.
stack(
  n("<[0 0 0 2] [4@3 2] [4 5 6 7] [7@3 ~]>")
    .scale(KEY)
    .s("sawtooth")
    .attack(0.03)
    .release(0.3)
    .gain(0.4)
    .lpf(700)
    .lpenv(3)
    .lpa(0.05)
    .lpd(0.5)
    .room(0.6),
  n("<[-7,-3] [-5,-3] [-3,0] [0,4]>")
    .scale(KEY)
    .s("sawtooth")
    .attack(0.2)
    .release(0.4)
    .gain(0.2)
    .lpf(1200)
    .room(0.6),
  s("<[timp:2*4] [timp:2*4] [timp:2*8] [crash:0 ~ ~ ~]>").gain(0.3),
).postgain(0.4);
