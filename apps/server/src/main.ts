import { loadConfig } from "./config.js";
import { createGameServer } from "./server.js";

/**
 * Process entrypoint.
 *
 * One process serves both the static client and the WebSocket game traffic:
 * a LAN host runs a single container, shares one URL, and has no CORS or
 * reverse proxy to configure (brief §27, `docs/adr/0009-production-deployment.md`).
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const server = createGameServer(config);

  await server.listen(config.port, config.host, undefined, () => {
    console.info(
      `[server] vibewars listening on ${config.host}:${String(config.port)} (devMode=${String(config.devMode)})`,
    );
  });
}

main().catch((error: unknown) => {
  console.error("[server] fatal startup error", error);
  process.exitCode = 1;
});
