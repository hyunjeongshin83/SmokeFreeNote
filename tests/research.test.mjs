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
