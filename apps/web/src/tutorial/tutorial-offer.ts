import { t } from "../i18n/index.js";
import { button, h } from "../ui/kit.js";

/**
 * The first-time offer (#3218), a card over the background fight: Learn
 * to play or Skip. Either removes it, then calls its own. Returns its
 * removal, for a link that comes meanwhile, which chooses neither.
 */
export function showTutorialOffer(
  root: HTMLElement,
  choices: { readonly onLearn: () => void; readonly onSkip: () => void },
): () => void {
  const backdrop = h("div", "tutorial-offer-overlay");
  const card = h("div", "screen tutorial-offer");
  card.setAttribute("role", "dialog");
  card.setAttribute("aria-modal", "true");
  const title = t("tutorial.offerTitle");
  card.setAttribute("aria-label", title);
  const choose = (then: () => void) => (): void => {
    backdrop.remove();
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
  learn.focus();
  return () => {
    backdrop.remove();
  };
}

/** The Skip tutorial button, in its fixed corner of `parent` on every station. */
export function mountSkipTutorial(parent: HTMLElement, onSkip: () => void): HTMLElement {
  const skip = button(t("tutorial.skipTutorial"), "tutorial-skip-tutorial", onSkip);
  parent.appendChild(skip);
  return skip;
}
