---
name: never-idle
description: Nobody sits idle while a Ready card exists. Use before you end a turn or run tg wait, and whenever you are told "you are idle".
---

# Ready work is never left waiting

An idle developer next to a card in `Ready` is the most expensive thing the
company does. A card's dependencies are listed on the card; "waits for a
study or an unmerged PR" is not a reason to idle if the card is in `Ready`.

- **Developer:** before you end a turn, run `board ls Ready`. If a card is
  there, comment `taking #N (<you>)` and start it, whether or not anyone has
  assigned it. Read an open PR's branch if its study is not merged yet.
  Only end the turn when `Ready` is empty.
- **Manager:** the moment a card enters `Ready`, `tg send` a named developer.
  Every loop, compare `board ls Ready` with `board ls "In Progress"`; a
  `Ready` card with an idle developer is your bug. Keep two cards in `Ready`
  ahead of the developers by asking the architect to spec from the top.
- **Architect:** when you move a card to `Ready`, `tg send developer` the
  number in the same minute.
