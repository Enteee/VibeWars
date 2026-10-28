/**
 * The TURN server's settings (#974) and the turnserver.conf they make.
 *
 * nix/turn.nix writes the module's options to a JSON file in the store and
 * names it in VIBEWARS_TURN_SETTINGS. Every turn-* command reads it from
 * there, so the server, the users and the links agree on one realm, one host
 * and one state directory.
 */
import fs from "node:fs";
import path from "node:path";

/**
 * @typedef {object} TurnSettings
 * @property {string} realm
 * @property {string | null} host  the name or address the invite links carry
 * @property {string | null} externalIp  `public` or `public/private`
 * @property {string | null} externalIp6
 * @property {string[]} listeningIps  empty means every interface
 * @property {number} listeningPort
 * @property {number} tlsPort
 * @property {{ min: number, max: number }} relayPorts
 * @property {string | null} cert
 * @property {string | null} key
 * @property {string} stateDir
 * @property {number} userQuota
 * @property {number} totalQuota
 * @property {number} maxBps
 * @property {number} bpsCapacity  0 is no limit
 * @property {number} prometheusPort
 * @property {string | null} stunProbe  `host:port` of a public STUN server, for the external IP check
 */

/**
 * Peers a relay must never reach: this host, its LAN, the carrier's NAT and
 * the cloud metadata service. Without them a TURN server is an open proxy
 * into the network it stands in. coturn takes ranges, not CIDRs.
 */
export const DENIED_PEERS = [
  { cidr: "0.0.0.0/8", range: "0.0.0.0-0.255.255.255" },
  { cidr: "10.0.0.0/8", range: "10.0.0.0-10.255.255.255" },
  { cidr: "100.64.0.0/10", range: "100.64.0.0-100.127.255.255" },
  { cidr: "127.0.0.0/8", range: "127.0.0.0-127.255.255.255" },
  { cidr: "169.254.0.0/16", range: "169.254.0.0-169.254.255.255" },
  { cidr: "172.16.0.0/12", range: "172.16.0.0-172.31.255.255" },
  { cidr: "192.0.0.0/24", range: "192.0.0.0-192.0.0.255" },
  { cidr: "192.168.0.0/16", range: "192.168.0.0-192.168.255.255" },
  { cidr: "198.18.0.0/15", range: "198.18.0.0-198.19.255.255" },
  { cidr: "240.0.0.0/4", range: "240.0.0.0-255.255.255.255" },
  { cidr: "::/128", range: "::" },
  { cidr: "::1/128", range: "::1" },
  // IPv4 in IPv6: a mapped or NAT64 peer reaches what the ranges above deny.
  { cidr: "::ffff:0:0/96", range: "::ffff:0.0.0.0-::ffff:255.255.255.255" },
  { cidr: "64:ff9b::/96", range: "64:ff9b::-64:ff9b::ffff:ffff" },
  { cidr: "fc00::/7", range: "fc00::-fdff:ffff:ffff:ffff:ffff:ffff:ffff:ffff" },
  { cidr: "fe80::/10", range: "fe80::-febf:ffff:ffff:ffff:ffff:ffff:ffff:ffff" },
];

/** @param {TurnSettings} s */
export function files(s) {
  return {
    conf: path.join(s.stateDir, "turnserver.conf"),
    db: path.join(s.stateDir, "turndb"),
    log: path.join(s.stateDir, "turn.log"),
    pid: path.join(s.stateDir, "turnserver.pid"),
    healthSecret: path.join(s.stateDir, "health.secret"),
  };
}

/**
 * The settings named by VIBEWARS_TURN_SETTINGS.
 *
 * @param {NodeJS.ProcessEnv} env
 * @returns {TurnSettings}
 */
export function readSettings(env) {
  const file = env.VIBEWARS_TURN_SETTINGS;
  if (file === undefined || file === "") {
    throw new Error("VIBEWARS_TURN_SETTINGS is not set: enable vibewars.turn in devenv.local.nix");
  }
  return parseSettings(JSON.parse(fs.readFileSync(file, "utf8")));
}

/**
 * @param {unknown} value
 * @returns {TurnSettings}
 */
