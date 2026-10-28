/**
 * The pure parts behind turn-dash and turn-check (#974): Prometheus text,
 * /proc/<pid>/io, coturn's log, turnadmin's list and the STUN codec. The
 * log lines are coturn 4.17.2's, verbatim.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { unreachableV4 } from "./check.mjs";
import { filterLog, lastAllocations, printable, tailLines } from "./log.mjs";
import { formatBytes, parseProcIo, parsePrometheus, rate } from "./metrics.mjs";
import { decode, encode, errorCode } from "./stun.mjs";
import { parseUserList } from "./users.mjs";

const LOG = [
  "2026-10-27T20:33:19.094+0100 INFO prometheus collector started successfully",
  "2026-10-27T20:35:53.244+0100 INFO session 004000000000000002: new, realm=<t.local>, username=<alice>, lifetime=600",
  "2026-10-27T20:35:53.244+0100 INFO session 004000000000000002: realm <t.local> user <alice>: incoming packet ALLOCATE processed, success",
  "2026-10-27T20:35:53.245+0100 INFO session 004000000000000002: realm <t.local> user <alice>: incoming packet REFRESH processed, success",
  "2026-10-27T20:35:53.247+0100 ERROR session 006000000000000001: check_stun_auth: user alice credentials are incorrect",
  "2026-10-27T20:35:53.247+0100 INFO session 006000000000000001: realm <t.local> user <alice>: incoming packet message processed, error 401: Unauthorized",
  "2026-10-27T20:35:54.244+0100 INFO session 004000000000000002: usage: realm=<t.local>, username=<alice>, rp=2, rb=216, sp=2, sb=144",
  "2026-10-27T20:35:54.244+0100 INFO session 004000000000000002: closed (2nd stage), user <alice> realm <t.local> origin <>, local 127.0.0.1:34780, remote 127.0.0.1:34358, reason: allocation timeout",
  "2026-10-27T20:36:10.000+0100 INFO session 005000000000000001: realm <t.local> user <bob>: incoming packet ALLOCATE processed, success",
  "2026-10-27T20:37:00.000+0100 INFO session 005000000000000009: realm <t.local> user <alice>: incoming packet ALLOCATE processed, success",
];

describe("filterLog", () => {
  it("keeps session starts and ends, usage, auth failures and errors", () => {
    expect(filterLog(LOG)).toEqual([LOG[1], LOG[4], LOG[5], LOG[6], LOG[7]]);
  });
});

describe("lastAllocations", () => {
  it("is each user's latest successful ALLOCATE", () => {
    expect(Object.fromEntries(lastAllocations(LOG))).toEqual({
      alice: "2026-10-27T20:37:00.000+0100",
      bob: "2026-10-27T20:36:10.000+0100",
    });
  });
});

describe("tailLines", () => {
  it("strips the escapes a STUN client can put in a username, so they never reach the terminal", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "turn-log-"));
    try {
      const file = path.join(dir, "turn.log");
      const osc = "\u001b]52;c;cHduZWQ=\u0007";
      fs.writeFileSync(
        file,
        [
          `2026-10-27T20:35:53.247+0100 ERROR session 006000000000000001: check_stun_auth: user ev${osc}il\u009b2J credentials are incorrect`,
          `2026-10-27T20:36:10.000+0100 INFO session 005000000000000001: realm <t.local> user <m${osc}al>: incoming packet ALLOCATE processed, success`,
          "",
        ].join("\n"),
      );
      const lines = tailLines(file);
      expect(filterLog(lines)).toEqual([
        "2026-10-27T20:35:53.247+0100 ERROR session 006000000000000001: check_stun_auth: user ev]52;c;cHduZWQ=il2J credentials are incorrect",
      ]);
      expect([...lastAllocations(lines).keys()]).toEqual(["m]52;c;cHduZWQ=al"]);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps tabs and printable text, drops C0, DEL and C1", () => {
    expect(printable("a\tb\u0000c\u001bd\u007fe\u0085f g")).toBe("a\tbcdef g");
  });
});

describe("parsePrometheus", () => {
  it("sums a metric over its labels and skips comments", () => {
    const m = parsePrometheus(
      [
        "# HELP turn_total_allocations Represents current allocations number",
        "# TYPE turn_total_allocations gauge",
        'turn_total_allocations{type="UDP"} 3',
        'turn_total_allocations{type="TCP"} 1',
        "turn_total_traffic_rcvb 216",
        "turn_packet_dropped NaN",
      ].join("\n"),
    );
    expect(m.get("turn_total_allocations")).toBe(4);
    expect(m.get("turn_total_traffic_rcvb")).toBe(216);
    expect(m.has("turn_packet_dropped")).toBe(false);
  });
});

describe("throughput", () => {
  it("reads rchar and wchar from /proc/<pid>/io", () => {
    expect(parseProcIo("rchar: 1200\nwchar: 800\nsyscr: 3\n")).toEqual({ rchar: 1200, wchar: 800 });
    expect(parseProcIo("")).toBeNull();
  });

  it("has no rate before a second sample, or across a restart", () => {
    expect(rate(undefined, 10, 3)).toBeNull();
    expect(rate(100, 400, 3)).toBe(100);
    expect(rate(400, 100, 3)).toBeNull();
  });

  it("formats bytes", () => {
    expect(formatBytes(512)).toBe("512 B");
    expect(formatBytes(12_345)).toBe("12.3 KB");
    expect(formatBytes(4_200_000)).toBe("4.2 MB");
  });
});

describe("parseUserList", () => {
  it("takes this realm's users from turnadmin -l", () => {
    const out =
      "2026-10-27T20:33:19.080+0100 INFO SQLite connection was closed.\nbob[t.local]\nalice[t.local]\neve[other]\n";
    expect(parseUserList(out, "t.local")).toEqual(["alice", "bob"]);
  });
});

describe("unreachableV4", () => {
  it("flags private, loopback, link-local and CGNAT addresses", () => {
    for (const ip of [
      "10.1.2.3",
      "100.64.0.1",
      "100.127.255.254",
      "127.0.0.1",
      "169.254.169.254",
      "172.20.0.1",
      "192.168.1.1",
    ]) {
      expect(unreachableV4(ip)).toBe(true);
    }
    for (const ip of ["203.0.113.7", "100.63.0.1", "100.128.0.1", "172.32.0.1"]) {
      expect(unreachableV4(ip)).toBe(false);
    }
  });
});

describe("STUN codec", () => {
  it("round-trips a message and signs it with the long-term key", () => {
    const txid = crypto.randomBytes(12);
    const key = crypto.createHash("md5").update("alice:t.local:pw").digest();
    const buf = encode(0x0003, txid, [[0x0006, Buffer.from("alice")]], key);
    const msg = decode(buf);
    expect(msg?.type).toBe(0x0003);
    expect(msg?.txid.equals(txid)).toBe(true);
    expect(msg?.attrs.get(0x0006)?.toString()).toBe("alice");
    const mac = msg?.attrs.get(0x0008);
    const signed = Buffer.from(buf.subarray(0, buf.length - 24));
    signed.writeUInt16BE(buf.length - 20, 2);
    expect(mac?.equals(crypto.createHmac("sha1", key).update(signed).digest())).toBe(true);
  });

  it("reads an error code", () => {
    const err = Buffer.from([0, 0, 4, 1, ...Buffer.from("Unauthorized")]);
    const msg = decode(encode(0x0113, crypto.randomBytes(12), [[0x0009, err]], null));
    expect(msg === null ? null : errorCode(msg)).toBe(401);
  });

  it("ignores what is not STUN", () => {
    expect(decode(Buffer.from("hello, this is not stun at all"))).toBeNull();
  });
});
