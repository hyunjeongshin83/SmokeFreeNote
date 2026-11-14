// 연구용 Drive 저장 — 수치화 · 엑셀 만들기 · 꺼짐 기본값 시험.  실행: node --test tests/research.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const R = require("../research.js");

// 시험용 고정 시각 (로컬 시각 기준으로 만든다 — 앱도 기기의 현지 시각을 쓴다)
const at = (y, m, d, h = 9, mi = 0) => new Date(y, m - 1, d, h, mi).getTime();
const state = () => ({
  kind: "hnb", perDay: 12, price: 4500, start: at(2026, 11, 3, 9), reason: "아이 이름 철수에게 약속",
  attempts: [{ start: at(2026, 10, 20, 9), end: at(2026, 10, 25, 9) }],
  meds: { "2026-11-04": true },
  logs: [
    { v: 2, t: at(2026, 11, 5, 21, 30), lv: "강함", mood: "나쁨", trig: ["스트레스", "식사 후"], other: true, avail: false, cope: ["심호흡", "5분 버티기"], slip: false },
    { t: at(2026, 11, 4, 8, 10), lv: "약함", mood: "좋음", trig: [], cope: [], slip: true },          // 옛 기록(v 없음) · 일부 칸 없음
    { v: 2, t: at(2026, 10, 22, 14, 0), lv: "보통", mood: "보통", trig: ["커피·술"], other: false, avail: true, cope: ["물 마시기"], slip: false }
  ],
  measures: [
    { t: at(2026, 11, 5, 10), kind: "co", v: 4 }, { t: at(2026, 11, 5, 10), kind: "puffs", v: 120 },
    { t: at(2026, 11, 5, 12), kind: "use", v: 1, dev: "abc" },
    { t: at(2026, 11, 2, 12), kind: "test", v: { type: "kit", res: "faint", date: "2026-11-02", place: "우리 동네 보건소" } },
    { t: at(2026, 11, 3, 12), kind: "test", v: { type: "cot", val: 35, date: "2026-11-03" } },
    { t: at(2026, 11, 5, 8), kind: "health", v: { steps: 5400, hrAvg: 72, hrN: 3, sleepMin: 410 } }
  ]
});
const PID = "P-test0001";
const NOW = at(2026, 11, 6, 12);

test("기록은 시간순 한 줄씩, 모두 숫자 코드로 바뀐다", () => {
  const rows = R.buildRecords(state(), PID), H = rows[0], col = (r, n) => r[H.indexOf(n)];
  assert.equal(rows.length, 4);
  // 1번째 = 10/22 (옛 시도 안), 2번째 = 11/4, 3번째 = 11/5
  assert.equal(col(rows[1], "date"), "2026-10-22"); assert.equal(col(rows[1], "attempt_no"), 1); assert.equal(col(rows[1], "day_of_attempt"), 2);
  assert.equal(col(rows[2], "date"), "2026-11-04"); assert.equal(col(rows[2], "attempt_no"), 2); assert.equal(col(rows[2], "day_of_attempt"), 1);
  const r = rows[3];
  assert.equal(col(r, "craving_level"), 3); assert.equal(col(r, "mood"), 3);
  assert.equal(col(r, "trig_stress"), 1); assert.equal(col(r, "trig_after_meal"), 1); assert.equal(col(r, "trig_home"), 0); assert.equal(col(r, "trig_none"), 0);
  assert.equal(col(r, "others_smoking"), 1); assert.equal(col(r, "cig_available"), 0);
  assert.equal(col(r, "cope_breath"), 1); assert.equal(col(r, "cope_hold5"), 1); assert.equal(col(r, "cope_water"), 0);
  assert.equal(col(r, "slip"), 0); assert.equal(col(r, "record_version"), 2);
});

test("옛 기록은 빈 칸을 숫자로 지어내지 않는다", () => {
  const rows = R.buildRecords(state(), PID), H = rows[0], r = rows[2], col = n => r[H.indexOf(n)];
  assert.equal(col("others_smoking"), ""); assert.equal(col("cig_available"), "");
  assert.equal(col("trig_none"), 1); assert.equal(col("slip"), 1); assert.equal(col("record_version"), 1);
});

test("자유로 적은 글은 어느 시트에도 들어가지 않는다", () => {
  const all = JSON.stringify(R.buildSheets(state(), PID, NOW));
  assert.ok(!all.includes("철수")); assert.ok(!all.includes("보건소")); assert.ok(!all.includes("abc"));
});

