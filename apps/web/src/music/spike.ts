/**
 * Spike (#368): with `?music-spike` in the URL, a small panel creates the
 * sandboxed music host after a click and drives its intensity. Every
 * message the host sends is kept on `window.musicSpike` for measurement.
 */
export function mountMusicSpike(): void {
  const params = new URLSearchParams(location.search);
  if (!params.has("music-spike")) return;
  const timers = params.get("music-spike") === "worker" ? "worker" : "default";
  const log: object[] = [];
  Object.assign(window, { musicSpike: log });

  const panel = document.createElement("div");
  panel.id = "music-spike";
  panel.style.cssText = "position:fixed;right:8px;bottom:8px;z-index:9999;display:flex;gap:4px;";
  const button = (label: string, onClick: () => void): void => {
    const b = document.createElement("button");
    b.textContent = label;
    b.addEventListener("click", onClick);
    panel.append(b);
  };

  let frame: HTMLIFrameElement | undefined;
  const send = (message: object): void => frame?.contentWindow?.postMessage(message, "*");
  addEventListener("message", (event: MessageEvent<object>) => {
    if (event.source !== frame?.contentWindow) return;
    log.push({ ...event.data, at: performance.now() });
  });

  button("Music", () => {
    if (frame === undefined) {
      frame = document.createElement("iframe");
      frame.setAttribute("sandbox", "allow-scripts");
      frame.setAttribute("allow", "autoplay");
      // `?frame=shown` keeps the frame rendered (1 px, transparent): Chromium
      // throttles the timers of a `display: none` cross-origin frame.
      if (params.get("frame") === "shown")
        frame.style.cssText =
          "position:fixed;left:0;top:0;width:1px;height:1px;opacity:0;border:0;pointer-events:none;";
      else frame.style.display = "none";
      frame.src = `${import.meta.env.BASE_URL}music-host.html?timers=${timers}${params.has("mute") ? "&mute" : ""}`;
      document.body.append(frame);
      addEventListener("message", function onReady(event: MessageEvent<{ type?: string }>) {
        if (event.source !== frame?.contentWindow || event.data.type !== "ready") return;
        removeEventListener("message", onReady);
        send({ type: "play" });
      });
    } else send({ type: "play" });
  });
  button("Stop", () => {
    send({ type: "stop" });
  });
  for (const level of [0, 1, 2, 3])
    button(`I${String(level)}`, () => {
      send({ type: "setIntensity", level });
    });
  document.body.append(panel);
}
