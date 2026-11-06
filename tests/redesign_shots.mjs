// Redesign screenshots in headless Microsoft Edge (DevTools protocol, no extra dependency).
// Run from the repo root after `npm run build` in web/:
//   node tests/redesign_shots.mjs before    (current main)
//   node tests/redesign_shots.mjs after     (adds the CASE-0158 network at desktop and 375 px)
//   node tests/redesign_shots.mjs compare   (before | after side by side, drawn by Edge itself)
// Writes to docs/screenshots/redesign/.
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const MODE = process.argv[2];
if (!["before", "after", "compare"].includes(MODE)) { console.log("Usage: node tests/redesign_shots.mjs before|after|compare"); process.exit(2); }
const EDGE = process.env.EDGE ?? "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
const SITE_PORT = 8766, CDP_PORT = 9335, BASE = `http://127.0.0.1:${SITE_PORT}`;
const OUT = "docs/screenshots/redesign";
const NAMES = ["desktop-light", "desktop-dark", "mobile-375", "drill-case-0158", "rule-performance"];
mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = MODE === "compare" ? null
  : spawn("python", ["-m", "http.server", String(SITE_PORT), "-d", "web/out", "--bind", "127.0.0.1"], { stdio: "ignore" });
const profile = join(tmpdir(), `redesign-edge-${Date.now()}`);
const edge = spawn(EDGE, ["--headless=new", `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--disable-gpu", "--hide-scrollbars", "about:blank"], { stdio: "ignore" });

let ws, id = 0;
const pending = new Map();
function send(method, params = {}, sessionId) {
  return new Promise((resolve, reject) => {
    const msg = { id: ++id, method, params, ...(sessionId ? { sessionId } : {}) };
    pending.set(msg.id, { resolve, reject });
    ws.send(JSON.stringify(msg));
  });
}

async function main() {
  let url;
  for (let i = 0; i < 50 && !url; i++) {
    try { url = (await (await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`)).json()).webSocketDebuggerUrl; } catch { await sleep(200); }
  }
  ws = new WebSocket(url);
  await new Promise((r) => ws.addEventListener("open", r));
  ws.addEventListener("message", (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const p = pending.get(m.id); pending.delete(m.id); m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result); }
  });
  const { targetId } = await send("Target.createTarget", { url: "about:blank" });
  const { sessionId: s } = await send("Target.attachToTarget", { targetId, flatten: true });
  const S = (m, p) => send(m, p, s);
  await S("Page.enable");
  const js = async (expr) => (await S("Runtime.evaluate", { expression: expr, returnByValue: true, awaitPromise: true })).result.value;
  let vw = 1440, vh = 900;
  const size = (w, h, mobile = false) => { vw = w; vh = h; return S("Emulation.setDeviceMetricsOverride", { width: w, height: h, deviceScaleFactor: 1, mobile }); };
  const go = async (path) => { await S("Page.navigate", { url: BASE + path }); await sleep(1500); };
  // full: whole page from the top; selector: one element; otherwise the viewport.
  const shot = async (name, { full = false, selector } = {}) => {
    let clip;
    if (selector) clip = await js(`(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { x: Math.max(0, r.x - 8), y: Math.max(0, r.y - 8 + scrollY), width: Math.min(r.width + 16, innerWidth), height: r.height + 16, scale: 1 }; })()`);
    else if (full) clip = { x: 0, y: 0, width: vw, height: Math.min(await js("document.documentElement.scrollHeight"), 3000), scale: 1 };
    const { data } = await S("Page.captureScreenshot", { format: "png", ...(clip ? { clip, captureBeyondViewport: true } : {}) });
    writeFileSync(`${OUT}/${MODE}-${name}.png`, Buffer.from(data, "base64"));
    console.log(`wrote ${OUT}/${MODE}-${name}.png`);
  };
  const theme = (t) => js(`document.documentElement.dataset.theme='${t}'`);
  const open158 = async () => { await js(`[...document.querySelectorAll('.rowbtn')].find(b => b.textContent.trim() === 'CASE-0158').click()`); await sleep(1200); };

  if (MODE === "compare") {
    for (const n of [...NAMES, "network-desktop", "network-375"]) {
      const a = `${OUT}/before-${n}.png`, b = `${OUT}/after-${n}.png`;
      if (!existsSync(b)) continue;
      const img = (f) => existsSync(f) ? `<img src="data:image/png;base64,${readFileSync(f).toString("base64")}">` : `<div class="none">No before image: new in the redesign</div>`;
      const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;background:#e7e5e1;font:600 15px system-ui;color:#1c1b19}
        .row{display:flex;gap:16px;padding:16px;align-items:flex-start}.col{flex:1;min-width:0}.col p{margin:0 0 8px}
        img{width:100%;border:1px solid #d6d3cd;background:#fff;display:block}.none{padding:40px;border:1px dashed #a39e94}</style>
        <div class="row"><div class="col"><p>Before</p>${img(a)}</div><div class="col"><p>After</p>${img(b)}</div></div>`;
      await size(1600, 100);
      await S("Page.setDocumentContent", { frameId: (await S("Page.getFrameTree")).frameTree.frame.id, html });
      await sleep(500);
      const { data } = await S("Page.captureScreenshot", { format: "png", captureBeyondViewport: true,
        clip: { x: 0, y: 0, width: 1600, height: await js("document.documentElement.scrollHeight"), scale: 1 } });
      writeFileSync(`${OUT}/compare-${n}.png`, Buffer.from(data, "base64"));
      console.log(`wrote ${OUT}/compare-${n}.png`);
    }
    return;
  }

  await size(1440, 900);
  await go("/");
  await theme("light"); await sleep(300);
  await shot("desktop-light", { full: true });
  await theme("dark"); await sleep(300);
  await shot("desktop-dark", { full: true });
  await theme("light"); await sleep(200);
  await open158();
  await shot("drill-case-0158");
  if (MODE === "after") await shot("network-desktop", { selector: ".network" });
  if (MODE === "after") {
    // Dark theme and a case with high-risk-tier counterparties (red rings).
    await go("/"); await theme("dark"); await sleep(300);
    await js(`[...document.querySelectorAll('.rowbtn')].find(b => b.textContent.trim() === 'CASE-0173').click()`); await sleep(1200);
    await shot("network-dark-case-0173", { selector: ".network" });
    await theme("light");
  }
  await go("/");
  await theme("light");
  await js(`document.querySelector('#tab-rules').click()`); await sleep(800);
  await shot("rule-performance", { full: true });

  await size(375, 812, true);
  await go("/");
  await theme("light"); await sleep(300);
  await shot("mobile-375", { full: true });
  if (MODE === "after") {
    await open158();
    await js(`document.querySelector('.network').scrollIntoView({ block: 'start' })`); await sleep(400);
    await shot("network-375");
  }
}

main().catch((e) => { console.log("FAILED", e.message); process.exitCode = 1; }).finally(() => {
  try { ws?.close(); } catch {}
  edge.kill(); server?.kill();
  setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch {} process.exit(); }, 500);
});
