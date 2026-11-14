#!/usr/bin/env node
/* 금연노트 · 금주노트 화면 점검 — 가로 넘침 · 44px · 기록 저장 · 진입화면 시간
 *
 * 쓰는 법 (Playwright 가 있는 곳에서):
 *   node tools/qa-check.cjs                      두 저장소를 이 폴더 옆에서 찾아 임시 서버로 띄워 점검
 *   SMOKE_DIR=... ALC_DIR=... node tools/qa-check.cjs
 *   SMOKE_URL=http://localhost:8741 ALC_URL=http://localhost:8731 node tools/qa-check.cjs   이미 떠 있는 서버를 씀
 *
 * 결과: 문제가 없으면 「이상 없음」 한 줄과 종료 코드 0, 있으면 줄마다 적고 종료 코드 1.
 * 코드를 고치지 않고, 시험 데이터는 브라우저 localStorage 뿐입니다(저장소·운영 DB 를 건드리지 않음).
 * 거짓경고로 알려진 것(ERR_TUNNEL_CONNECTION_FAILED 의 외부 글꼴 오류 · 체크박스 입력 22px)은 거릅니다. */
"use strict";
const path = require("path");
const fs = require("fs");
const http = require("http");
let chromium; try { ({ chromium } = require("playwright")); } catch (e) { /* 시험이 serve 만 불러올 때는 Playwright 가 없어도 된다 */ }

const ROOT = path.resolve(__dirname, "..");
const APPS = [
  { n: "금연노트", dir: process.env.SMOKE_DIR || ROOT, url: process.env.SMOKE_URL, file: "SmokeFree_app.html", key: "smokefree.v1", tabs: ["home", "log", "stats", "health", "help"] },
  { n: "금주노트", dir: process.env.ALC_DIR || path.resolve(ROOT, "..", "NonAlcoholNote"), url: process.env.ALC_URL, file: "NonAlcohol_app.html", key: "nonalcohol.v1", tabs: ["home", "log", "stats", "help"] }
];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };

/* 정적 파일 서버 — 이미 떠 있는 서버가 없을 때만 띄웁니다.
 * 폴더는 절대 경로·실제 경로(symlink 해석)로 바꿔 두고, 요청 파일도 실제 경로로 바꾼 뒤 「그 폴더 안인지」를 폴더 경계로 확인합니다
 * (SMOKE_DIR=./ 처럼 상대 경로여도 되고, 이름이 앞부분만 같은 이웃 폴더나 폴더 밖을 가리키는 symlink 는 막습니다). */
function inside(root, f) { const r = path.relative(root, f); return r === "" || (!r.startsWith("..") && !path.isAbsolute(r)); }
function serve(dir) {
  const root = fs.realpathSync(path.resolve(dir));
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      let p;
      try { p = decodeURIComponent((req.url || "/").split("?")[0]); } catch (e) { res.statusCode = 400; return res.end("bad request"); }
      let f;
      try { f = fs.realpathSync(path.join(root, p === "/" ? "index.html" : p)); } catch (e) { res.statusCode = 404; return res.end("not found"); }
      if (!inside(root, f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
      res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve({ srv, url: "http://127.0.0.1:" + srv.address().port }));
  });
}

const out = [];
const add = (m) => out.push(m);
// 거르는 것: 외부 주소(글꼴 등)의 접속 실패(ERR_TUNNEL_CONNECTION_FAILED — 샌드박스 망). 이 앱 주소의 자원 실패(404 등)는 남긴다
const goodErr = (m, base) => { const t = m.text(); if (!/Failed to load resource/.test(t)) return !/ERR_TUNNEL/.test(t); const u = (m.location() && m.location().url) || ""; return u.indexOf(base) === 0 || !/ERR_TUNNEL/.test(t); };

async function setup(page, a, probe) {   // 시작 → 설정 저장 (금주는 목표 칩 하나를 골라야 저장됨). probe(이름) 가 있으면 시작·설정 화면도 잰다
  await page.goto(a.base + "/" + a.file + "?tab=start"); await page.waitForTimeout(400);
  if (probe) await probe("start");
  await page.click("#st_go"); await page.waitForTimeout(250);
  const chip = await page.$("#s_goal button, #s_goal .chip"); if (chip) await chip.click();
  if (probe) await probe("setup");
  await page.click("#s_save"); await page.waitForTimeout(400);
}
async function fillLog(page) {   // 기록하기 — 화면의 칩 묶음마다 하나씩 고르고 저장
  await page.click('#tabs [data-v="log"]'); await page.waitForTimeout(200);
  for (const id of await page.evaluate(() => [...document.querySelectorAll("#v-log .chips")].map((g) => g.id))) {
    const b = await page.$("#" + id + " button"); if (b) await b.click().catch(() => {});
  }
  await page.click("#l_save").catch(() => {}); await page.waitForTimeout(300);
}
const logCount = (page, key) => page.evaluate((k) => { try { return (JSON.parse(localStorage.getItem(k) || "{}").logs || []).length; } catch (e) { return -1; } }, key);

// 지금 보이는 화면의 가로 넘침 · 44px 미만을 잰다 (체크박스·라디오 입력은 감싸는 label 로 재므로 뺀다)
const page_measure = () => {
  const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
  const on = [...document.querySelectorAll(".view.on *")];
  const bad = on.filter((e) => e.offsetParent && e.getBoundingClientRect().right > W + 1).slice(0, 4).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().right));
  const small = [...document.querySelectorAll(".view.on button, .view.on a, .view.on select, .view.on input:not([type=checkbox]):not([type=radio])")].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44).slice(0, 4).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height));
  return { W, sw, bad, small, view: (document.querySelector(".view.on") || {}).id || "" };
};