test("측정값: 종류는 코드로, 검사한 날은 고른 날짜 그대로", () => {
  const m = R.buildMeasures(state(), PID);
  const find = (type) => m.filter((r, i) => i > 0 && r[3] === type);
  assert.deepEqual(find(3).map(r => [r[1], r[4]]), [["2026-11-02", 1]]);       // 키트 희미한 줄 = 1
  assert.deepEqual(find(4).map(r => [r[1], r[4]]), [["2026-11-03", 35]]);
  assert.equal(find(1)[0][4], 4); assert.equal(find(2)[0][4], 120); assert.equal(find(6).length, 1);
  assert.equal(find(7)[0][4], 5400); assert.equal(find(8)[0][4], 72); assert.equal(find(9)[0][4], 410);
});

test("일별: 기록 없는 날도 한 줄, 평균과 복용 표시가 맞다", () => {
  const d = R.buildDaily(state(), PID, NOW), H = d[0], row = (k) => d.find(r => r[1] === k), col = (r, n) => r[H.indexOf(n)];
  assert.equal(col(row("2026-11-05"), "n_cravings"), 1); assert.equal(col(row("2026-11-05"), "craving_level_mean"), 3);
  assert.equal(col(row("2026-11-04"), "n_slips"), 1); assert.equal(col(row("2026-11-04"), "med_taken"), 1);
  assert.equal(col(row("2026-11-05"), "n_sticker_use"), 1);
  assert.equal(col(row("2026-11-03"), "day_index"), 0); assert.equal(col(row("2026-11-06"), "day_index"), 3);
  assert.equal(col(row("2026-11-01"), "n_cravings"), 0);
  assert.equal(d.filter((r, i) => i > 0 && r[1] === "2026-11-06").length, 1);       // 마지막 날(오늘)까지
});

test("엑셀 파일: zip 구조 · CRC · 시트 5장이 맞다", () => {
  const bytes = R.toXlsx(R.buildSheets(state(), PID, NOW));
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  assert.equal(dv.getUint32(0, true), 0x04034b50);
  const eocd = bytes.length - 22; assert.equal(dv.getUint32(eocd, true), 0x06054b50);
  const n = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const names = [], xml = {};
  for (let i = 0; i < n; i++) {
    const crc = dv.getUint32(p + 16, true), size = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), off = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nl)); names.push(name);
    const lnl = dv.getUint16(off + 26, true), data = bytes.subarray(off + 30 + lnl, off + 30 + lnl + size);
    assert.equal(R._crc32(data), crc, name + " CRC");
    xml[name] = new TextDecoder().decode(data); p += 46 + nl;
  }
  assert.ok(names.includes("[Content_Types].xml") && names.includes("xl/workbook.xml"));
  assert.equal(names.filter(x => x.startsWith("xl/worksheets/")).length, 6);
  assert.match(xml["xl/workbook.xml"], /name="records"/); assert.match(xml["xl/workbook.xml"], /name="codebook"/);
  assert.match(xml["xl/worksheets/sheet2.xml"], /<c r="H4"><v>3<\/v><\/c>/);          // records 의 3번째 기록 craving_level = 3
});

test("꺼짐이 기본값: 설정이 비어 있으면 준비 안 됨, 불완전하면 켤 수 없다", () => {
  delete globalThis.SF_RESEARCH_CONFIG;
  assert.equal(R.config().enabled, false); assert.equal(R.config().ready, false);
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "", consentVersion: "v1", irb: "IRB-TEST-1" };
  assert.equal(R.config().ready, false, "동의 문구가 없으면 준비 안 됨");
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "", consentText: "문구", consentVersion: "v1", irb: "IRB-TEST-1" };
  assert.equal(R.config().ready, false, "클라이언트 ID 가 없으면 준비 안 됨");
  for (const bad of [undefined, "", "   ", null, 123]) {   // IRB 번호가 없거나 공백뿐이거나 글자가 아니면 켜지 못한다 (2026-11-14 대표님 결정)
    globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "문구", consentVersion: "v1", irb: bad };
    assert.equal(R.config().ready, false, "IRB 번호가 " + JSON.stringify(bad) + " 이면 준비 안 됨");
  }
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "문구", consentVersion: "v1", irb: "IRB-TEST-1" };
  assert.equal(R.config().ready, true);
  delete globalThis.SF_RESEARCH_CONFIG;
});

test("준비 안 된 상태에서는 enable() 이 아무 데도 접속하지 않는다", async () => {
  delete globalThis.SF_RESEARCH_CONFIG;
  let calls = 0; const f = globalThis.fetch; globalThis.fetch = () => { calls++; return Promise.reject(new Error("no")); };
  const r = await R.enable(); globalThis.fetch = f;
  assert.equal(r.ok, false); assert.equal(r.why, "not_ready"); assert.equal(calls, 0);
});

