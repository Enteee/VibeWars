// Strudel ships no types. This is the slice of it the music checker uses.

declare module "@strudel/core" {
  export function evalScope(...modules: unknown[]): Promise<unknown>;
  export function ref(f: () => number): unknown;
}

declare module "@strudel/mini" {
  export const mini: unknown;
}

declare module "@strudel/tonal" {
  export const scale: unknown;
}

declare module "@strudel/transpiler" {
  export interface Hap {
    whole: { begin: { valueOf(): number } };
    value: Record<string, unknown>;
    hasOnset(): boolean;
  }
  export interface Pattern {
    queryArc(begin: number, end: number): Hap[];
    mask(mask: unknown): Pattern;
  }
  export function evaluate(code: string): Promise<{ pattern: Pattern }>;
}