async function layout(browser, a) {   // 가로 넘침 · 44px — 390/320/800px × 보통·글자 200% (시작·설정 화면과 모든 탭)
  for (const [w, big] of [[390, 0], [390, 1], [320, 0], [320, 1], [800, 0], [800, 1]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: "block" });
    const page = await ctx.newPage(), errs = [], tag = a.n + " " + w + (big ? " 200%" : "");
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && goodErr(m, a.base)) errs.push(m.text()); });
    const check = async (v) => {
      const o = await page.evaluate(page_measure);
      if (o.sw > o.W || o.bad.length || o.small.length)
        add(tag + " " + v + ": sw " + o.sw + "/" + o.W + (o.bad.length ? " 넘침 " + o.bad.join(",") : "") + (o.small.length ? " 44미만 " + o.small.join(",") : ""));
    };
    const probe = async (v) => { if (big) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; }); await page.waitForTimeout(150); await check(v); };
    await setup(page, a, probe); await fillLog(page); await fillLog(page);
    if (big) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    for (const v of a.tabs) {
      try { await page.click('#tabs [data-v="' + v + '"]', { timeout: 3000 }); } catch (e) { add(tag + " " + v + ": 탭을 열지 못함 (" + String(e.message).split("\n")[0].slice(0, 60) + ")"); continue; }
      await page.waitForTimeout(250);
      const shown = await page.evaluate(() => (document.querySelector(".view.on") || {}).id || "");
      if (shown !== "v-" + v) { add(tag + " " + v + ": 눌렀는데 다른 화면(" + (shown || "없음") + ")이 열려 있음"); continue; }
      await check(v);
    }
    if (errs.length) add(tag + " 오류: " + [...new Set(errs)].slice(0, 3).join(" | "));
    await ctx.close();
  }
}

async function saveFlow(browser, a) {   // 기록 저장 → 새로고침 뒤에도 남는지
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await setup(page, a);
  const before = await logCount(page, a.key);
  await fillLog(page);
  const after = await logCount(page, a.key);
  if (after !== before + 1) add(a.n + " 기록 저장: " + before + " → " + after + " (1건 늘어야 함)");
  await page.reload(); await page.waitForTimeout(500);
  const re = await logCount(page, a.key);
  if (re !== after) add(a.n + " 새로고침 뒤 기록 수 " + re + " (저장 직후 " + after + ")");
  await ctx.close();
}

async function splash(browser, a) {   // 진입화면: 약 1.6초(동작 줄이기 0.9초) 뒤 사라짐 · ?tab= 에서는 안 뜸
  // 앱은 타이머가 끝나면 #splash 에 「out」 클래스를 붙여 사라지기 시작하고(페이드 0.45초), 그 뒤에 display:none 이 된다.
  // 그래서 「사라지기 시작한 시각」(out)을 재야 타이머 단축을 잡는다 — display:none 시각만 재면 페이드 0.45초에 가려져 1.0초로 줄여도 통과한다(Codex PR #93).
  // 시각은 문서 시작부터 잰다(goto 가 돌아온 뒤가 아님 — 글꼴 접속 실패로 goto 가 늦게 돌아온다). 기대의 95% 보다 이르면 「너무 일찍」, 4초가 지나도 사라지지 않으면 「안 사라짐」.
  for (const [rm, want] of [["no-preference", 1600], ["reduce", 900]]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: rm });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      const tick = () => {
        const s = document.getElementById("splash");
        if (s) {
          if (getComputedStyle(s).display !== "none") window.__shown = true;
          if (!window.__out && s.classList.contains("out")) window.__out = performance.now();
          if (window.__shown && !window.__gone && getComputedStyle(s).display === "none") { window.__gone = performance.now(); return; }
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
    await page.goto(a.base + "/" + a.file);
    await page.waitForFunction(() => window.__gone || performance.now() > 4000, null, { timeout: 6000 }).catch(() => {});
    const r = await page.evaluate(() => ({ shown: !!window.__shown, out: window.__out || 0, gone: window.__gone || 0 }));
    if (!r.shown) add(a.n + " 진입화면(" + rm + "): 첫 로드에 안 뜸");
    else if (!r.gone) add(a.n + " 진입화면(" + rm + "): 4초가 지나도 안 사라짐");
    else if ((r.out || r.gone) < want * 0.95) add(a.n + " 진입화면(" + rm + "): 너무 일찍 사라지기 시작 (" + Math.round(r.out || r.gone) + "ms · 기대 " + want + "ms)");
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(a.base + "/" + a.file + "?tab=log"); await page.waitForTimeout(200);
  if (await page.evaluate(() => document.documentElement.classList.contains("splash-on"))) add(a.n + " 진입화면: ?tab= 딥링크에서 뜸");
  await ctx.close();
}

if (require.main !== module) { module.exports = { serve, inside }; } else (async () => {
  const servers = [];
  for (const a of APPS) {
    if (a.url) { a.base = a.url.replace(/\/$/, ""); continue; }
    if (!fs.existsSync(path.join(a.dir, a.file))) { console.error(a.n + ": " + path.join(a.dir, a.file) + " 가 없습니다 (SMOKE_DIR · ALC_DIR 로 알려 주세요)"); process.exit(2); }
    const s = await serve(a.dir); servers.push(s.srv); a.base = s.url;
  }
  const browser = await chromium.launch();
  try {
    for (const a of APPS) { await layout(browser, a); await saveFlow(browser, a); await splash(browser, a); }
  } finally { await browser.close(); servers.forEach((s) => s.close()); }
  console.log(out.join("\n") || "이상 없음");
  process.exit(out.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
