// Static server: `node serve.mjs <dir> <port> [prefix]` serves <dir> under <prefix>.
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
const [dir, port, prefix = "/"] = process.argv.slice(2);
const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".json": "application/json", ".svg": "image/svg+xml", ".wasm": "application/wasm", ".ogg": "audio/ogg", ".mp3": "audio/mpeg", ".woff2": "font/woff2" };
http.createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  if (!url.pathname.startsWith(prefix)) { res.writeHead(404); res.end(); return; }
  let p = path.join(dir, decodeURIComponent(url.pathname.slice(prefix.length)));
  if (p.endsWith("/") || (fs.existsSync(p) && fs.statSync(p).isDirectory())) p = path.join(p, "index.html");
  if (!fs.existsSync(p)) { res.writeHead(404); res.end(); console.log("404", url.pathname); return; }
  res.writeHead(200, { "content-type": types[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
}).listen(Number(port), "127.0.0.1");
