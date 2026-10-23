import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { defineRoom, defineServer } from "colyseus";
import { ROOM_MATCH } from "@vibewars/game-protocol";
import express from "express";

import type { ServerConfig } from "./config.js";
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
    },

    express: (app) => {
      // Liveness probe for container orchestrators. Deliberately free of game
      // state so it stays cheap and cannot be used to enumerate lobbies.
      app.get("/healthz", (_req, res) => {
        res.status(200).json({ status: "ok" });
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
      // index.html so that deep links survive a reload.
      app.get(/^\/(?!healthz|matchmake\/).*/, (_req, res) => {
        res.sendFile(resolve(webRoot, "index.html"));
      });
    },
  });
}

export type GameServer = ReturnType<typeof createGameServer>;
