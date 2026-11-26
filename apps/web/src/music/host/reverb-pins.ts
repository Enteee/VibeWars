/**
 * One reverb per orbit (#420). superdough keeps a single reverb on each
 * orbit and rebuilds its impulse response, seconds of noise generated on
 * the main thread, whenever an event asks for a different room on that
 * orbit. Two voices with different `roomsize` on one orbit rebuild it every
 * few hundred milliseconds: the stall skips music, and every rebuild swaps
 * the convolver's buffer and cuts its tail, which crackles.
 *
 * So the first room a track asks for on an orbit is the one that orbit
 * keeps until the next track plays alone. A voice that wants a different
 * room belongs on an orbit of its own.
 */

/** The fields that make superdough rebuild an orbit's reverb. */
export const ROOM_FIELDS = ["roomsize", "roomfade", "roomlp", "roomdim"] as const;

/** superdough's default orbit. */
const DEFAULT_ORBIT = 1;

export interface ReverbPins {
  /** `value` with its room fields set to what its orbit already has. */
  pin(value: unknown): unknown;
  /** Forget every orbit's room: the next track sets its own. */
  reset(): void;
}

function record(value: unknown): Readonly<Record<string, unknown>> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

export function reverbPins(): ReverbPins {
  const orbits = new Map<unknown, Record<string, unknown>>();
  return {
    pin(value) {
      const fields = record(value);
      if (fields === null) {
        return value;
      }
      const orbit = fields.orbit ?? DEFAULT_ORBIT;
      let pinned = orbits.get(orbit);
      if (pinned === undefined) {
        pinned = {};
        orbits.set(orbit, pinned);
      }
      let changed: Record<string, unknown> | undefined;
      for (const field of ROOM_FIELDS) {
        const asked = fields[field];
        // superdough keeps the orbit's room for an event that sets none.
        if (asked === undefined) {
          continue;
        }
        if (!(field in pinned)) {
          pinned[field] = asked;
        } else if (pinned[field] !== asked) {
          changed ??= { ...fields };
          changed[field] = pinned[field];
        }
      }
      return changed ?? value;
    },
    reset() {
      orbits.clear();
    },
  };
}
