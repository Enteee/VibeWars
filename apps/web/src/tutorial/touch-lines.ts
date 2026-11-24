import type { MessageKey } from "../i18n/index.js";

/**
 * The tutor's lines that name a key or a mouse button, and what each says
 * instead on a touch-only device (#3782): the gestures `controls.md`'s
 * Touch section gives. A line not here reads the same with a finger.
 */
const TOUCH_LINES: Partial<Readonly<Record<MessageKey, MessageKey>>> = {
  "tutorial.call.how": "tutorial.touch.callHow",
  "tutorial.call.t": "tutorial.touch.callT",
  "tutorial.climb.how": "tutorial.touch.climbHow",
  "tutorial.climb.tip": "tutorial.touch.climbTip",
  "tutorial.climb.under": "tutorial.touch.climbUnder",
  "tutorial.dodge.how": "tutorial.touch.walk",
  "tutorial.gate.how": "tutorial.touch.walk",
  "tutorial.ground.how": "tutorial.touch.walk",
  "tutorial.heal.hint": "tutorial.touch.healHint",
  "tutorial.heal.how": "tutorial.touch.healHow",
  "tutorial.look.how": "tutorial.touch.look",
  "tutorial.ping.how": "tutorial.touch.pingHow",
  "tutorial.rats.how": "tutorial.touch.ratsHow",
  "tutorial.stepIn.how": "tutorial.touch.walk",
  "tutorial.tunnel.how": "tutorial.touch.tunnelHow",
  "tutorial.walk.how": "tutorial.touch.walk",
  "tutorial.wall.hint": "tutorial.touch.wallHint",
  "tutorial.wall.how": "tutorial.touch.wallHow",
  "tutorial.wall.intro": "tutorial.touch.wallIntro",
};

/** `key`, or its touch twin when `touch`. */
export function touchLine(key: MessageKey, touch: boolean): MessageKey {
  return (touch ? TOUCH_LINES[key] : undefined) ?? key;
}
