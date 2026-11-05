// UI check in headless Microsoft Edge over the DevTools protocol (no extra dependency).
// Checks: "(fictional)" on every page, the four KPIs, queue sorted by risk, CASE-0158 drill-down, Esc, Tab focus ring,
// dark mode, rule performance tab with the 2x2 table, trade-off line and customers column, How this works,
// no horizontal scroll at 375 px, Open Graph tags, no console errors.
// Local (serves web/out, writes docs/screenshots/ and web/public/og.png), after `npm run build` in web/:
//   node tests/qa_edge.mjs
// Live site, run ONCE (do not poll; Vercel's bot protection reacts to repeated runs). Screenshots to docs/screenshots/live/:
//   node tests/qa_edge.mjs https://lysbro-aml.vercel.app
import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const EDGE = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const LIVE = (process.argv[2] ?? "").replace(/\/$/, "");
const SITE_PORT = 8765, CDP_PORT = 9333, BASE = LIVE || `http://127.0.0.1:${SITE_PORT}`;
const SHOTS = LIVE ? "docs/screenshots/live" : "docs/screenshots";
// Expected values, read from the same files the site is built from.
const CASES = JSON.parse(readFileSync("web/data/cases.json", "utf8"));
const META = JSON.parse(readFileSync("web/data/meta.json", "utf8"));
const sep = CASES.filter((c) => c.case_month === META.default_month);
const EXPECT_KPI = `${sep.filter((c) => c.ai?.suggestion === "escalate").length} of ${sep.length}`;
const T = META.scores.ai.table;
const EXPECT_TRADE = `${T.suspicious_escalate + T.not_suspicious_escalate} of ${META.scores.overall.cases} cases reviewed, ${T.suspicious_escalate} of ${T.suspicious_escalate + T.suspicious_close} truly suspicious cases found, ${T.suspicious_close} missed`;
const C158 = CASES.find((c) => c.case_id === "CASE-0158");
mkdirSync(SHOTS, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = LIVE ? null : spawn("python", ["-m", "http.server", String(SITE_PORT), "-d", "web/out", "--bind", "127.0.0.1"], { stdio: "ignore" });
const profile = join(tmpdir(), `qa-edge-${Date.now()}`);
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "about:blank"], { stdio: "ignore" });

let ws, id = 0;
const pending = new Map(), errors = [];
const results = [];
const check = (name, ok, detail = "") => { results.push({ name, ok, detail }); console.log(`${ok ? "PASS" : "FAIL"} ${name}${detail ? ` (${detail})` : ""}`); };

function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params };
    if (sessionId) msg.sessionId = sessionId;
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function connect() {
  for (let i = 0; i < 50; i++) {
    try { const v = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json(); return v.webSocketDebuggerUrl; }
    catch { await sleep(200); }
  }
  throw new Error("Edge did not start");
}

