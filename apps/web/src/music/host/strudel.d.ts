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
    readonly duration: Fraction;
    wholeOrPart(): { readonly begin: Fraction };
    withValue(func: (value: unknown) => unknown): Hap;
    hasOnset(): boolean;
    /** Makes `value` an object of controls, as superdough reads it. */
    ensureObjectValue(): void;
  }
  export interface State {
    readonly span: { readonly begin: Fraction; readonly end: Fraction };
  }
  export class Pattern {
    constructor(query: (state: State) => Hap[]);
    query(state: State): Hap[];
    queryArc(begin: number, end: number, controls?: { readonly _cps?: number }): Hap[];
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
    /** The scheduler's clock, in seconds; defaults to the context's. */
    getTime?: () => number;
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
  export interface SuperdoughAudioController {
    readonly output: { readonly destinationGain: GainNode };
  }
  export function getSuperdoughAudioController(): SuperdoughAudioController;
  /** `null` makes the next `getSuperdoughAudioController()` build one for the current context. */
  export function setSuperdoughAudioController(
    controller: SuperdoughAudioController | null,
  ): SuperdoughAudioController | null;
  /** The context superdough builds every sound in. */
  export function getAudioContext(): BaseAudioContext;
  export function setAudioContext(context: BaseAudioContext): BaseAudioContext;
  /** Build one event's sound: `t` its onset in the current context's time. */
  export function superdough(
    value: unknown,
    t: number,
    duration: number,
    cps: number,
    cycle: number,
  ): Promise<void>;
}
