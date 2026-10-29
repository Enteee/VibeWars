---
name: gw-research
description: Use before asking anyone a GW1 mechanics or numbers question. Where the answer is, in order: the vendored skill corpus, then the wiki through `hub wiki`, and only then the operator.
---

# Researching Guild Wars 1

The operator is not the wiki. Look it up first, in this order.

## 1. The vendored corpus

`packages/game-data/raw/gw-skilldata` holds every skill's numbers
(`skilldata.json`) and text (`skilldesc-en.json`). Where a skill has a
PvP split, **the PvP numbers win**: this is a PvP game.

## 2. The wiki, through hub

```text
hub wiki get <Page> [--at YYYY-MM-DD]
hub wiki history <Page>
hub wiki diff <Page> <date> [<date> | live]
```

- `get` prints the page as text. The first line says where it came from:
  `live`, or `snapshot YYYY-MM-DD` when wiki.guildwars.com is down (its
  maintenance page answers 200; hub knows it) and Wayback served it.
- `history` lists one line per distinct snapshot, newest first.
- `diff` shows what a patch changed: `hub wiki diff Fireball 2007-06-01`
  puts the 2007 page against today's.
- Page names as on the wiki: `hub wiki get "Fiery Rebuke"`.
- A Wayback read can take 30 s. It never holds up anyone's `hub` or
  `board` request.

## 3. Only then, ask

Through the manager, as **one** bundled question with what you already
found and the choice you need made. Never one question a turn.
