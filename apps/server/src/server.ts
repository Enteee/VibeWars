import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineRoom, defineServer } from "colyseus";
import { loadAllMaps } from "@vibewars/game-maps";
import { ROOM_LOBBY, ROOM_MATCH } from "@vibewars/game-protocol";
import express from "express";

import { DEFAULT_DEV_CLIENT_ORIGIN, type ServerConfig } from "./config.js";
import { LobbyRoom } from "./rooms/lobby-room.js";
import { MatchRoom } from "./rooms/match-room.js";

/**
 * Build (but do not start) the game server.
 *
 * Construction is separated from `listen()` so tests can boot a server on an
 * ephemeral port, and so a startup failure is a rejected promise rather than a
 * half-initialised module.
 */
export function createGameServer(config: ServerConfig) {
  return defineServer({
    greet: false,

    rooms: {
      [ROOM_MATCH]: defineRoom(MatchRoom),
      // `filterBy(["code"])` is what makes "join by code" actually mean
      // "join *that* lobby": without it, matchmaking would hand a player
      // any available lobby and quietly ignore the code they typed.
      [ROOM_LOBBY]: defineRoom(LobbyRoom).filterBy(["code"]),
    },

    express: (app) => {
      // During `pnpm run dev` the client is served by Vite on another
      // port, so matchmaking and /api are cross-origin. Allowed only in
      // dev mode, and only for one exact origin — never `*`, and never
      // by echoing back whatever Origin the caller sent.
      //
      // Production needs none of this: the server serves the client, so
      // every request is same-origin.
      if (config.devMode) {
        const devOrigin = config.devClientOrigin ?? DEFAULT_DEV_CLIENT_ORIGIN;
        console.warn(`[http] dev mode: allowing cross-origin requests from ${devOrigin}`);
        app.use((req, res, next) => {
          res.setHeader("Access-Control-Allow-Origin", devOrigin);
          res.setHeader("Vary", "Origin");
          res.setHeader("Access-Control-Allow-Headers", "content-type");
          if (req.method === "OPTIONS") {
            res.sendStatus(204);
            return;
          }
          next();
        });
      }

      // Liveness probe for container orchestrators. Deliberately free of game
      // state so it stays cheap and cannot be used to enumerate lobbies.
      app.get("/healthz", (_req, res) => {
        res.status(200).json({ status: "ok" });
      });

      // The list of arenas, so the lobby can offer a map picker. The
      // server is the authority on what maps exist (brief §32); the
      // client never invents an id.
      app.get("/api/maps", (_req, res) => {
        res.status(200).json({
          maps: loadAllMaps().map((map) => ({ id: map.id, name: map.name })),
        });
      });

      if (config.webRoot === undefined) {
        return;
      }

      const webRoot = resolve(config.webRoot);
      if (!existsSync(webRoot)) {
        console.warn(`[http] VIBEWARS_WEB_ROOT=${webRoot} does not exist; not serving a client`);
        return;
      }

      console.info(`[http] serving client from ${webRoot}`);
      app.use(express.static(webRoot));

      // The client is a single-page app: unknown non-API paths must return
      // index.html so that deep links survive a reload. Every API prefix
      // has to be excluded here, or a missing API route silently returns
      // the HTML shell and the caller sees a confusing JSON parse error
      // instead of a 404.
      app.get(/^\/(?!healthz|api\/|matchmake\/).*/, (_req, res) => {
        res.sendFile(resolve(webRoot, "index.html"));
      });
    },
  });
}

export type GameServer = ReturnType<typeof createGameServer>;