test("연구용 번호는 P- 와 16진수 8자리", () => { assert.match(R.newPid(), /^P-[0-9a-f]{8}$/); });

// ── 동의 철회 · 지우기 · 문구 버전 (Codex 지적 3건) ───────────────────────────────────────────
const KEY = "smokefree.research.v1";
function fresh({ tokenDelay = 15, listDelay = 0, uploadDelay = 0, deleteDelay = 0, deleteStatus = 200, seed = null } = {}) {
  delete require.cache[require.resolve("../research.js")];
  const store = {}, calls = [], raw = [], revoked = [], rec = { aborted: 0, completed: 0 }, listeners = {};
  globalThis.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  if (seed) store[KEY] = JSON.stringify(seed);
  const hooks = {};
  globalThis.fetch = async (url, opts = {}) => {
    calls.push((opts.method || "GET") + " " + String(url).split("?")[0]); raw.push({ url: String(url), body: opts.body });
    if ((opts.method || "") === "DELETE") { if (deleteDelay) await new Promise(r => setTimeout(r, deleteDelay)); return { ok: deleteStatus === 200, status: deleteStatus, json: async () => ({}) }; }
    const isUp = String(url).includes("/upload/");
    const delay = isUp ? uploadDelay : listDelay;
    if (delay) await new Promise((res, rej) => {
      const tm = setTimeout(res, delay);
      if (opts.signal) opts.signal.addEventListener("abort", () => { clearTimeout(tm); rec.aborted++; const e = new Error("aborted"); e.name = "AbortError"; rej(e); });
    });
    if (isUp) rec.completed++;
    const body = isUp ? { id: "F1" } : { files: [] };
    return { ok: true, status: 200, json: async () => body };
  };
  globalThis.google = { accounts: { oauth2: {
    initTokenClient: o => ({ requestAccessToken() { setTimeout(() => o.callback({ access_token: "T", expires_in: 3600 }), tokenDelay); } }),
    revoke(t) { revoked.push(t); } } } };
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "문구", consentVersion: "v1", irb: "IRB-TEST-1" };
  const R2 = require("../research.js"); R2.init({ getState: () => { if (hooks.onBuild) hooks.onBuild(store); return hooks.stateFn ? hooks.stateFn() : state(); } });
  return { R: R2, store, calls, raw, revoked, rec, listeners, hooks };
}
const wait = ms => new Promise(r => setTimeout(r, ms));
const posts = calls => calls.filter(c => c.startsWith("POST") || c.startsWith("PATCH"));

test("P1: 로그인을 요청하기 전에 끄면 토큰을 요청하지도 않고, 업로드도 없다", async () => {
  const { R: Rr, calls, revoked } = fresh({ tokenDelay: 30 });
  const p = Rr.enable(); Rr.disable();
  const r = await p; await wait(50);
  assert.equal(calls.length, 0); assert.equal(r.ok, false); assert.equal(revoked.length, 0, "받은 토큰이 없으니 취소할 것도 없음");
  assert.equal(Rr.state().on, false);
});

test("P1: 로그인 창이 열려 있는 사이 끄면 업로드하지 않고, 늦게 온 토큰은 바로 취소한다", async () => {
  const { R: Rr, calls, revoked } = fresh({ tokenDelay: 30 });
  const p = Rr.enable(); await wait(8);                  // 로그인 요청은 나간 상태
  Rr.disable(); const r = await p; await wait(50);
  assert.equal(calls.length, 0, "조회도 업로드도 없음"); assert.equal(r.ok, false);
  assert.ok(revoked.includes("T"), "늦게 온 토큰은 바로 취소"); assert.equal(Rr.state().on, false);
});

test("P1: 파일 조회를 기다리는 사이 끄면 업로드하지 않는다", async () => {
  const { R: Rr, calls } = fresh({ tokenDelay: 5, listDelay: 60 });
  const p = Rr.enable(); await wait(25);                 // 토큰은 왔고 조회가 진행 중
  Rr.disable(); await p; await wait(80);
  assert.equal(posts(calls).length, 0, "조회 뒤 업로드가 일어나면 안 됨: " + calls.join(" | "));
});

