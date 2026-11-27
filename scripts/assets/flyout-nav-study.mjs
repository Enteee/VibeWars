/* global document, window, requestAnimationFrame */
/* eslint-disable @typescript-eslint/prefer-nullish-coalescing, @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/restrict-template-expressions -- an untyped docs script: the mocks are DOM edits run inside the page. */
// Flyout navigation study (#4186): three ways to navigate a flyout's sub-pages,
// mocked in the real Help and Options flyouts of the running client by a
// throwaway DOM and CSS override (nothing here is merged into apps/web).
//   A tab strip, B left rail (list > page drill-down when narrow), C dropdown with breadcrumb.
// Usage: node scripts/assets/flyout-nav-study.mjs <url> <out-dir>
//        node scripts/assets/flyout-nav-study.mjs --sheet <out-dir> <sheet.png>   (the overview of the panels)
//   <url>: a client built with VITE_VIBEWARS_TRANSPORT=broadcast and VITE_VIBEWARS_SPLASH=off.
//   Browser: VIBEWARS_CHROMIUM, else Playwright's own. Needs imagemagick for the sheet.
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { chromium } from "@playwright/test";

const FONT = process.env.STUDY_FONT || "DejaVu-Sans-Mono";
const magick = (...args) => execFileSync("magick", args);

/** One overview: a column per proposal, the panels shrunk to the column. */
function sheet(dir, target) {
  const COLW = 560;
  const cell = (file, w) => [`${dir}/${file}.png`, "-resize", `${w}x`];
  const pair = (a, b) => [
    "(",
    ...cell(a, COLW / 2 - 4),
    "-bordercolor",
    "#1b1d22",
    "-border",
    "2",
    ")",
    "(",
    ...cell(b, COLW / 2 - 4),
    "-bordercolor",
    "#1b1d22",
    "-border",
    "2",
    ")",
    "+append",
  ];
  const col = (k, name, second) => {
    const arg = [];
    const row = (items) => arg.push("(", ...items, ")");
    row([
      "-size",
      `${COLW}x34`,
      "xc:#1b1d22",
      "-font",
      FONT,
      "-pointsize",
      "20",
      "-fill",
      "#e8eef6",
      "-annotate",
      "+8+24",
      name,
    ]);
    row([...cell(`${k}-help-desktop`, COLW)]);
    row([...cell(`${k}-options-desktop`, COLW)]);
    row(pair(`${k}-help-narrow`, second.help));
    row(pair(`${k}-options-narrow`, `${k}-options-long-narrow`));
    row([...cell(`${k}-help-long-desktop`, COLW)]);
    return ["(", ...arg, "-background", "#1b1d22", "-append", ")"];
  };
  magick(
    ...col("a", "A  tab strip", { help: "a-help-narrow-end", options: "a-options-long-narrow" }),
    ...col("b", "B  left rail", { help: "b-help-narrow-page", options: "b-options-narrow-page" }),
    ...col("c", "C  dropdown + breadcrumb", {
      help: "c-help-narrow-open",
      options: "c-options-long-desktop",
    }),
    "-background",
    "#1b1d22",
    "+append",
    "-colors",
    "64",
    `PNG8:${target}`,
  );
}

if (process.argv[2] === "--sheet") {
  sheet(process.argv[3], process.argv[4]);
  process.exit(0);
}
const [url, out] = process.argv.slice(2);
if (!url || !out) {
  throw new Error("usage: flyout-nav-study.mjs <url> <out-dir>");
}
mkdirSync(out, { recursive: true });

// The longest real titles across docs/player/*: Vietnamese and Portuguese.
const LONG = {
  help: [
    "Bắt đầu",
    "Điều khiển",
    "Cơ bản về chiến đấu",
    "Kỹ năng và build",
    "Trang bị",
    "Chế độ",
    "Xếp hạng",
    "Trang trí",
    "Các yếu tố trong thế giới",
    "Bot",
    "Thuật ngữ",
    "Ủng hộ VibeWars",
    "Trailer",
    "Giấy phép bên thứ ba",
  ],
  options: ["người chơi", "ngôn ngữ", "điều khiển", "trang trí", "ретранслятор (TURN)"],
};

