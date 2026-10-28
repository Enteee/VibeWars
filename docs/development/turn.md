# Running a TURN relay

Two players behind symmetric NAT or carrier-grade NAT (CGNAT) cannot connect
to each other directly. A TURN relay passes their traffic along. The project
hosts no relay (ADR-0022). You can run your own from the devenv (#974) and
share it with your friends through an invite link, which the game reads
(#972).

Only one player of a pair needs a relay. ICE still prefers a direct path,
so the relay carries only the pairs that need it.

## Where to run it

You need a host the internet can reach, usually a small VPS:

- a public IPv4 address, and IPv6 too if you have it;
- these ports open in the firewall, or forwarded to the host:
  - `3478` UDP and TCP (`listeningPort`);
  - `5349` TCP, only with TLS (`tlsPort`);
  - the relay range `49160–49200` UDP (`relayPorts`).

A home line behind CGNAT does not work: nobody can reach it. `turn-check`
fails when the external IP is private or in `100.64.0.0/10`.

## Turning it on

In `devenv.local.nix`:

```nix
{
  vibewars.turn = {
    enable = true;
    realm = "turn.example.org";
    host = "turn.example.org"; # what the links name; defaults to externalIp's public part
    externalIp = "203.0.113.7/10.0.0.7";
  };
}
```

- **`externalIp`.** Most VPSs are behind 1:1 NAT: the interface has a private
  address, and the provider maps a public one onto it. Write that as
  `public/private`. If the interface has the public address itself, leave
  `externalIp` unset.
- **Other options.** `nix/turn.nix` lists them all, with what each one does:
  ports, the relay range, quotas, `maxBps` and `stateDir`.
- **Starting it.** `devenv up` starts `processes.turn`.
- **State.** The server keeps its state in `.devenv/state/turn/`:
  - `turndb`, the users;
  - `turn.log`;
  - `turnserver.conf`, generated on every start;
  - `turn.nft`, the firewall rules below, generated on every start;
  - `health.secret`.

The server is configured to be safe on the open internet:

- It refuses to relay to loopback, private, link-local, CGNAT or cloud
  metadata addresses (`denied-peer-ip`). Otherwise it would be an open proxy
  into the network it stands in.
- It does relay to the host's own external and listening addresses
  (`allowed-peer-ip`): when two players use the same relay, each one's
  relayed address is the host's. `turn.nft` keeps that to the relay ports
  (see below).
- UDP relays only.
- No admin CLI.
- Metrics only on `127.0.0.1`.

## Firewall rules (once, as root)

A relay socket can send to the host's own addresses, so without more, a
relay user reaches every UDP service the host runs on its public address.
`turn.nft` drops what leaves a relay port for an own address on any port
outside the relay range. Loading it needs root, so the server cannot do it
itself.

`turn.nft` is written by the unprivileged user the server runs as, on every
start, so a compromised server could rewrite it, and `nft -f` runs whatever
it holds, `flush ruleset` included. Never have root load that file as it
lies. Read it, then install a root-owned copy and load the copy, once and
again when the addresses or the relay range change:

```sh
less .devenv/state/turn/turn.nft
sudo install -D -o root -g root -m 0644 .devenv/state/turn/turn.nft /etc/nftables.d/vibewars_turn.nft
sudo nft -f /etc/nftables.d/vibewars_turn.nft
```

To keep it across reboots on NixOS, set
`networking.nftables.tables.vibewars_turn = { family = "inet"; content = …; }`
with the `chain output { … }` block from the file as `content`. Elsewhere,
have a systemd unit that starts before the network load the root-owned
copy, `nft -f /etc/nftables.d/vibewars_turn.nft`, never the file under
`.devenv/state`.

**Without it, relay users can reach the host's UDP services on its public
IP.** `turn-check`, run as root, fails while the table is not loaded.

The relay ports sit inside Linux's ephemeral port range, so a host process
whose source port lands in it and sends UDP to an own address outside the
range is dropped too. Reserve the range so no process is handed one:
`sysctl net.ipv4.ip_local_reserved_ports=<relay range>` (the `relayPorts`
setting, as `first-last`).

## Certificates (optional)

With `cert` and `key` set, the server also listens for `turns:` on `tlsPort`,
and invite links carry a `turns:` URL as well. A browser accepts only a
certificate valid for `host`. Let's Encrypt works, for example from `certbot`
or `lego` on the same host. Point `cert` at the full chain and `key` at the
private key. Both paths are read at runtime and never copied into the Nix
store.

`turn-check` fails seven days before the certificate expires.

## Adding a friend

```sh
turn-user add alice
```

This prints Alice's password and her invite link, once. Neither is stored:
the user database keeps only a key derived from the password. Send her the
link. When she opens it, the game asks whether to use your relay.

| Command                  | What it does                                                                                                                   |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `turn-link alice`        | Gives Alice a new link. It sets a new password, so her old link stops working.                                                 |
| `turn-user list`         | Lists everyone.                                                                                                                |
| `turn-user remove alice` | Removes Alice. Her new allocations are refused at once. A session she has open runs on until it ends: coturn has no kick here. |

Each friend has their own credential, so removing one leaves the others
alone. Links point at the game's latest `main` by default. Use
`--base <url>` for another page, such as a release:
`--base https://enteee.github.io/VibeWars/`.

turnadmin takes the password only on its command line, so while it runs,
for a moment, any other user on the host can read it in `/proc`. Run the
relay on a host you do not share.

## Checking it

`turn-check` runs these checks once. It exits 0 when none of them fails, so
it works from cron:

- **process:** the server is running (its pid file names a live process).
- **STUN binding:** the server answers a Binding request.
- **allocation:** a real authenticated allocation succeeds, then is released.
  It allocates as `vibewars-health`, a user `turn-check` creates the first
  time. Its password is in `health.secret` (mode 0600), and `turn-user list`
  does not show it.
- **permissions:** on that allocation, a permission toward `stunProbe`'s
  address and toward the host's own public address is granted, and one toward
  a private address is refused. No packet is sent to them.
- **nftables:** `table inet vibewars_turn` is loaded. Only root can tell;
  anyone else gets a skip.
- **external IP:** the address is public, and `stunProbe` (a public STUN
  server) sees this host at that address.
- **TLS certificate:** the days left.

## The dashboard

`turn-dash` opens a tmux session on a tmux server of its own
(`tmux -L vibewars-turn`), so it never touches your other sessions. Run it
again to attach. `turn-dash stop` closes it; the relay keeps running.

- **Stats.** Refreshed every 3 s.
  - _allocations now_: the current allocations.
  - _throughput_: approximate. It is the server process's own reads and
    writes (`/proc/<pid>/io`), so it includes control traffic and the log.
    It shows "n/a" where there is no `/proc`, such as on macOS.
  - _finished sessions_: coturn's traffic counters. They only grow when a
    session ends, so they lag behind.
  - The rate of 401 responses (wrong or removed credentials) and of dropped
    packets.
- **Health.** `turn-check`, every 15 s.
- **Users.** Each user and the time of their last allocation in the log.
- **Log.** `turn.log`, filtered to:
  - session starts, ends and usage;
  - authentication failures;
  - warnings and errors.

When the server is not running, the panes say so.