test("P1: 「모든 기록 지우기」(reset)는 동의·번호·파일 id 를 모두 지우고 다시 켜기 전에는 보내지 않는다", async () => {
  const { R: Rr, calls, store } = fresh();
  const r = await Rr.enable(); assert.equal(r.ok, true); assert.ok(store[KEY]);
  Rr.reset();
  assert.equal(store[KEY], undefined, "연구 저장 키가 남지 않음"); assert.equal(Rr.state().on, undefined); assert.equal(Rr.state().pid, undefined);
  const n = calls.length; Rr.touch(); await wait(30); assert.equal(calls.length, n, "지운 뒤에는 예약도 전송도 없음");
  assert.equal((await Rr.sync(false)).ok, false);
});

test("P2: 동의 문구 버전이 바뀌면 다시 동의하기 전까지 보내지 않는다", async () => {
  const { R: Rr, calls, store } = fresh();
  store[KEY] = JSON.stringify({ on: true, consentVersion: "v0", pid: "P-old00001", fileId: "OLD" });   // 이전 문구(v0)에 동의한 참여자
  assert.equal(Rr.consented(), false);
  assert.equal((await Rr.sync(false)).ok, false); Rr.touch(); await wait(30);
  assert.equal(calls.length, 0, "재동의 전에는 어떤 요청도 없음");
  const r = await Rr.enable();                                   // 새 문구를 읽고 직접 켬
  assert.equal(r.ok, true); assert.equal(Rr.consented(), true); assert.equal(Rr.state().consentVersion, "v1"); assert.equal(Rr.state().pid, "P-old00001");
  assert.ok(posts(calls).length + calls.filter(c => c.startsWith("PATCH")).length >= 1);
});

test("끈 뒤 기록이 바뀌어도 예약·전송이 없다", async () => {
  const { R: Rr, calls } = fresh();
  await Rr.enable(); Rr.disable(); const n = calls.length; Rr.touch(); await wait(30);
  assert.equal(calls.length, n);
});

test("P1: 업로드가 이미 시작된 뒤 끄면 진행 중인 요청을 실제로 중단한다", async () => {
  const { R: Rr, rec, calls } = fresh({ tokenDelay: 5, uploadDelay: 120 });
  const p = Rr.enable(); await wait(40);                 // 토큰·조회는 끝났고 업로드가 진행 중
  assert.ok(posts(calls).length >= 1, "업로드가 시작된 상태");
  Rr.disable(); const r = await p; await wait(30);
  assert.equal(rec.aborted, 1, "업로드 요청에 취소 신호가 가야 함"); assert.equal(rec.completed, 0, "끝까지 가면 안 됨");
  assert.equal(r.ok, false); assert.equal(Rr.state().fileId, undefined, "중단된 업로드의 결과로 상태를 되살리지 않음");
});

test("P1: 다른 탭에서 끄면(storage 이벤트) 이 탭의 진행 중인 업로드도 중단한다", async () => {
  const { R: Rr, rec, store, listeners } = fresh({ tokenDelay: 5, uploadDelay: 120 });
  assert.ok(listeners.storage && listeners.storage.length === 1, "storage 이벤트를 듣고 있어야 함");
  const p = Rr.enable(); await wait(40);
  store[KEY] = JSON.stringify({ on: false, consentVersion: "v1", pid: "P-x" });               // 다른 탭이 끈 것
  listeners.storage.forEach(f => f({ key: KEY })); const r = await p; await wait(30);
  assert.equal(rec.aborted, 1); assert.equal(rec.completed, 0); assert.equal(r.ok, false);
});

test("다른 키의 storage 이벤트나 동의가 유지되는 변경에는 전송을 멈추지 않는다", async () => {
  const { R: Rr, rec, listeners } = fresh({ tokenDelay: 5, uploadDelay: 60 });
  const p = Rr.enable(); await wait(30);
  listeners.storage.forEach(f => f({ key: "smokefree.v1" })); listeners.storage.forEach(f => f({ key: KEY }));   // 동의는 그대로
  const r = await p; assert.equal(rec.aborted, 0); assert.equal(rec.completed, 1); assert.equal(r.ok, true);
});

// ── 관문(전송 직전 단일 확인) · 지우기 순서 (Codex 3차 지적 2건) ───────────────────────────────
const writes = calls => calls.filter(c => c.startsWith("POST") || c.startsWith("PATCH"));

