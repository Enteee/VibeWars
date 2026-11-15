// sfx cast-motif-spell: 0.2 s, peak -14 dBFS
// A spell is cast (#3298): a quick rising sweep, pitched per skill.
setcpm(60);
stack(
  s("sine").freq(880).penv(12).pattack(0.2).panchor(0).attack(0.02).decay(0.18).sustain(0),
  s("triangle").freq(1320).penv(12).pattack(0.2).panchor(0).attack(0.03).decay(0.17).sustain(0).gain(0.25),
);
