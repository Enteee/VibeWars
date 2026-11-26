/**
 * `@strudel/core`'s repl builds a Kabelsalat REPL it only uses for
 * `compileKabel`, which no track of ours calls. This stub keeps the
 * Kabelsalat engine out of the host bundle, 22.5 kB gzip (ADR-0028).
 */
export class SalatRepl {
  evaluate(): never {
    throw new Error("Kabelsalat is not part of the VibeWars music host");
  }
}
