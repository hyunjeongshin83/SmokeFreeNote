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
const { chromium } = require("playwright");

const ROOT = path.resolve(__dirname, "..");
const APPS = [
  { n: "금연노트", dir: process.env.SMOKE_DIR || ROOT, url: process.env.SMOKE_URL, file: "SmokeFree_app.html", key: "smokefree.v1", tabs: ["home", "log", "stats", "health", "help"] },
  { n: "금주노트", dir: process.env.ALC_DIR || path.resolve(ROOT, "..", "NonAlcoholNote"), url: process.env.ALC_URL, file: "NonAlcohol_app.html", key: "nonalcohol.v1", tabs: ["home", "log", "stats", "help"] }
];
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".json": "application/json", ".png": "image/png", ".woff2": "font/woff2", ".webmanifest": "application/manifest+json", ".css": "text/css", ".wasm": "application/wasm", ".svg": "image/svg+xml" };

/* 정적 파일 서버 — 이미 떠 있는 서버가 없을 때만 띄웁니다 */
function serve(dir) {
  return new Promise((resolve) => {
    const srv = http.createServer((req, res) => {
      const p = decodeURIComponent((req.url || "/").split("?")[0]);
      const f = path.join(dir, p === "/" ? "index.html" : p);
      if (!f.startsWith(dir) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
      res.setHeader("content-type", TYPES[path.extname(f)] || "application/octet-stream");
      fs.createReadStream(f).pipe(res);
    }).listen(0, "127.0.0.1", () => resolve({ srv, url: "http://127.0.0.1:" + srv.address().port }));
  });
}

const out = [];
const add = (m) => out.push(m);
const goodErr = (t) => !/ERR_TUNNEL|Failed to load resource/.test(t);

async function setup(page, a) {   // 시작 → 설정 저장 (금주는 목표 칩 하나를 골라야 저장됨)
  await page.goto(a.base + "/" + a.file + "?tab=start"); await page.waitForTimeout(400);
  await page.click("#st_go");
  const chip = await page.$("#s_goal button, #s_goal .chip"); if (chip) await chip.click();
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

async function layout(browser, a) {   // 가로 넘침 · 44px — 390/320/800px × 보통·글자 200%
  for (const [w, big] of [[390, 0], [390, 1], [320, 0], [320, 1], [800, 0]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: 844 }, serviceWorkers: "block" });
    const page = await ctx.newPage(), errs = [];
    page.on("pageerror", (e) => errs.push(e.message));
    page.on("console", (m) => { if (m.type() === "error" && goodErr(m.text())) errs.push(m.text()); });
    await setup(page, a); await fillLog(page); await fillLog(page);
    if (big) await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    for (const v of a.tabs) {
      await page.click('#tabs [data-v="' + v + '"]').catch(() => {}); await page.waitForTimeout(250);
      const o = await page.evaluate(() => {
        const W = document.documentElement.clientWidth, sw = document.documentElement.scrollWidth;
        const bad = [...document.querySelectorAll(".view.on *")].filter((e) => e.offsetParent && e.getBoundingClientRect().right > W + 1).slice(0, 4).map((e) => (e.id || e.className || e.tagName) + ":" + Math.round(e.getBoundingClientRect().right));
        const small = [...document.querySelectorAll(".view.on button, .view.on a, .view.on select, .view.on input:not([type=checkbox]):not([type=radio])")].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && e.getBoundingClientRect().height < 44 && !e.closest("[hidden]")).slice(0, 5).map((e) => (e.id || e.textContent.trim().slice(0, 12) || e.tagName) + ":" + Math.round(e.getBoundingClientRect().height));
        return { W, sw, bad, small };
      });
      if (o.sw > o.W || o.bad.length || (w === 390 && !big && o.small.length))
        add(a.n + " " + w + (big ? " 200%" : "") + " " + v + ": sw " + o.sw + "/" + o.W + (o.bad.length ? " 넘침 " + o.bad.join(",") : "") + (o.small.length ? " 44미만 " + o.small.join(",") : ""));
    }
    if (errs.length) add(a.n + " " + w + (big ? " 200%" : "") + " 오류: " + [...new Set(errs)].slice(0, 3).join(" | "));
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
  for (const rm of ["no-preference", "reduce"]) {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block", reducedMotion: rm });
    const page = await ctx.newPage();
    await page.goto(a.base + "/" + a.file);
    const shown = await page.evaluate(() => getComputedStyle(document.getElementById("splash")).display);
    await page.waitForTimeout(rm === "reduce" ? 1300 : 2300);
    const gone = await page.evaluate(() => getComputedStyle(document.getElementById("splash")).display);
    if (shown === "none") add(a.n + " 진입화면(" + rm + "): 첫 로드에 안 뜸");
    if (gone !== "none") add(a.n + " 진입화면(" + rm + "): 시간이 지나도 안 사라짐");
    await ctx.close();
  }
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: "block" });
  const page = await ctx.newPage();
  await page.goto(a.base + "/" + a.file + "?tab=log"); await page.waitForTimeout(200);
  if (await page.evaluate(() => document.documentElement.classList.contains("splash-on"))) add(a.n + " 진입화면: ?tab= 딥링크에서 뜸");
  await ctx.close();
}

(async () => {
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
