/**
 * `?audiostress=<ms>` (#519): an AudioWorklet on the music context that
 * busy-waits that long in every 128-frame render quantum, so the audio
 * thread runs close to its budget (2.67 ms at 48 kHz) and a browser's
 * underrun probe has something real to see. The game asks for it only in
 * the build scripts/music-stress.mjs makes (music/stress.ts).
 */

const PROCESSOR = "audio-stress";

/**
 * The worklet's source: a module is loaded by URL, and the host's CSP allows
 * `blob:`. A worklet scope has no `performance`, and `Date` ticks in whole
 * milliseconds, so the constructor times a spin of fixed size once (a one-off
 * stall of about 50 ms when the load starts) and `process()` spins as many
 * turns as `ms` is worth.
 */
const SOURCE = `
function spin(turns) {
  let x = 0;
  for (let i = 0; i < turns; i += 1) {
    x = (x + i * 31) % 1000003;
  }
  return x;
}
class AudioStress extends AudioWorkletProcessor {
  constructor(options) {
    super();
    let turns = 1000;
    let took = 0;
    while (took < 50) {
      const start = Date.now();
      this.sink = spin(turns);
      took = Date.now() - start;
      if (took < 50) {
        turns *= 2;
      }
    }
    this.turns = Math.round((turns / took) * options.processorOptions.ms);
  }
  process() {
    this.sink = spin(this.turns);
    return true;
  }
}
registerProcessor("${PROCESSOR}", AudioStress);
`;

export async function startAudioStress(context: AudioContext, ms: number): Promise<void> {
  const url = URL.createObjectURL(new Blob([SOURCE], { type: "text/javascript" }));
  try {
    await context.audioWorklet.addModule(url);
  } finally {
    URL.revokeObjectURL(url);
  }
  const node = new AudioWorkletNode(context, PROCESSOR, { processorOptions: { ms } });
  // Only a node that reaches the output is pulled.
  node.connect(context.destination);
}
