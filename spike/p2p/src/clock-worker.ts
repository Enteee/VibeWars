// A fixed-tick accumulator in a dedicated worker: the host clock (#15).
const TICK_MS = 1000 / 20;
let last = performance.now();
let acc = 0;
let ticks = 0;
function loop() {
  const now = performance.now();
  acc += Math.min(now - last, 250);
  last = now;
  while (acc >= TICK_MS) {
    acc -= TICK_MS;
    ticks += 1;
    postMessage({ tick: ticks, t: performance.timeOrigin + now });
  }
  setTimeout(loop, Math.max(0, TICK_MS - acc));
}
loop();