export function parseSettings(value) {
  if (typeof value !== "object" || value === null) throw new Error("turn settings: not an object");
  const v = /** @type {Record<string, unknown>} */ (value);
  /** @param {string} k */
  const str = (k) => {
    if (typeof v[k] !== "string" || v[k] === "")
      throw new Error(`turn settings: ${k} must be a string`);
    return /** @type {string} */ (v[k]);
  };
  /** @param {string} k */
  const optStr = (k) => (v[k] === null ? null : str(k));
  /** @param {unknown} x @param {string} k */
  const int = (x, k) => {
    if (typeof x !== "number" || !Number.isInteger(x) || x < 0)
      throw new Error(`turn settings: ${k} must be a whole number`);
    return x;
  };
  const relay = /** @type {Record<string, unknown> | null} */ (
    typeof v.relayPorts === "object" ? v.relayPorts : null
  );
  if (relay === null) throw new Error("turn settings: relayPorts must be { min, max }");
  const listeningIps = v.listeningIps;
  if (!Array.isArray(listeningIps) || !listeningIps.every((ip) => typeof ip === "string")) {
    throw new Error("turn settings: listeningIps must be a list of addresses");
  }
  const settings = {
    realm: str("realm"),
    host: optStr("host"),
    externalIp: optStr("externalIp"),
    externalIp6: optStr("externalIp6"),
    listeningIps: /** @type {string[]} */ (listeningIps),
    listeningPort: int(v.listeningPort, "listeningPort"),
    tlsPort: int(v.tlsPort, "tlsPort"),
    relayPorts: { min: int(relay.min, "relayPorts.min"), max: int(relay.max, "relayPorts.max") },
    cert: optStr("cert"),
    key: optStr("key"),
    stateDir: str("stateDir"),
    userQuota: int(v.userQuota, "userQuota"),
    totalQuota: int(v.totalQuota, "totalQuota"),
    maxBps: int(v.maxBps, "maxBps"),
    bpsCapacity: int(v.bpsCapacity, "bpsCapacity"),
    prometheusPort: int(v.prometheusPort, "prometheusPort"),
    stunProbe: optStr("stunProbe"),
  };
  if (settings.relayPorts.min > settings.relayPorts.max) {
    throw new Error("turn settings: relayPorts.min is above relayPorts.max");
  }
  if ((settings.cert === null) !== (settings.key === null)) {
    throw new Error("turn settings: cert and key go together");
  }
  return settings;
}

/** @param {TurnSettings} s */
export function tls(s) {
  return s.cert !== null && s.key !== null;
}

/**
 * turnserver.conf for these settings: long-term credentials from the
 * SQLite userdb, no CLI, UDP relays only, every DENIED_PEERS range refused,
 * and metrics on localhost only.
 *
 * @param {TurnSettings} s
 * @returns {string}
 */
export function turnserverConf(s) {
  const f = files(s);
  const lines = [
    "# Generated by scripts/turn/settings.mjs (#974). Edit devenv.local.nix, not this.",
    ...s.listeningIps.map((ip) => `listening-ip=${ip}`),
    `listening-port=${String(s.listeningPort)}`,
    `min-port=${String(s.relayPorts.min)}`,
    `max-port=${String(s.relayPorts.max)}`,
    ...(s.externalIp === null ? [] : [`external-ip=${s.externalIp}`]),
    ...(s.externalIp6 === null ? [] : [`external-ip=${s.externalIp6}`]),
    `realm=${s.realm}`,
    "lt-cred-mech",
    `userdb=${f.db}`,
    "fingerprint",
    // No CLI: coturn 4.17 has it off unless `cli` is given, and logs an
    // error for the old `no-cli`.
    "no-multicast-peers",
    "no-tcp-relay",
    ...DENIED_PEERS.map((d) => `denied-peer-ip=${d.range}`),
    `user-quota=${String(s.userQuota)}`,
    `total-quota=${String(s.totalQuota)}`,
    `max-bps=${String(s.maxBps)}`,
    ...(s.bpsCapacity > 0 ? [`bps-capacity=${String(s.bpsCapacity)}`] : []),
    ...(tls(s)
      ? [
          `tls-listening-port=${String(s.tlsPort)}`,
          `cert=${String(s.cert)}`,
          `pkey=${String(s.key)}`,
        ]
      : ["no-tls"]),
    "prometheus",
    "prometheus-address=127.0.0.1",
    `prometheus-port=${String(s.prometheusPort)}`,
    `log-file=${f.log}`,
    "simple-log",
    // Session starts, ends and auth failures are only logged in verbose mode.
    "verbose",
    `pidfile=${f.pid}`,
  ];
  return `${lines.join("\n")}\n`;
}
