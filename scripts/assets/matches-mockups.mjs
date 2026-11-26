// #2585 mockups: closed and open Matches rows, three options each.
// Usage: node scripts/assets/matches-mockups.mjs docs/mockups/2585-matches-rows.html
import { readFileSync, writeFileSync } from "node:fs";

const out = process.argv[2];
/** @type {Record<string, string>} */
const COL = {
  warrior: "#e3b341",
  ranger: "#8fd36b",
  monk: "#9ecbff",
  necromancer: "#3fb68b",
  mesmer: "#e87fd0",
  elementalist: "#ff6e5a",
  assassin: "#c0405e",
  ritualist: "#a9e5e0",
  paragon: "#f0883e",
  dervish: "#c9a27e",
};
/** @type {(p: string, s?: number) => string} */
const icon = (p, s = 22) => {
  const svg = readFileSync(`apps/web/public/icons/profession/${p}.svg`, "utf8").trim();
  return svg.replace(/width="24" height="24"/, `width="${String(s)}" height="${String(s)}"`);
};
/** @typedef {[string, string, string]} Member */
/** @type {Member[]} */
const T1 = [
  ["Aldric", "monk", "mesmer"],
  ["Brynn", "warrior", "monk"],
  ["Cael", "elementalist", "monk"],
  ["Dova", "ranger", "assassin"],
];
/** @type {Member[]} */
const T2 = [
  ["Eska", "necromancer", "mesmer"],
  ["Fenn", "paragon", "warrior"],
  ["Gwyn", "ritualist", "monk"],
  ["Holt", "dervish", "warrior"],
];
const meta = `<span class="tag">4v4</span><span class="dim">Crossroads · Kill Count · 12:31 · 2 min ago</span>`;
const badge = `<span class="host">host-reported</span>`;
/** @type {(a: string, b: string) => string} */
const pair = (a, b) => `<span class="pair">${icon(a)}<i>${icon(b, 14)}</i></span>`;

// Closed A: two rosters side by side, one icon pair per player.
const closedA = `<div class="row"><div class="head">${meta}${badge}</div>
 <div class="a"><div class="side win"><b>Team 1 · Won</b><div class="pairs">${T1.map(([, a, b]) => pair(a, b)).join("")}</div></div>
 <span class="vs">vs</span>
 <div class="side"><b>Team 2</b><div class="pairs">${T2.map(([, a, b]) => pair(a, b)).join("")}</div></div></div></div>`;
// Closed B: single line, icons only, as dense as a scoreboard.
const closedB = `<div class="row b"><span class="tag">4v4</span>
 <span class="icons win">${T1.map(([, a]) => icon(a, 18)).join("")}</span><b class="score">WON</b>
 <span class="icons">${T2.map(([, a]) => icon(a, 18)).join("")}</span>
 <span class="dim grow">Crossroads · 12:31 · 2 min ago</span>${badge}</div>`;
// Closed C: names and professions as text, two columns.
const closedC = `<div class="row"><div class="head">${meta}${badge}</div>
 <div class="c"><ul class="win"><li class="h">Team 1 · Won</li>${T1.map(([n, a, b]) => `<li>${icon(a, 14)}<span>${n}</span><em>${a.slice(0, 1).toUpperCase()}/${b.slice(0, 1).toUpperCase()}</em></li>`).join("")}</ul>
 <ul><li class="h">Team 2</li>${T2.map(([n, a, b]) => `<li>${icon(a, 14)}<span>${n}</span><em>${a.slice(0, 1).toUpperCase()}/${b.slice(0, 1).toUpperCase()}</em></li>`).join("")}</ul></div></div>`;

/** @type {(n: string, a: string, b: string) => string} */
const fig = (n, a, b) =>
  `<div class="fig"><div class="disc" style="border-color:${COL[a] ?? ""}">${icon(a, 26)}</div><span>${n}</span><small>${a}/${b}</small></div>`;
/** @type {(title: string, team: Member[], won: boolean) => string} */
const card = (
  title,
  team,
  won,
) => `<div class="card${won ? " win" : ""}"><div class="ct"><b>${title}</b><span class="tag">4v4</span>${won ? '<span class="won">Won</span>' : ""}</div>
 <div class="figs">${team.map(([n, a, b]) => fig(n, a, b)).join("")}</div><button>Clone</button></div>`;
// Open A: both cards side by side.
const openA = `<div class="row open"><div class="head">${meta}${badge}<u>Close ▴</u></div><div class="cards">${card("Team 1", T1, true)}${card("Team 2", T2, false)}</div></div>`;
// Open B: stacked, full width, figures in one line with Clone at the end.
/** @type {(title: string, team: Member[], won: boolean) => string} */
const wide = (title, team, won) =>
  `<div class="card wide${won ? " win" : ""}"><div class="ct"><b>${title}</b>${won ? '<span class="won">Won</span>' : ""}</div><div class="figs">${team.map(([n, a, b]) => fig(n, a, b)).join("")}</div><button>Clone</button></div>`;
const openB = `<div class="row open"><div class="head">${meta}${badge}<u>Close ▴</u></div>${wide("Team 1", T1, true)}${wide("Team 2", T2, false)}</div>`;
// Open C: the closed overview stays on top; tabs show one card at a time.
const openC = `<div class="row open"><div class="head">${meta}${badge}<u>Close ▴</u></div>
 <div class="tabs"><span class="on">Team 1 · Won</span><span>Team 2</span></div>${card("Team 1", T1, true)}</div>`;

