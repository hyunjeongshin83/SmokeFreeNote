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
  assert.equal(names.filter(x => x.startsWith("xl/worksheets/")).length, 5);
  assert.match(xml["xl/workbook.xml"], /name="records"/); assert.match(xml["xl/workbook.xml"], /name="codebook"/);
  assert.match(xml["xl/worksheets/sheet2.xml"], /<c r="H4"><v>3<\/v><\/c>/);          // records 의 3번째 기록 craving_level = 3
});

test("꺼짐이 기본값: 설정이 비어 있으면 준비 안 됨, 불완전하면 켤 수 없다", () => {
  delete globalThis.SF_RESEARCH_CONFIG;
  assert.equal(R.config().enabled, false); assert.equal(R.config().ready, false);
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "", consentVersion: "v1" };
  assert.equal(R.config().ready, false, "동의 문구가 없으면 준비 안 됨");
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "", consentText: "문구", consentVersion: "v1" };
  assert.equal(R.config().ready, false, "클라이언트 ID 가 없으면 준비 안 됨");
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "문구", consentVersion: "v1" };
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
function fresh({ tokenDelay = 15, listDelay = 0, uploadDelay = 0 } = {}) {
  delete require.cache[require.resolve("../research.js")];
  const store = {}, calls = [], revoked = [], rec = { aborted: 0, completed: 0 }, listeners = {};
  globalThis.addEventListener = (type, fn) => { (listeners[type] = listeners[type] || []).push(fn); };
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  globalThis.fetch = async (url, opts = {}) => {
    calls.push((opts.method || "GET") + " " + String(url).split("?")[0]);
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
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "x".repeat(30), consentText: "문구", consentVersion: "v1" };
  const R2 = require("../research.js"); R2.init({ getState: () => state() });
  return { R: R2, store, calls, revoked, rec, listeners };
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
