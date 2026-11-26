import { t } from "../i18n/index.js";
import { button, h } from "../ui/kit.js";
import { holdFocus } from "../ui/modal-focus.js";

/**
 * The first-time offer (#3218), a card over the background fight: Learn
 * to play or Skip. Either removes it, then calls its own; Esc is not now,
 * which removes it and records nothing (#4090). Returns its removal, for
 * a link that comes meanwhile, which chooses neither.
 */
export function showTutorialOffer(
  root: HTMLElement,
  choices: {
    readonly onLearn: () => void;
    readonly onSkip: () => void;
    readonly onNotNow: () => void;
  },
): () => void {
  const backdrop = h("div", "tutorial-offer-overlay");
  const card = h("div", "screen tutorial-offer");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const title = t("tutorial.offerTitle");
  card.setAttribute("aria-label", title);
  let release = (): void => undefined;
  const remove = (): void => {
    backdrop.remove();
    release();
  };
  const choose = (then: () => void) => (): void => {
    remove();
    then();
  };
  const learn = button(t("tutorial.learn"), "primary tutorial-learn", choose(choices.onLearn));
  const actions = h("div", "tutorial-offer-actions");
  actions.append(learn, button(t("tutorial.skip"), "tutorial-skip", choose(choices.onSkip)));
  card.append(
    h("h1", "screen-title", title),
    h("p", "screen-subtitle", t("tutorial.offer")),
    actions,
  );
  backdrop.appendChild(card);
  root.appendChild(backdrop);
  release = holdFocus(card, choose(choices.onNotNow));
  return remove;
}

/** The Skip tutorial button, in its fixed corner of `parent` on every station. */
export function mountSkipTutorial(parent: HTMLElement, onSkip: () => void): HTMLElement {
  const skip = button(t("tutorial.skipTutorial"), "tutorial-skip-tutorial", onSkip);
  parent.appendChild(skip);
  return skip;
}