test("P1: 엑셀을 만드는 동안 다른 탭이 동의를 철회하면 그 직후 업로드를 시작하지 않는다 (관문)", async () => {
  const { R: Rr, calls, hooks } = fresh({ tokenDelay: 3 });
  const r0 = await Rr.enable(); assert.equal(r0.ok, true);
  const n = writes(calls).length;
  // 엑셀 직렬화(동기) 도중에 다른 탭이 저장소의 동의를 지웠다고 흉내 낸다 — 이 탭의 storage 콜백은 그 동안 실행될 수 없다
  hooks.onBuild = store => { store[KEY] = JSON.stringify({ on: false, consentVersion: "v1", pid: "P-x", fileId: "F1" }); };
  const r = await Rr.sync(false);
  assert.equal(r.ok, false); assert.equal(writes(calls).length, n, "철회된 뒤에는 업로드 요청이 만들어지면 안 됨");
});

test("P1: 지우기는 참여를 먼저 끈다 — 삭제 응답을 기다리는 동안 자동 저장이 새 파일을 만들 수 없다", async () => {
  const { R: Rr, calls, rec } = fresh({ tokenDelay: 3, uploadDelay: 100, deleteDelay: 80 });
  const r0 = await Rr.enable(); assert.equal(r0.ok, true);
  const slow = Rr.sync(false); await wait(15);          // 느린 저장(PATCH)이 진행 중
  const del = Rr.deleteRemote();
  assert.equal(Rr.state().on, false, "삭제 응답 전에 이미 꺼져 있어야 함"); assert.equal(Rr.consented(), false);
  const n = writes(calls).length; Rr.touch(); await wait(20);
  assert.equal(writes(calls).length, n, "삭제 중에는 새 저장(POST·PATCH) 예약·전송이 없음");
  const r = await del; await slow; await wait(120);
  assert.equal(r.ok, true); assert.equal(rec.aborted, 1, "진행 중이던 저장은 중단");
  assert.equal(calls.filter(c => c.startsWith("POST")).length, 1, "새 파일을 만들지 않음(처음 만든 1건뿐)");
  assert.ok(calls.some(c => c.startsWith("DELETE")));
  assert.equal(Rr.state().fileId, null); assert.equal(Rr.state().on, false);
});

test("P1: 지우기가 실패해도 참여는 꺼진 채이고 파일 id 는 남아 다시 지울 수 있다", async () => {
  const { R: Rr } = fresh({ tokenDelay: 3, deleteStatus: 500 });
  await Rr.enable();
  const r = await Rr.deleteRemote();
  assert.equal(r.ok, false); assert.equal(Rr.state().on, false, "실패해도 켜진 채 남으면 안 됨"); assert.equal(Rr.consented(), false);
  assert.equal(Rr.state().fileId, "F1", "다시 지울 수 있게 남김");
});

test("지우려는 파일이 이미 없으면(404) 지운 것으로 본다", async () => {
  const { R: Rr } = fresh({ tokenDelay: 3, deleteStatus: 404 });
  await Rr.enable(); const r = await Rr.deleteRemote();
  assert.equal(r.ok, true); assert.equal(Rr.state().fileId, null);
});

