/**
 * The slice of Strudel the sound-effect renderer touches beyond what the
 * music host declares (`src/music/host/strudel.d.ts`, which merges with
 * this): superdough's context and one-shot entry point.
 */
declare module "@strudel/webaudio" {
  export function getAudioContext(): { close(): Promise<void> };
  export function setAudioContext(context: OfflineAudioContext | null): void;
  export function setSuperdoughAudioController(controller: null): void;
  export function resetGlobalEffects(): void;
  export function superdough(
    value: unknown,
    begin: number,
    duration: number,
    cps: number,
    cycle: number,
  ): Promise<void>;
}

declare module "@strudel/core" {
  interface Hap {
    readonly duration: Fraction;
    hasOnset(): boolean;
    ensureObjectValue(): void;
  }
}
