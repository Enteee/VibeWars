const base = "http://127.0.0.1:9333";
const list = await (await fetch(`${base}/json/list`)).json();
const a = list.find((t) => t.type === "page");
async function evalIn(wsUrl, expr) {
  const ws = new WebSocket(wsUrl);
  await new Promise((r) => (ws.onopen = r));
  const out = new Promise((r) => (ws.onmessage = (m) => r(JSON.parse(m.data))));
  ws.send(JSON.stringify({ id: 1, method: "Runtime.evaluate", params: { expression: expr, returnByValue: true } }));
  const res = await out; ws.close(); return res.result?.result?.value;
}
console.log("a alone:", await evalIn(a.webSocketDebuggerUrl, "document.visibilityState"));
await fetch(`${base}/json/new?about:blank`, { method: "PUT" });
await new Promise((r) => setTimeout(r, 1500));
console.log("a after new tab:", await evalIn(a.webSocketDebuggerUrl, "document.visibilityState"));