// ── 서비스워커: 연구 코드·설정은 네트워크 우선 (Codex 4차 P1 — 캐시된 옛 research.js 가 새 화면과 섞임 · 설정이 늦게 퍼짐) ──
import { readFileSync } from "node:fs";
function loadSw({ cached = {}, netFail = false } = {}) {
  const handlers = {}, fetched = [];
  const self_ = { location: { origin: "https://app.test" }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  const caches_ = { open: async () => ({ match: async req => (cached[typeof req === "string" ? req : new URL(req.url).pathname] ? { from: "cache" } : undefined), put: async () => {}, addAll: async () => {}, add: async () => {} }),
    keys: async () => [], delete: async () => true };
  const fetch_ = async (req, init) => { fetched.push({ url: typeof req === "string" ? req : req.url, init }); if (netFail) throw new Error("offline"); return { from: "network", ok: true, clone() { return this; } }; };
  new Function("self", "caches", "fetch", "clients", readFileSync(new URL("../sw.js", import.meta.url), "utf8"))(self_, caches_, fetch_, self_.clients);
  const run = async (path, extra = {}) => { let p; handlers.fetch({ request: { method: "GET", url: "https://app.test" + path, mode: "no-cors", ...extra }, respondWith: x => { p = x; } }); return { res: p ? await p : null, handled: !!p }; };
  return { run, fetched, src: readFileSync(new URL("../sw.js", import.meta.url), "utf8") };
}

test("서비스워커: research.js · research-config.js 는 캐시에 옛것이 있어도 네트워크에서 새로 확인한다", async () => {
  const sw = loadSw({ cached: { "/research.js": 1, "/research-config.js": 1 } });
  for (const f of ["/research.js", "/research-config.js"]) {
    const { res } = await sw.run(f);
    assert.equal(res.from, "network", f + " 은 캐시가 아니라 네트워크 응답이어야 함");
  }
  assert.ok(sw.fetched.every(x => x.init && /^no-(cache|store)$/.test(x.init.cache)), "매번 서버에 최신 여부를 확인(no-cache · no-store)");
});

test("서비스워커: 오프라인이면 research.js 는 캐시로, 설정은 캐시 대신 「꺼짐」을 돌려준다 (옛 enabled:true 방지)", async () => {
  const sw = loadSw({ cached: { "/research.js": 1, "/research-config.js": 1 }, netFail: true });
  assert.equal((await sw.run("/research.js")).res.from, "cache");
  const txt = await (await sw.run("/research-config.js")).res.text();
  assert.match(txt, /enabled:false/); assert.doesNotMatch(txt, /enabled:true/);
});

test("서비스워커: 설정 요청이 오류 응답(5xx)이어도 꺼진 설정으로 대체한다", async () => {
  const sw = loadSw({ cached: { "/research-config.js": 1 } });
  const orig = globalThis.fetch;
  // loadSw 의 fetch 는 항상 성공 응답이라, 오류 응답은 별도 SW 인스턴스로
  const handlers = {}; const self_ = { location: { origin: "https://app.test" }, addEventListener: (t, f) => { handlers[t] = f; }, skipWaiting() {}, clients: { claim() {} } };
  const caches_ = { open: async () => ({ match: async () => ({ from: "cache" }), put: async () => {}, addAll: async () => {}, add: async () => {} }), keys: async () => [], delete: async () => true };
  new Function("self", "caches", "fetch", "clients", readFileSync(new URL("../sw.js", import.meta.url), "utf8"))(self_, caches_, async () => ({ ok: false, status: 503, clone() { return this; } }), self_.clients);
  let p; handlers.fetch({ request: { method: "GET", url: "https://app.test/research-config.js", mode: "no-cors" }, respondWith: x => { p = x; } });
  assert.match(await (await p).text(), /enabled:false/);
  void orig; void sw;
});

test("서비스워커: coach.js · iqos-ble.js 도 네트워크 우선 — 옛 캐시가 새 화면과 섞이지 않는다 (Codex #80 P1)", async () => {
  const sw = loadSw({ cached: { "/coach.js": 1, "/iqos-ble.js": 1 } });
  for (const f of ["/coach.js", "/iqos-ble.js"]) { const { res } = await sw.run(f); assert.equal(res.from, "network", f); }
  assert.ok(sw.fetched.every(x => x.init && x.init.cache === "no-cache"));
  const off = loadSw({ cached: { "/coach.js": 1 }, netFail: true });
  assert.equal((await off.run("/coach.js")).res.from, "cache");           // 오프라인이면 캐시로 열린다
});

test("서비스워커: 다른 정적 자산은 그대로 캐시 우선이고, 캐시 이름이 v28 로 올랐다", async () => {
  const sw = loadSw({ cached: { "/vendor/qrcodejs-1.0.0.min.js": 1 } });
  const { res } = await sw.run("/vendor/qrcodejs-1.0.0.min.js"); assert.equal(res.from, "cache"); assert.equal(sw.fetched.length, 0, "캐시에 있으면 네트워크를 부르지 않음");
  assert.match(sw.src, /const CACHE="smokefree-v29"/);
});

// ── 금주노트 연구 저장(#22)에서 Codex 가 지적해 고친 것들을 같은 코드인 이쪽에도 ───────────────────────────
const planning = (fn) => { const real = globalThis.setTimeout, planned = []; globalThis.setTimeout = (f, ms, ...a) => { if (ms >= 8000) { planned.push(ms); return 0; } return real(f, ms, ...a); }; return { planned, real, run: fn, done() { globalThis.setTimeout = real; } }; };

test("올리는 중에 sync 가 또 불리면 끝난 뒤 한 번 더 예약된다", async () => {
  const { R: Rr } = fresh({ tokenDelay: 5, uploadDelay: 80 }); const p = planning();
  try {
    const first = Rr.enable(); await new Promise(r => p.real(r, 30));
    const busy = await Rr.sync(false); assert.equal(busy.why, "busy");
    assert.equal((await first).ok, true); assert.ok(p.planned.length >= 1);
  } finally { p.done(); }
});

test("올리는 동안 이 탭의 기록이 달라졌으면(다른 탭 변경 합침) 올린 뒤 한 번 더 예약한다", async () => {
  const f = fresh({ tokenDelay: 5, uploadDelay: 60 }); const p = planning();
  try {
    const first = f.R.enable(); await new Promise(r => p.real(r, 30));
    f.hooks.stateFn = () => { const s = state(); s.logs.push({ v: 2, t: at(2026, 11, 6, 7, 0), lv: "보통", mood: null, trig: [], cope: [], slip: true }); return s; };
    assert.equal((await first).ok, true); assert.ok(p.planned.length >= 1);
  } finally { p.done(); }
});

test("다시 열었을 때 마지막으로 올린 뒤 내용이 바뀌어 있으면 한 번 따라잡도록 예약한다 (동의한 경우만)", () => {
  const p = planning();
  try {
    fresh({ seed: { on: true, consentVersion: "v1", pid: "P-old00001", sig: "stale" } }); assert.equal(p.planned.length, 1);
    p.planned.length = 0; fresh({ seed: { on: false, consentVersion: "v1", pid: "P-old00001" } }); assert.equal(p.planned.length, 0);
  } finally { p.done(); }
});

test("올린 직후 상태와 같으면 다시 열어도 예약하지 않는다", async () => {
  const f = fresh({ tokenDelay: 5 }); assert.equal((await f.R.enable()).ok, true);
  const sig = f.R.state().sig; assert.ok(sig && sig.length > 0); const p = planning();
  try { fresh({ seed: { on: true, consentVersion: "v1", pid: "P-old00001", sig } }); } finally { p.done(); }
  assert.equal(p.planned.length, 0);
});

test("따라잡기 표지는 표 전체의 내용을 본다 — 수·가장 늦은 시각이 같아도 내용이 다르면 다르다", () => {
  const a = state(), b = state(), c = state(), d = state(), e = state();
  assert.equal(R._sigOf(a), R._sigOf(b));
  b.logs[2] = { ...b.logs[2], lv: "강함", slip: true }; assert.equal(a.logs.length, b.logs.length); assert.notEqual(R._sigOf(a), R._sigOf(b));
  c.attempts = [{ start: at(2026, 10, 21, 9), end: at(2026, 10, 25, 9) }]; assert.notEqual(R._sigOf(a), R._sigOf(c));
  d.measures[0] = { ...d.measures[0], v: 99 }; assert.notEqual(R._sigOf(a), R._sigOf(d), "측정값 변경도 감지");
  e.reason = "다른 글"; assert.equal(R._sigOf(a), R._sigOf(e), "내보내지 않는 글은 무시");
});

test("구글이 토큰을 거절(401)하면 버려서, 다음 「지금 저장」이 새로 로그인한다", async () => {
  const f = fresh({ tokenDelay: 5 }); let inits = 0; const oi = globalThis.google.accounts.oauth2.initTokenClient;
  globalThis.google.accounts.oauth2.initTokenClient = o => { inits++; return oi(o); };
  const of = globalThis.fetch; let n = 0;
  globalThis.fetch = (u, o) => (String(u).includes("/upload/") && n++ === 0) ? Promise.resolve({ ok: false, status: 401, json: async () => ({}) }) : of(u, o);
  assert.equal((await f.R.enable()).ok, false); assert.equal((await f.R.sync(true)).ok, true); assert.equal(inits, 2);
});

test("파일 찾기는 연구 번호까지 맞는 것만 — 다른 기기의 파일을 덮어쓰지 않는다", async () => {
  const f = fresh({ tokenDelay: 5 }); assert.equal((await f.R.enable()).ok, true);
  const pid = f.R.state().pid, list = f.raw.find(x => x.url.includes("/drive/v3/files?")); assert.ok(list);
  assert.match(decodeURIComponent(list.url.split("q=")[1]), new RegExp("sfPid' and value='" + pid + "'"));
  const up = f.raw.find(x => x.url.includes("/upload/")); assert.ok(Buffer.from(up.body).toString("utf8").includes('"sfPid":"' + pid + '"'));
});

test("파일을 찾고 만들고 덮어쓰는 구간은 Web Locks 로 탭 사이에 직렬화된다", async () => {
  let held = 0, maxHeld = 0; const order = [], q = []; let running = false;
  const origNav = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  Object.defineProperty(globalThis, "navigator", { configurable: true, writable: true, value: { locks: { request: (name, fn) => new Promise((res, rej) => {
    const run = async () => { running = true; held++; maxHeld = Math.max(maxHeld, held); order.push(name); try { res(await fn()); } catch (e) { rej(e); } finally { held--; running = false; const nx = q.shift(); if (nx) nx(); } };
    if (running) q.push(run); else run(); }) } } });
  try {
    const f = fresh({ tokenDelay: 5, uploadDelay: 40 }); assert.equal((await f.R.enable()).ok, true);
    assert.ok(order.includes("smokefree-research-sync")); assert.equal(maxHeld, 1); assert.equal(f.R.state().fileId, "F1");
  } finally { if (origNav) Object.defineProperty(globalThis, "navigator", origNav); else delete globalThis.navigator; }
});

test("일별: 기록 없이 끝난 앞 시도의 날들도 담고, 시작일이 오래돼도 오늘까지 이어진다", () => {
  const NOW2 = at(2026, 11, 10, 12);
  const st = { kind: "cig", perDay: 10, price: 4500, start: at(2026, 11, 8, 9), attempts: [{ start: at(2026, 11, 1, 9), end: at(2026, 11, 7, 9) }], logs: [], measures: [], meds: {} };
  const d = R.buildDaily(st, PID, NOW2); assert.equal(d[1][1], "2026-11-01"); assert.equal(d[d.length - 1][1], "2026-11-10");
  const old = { ...st, start: at(2023, 1, 5, 9), attempts: [] }; const d2 = R.buildDaily(old, PID, NOW);
  assert.equal(d2[1][1], "2023-01-05"); assert.equal(d2[d2.length - 1][1], "2026-11-06"); assert.ok(d2.length > 1300);
  const big = { ...st, start: at(2000, 1, 1, 9), attempts: [] }; const d3 = R.buildDaily(big, PID, NOW);
  assert.equal(d3[d3.length - 1][1], "2026-11-06"); assert.ok(d3.length <= 5002);
});

test("meds 시트: 약 기록을 코드·수로만 담고, 이상한 기록·글자는 버린다 (VN-218-5)", () => {
  const t = new Date(2026, 10, 3, 9, 30).getTime();
  const rows = R.buildMeds({ medlog: [
    { id: "a", t, type: "patch", mg: 21, n: 1 },
    { id: "b", t: t + 3600e3, type: "gum", mg: "Kim 010", n: 1.5 },
    { id: "a", t, type: "patch", mg: 21, n: 1 },
    { id: "c", t, type: { toString: 5 } },
    { id: "d", t: "x", type: "varen" },
    { id: "e", t: t - 864e5, type: "other" }
  ] }, "P-00000001");
  assert.deepEqual(rows[0], ["participant_id", "date", "hour", "med_type", "dose_mg", "count"]);
  assert.deepEqual(rows.slice(1), [
    ["P-00000001", "2026-11-02", 9, 9, "", ""],
    ["P-00000001", "2026-11-03", 9, 1, 21, 1],
    ["P-00000001", "2026-11-03", 10, 2, "", ""]
  ]);
  assert.deepEqual(R.buildMeds({}, "P-00000001"), [rows[0]]);
});

test("participant: 흡연 기간·이전 시도 (선택 · 범위 밖은 빈칸) · 코드북 v2 (VN-218-3 나)", () => {
  const p = R.buildParticipant({ kind: "cig", smokeYears: 20, priorTries: 3 }, "P-00000001", 0);
  const h = p[0], v = p[1];
  assert.equal(v[h.indexOf("smoking_years")], 20);
  assert.equal(v[h.indexOf("prior_quit_attempts")], 3);
  assert.equal(v[h.indexOf("codebook_version")], "2");
  const q = R.buildParticipant({ smokeYears: -1, priorTries: "3" }, "P-00000001", 0);
  assert.equal(q[1][h.indexOf("smoking_years")], ""); assert.equal(q[1][h.indexOf("prior_quit_attempts")], "");
  const cb = R.buildCodebook().map(r => r[0] + ":" + r[1]);
  ["participant:smoking_years", "participant:prior_quit_attempts", "meds:med_type"].forEach(k => assert.ok(cb.includes(k), k));
  assert.ok(R.buildSheets({}, "P-00000001", 0).some(s => s.name === "meds"));
});

test("participant · meds: 소수 이력값과 Date 범위 밖 시각은 넣지 않는다 (#88 Sourcery)", () => {
  const p = R.buildParticipant({ smokeYears: 2.5, priorTries: 1.5 }, "P-00000001", 0);
  assert.equal(p[1][p[0].indexOf("smoking_years")], ""); assert.equal(p[1][p[0].indexOf("prior_quit_attempts")], "");
  assert.equal(R.buildMeds({ medlog: [{ id: "x", t: 9e15, type: "patch" }] }, "P-00000001").length, 1);
});
