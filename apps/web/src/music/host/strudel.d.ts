/**
 * The few Strudel entry points the spike host touches. Strudel ships no
 * types; this is deliberately the narrowest surface that compiles.
 */
declare module "@strudel/core" {
  export interface Pattern {
    mask(mask: Pattern): Pattern;
  }
  export function ref(accessor: () => number): Pattern;
  export function evalScope(...modules: readonly object[]): Promise<readonly object[]>;
}
declare module "@strudel/mini" {}
declare module "@strudel/tonal" {}
declare module "@strudel/transpiler" {
  export function transpiler(input: string, options?: object): { output: string };
}
declare module "@strudel/webaudio" {
  export interface Hap {
    whole?: { begin: { valueOf(): number } };
    value: { s?: string };
  }
  export type Output = (
    hap: Hap,
    deadline: number,
    duration: number,
    cps: number,
    t: number,
  ) => unknown;
  export interface Repl {
    evaluate(code: string, autostart?: boolean): Promise<unknown>;
    start(): void;
    stop(): void;
    scheduler: { now(): number; cps: number; started: boolean };
  }
  export function webaudioRepl(options: {
    transpiler: (input: string, options?: object) => { output: string };
    setInterval?: (callback: () => void, ms: number) => number;
    clearInterval?: (id: number) => void;
    defaultOutput?: Output;
    onEvalError?: (error: Error) => void;
  }): Repl;
  export const webaudioOutput: Output;
  export function registerSynthSounds(): void;
  export function samples(
    map: Record<string, string | readonly string[]>,
    baseUrl: string,
  ): Promise<void>;
  export function initAudio(options?: object): Promise<void>;
  export function getAudioContext(): AudioContext;
}