async function main() {
  ws = new WebSocket(await connect());
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
    if (m.method === "Runtime.exceptionThrown") errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text);
    if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") errors.push(m.params.args.map((a) => a.value ?? a.description).join(" "));
    if (m.method === "Log.entryAdded" && m.params.entry.level === "error") errors.push(m.params.entry.text + " " + (m.params.entry.url ?? ""));
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, s);
  await S("Page.enable"); await S("Runtime.enable"); await S("Log.enable");
  const js = async (expr) => (await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  const size = (w, h, mobile = false) => S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile });
  const go = async (path) => { await S("Page.navigate", { url: BASE + path }); await sleep(1500); };
  const shot = async (name) => { const { data } = await S("Page.captureScreenshot", { format: "png" }); writeFileSync(`${SHOTS}/${name}`, Buffer.from(data, "base64")); };
  const key = async (k, code, vk, mods = 0) => {
    await S("Input.dispatchKeyEvent", { type: "keyDown", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods, ...(k === "Enter" ? { text: String.fromCharCode(13) } : {}) });
    await S("Input.dispatchKeyEvent", { type: "keyUp", key: k, code, windowsVirtualKeyCode: vk, modifiers: mods });
    await sleep(60);
  };
  const theme = (t) => js(`document.documentElement.dataset.theme='${t}'`);

  // Desktop, light
  await size(1280, 900);
  await go("/");
  await theme("light"); await sleep(200);
  check("Title says (fictional)", await js(`document.querySelector('h1').textContent.includes('(fictional)')`));
  check("Notice says the data is fictional", await js(`document.querySelector('.notice').textContent.includes('fictional')`));
  check("Four KPI cards", (await js(`document.querySelectorAll('.kpi').length`)) === 4);
  const kpi1 = await js(`document.querySelector('.kpi').innerText`);
  check(`KPI "AI suggests escalation" shows ${EXPECT_KPI} for Sep 2026`, kpi1.toUpperCase().includes("AI SUGGESTS ESCALATION") && kpi1.includes(EXPECT_KPI), kpi1.replace(/\s+/g, " ").slice(0, 80));
  check("Month selector defaults to Sep 2026", (await js(`document.querySelector('#month').selectedOptions[0].textContent`)) === "Sep 2026");
  const scores = await js(`[...document.querySelectorAll('tbody tr.row .score')].map(e => parseInt(e.textContent))`);
  check("Queue has rows", scores.length > 0, `${scores.length} rows`);
  check("Queue sorted by risk score, highest first", scores.every((v, i) => i === 0 || scores[i - 1] >= v));
  check("Status badge 'Awaiting analyst'", await js(`[...document.querySelectorAll('.badge-status')].some(b => b.textContent === 'Awaiting analyst')`));
  check("No em dash on the page", !(await js(`document.body.innerText.includes('\\u2014')`)));
  await shot("desktop-light.png");

  // CASE-0158 opens with its AI summary
  await js(`[...document.querySelectorAll('.rowbtn')].find(b => b.textContent === 'CASE-0158').click()`);
  await sleep(600);
  const d158 = await js(`document.querySelector('dialog.drill')?.innerText ?? ''`);
  check("CASE-0158 opens with summary and 'AI suggestion only. An analyst decides.'",
    d158.includes("CASE-0158") && d158.includes(C158.ai.summary.slice(0, 60)) && d158.includes("AI suggestion only. An analyst decides."));
  await key("Escape", "Escape", 27);
  await sleep(300);

  // Filters
  await js(`(() => { const s = document.querySelectorAll('.filters select')[1]; const set = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set; set.call(s, 'escalate'); s.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await sleep(300);
  const sugg = await js(`[...document.querySelectorAll('tbody tr.row .badge')].filter(b => !b.classList.contains('badge-status')).map(b => b.textContent)`);
  check("Filter by AI suggestion works", sugg.every((t) => t === "Escalate"), `${sugg.length} rows`);
  await go("/");

  // Tab navigation with a visible focus ring
  await theme("light");
  const stops = [];
  for (let i = 0; i < 14; i++) {
    await key("Tab", "Tab", 9);
    stops.push(await js(`(() => { const e = document.activeElement; const cs = getComputedStyle(e);
      return { tag: e.tagName, cls: e.className, text: (e.textContent || e.ariaLabel || '').trim().slice(0, 30), outline: cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0 }; })()`));
  }
  check("Tab reaches the month selector, theme toggle, KPI info, tabs and a case", ["SELECT"].every((t) => stops.some((x) => x.tag === t))
    && stops.some((x) => x.cls.includes("info")) && stops.some((x) => x.cls.includes("tab")) && stops.some((x) => x.cls.includes("rowbtn")),
    stops.map((x) => x.cls || x.tag).join(" > "));
  check("Visible focus ring on every Tab stop", stops.every((x) => x.outline), stops.filter((x) => !x.outline).map((x) => x.tag + "." + x.cls).join(", "));
  await shot("focus-ring.png");

  // Drill-down: Enter on the focused case opens it
  while (!(await js(`document.activeElement.classList.contains('rowbtn')`))) await key("Tab", "Tab", 9);
  await key("Enter", "Enter", 13);
  await sleep(600);
  check("Enter opens the drill-down", await js(`document.querySelector('dialog.drill').open`));
  const body = await js(`document.querySelector('dialog.drill').innerText`);
  check("Drill-down says 'AI suggestion only. An analyst decides.'", body.includes("AI suggestion only. An analyst decides."));
  check("Drill-down has profile, timeline, rules and AI section", ["Customer profile", "Declared vs actual", "Rules hit", "AI draft"].every((t) => body.toUpperCase().includes(t.toUpperCase())));
  check("Drill-down timeline chart renders", (await js(`document.querySelectorAll('dialog.drill .recharts-symbols').length`)) > 0);
  check("Focus is inside the drill-down", await js(`document.querySelector('dialog.drill').contains(document.activeElement)`));
  await shot("drilldown.png");
  await key("Escape", "Escape", 27);
  await sleep(300);
  check("Esc closes the drill-down", !(await js(`document.querySelector('dialog.drill').open`)));

  // Dark mode via the toggle
  await js(`document.querySelector('button[aria-label="Switch light or dark theme"]').click()`);
  await sleep(300);
  check("Theme toggle switches to dark", (await js(`document.documentElement.dataset.theme`)) === "dark");
  check("Dark background applied", (await js(`getComputedStyle(document.body).backgroundColor`)) === "rgb(11, 17, 32)");
  await shot("desktop-dark.png");
  await js(`document.querySelector('#tab-rules').click()`);
  await sleep(600);
  check("Rule performance tab shows the 2x2 table", await js(`!!document.querySelector('.t22')`));
  const trade = await js(`document.querySelector('#trade-off')?.innerText ?? ''`);
  check("Trade-off line shows the computed figures", trade.includes(EXPECT_TRADE) && trade.includes("not to close cases"), trade.slice(0, 120));
  check("Rule table has the customers column", await js(`[...document.querySelectorAll('th')].some(t => t.textContent === 'Customers (planted)')`));
  await shot("rule-performance-dark.png");
  await theme("light"); await sleep(200);
  await shot("rule-performance.png");

  // How this works
  await go("/how-it-works/");
  const how = await js(`document.body.innerText`);
  check("How this works page loads and says fictional", how.includes("How this works") && how.includes("fictional"));
  check("Footer credit present", how.includes("Built with Claude Code by Knut Barka"));
  check("How this works says (fictional)", how.includes("(fictional)"));
  await shot("how-it-works.png");
  await go(LIVE ? "/no-such-page/" : "/404.html");
  check("404 page says (fictional)", (await js(`document.body.innerText`)).includes("(fictional)"));

  // Open Graph tags: absolute URLs; on the live site the image must load.
  const html = await (await fetch(BASE + "/")).text();
  const meta = (attr, name) => html.match(new RegExp(`<meta ${attr}="${name}" content="([^"]+)"`))?.[1] ?? "";
  const ogImage = meta("property", "og:image"), ogUrl = meta("property", "og:url");
  check("og:image and og:url are absolute", ogImage.startsWith("https://") && ogUrl.startsWith("https://"), `${ogImage} | ${ogUrl}`);
  check("twitter:card is summary_large_image", meta("name", "twitter:card") === "summary_large_image");
  if (LIVE) {
    const r = await fetch(ogImage);
    check("Open Graph image returns 200", r.status === 200, `${r.status} ${r.headers.get("content-type")}`);
  }

  // Open Graph image, 1200 x 630 (local run only)
  if (!LIVE) {
    await size(1200, 630);
    await go("/");
    await theme("light"); await sleep(300);
    const { data } = await S("Page.captureScreenshot", { format: "png" });
    writeFileSync("web/public/og.png", Buffer.from(data, "base64"));
  }

  // 375 px
  await size(375, 812, true);
  await go("/");
  await theme("light");
  await sleep(300);
  check("No horizontal scroll at 375 px", (await js(`document.documentElement.scrollWidth`)) <= 375, `scrollWidth ${await js(`document.documentElement.scrollWidth`)}`);
  await shot("mobile-375.png");
  await js(`document.querySelector('.rowbtn').click()`);
  await sleep(600);
  check("Drill-down fits 375 px", await js(`(() => { const d = document.querySelector('dialog.drill'); return d.open && d.scrollWidth <= d.clientWidth + 1; })()`));
  await shot("mobile-375-drilldown.png");
  await go("/how-it-works/");
  check("How this works fits 375 px", (await js(`document.documentElement.scrollWidth`)) <= 375);

  check("No console errors", errors.length === 0, errors.slice(0, 3).join(" | "));
}

main().catch((e) => { check("QA script ran", false, e.message); }).finally(() => {
  const failed = results.filter((r) => !r.ok).length;
  console.log(`\n${results.length - failed} of ${results.length} checks passed.`);
  try { ws?.close(); } catch {}
  edge.kill(); server?.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(failed ? 1 : 0); }, 500);
});
