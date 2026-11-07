import * as core from "@strudel/core";
import * as mini from "@strudel/mini";
import * as tonal from "@strudel/tonal";
import { evaluate } from "@strudel/transpiler";
import {
  getAudioContext,
  initAudio,
  registerSynthSounds,
  resetGlobalEffects,
  setAudioContext,
  setSuperdoughAudioController,
  superdough,
} from "@strudel/webaudio";

const SAMPLE_RATE = 22050;

/**
 * What `scripts/assets/render-sfx.mjs` calls: render cycle 0 of a source
 * (its first `seconds`, at the one cycle per second `setcpm(60)` gives)
 * through an offline context and hand back the mono samples.
 */
async function render(source: string, seconds: number): Promise<number[]> {
  let cps = 1;
  await core.evalScope(core, mini, tonal, {
    setcpm: (cpm: number) => {
      cps = cpm / 60;
    },
  });
  registerSynthSounds();
  const { pattern } = await evaluate(source);
  if (!core.isPattern(pattern)) throw new Error("the source does not end in a pattern");
  await getAudioContext().close();
  const context = new OfflineAudioContext(1, Math.ceil(seconds * SAMPLE_RATE), SAMPLE_RATE);
  setAudioContext(context);
  setSuperdoughAudioController(null);
  await initAudio();
  const haps = pattern
    .queryArc(0, seconds)
    .filter((hap) => hap.hasOnset())
    .sort((a, b) => (a.whole?.begin.valueOf() ?? 0) - (b.whole?.begin.valueOf() ?? 0));
  for (const hap of haps) {
    const begin = hap.whole?.begin.valueOf() ?? 0;
    hap.ensureObjectValue();
    await superdough(hap.value, begin / cps, hap.duration.valueOf() / cps, cps, begin / cps);
  }
  const buffer = await context.startRendering();
  resetGlobalEffects();
  return Array.from(buffer.getChannelData(0));
}

Object.assign(globalThis, { renderSfx: render });
