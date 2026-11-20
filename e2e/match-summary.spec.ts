import { expect, test, type Locator } from "@playwright/test";

/**
 * The end of a match (#3563): the end line, the result banner and the
 * summary never overlap and never cut a name, from a phone to a desktop.
 * `?summary-fixture` shows the real HUD's end column from a fixed
 * three-team 8v8 summary, the hardest names in it, over no arena.
 */

interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

async function box(locator: Locator): Promise<Box> {
  const found = await locator.boundingBox();
  expect(found, "it has a box").not.toBeNull();
  return found ?? { x: 0, y: 0, width: 0, height: 0 };
}

function apart(a: Box, b: Box): boolean {
  return (
    a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y
  );
}

function inside(inner: Box, outer: Box): boolean {
  const slack = 0.5;
  return (
    inner.x >= outer.x - slack &&
    inner.y >= outer.y - slack &&
    inner.x + inner.width <= outer.x + outer.width + slack &&
    inner.y + inner.height <= outer.y + outer.height + slack
  );
}

for (const [width, height] of [
  [360, 640],
  [800, 360],
  [1280, 720],
  [1920, 1080],
] as const) {
  test(`at ${String(width)}x${String(height)} the end of a match overlaps nothing and cuts no name (#3563)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./?summary-fixture");
    const summary = page.locator(".hud-summary");
    await expect(summary).toBeVisible();
    const panels = summary.locator(".match-summary-panel");
    await expect(panels).toHaveCount(3);

    const banner = await box(page.locator(".hud-result"));
    const line = await box(page.locator(".hud-end-line"));
    const press = page.locator(".hud-end-line button");
    const button = await box(press);
    const whole = await box(summary);
    const parts: [string, Box][] = [
      ["banner", banner],
      ["end line", line],
      ["summary", whole],
      // The top cluster: the scoreboard and the target frame, your last foe in it.
      ["top", await box(page.locator(".hud-top"))],
    ];
    for (const [index, panel] of (await panels.all()).entries()) {
      parts.push([`panel ${String(index + 1)}`, await box(panel)]);
    }
    // The HUD corner buttons stay clear of the column too.
    for (const [index, row] of (await page.locator(".hud-controls-row").all()).entries()) {
      parts.push([`corner row ${String(index + 1)}`, await box(row)]);
    }
    for (const [i, [nameA, a]] of parts.entries()) {
      for (const [nameB, b] of parts.slice(i + 1)) {
        if (nameA === "summary" || nameB === "summary") {
          // The summary holds the panels; it only has to stay clear of the rest.
          if (nameA.startsWith("panel") || nameB.startsWith("panel")) {
            continue;
          }
        }
        expect(apart(a, b), `${nameA} and ${nameB} do not overlap`).toBe(true);
      }
    }
    // The summary fits what is left of the view, and scrolls inside.
    expect(whole.y + whole.height).toBeLessThanOrEqual(height);
    // Its first panel is where it starts, not spilled above what it can scroll to.
    expect((await box(panels.first())).y).toBeGreaterThanOrEqual(whole.y);
    // The end line's button is what a click on it reaches.
    const reached = await page.evaluate(
      ([x, y]) => document.elementFromPoint(x, y)?.closest(".hud-end-line button") !== null,
      [button.x + button.width / 2, button.y + button.height / 2] as const,
    );
    expect(reached, "the end line's button takes its click").toBe(true);

    // Every name: the label never runs out of its cell, and the cell has it whole.
    const names = summary.locator(".match-summary-name");
    await expect(names).toHaveCount(24);
    for (const name of await names.all()) {
      await expect(name).toHaveAttribute("title", /.+/);
      const label = name.locator(".player-label");
      const fits = await label.evaluate((element) => element.scrollWidth <= element.clientWidth);
      expect(fits, "the label does not overflow sideways").toBe(true);
      expect(inside(await box(label), await box(name)), "the label is inside its cell").toBe(true);
      const chip = name.locator(".match-summary-bot");
      if ((await chip.count()) > 0) {
        expect(inside(await box(chip), await box(name)), "the BOT chip is inside its cell").toBe(
          true,
        );
        expect(apart(await box(chip), await box(label)), "the BOT chip is not on the name").toBe(
          true,
        );
      }
    }
  });
}

for (const [width, height] of [
  [360, 640],
  [1280, 720],
] as const) {
  test(`at ${String(width)}x${String(height)} the queue screen's charts stay clear of its buttons (#3565)`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height });
    await page.goto("./?summary-fixture=queue");
    const charts = page.locator(".match-charts");
    await expect(charts.locator(".match-charts-svg")).toBeVisible();
    const actions = page.locator(".queue-actions");
    const buttons = await box(actions);
    for (const tab of ["You", "Teams"]) {
      await charts.getByRole("tab", { name: tab }).click();
      await expect(charts.getByRole("tab", { name: tab })).toHaveAttribute("aria-selected", "true");
      // Scrolled into view as far as it goes, the chart is still clear of the footer.
      await charts.locator(".match-charts-marks").scrollIntoViewIfNeeded();
      const chart = await box(charts);
      expect(apart(chart, await box(actions)), `${tab}: chart and buttons do not overlap`).toBe(
        true,
      );
      expect(
        apart(chart, await box(page.locator(".queue-scores"))),
        `${tab}: chart and scores do not overlap`,
      ).toBe(true);
      // On a phone the charts use the whole width and stay at least 160 px tall.
      const plot = await box(charts.locator(".match-charts-svg"));
      expect(plot.height).toBeGreaterThanOrEqual(160);
      expect(chart.x + chart.width).toBeLessThanOrEqual(width);
    }
    expect(buttons.y + buttons.height).toBeLessThanOrEqual(height);

    // A legend chip hides its line and says so.
    await charts.getByRole("tab", { name: "You" }).click();
    const chip = charts.locator(".match-charts-chip", { hasText: "Damage dealt" });
    await chip.click();
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await expect(charts.locator(".chart-line-dealt")).toHaveCount(0);

    // A mark is reached by keyboard and says what happened.
    const mark = charts.locator(".chart-mark").first();
    await mark.focus();
    await expect(charts.locator(".match-charts-tip")).toBeVisible();
    await expect(charts.locator(".match-charts-tip")).toHaveText(/^\d+:\d\d — /);
  });
}
