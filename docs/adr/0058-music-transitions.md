# ADR-0058: One transition model for every change of music

## Status

Accepted (2026-11-25). Issue #3983, operator feedback that the music is
"a bit wild, especially the transitions". Supersedes in part ADR-0028:
the forced-tempo crossfade it shipped with (#366 §3.1) is replaced.

## Context

Every change of music was abrupt in its own way, measured from the code:

- **Track switch.** A 2-cycle equal-power crossfade landing on a phrase.
  Both songs played through the overlap at the _incoming_ song's tempo,
  because the scheduler has one clock. Tracks run from 66 to 150 BPM, so
  the old song suddenly raced or crawled for two cycles. That was the main
  "wild" moment.
- **Intensity.** A layer was a gate, on or off at full level on the next
  cycle, and the director rose straight to its target, so two or three
  layers could arrive on one downbeat.
- **Stings** stacked on the music at full level, with nothing ducking.
- **Trailer.** One take of the fight scene's audio, which included the
  menu-to-match switch, was laid under every scene.

## Decision

**Music changes by fading at the tempo of whatever is playing. No song is
ever played at another's tempo, no level ever jumps, and the trailer has
one song in it.**

1. **A switch fades out, then fades in.** The playing song fades to
   silence over `SWITCH_FADE_CYCLES` (1 cycle), equal power, at its own
   tempo, ending on one of its bars: the first bar with room for the
   whole fade after what the scheduler has already queried, or a phrase
   boundary at most `PHRASE_WAIT_CYCLES` (2) cycles after that bar. On
   that boundary, while the old song is silent, the tempo changes. The
   new song starts on its downbeat there and fades in over one cycle.
   The old song triggers no note from the boundary on; a note that would
   ring past it is shortened to end there (#3530). A match start
   (`landOn: "cycle"`) uses the bar and never waits for the phrase.
   `host/transitions.ts` plans it; `host/crossfade.ts` builds it.
2. **The newest request wins, from wherever the music is.** Before the
   fade starts, a new request replaces the plan, and asking for the
   playing song again cancels it. While the old song fades out, a new
   request lands where the planned one would have; the playing song
   itself can be asked for and fades back in. While the new song fades
   in, a request makes it the outgoing song, and it fades back out from
   the level it got to. There are never two fades on one song.
3. **Intensity is gain, not a gate.** A layer entering fades from 0 to
   full over one cycle from a cycle boundary; one leaving fades out over
   one cycle, from wherever it was. The host climbs a rise one level per
   cycle, so 0 to 3 takes three cycles, each heard. The director still
   falls one level per 8 s of calm. Its `PEAK_HOLD_MS` was dead: shorter
   than `FALL_STEP_MS`, it never held anything. It is deleted.
4. **A sting ducks the music by 6 dB.** The sting plays on an orbit of
   its own (`STING_ORBIT`); the track's orbits drop to −6 dB over 50 ms
   when a sting note starts, hold while the sting sounds, and return over
   one beat. A second sting extends the duck and never deepens it. A
   sting asked for during a switch still waits for the landing, then
   ducks the new song.
5. **Stop** is the 1 s fade it was.
6. **The trailer has one song.** The capture notes every track the host
   reports playing; `assemble.mjs` takes the music only from after the
   last switch has faded in, so the cut's music changes only through the
   fades at its two ends.

Out of the model, unchanged: share playback's `load` and the editor's
`evaluate` swap at once, which is right for someone auditioning a track.
Hidden-tab suspend and the 0.2 s mute and volume ramps are unchanged.

## Consequences

- A switch now takes up to about 7 s from request to full volume at
  66 BPM: up to three cycles of waiting and fading out, one of fading in.
  That is accepted for every screen, the result screen included. A
  screen that needs it faster is named here, not special-cased in code.
- The keys of the two songs still meet only across silence, so they no
  longer clash, but nothing matches them either.
- Levels are per note, at its onset: a long note started before a fade
  keeps the level it started with. The tracks' notes are short enough
  that a fade over a cycle is heard as smooth.
- The duck reaches into superdough's orbits, a surface `strudel.d.ts`
  now declares. An orbit a track first uses during a duck is not ducked.
- A trailer capture without the `musicSettled` mark is refused; it is
  shot again.

## Alternatives Considered

- **The forced-tempo crossfade** (ADR-0028 era, #366 §3.1, #420, #3530).
  Both songs overlapped for two cycles on one clock, the outgoing one at
  the incoming one's tempo. Equal-power curves and shortened notes made
  it smooth in level, but not in time: the old song's tempo jumped at
  the landing. Strudel's scheduler has one tempo, so two songs can only
  overlap at their own tempos if one of them is silent. Replaced, and its
  cps-sharing path deleted.
- **Key-aware transitions** (harmonic matching). A possible follow-up;
  out of scope here.
- **Ducking the whole music bus.** The sting plays through the same bus,
  so it would duck itself.
