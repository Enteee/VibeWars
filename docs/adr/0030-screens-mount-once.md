# ADR-0030: Screens mount once and update in place

## Status

Accepted (2026-10-26). Epic #549, child 1: issue #563. The other #549
children, and the team editor (#554) and menu (#555) reworks, build on
this.

## Context

The build editor rebuilt its whole DOM from the character on every
change: `renderBuildEditor(root, character, callbacks, rerender)` emptied
the root and built it again, and `main.ts` called it on every `+`, equip,
drag and tab switch. That was simple, and it guaranteed what was shown
matched the model. It also threw away everything the browser keeps on the
elements themselves:

- the skill library scrolled back to the top after every click in it
  (#549, bug 1);
- the control you pressed was gone, so keyboard focus fell to `<body>`
  and Tab started again from the top of the page (#549, bug 2);
- a hover tooltip was orphaned when the element under it was rebuilt, so
  the editor kept a module-level tooltip, search text, library tab and
  Training Ground panel alive outside the render to survive it.

## Decision

**A screen mounts once; each region updates its own elements in place.**
No virtual DOM and no framework.

- `apps/web/src/ui/kit.ts` holds the parts every screen shares:
  `h(tag, className?, text?)`, `button(label, className, onClick)`, and
  `syncList(container, items, key, create, update)`. `syncList` is a keyed
  list: an element whose key stays is kept, moved only if its place
  changed, and updated; a new key is created and then updated; anything
  else in the container is removed. `create` builds structure and
  listeners, `update` fills in what can change. The screens' own copies of
  `h()` and `button()` are gone.
- The kit also holds the parts a screen bar is made of (#566):
  `screenBar`, `inlineConfirm` in place of `window.confirm()`,
  `problemsChip` and `toast`.
- `mountBuildEditor(root, character, callbacks)` returns `{ dispose() }`.
  It builds the three columns once. Each region is
  `mountX(parent, context)` returning `{ update(character) }`: the command bar
  (#566: name, professions, budget, problems, Save, ⋯), attributes, skill bar,
  gear, share, library. One
  `commit(next)` sets the character and calls every region's `update`.
  The lists (attributes, bar slots, library groups and boxes, runes) go
  through `syncList`.
- Listeners read the character at the moment they fire, through
  `context.current()`, never a copy taken when the element was built.
- State that only lived outside the render to survive it (tooltip, search
  text, active tab, the Training Ground panel) now lives in the mounted
  editor, and goes with `dispose()`. Reopening the editor starts afresh.
- The library's two tabs are both built and kept up to date; only the
  open one is in the page, and each remembers its own scroll.

## Considered and dropped

- **Keep the full re-render.** It is the bug: scroll, focus, hover and an
  in-progress drag all live on elements, and rebuilding the elements
  loses them.
- **Save and restore scroll and focus around the rebuild.** A stopgap
  (#549 item 1) we would delete as soon as this landed. It also cannot
  restore a hover, a drag or a caret, and focus has to be found again by
  some identity the rebuilt element may not have.
- **A UI framework.** A dependency, a build step and a new idiom for
  about ten screens of plain DOM. `syncList` is the one piece of diffing
  they need.

## Consequences

- A region must update everything it shows. A field one forgets to
  update shows stale data, where the full re-render could not. The
  regions are small, and the e2e suite drives every control.
- The team editor (#554) and the menu screens (#555) follow this as they
  are reworked. Other screens convert when they are next touched.
- The Training Ground panel is attached once; `refocus()` hands it the
  keyboard back after an edit that left focus on nothing, which the
  re-attach used to do.
