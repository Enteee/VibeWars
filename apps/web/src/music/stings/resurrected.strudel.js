// resurrected - a rising harp gliss, and the choir answers it with an
// open chord: someone stands up again.
stack(
  n("[0 1 2 3 4 5 6 7 8 9 10 11] ~").scale(KEY).s("harp").gain(.35).room(.6),
  n("~ [7,9,11]").scale(KEY)
    .s("supersaw").unison(1).attack(.4).release(.6).gain(.2).lpf(1800).room(.7),
  s("~ bells:1").gain(.2).room(.7)
).slow(2).postgain(.4)
