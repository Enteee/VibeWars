import dgram from "node:dgram";

import { afterEach, describe, expect, it } from "vitest";

import { ALLOCATE_ADDRESSES, allocate, decode, encode } from "./stun.mjs";

const USERNAME = 0x0006;
const ERROR_CODE = 0x0009;
const REALM = 0x0014;
const NONCE = 0x0015;

/** @param {number} code @returns {Buffer} */
const errorAttr = (code) => Buffer.from([0, 0, Math.floor(code / 100), code % 100]);

/** @type {dgram.Socket | null} */
let server = null;

afterEach(() => {
  server?.close();
  server = null;
});

/**
 * A TURN server that answers every authenticated Allocate from the first
 * `mismatched` client addresses 437, like a coturn still holding an
 * allocation for them (#1379), and grants the rest.
 *
 * @param {number} mismatched
 * @returns {Promise<{ port: number, clients: Set<string> }>}
 */
function fakeTurn(mismatched) {
  const socket = dgram.createSocket("udp4");
  server = socket;
  /** @type {Set<string>} */
  const clients = new Set();
  socket.on("message", (buf, from) => {
    const msg = decode(buf);
    if (msg === null) return;
    const client = `${from.address}:${String(from.port)}`;
    /** @param {number} type @param {[number, Buffer][]} attrs */
    const answer = (type, attrs) => {
      socket.send(encode(type, msg.txid, attrs, null), from.port, from.address);
    };
    if (!msg.attrs.has(USERNAME)) {
      answer(msg.type | 0x0110, [
        [ERROR_CODE, errorAttr(401)],
        [REALM, Buffer.from("turn.test")],
        [NONCE, Buffer.from("nonce")],
      ]);
      return;
    }
    clients.add(client);
    if (msg.type === 0x0003 && clients.size <= mismatched) {
      answer(msg.type | 0x0110, [[ERROR_CODE, errorAttr(437)]]);
      return;
    }
    answer(msg.type | 0x0100, []);
  });
  return new Promise((resolve) => {
    socket.bind(0, "127.0.0.1", () => {
      resolve({ port: socket.address().port, clients });
    });
  });
}

describe("allocate", () => {
  const opts = { host: "127.0.0.1", username: "u", password: "p", timeoutMs: 1000 };

  it("asks again from a new client address after a 437 (RFC 8656 §7.3)", async () => {
    const { port, clients } = await fakeTurn(ALLOCATE_ADDRESSES - 1);
    expect(await allocate({ ...opts, port })).toEqual({ ok: true, relayed: "?" });
    expect(clients.size).toBe(ALLOCATE_ADDRESSES);
  });

  it("gives up with the 437 after three client addresses", async () => {
    const { port, clients } = await fakeTurn(ALLOCATE_ADDRESSES);
    expect(await allocate({ ...opts, port })).toEqual({ ok: false, code: 437 });
    expect(clients.size).toBe(ALLOCATE_ADDRESSES);
  });
});
