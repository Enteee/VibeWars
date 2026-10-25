/**
 * The slice of Strudel the music host touches (ADR-0028). Strudel ships no
 * types; this is deliberately the narrowest surface that compiles.
 */
declare module "@strudel/core" {
  export interface Fraction {
    valueOf(): number;
  }
  export interface Hap {
    readonly whole: { readonly begin: Fraction } | undefined;
    readonly value: unknown;
    wholeOrPart(): { readonly begin: Fraction };
    withValue(func: (value: unknown) => unknown): Hap;
  }
  export interface State {
    readonly span: { readonly begin: Fraction; readonly end: Fraction };
  }
  export class Pattern {
    constructor(query: (state: State) => Hap[]);
    query(state: State): Hap[];
    queryArc(begin: number, end: number): Hap[];
    filterHaps(test: (hap: Hap) => boolean): Pattern;
    withHap(func: (hap: Hap) => Hap): Pattern;
    late(cycles: number): Pattern;
  }
  /** The scheduler `webaudioRepl` makes; the host's tests drive one directly. */
  export class Cyclist {
    constructor(options: {
      onTrigger: (hap: Hap, deadline: number, duration: number, cps: number, t: number) => void;
      getTime: () => number;
      setInterval: (callback: () => void, ms: number) => number;
      clearInterval: (id: number) => void;
    });
    setCps(cps: number): void;
    setPattern(pattern: Pattern, autostart?: boolean): Promise<void>;
    stop(): void;
  }
  export function isPattern(value: unknown): value is Pattern;
  export function stack(...patterns: readonly Pattern[]): Pattern;
  export const silence: Pattern;
  export function pure(value: unknown): Pattern;
  export function evalScope(...modules: readonly object[]): Promise<readonly object[]>;
}
declare module "@strudel/mini" {}
declare module "@strudel/tonal" {}
declare module "@strudel/transpiler" {
  import type { Pattern } from "@strudel/core";

  export function transpiler(input: string, options?: object): { output: string };
  export function evaluate(code: string): Promise<{ pattern: unknown }>;
  export type { Pattern };
}
declare module "@strudel/webaudio" {
  import type { Hap, Pattern } from "@strudel/core";

  export interface Repl {
    readonly scheduler: {
      readonly started: boolean;
      /** The end of what the scheduler has queried, in cycles. */
      readonly lastEnd: number;
      readonly cps: number;
      /** zyklus: `getPhase` is the next slot's time, `duration` a slot's length, in seconds. */
      readonly clock: { getPhase(): number; readonly duration: number };
      setCps(cps: number): void;
      start(): Promise<void>;
      stop(): void;
    };
    setPattern(pattern: Pattern, autostart?: boolean): Promise<Pattern>;
  }
  export function webaudioRepl(options: {
    audioContext?: AudioContext;
    transpiler: (input: string, options?: object) => { output: string };
    setInterval?: (callback: () => void, ms: number) => number;
    clearInterval?: (id: number) => void;
    defaultOutput?: Output;
  }): Repl;
  /** How a hap is played: `t` is its onset, in the audio context's time. */
  export type Output = (
    hap: Hap,
    deadline: number,
    duration: number,
    cps: number,
    t: number,
  ) => Promise<void> | undefined;
  export const webaudioOutput: Output;
  export function registerSynthSounds(): void;
  export function samples(map: string, baseUrl: string): Promise<void>;
  export function initAudio(options?: object): Promise<void>;
  export function getSuperdoughAudioController(): {
    readonly output: { readonly destinationGain: GainNode };
  };
}