const CSS = `
.mock-tabs{flex:none;display:flex;gap:2px;overflow-x:auto;border-bottom:1px solid var(--line);margin:0 2.6rem .7rem 0;scrollbar-width:none;
  -webkit-mask-image:linear-gradient(90deg,#000 88%,transparent);mask-image:linear-gradient(90deg,#000 88%,transparent)}
.mock-tabs.at-end{-webkit-mask-image:linear-gradient(90deg,transparent,#000 12%);mask-image:linear-gradient(90deg,transparent,#000 12%)}
.mock-tab{flex:none;background:none;border:0;border-bottom:2px solid transparent;color:var(--ink-dim);padding:.5rem .8rem;font:inherit;white-space:nowrap;cursor:pointer}
.mock-tab[aria-selected=true]{color:var(--accent);border-bottom-color:var(--accent)}
.mock-layout{display:grid;grid-template-columns:11rem minmax(0,1fr);gap:1.2rem;align-items:start}
.mock-rail{display:flex;flex-direction:column;gap:.3rem;max-height:30rem;overflow-y:auto}
.mock-entry{text-align:start;background:var(--panel);border:1px solid var(--line);color:var(--ink);padding:.45rem .7rem;font:inherit;cursor:pointer}
.mock-entry[aria-current=page]{border-color:var(--accent);color:var(--accent)}
.mock-back{flex:none;display:flex;align-items:center;gap:.5rem;margin:0 2.6rem .7rem 0;padding-bottom:.5rem;border-bottom:1px solid var(--line)}
.mock-back button{background:none;border:1px solid var(--line);color:var(--accent);padding:.2rem .6rem;font:inherit;cursor:pointer}
.mock-crumb{flex:none;display:flex;align-items:center;gap:.5rem;margin:0 2.6rem .7rem 0;position:relative}
.mock-crumb .root{color:var(--ink-dim)}
.mock-crumb button{background:var(--panel);border:1px solid var(--accent);color:var(--accent);padding:.35rem .7rem;font:inherit;cursor:pointer;max-width:100%}
.mock-list{position:absolute;top:2.4rem;left:2.6rem;z-index:5;background:#10151c;border:1px solid var(--accent);max-height:19rem;overflow-y:auto;min-width:14rem;display:flex;flex-direction:column}
.mock-list [role=option]{padding:.4rem .8rem;color:var(--ink);cursor:pointer}
.mock-list [role=option][aria-selected=true]{color:var(--accent);background:#1a2430}
.mock-list [role=option].focus{outline:1px solid var(--accent);outline-offset:-2px}
`;

/** Runs in the page: turn the open flyout into proposal `kind` (a/b/c), in `state`. */
function mock({ flyout, kind, state, long, narrow }) {
  const root = document.querySelector(flyout === "help" ? ".help-window" : ".options-window");
  const style = document.createElement("style");
  style.textContent = window.__css;
  document.head.append(style);
  const original =
    flyout === "help" ? root.querySelector(".help-picker") : root.querySelector(".options-nav");
  const labels =
    flyout === "help"
      ? [...original.options].map((o) => o.textContent)
      : [...original.children].map((b) => b.textContent);
  const shown = long ? window.__long[flyout] : labels;
  const current = 0;
  const el = (tag, cls, text, attrs = {}) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
    return e;
  };
  const crumbRoot = flyout === "help" ? "Help" : "Options";
  const body = flyout === "help" ? null : root.querySelector(".options-body");
  // Everything but the close button and the old navigation is the page.
  const pageParts =
    flyout === "help"
      ? [...root.children].filter((c) => c !== original && !c.classList.contains("overlay-close"))
      : [];
  const putNav = (nav) => {
    if (flyout === "help") {
      original.replaceWith(nav);
    } else {
      body.before(nav);
    }
  };
  if (flyout === "options") {
    original.style.display = "none";
  }
  if (kind === "a") {
    const strip = el("div", "mock-tabs", undefined, {
      role: "tablist",
      "aria-label": flyout === "help" ? "Help pages" : "Options sections",
    });
    shown.forEach((l, i) =>
      strip.append(
        el("button", "mock-tab", l, {
          role: "tab",
          "aria-selected": String(i === (state === "end" ? shown.length - 1 : current)),
        }),
      ),
    );
    putNav(strip);
    if (flyout === "options") body.style.gridTemplateColumns = "minmax(0,1fr)";
    if (state === "end") {
      strip.classList.add("at-end");
      requestAnimationFrame(() => (strip.scrollLeft = strip.scrollWidth));
    }
  }
  if (kind === "b") {
    const rail = el("div", "mock-rail", undefined, {
      role: "navigation",
      "aria-label": flyout === "help" ? "Help pages" : "Options sections",
    });
    shown.forEach((l, i) =>
      rail.append(el("button", "mock-entry", l, i === current ? { "aria-current": "page" } : {})),
    );
    if (flyout === "help") {
      const layout = el("div", "mock-layout");
      const main = el("div", "mock-main");
      main.style.minWidth = "0";
      main.append(...pageParts);
      original.replaceWith(layout);
      layout.append(rail, main);
      if (narrow) {
        layout.style.display = "block";
        if (state === "page") {
          rail.hidden = true;
          const bar = el("div", "mock-back");
          bar.append(
            el("button", "", "‹ Help", { "aria-label": "Back to the list of pages" }),
            el("strong", "", shown[current]),
          );
          layout.before(bar);
        } else {
          main.hidden = true;
          rail.style.maxHeight = "none";
        }
      }
    } else {
      original.style.display = "";
      original.className = "mock-rail";
      [...original.children].forEach((b, i) => {
        b.className = "mock-entry";
        b.textContent = shown[i];
        if (i === current) b.setAttribute("aria-current", "page");
      });
      if (narrow) {
        body.style.gridTemplateColumns = "minmax(0,1fr)";
        if (state === "page") {
          original.style.display = "none";
          const bar = el("div", "mock-back");
          bar.append(
            el("button", "", "‹ Options", { "aria-label": "Back to the list of sections" }),
            el("strong", "", shown[current]),
          );
          body.before(bar);
        } else {
          root.querySelector(".options-pane").hidden = true;
        }
      } else {
        body.style.gridTemplateColumns = "11rem minmax(0,1fr)";
      }
    }
  }
  if (kind === "c") {
    const crumb = el("nav", "mock-crumb", undefined, { "aria-label": "You are here" });
    const trigger = el("button", "", `${shown[current]} ▾`, {
      "aria-haspopup": "listbox",
      "aria-expanded": String(state === "open"),
    });
    crumb.append(el("span", "root", crumbRoot), el("span", "root", "›"), trigger);
    if (state === "open") {
      const list = el("div", "mock-list", undefined, {
        role: "listbox",
        "aria-label": flyout === "help" ? "Help pages" : "Options sections",
      });
      shown.forEach((l, i) =>
        list.append(
          el("div", i === 2 ? "focus" : "", l, {
            role: "option",
            "aria-selected": String(i === current),
          }),
        ),
      );
      crumb.append(list);
    }
    putNav(crumb);
    if (flyout === "options") body.style.gridTemplateColumns = "minmax(0,1fr)";
  }
}

