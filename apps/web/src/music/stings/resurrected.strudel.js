// resurrected - a rising harp gliss, and the choir answers it with an
// open chord: someone stands up again.
stack(
  n("[0 1 2 3 4 5 6 7 8 9 10 11] ~").scale(KEY).s("harp").gain(0.35).room(0.6),
  n("~ [7,9,11]")
    .scale(KEY)
    .s("supersaw")
    .unison(1)
    .attack(0.4)
    .release(0.6)
    .gain(0.2)
    .lpf(1800)
    .room(0.7),
  s("~ bells:1").gain(0.2).room(0.7),
)
  .slow(2)
  .postgain(0.4);
