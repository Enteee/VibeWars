// sfx cast-motif-ward: 0.22 s, peak -14 dBFS
// A well, ward or trap is laid (#3298): a low ping, the ground's.
setcpm(60);
stack(
  s("sine").freq(420).attack(0.004).decay(0.21).sustain(0),
  s("sine").freq(630).attack(0.004).decay(0.12).sustain(0).gain(0.3),
);