const browser = await chromium.launch({
  executablePath: process.env.VIBEWARS_CHROMIUM || undefined,
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// A first visit on a phone starts the tutorial; the menu is what is wanted.
await page.addInitScript(() => {
  localStorage.setItem("vibewars.tutorial", "skipped");
});
const failed = [];
page.on("pageerror", (e) => failed.push(String(e)));

/** Open `flyout`, mock it, and shoot its panel into `${out}/${name}.png`. */
async function shoot(name, { flyout, kind, state, long = false, narrow = false }) {
  // Loaded wide, so the splash is skipped, then narrowed: the layout reflows.
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.goto(url);
  await page.waitForTimeout(1500);
  if (narrow) {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.waitForTimeout(500);
  }
  // A script click: on a phone a "Click to start" cover sits over the bar.
  await page
    .locator(flyout === "help" ? "button.topbar-help" : "button.topbar-options")
    .first()
    .evaluate((button) => button.click());
  const panel = page.locator(flyout === "help" ? ".help-window" : ".options-window");
  await panel.waitFor();
  if (kind) {
    await page.evaluate(
      ([css, longLabels]) => {
        window.__css = css;
        window.__long = longLabels;
      },
      [CSS, LONG],
    );
    await page.evaluate(mock, { flyout, kind, state, long, narrow });
  }
  await page.waitForTimeout(300);
  const file = `${out}/${name}.png`;
  await panel.screenshot({ path: file });
  // At most 800 px wide, 8-bit: the study loads over a LAN.
  magick(file, "-resize", "800x>", `PNG8:${file}`);
}

const NAME = (k, f, v) => `${k}-${f}-${v}`;
await shoot("today-help-desktop", { flyout: "help" });
await shoot("today-options-desktop", { flyout: "options" });
await shoot("today-help-narrow", { flyout: "help", narrow: true });
await shoot("today-options-narrow", { flyout: "options", narrow: true });
for (const kind of ["a", "b", "c"]) {
  for (const flyout of ["help", "options"]) {
    await shoot(NAME(kind, flyout, "desktop"), { flyout, kind });
    await shoot(NAME(kind, flyout, "narrow"), {
      flyout,
      kind,
      narrow: true,
      state: kind === "b" ? "list" : undefined,
    });
    await shoot(NAME(kind, flyout, "long-desktop"), {
      flyout,
      kind,
      long: true,
      state: kind === "c" ? "open" : undefined,
    });
    await shoot(NAME(kind, flyout, "long-narrow"), {
      flyout,
      kind,
      long: true,
      narrow: true,
      state: kind === "b" ? "list" : kind === "c" ? "open" : "end",
    });
  }
}
await shoot("b-help-narrow-page", { flyout: "help", kind: "b", narrow: true, state: "page" });
await shoot("b-options-narrow-page", { flyout: "options", kind: "b", narrow: true, state: "page" });
await shoot("c-help-desktop-open", { flyout: "help", kind: "c", state: "open" });
await shoot("c-help-narrow-open", { flyout: "help", kind: "c", narrow: true, state: "open" });
await shoot("a-help-narrow-end", { flyout: "help", kind: "a", narrow: true, state: "end" });
await browser.close();
if (failed.length > 0) {
  console.error(failed.join("\n"));
}
console.log("panels written to", out);