/** @type {(t: string, n: string, body: string) => string} */
const sec = (t, n, body) => `<h2>${t}</h2><p class="n">${n}</p>${body}`;
writeFileSync(
  out,
  `<!doctype html><meta charset="utf-8"><title>#2585 mockups: Matches rows</title>
<style>
:root{--bg:#0e1116;--panel:#161b22;--line:#2b3440;--ink:#d7dee8;--dim:#7d8899;--accent:#59c2ff;--won:#7ee787}
body{margin:0;padding:1.5rem;background:#080a0d;color:var(--ink);font:15px system-ui,sans-serif}
h1{font-size:1.2rem}h2{font-size:1rem;margin:2rem 0 .3rem;color:var(--accent)}p.n{color:var(--dim);margin:.2rem 0 .6rem;max-width:44rem}
.wrap{max-width:54rem}.row{background:var(--panel);border:1px solid var(--line);border-radius:6px;padding:.6rem .8rem;margin-bottom:.5rem}
.head{display:flex;gap:.7rem;align-items:center;margin-bottom:.5rem}.head u{margin-left:auto;color:var(--accent);text-decoration:none}
.tag{border:1px solid var(--line);border-radius:3px;padding:0 .35rem;font-size:.8rem;color:var(--dim)}.dim{color:var(--dim);font-size:.85rem}
.host{margin-left:auto;font-size:.75rem;color:#ffa657;border:1px dashed #ffa657;border-radius:3px;padding:0 .35rem}.head .host+u{margin-left:.7rem}
.a{display:flex;align-items:center;gap:1rem}.a .side{flex:1;border:1px solid var(--line);border-radius:4px;padding:.4rem .5rem}.side.win,.card.win{border-color:var(--won)}
.a b{font-size:.85rem}.win>b,.win b.won,.won{color:var(--won)}.pairs{display:flex;gap:.7rem;margin-top:.3rem}
.pair{position:relative;display:inline-flex}.pair i{position:absolute;right:-6px;bottom:-4px;background:var(--panel);border-radius:50%;display:flex}.vs{color:var(--dim)}
.b{display:flex;align-items:center;gap:.7rem}.icons{display:flex;gap:.25rem}.icons.win{padding:2px 4px;border-bottom:2px solid var(--won)}.score{color:var(--won);font-size:.8rem}.grow{flex:1}
.c{display:flex;gap:1rem}.c ul{flex:1;list-style:none;margin:0;padding:.3rem .5rem;border:1px solid var(--line);border-radius:4px}
.c li{display:flex;gap:.5rem;align-items:center;padding:1px 0}.c li span{flex:1}.c em{font-style:normal;color:var(--dim);font-size:.8rem}.c .h{color:var(--dim);font-size:.8rem}.c .win .h{color:var(--won)}.c ul.win{border-color:var(--won)}
.cards{display:flex;gap:.6rem}.card{flex:1;border:1px solid var(--line);border-radius:6px;padding:.5rem;background:#10151c}
.ct{display:flex;gap:.5rem;align-items:center;margin-bottom:.4rem}.won{font-size:.8rem;margin-left:auto}
.figs{display:flex;gap:.5rem}.fig{display:flex;flex-direction:column;align-items:center;font-size:.8rem;width:5.4rem}.fig small{color:var(--dim);font-size:.6rem;white-space:nowrap}
.disc{width:40px;height:40px;border:2px solid;border-radius:50%;display:flex;align-items:center;justify-content:center;background:#0b0e13}
button{margin-top:.5rem;background:#1f2a37;color:var(--ink);border:1px solid var(--accent);border-radius:4px;padding:.2rem .8rem}
.card.wide{display:flex;align-items:center;gap:1rem;margin-bottom:.4rem}.card.wide .ct{flex-direction:column;align-items:flex-start;width:4rem;margin:0}.card.wide .figs{flex:1}.card.wide button{margin:0}
.tabs{display:flex;gap:.3rem;margin-bottom:.4rem}.tabs span{padding:.15rem .7rem;border:1px solid var(--line);border-radius:4px 4px 0 0;color:var(--dim)}.tabs .on{color:var(--won);border-color:var(--won)}
</style><h1>#2585 mockups: a Matches row, closed and opened</h1><div class="wrap">
${sec("Closed A: Rosters", "Two framed teams side by side, one profession icon per player with the secondary as a small badge. Winner framed green. Tallest, clearest who-played-what.", closedA)}
${sec("Closed B: Scoreboard line", "One line per match: primary profession icons only, the winner underlined, WON between. Densest; many rows fit; secondaries and names wait for the open row.", closedB)}
${sec("Closed C: Name lists", "Names with profession icon and profession initials (primary/secondary). Text first, searchable by eye; tallest.", closedC)}
${sec("Open A: Side by side", "Team Builder's cards for both teams next to each other, each with Clone. Compare at a glance.", openA)}
${sec("Open B: Stacked wide", "One card per line, figures in a row, Clone at the end. Scales to 8v8 without squeezing.", openB)}
${sec("Open C: Tabs", "One team card at a time with tabs; the least busy, one click more to see the other team.", openC)}
</div>`,
);
