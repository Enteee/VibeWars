/**
 * Deterministic pseudo-random number generation for the simulation.
 *
 * The simulation must never call `Math.random()` directly (see
 * `docs/adr/0003-simulation.md`). Every source of randomness is an explicit,
 * injectable `SimulationRng` seeded from the match seed, so that a match can
 * later be reproduced exactly from `(seed, initialState, inputStream)`.
 */

/** A deterministic, seekable source of randomness. */
export interface SimulationRng {
  /** Uniform float in `[0, 1)`. */
  nextFloat(): number;
  /** Uniform unsigned 32-bit integer. */
  nextUint32(): number;
  /** Uniform integer in `[minInclusive, maxExclusive)`. */
  nextInt(minInclusive: number, maxExclusive: number): number;
  /** Current internal state, for snapshotting/replay. */
  getState(): number;
  /** Restore a previously captured state. */
  setState(state: number): void;
}

/**
 * Derive a 32-bit seed from an arbitrary string (e.g. a match id or lobby
 * code) using the FNV-1a hash. Stable across platforms and runs.
 */
export function seedFromString(input: string): number {
  // FNV-1a, 32-bit.
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    // hash *= 16777619, kept in 32-bit space.
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Mulberry32: a compact 32-bit PRNG with a full 2^32 period.
 *
 * Chosen over `xoshiro`/`pcg` because the simulation only needs cheap,
 * reproducible, well-distributed randomness for things like damage variance
 * and tie-breaking — not cryptographic quality. It is pure integer math, so
 * it behaves identically on every JS engine.
 */
export function createRng(seed: number): SimulationRng {
  let state = seed >>> 0;

  const nextUint32 = (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (t ^ (t >>> 14)) >>> 0;
  };

  return {
    nextUint32,
    nextFloat: () => nextUint32() / 0x100000000,
    nextInt: (minInclusive: number, maxExclusive: number): number => {
      if (!Number.isInteger(minInclusive) || !Number.isInteger(maxExclusive)) {
        throw new RangeError("nextInt bounds must be integers");
      }
      if (maxExclusive <= minInclusive) {
        throw new RangeError(
          `nextInt requires maxExclusive > minInclusive, got [${String(minInclusive)}, ${String(maxExclusive)})`,
        );
      }
      const span = maxExclusive - minInclusive;
      return minInclusive + Math.floor((nextUint32() / 0x100000000) * span);
    },
    getState: () => state,
    setState: (next: number) => {
      state = next >>> 0;
    },
  };
}
