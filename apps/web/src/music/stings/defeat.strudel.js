// defeat - a falling cello phrase over a low drone, settling on the
// tonic for the lament to take over.
stack(
  n("<[7@2 6 5] [4@2 3 2] [1@2 0 -1] [0@3 ~]>")
    .scale(KEY)
    .s("sawtooth")
    .attack(0.15)
    .release(0.6)
    .gain(0.4)
    .lpf(600)
    .room(0.6),
  n("-7").scale(KEY).s("triangle").attack(1).release(1).gain(0.35),
  s("<gong:0 ~ ~ ~>").gain(0.15),
).postgain(0.4);
