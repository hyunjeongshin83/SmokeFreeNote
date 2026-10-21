// 퍼프 연동 뼈대 — 순수 로직 시험.  실행: node --test tests/puff-core.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const P = require("../labs/puff-link/puff-core.js");

const DAY = P.DAY;
const T0 = Date.UTC(2026, 9, 1);                                  // 2026-10-01 00:00 UTC (시험용 고정 시각)
const rec = (seq, t, d = 3) => ({ seq, t, d });

function completenessOf(seed, K, disc = "normal", days = 21) {
  const s = P.newState();
  const sim = P.simulateDevice(T0, T0 + days * DAY, { seed, bufferK: K, disconnects: disc });
  P.ingest(s, sim.records, "live", T0 + days * DAY);
  return { c: s.puffs.length / sim.truth, truth: sim.truth, s };
}

test("같은 일련번호는 한 번만 들어가고 잘못된 기록은 걸러진다", () => {
  const s = P.newState();
  const r1 = P.ingest(s, [rec(0, T0), rec(1, T0 + 1000), rec(1, T0 + 1000)], "live", T0);
  assert.deepEqual(r1, { added: 2, dup: 1, bad: 0 });
  const r2 = P.ingest(s, [rec(1, T0 + 1000), rec(2, T0 + 2000), { seq: -1, t: T0, d: 3 }, { seq: 3, t: T0, d: 99 }, { seq: 4, t: 0, d: 3 }], "resync", T0);
  assert.deepEqual(r2, { added: 1, dup: 1, bad: 3 });
  assert.equal(s.puffs.length, 3);
});

test("일련번호 빈 곳으로 완전성을 계산한다", () => {
  const s = P.newState();
  P.ingest(s, [0, 1, 2, 5, 6].map(i => rec(i, T0 + i * 60000)), "live", T0);
  assert.deepEqual(P.gaps(s), [[3, 4]]);
  assert.equal(P.missingCount(s), 2);
  const c = P.completeness(s, { connected: true });
  assert.equal(c.status, "ok");
  assert.equal(c.pct, 71.4);
});

test("끊겨 있는 동안에는 완전성 숫자를 주지 않는다", () => {
  const s = P.newState();
  P.ingest(s, [rec(0, T0), rec(1, T0 + 1000)], "live", T0);
  const c = P.completeness(s, { connected: false });
  assert.equal(c.status, "pending");
  assert.equal(c.pct, null);
  assert.equal(P.completeness(P.newState(), { connected: true }).status, "no-data");
});

test("하루 요약: 개수 · 시간대 · 길이 합", () => {
  const s = P.newState();
  P.ingest(s, [rec(0, T0 + 8 * 3600000, 3), rec(1, T0 + 8 * 3600000 + 5000, 2.5), rec(2, T0 + 23 * 3600000 + 59 * 60000, 4), rec(3, T0 + DAY + 1000, 3)], "live", T0);
  const d = P.daySummary(s, T0);
  assert.equal(d.count, 3);
  assert.equal(d.hours[8], 2);
  assert.equal(d.hours[23], 1);
  assert.equal(d.durS, 9.5);
  assert.equal(d.durN, 3);
});

test("니코틴 참고치: 길이가 없거나 농도가 없으면 만들지 않는다", () => {
  assert.equal(P.nicotineMg(10, 20), 0.08);
  assert.equal(P.nicotineMg(10, 0), null);
  assert.equal(P.nicotineMg(0, 20), null);
  assert.equal(P.nicotineMg(null, 20), null);
});

test("카운터형 기기: 처음 값은 기준만, 이후 차이만큼 기록, 초기화는 무시", () => {
  const s = P.newState();
  assert.equal(P.ingestCounter(s, 100, T0).first, true);
  assert.equal(s.puffs.length, 0);
  assert.equal(P.ingestCounter(s, 107, T0 + 1000).added, 7);
  assert.equal(s.puffs.every(p => p.d === null && p.src === "counter"), true);
  assert.equal(P.ingestCounter(s, 3, T0 + 2000).reset, true);
  assert.equal(s.puffs.length, 7);
  assert.equal(P.ingestCounter(s, 5, T0 + 3000).added, 2);
});

function steadyState(perDay, days, opts = {}) {
  const s = P.newState();
  let seq = 0;
  const recs = [];
  for (let d = 0; d < days; d++) {
    const n = typeof perDay === "function" ? perDay(d) : perDay;
    for (let i = 0; i < n; i++) recs.push(rec(seq++, T0 + d * DAY + 8 * 3600000 + i * 60000));
  }
  const keep = opts.drop ? recs.filter((r, i) => !opts.drop(r, i)) : recs;
  P.ingest(s, keep, "live", T0 + days * DAY);
  return s;
}

test("추세: 비슷하면 similar, 20 % 넘게 줄면 lower", () => {
  const now = T0 + 21 * DAY;
  assert.equal(P.weeklyTrend(steadyState(100, 21), now, { connected: true }).level, "similar");
  const lower = P.weeklyTrend(steadyState(d => (d >= 14 ? 60 : 100), 21), now, { connected: true });
  assert.equal(lower.level, "lower");
  assert.ok(Math.abs(lower.change + 0.4) < 0.01);
  const higher = P.weeklyTrend(steadyState(d => (d >= 14 ? 140 : 100), 21), now, { connected: true });
  assert.equal(higher.level, "higher");
});

test("추세: 10 % 정도 줄어든 것은 문턱(20 %) 아래라 similar", () => {
  const now = T0 + 21 * DAY;
  assert.equal(P.weeklyTrend(steadyState(d => (d >= 14 ? 90 : 100), 21), now, { connected: true }).level, "similar");
});

test("추세: 기록 일수가 모자라면 비교하지 않고, 끊겨 있으면 만들지 않는다", () => {
  const now = T0 + 21 * DAY;
  assert.equal(P.weeklyTrend(steadyState(100, 6), T0 + 6 * DAY, { connected: true }).status, "insufficient");
  assert.equal(P.weeklyTrend(steadyState(100, 21), now, { connected: false }).status, "pending");
});

test("추세: 추적을 시작한 지 얼마 안 돼 기간이 덜 차도 일정하게 쓰면 변화 없음 (하루 평균으로 견줌)", () => {
  const now = T0 + 21 * DAY;
  for (const from of [5, 7, 9]) {
    const s = steadyState(d => (d >= from ? 100 : 0), 21);
    const t = P.weeklyTrend(s, now, { connected: true });
    assert.equal(t.status, "ok", "추적 " + from + "일째부터");
    assert.equal(t.level, "similar", "추적 " + from + "일째부터: " + t.change);
    assert.ok(Math.abs(t.change) < 0.02);
  }
});

test("추세: 덜 찬 기간에서도 진짜로 줄면 줄었다고 알아본다", () => {
  const now = T0 + 21 * DAY;
  const s = steadyState(d => (d < 5 ? 0 : d >= 14 ? 60 : 100), 21);
  const t = P.weeklyTrend(s, now, { connected: true });
  assert.equal(t.level, "lower");
  assert.ok(Math.abs(t.change + 0.4) < 0.03, "변화 " + t.change);
});

test("추세: 기록이 없는 날은 진짜 0 으로 센다 — 퍼프가 사라지는 경우를 가리지 않는다", () => {
  const now = T0 + 21 * DAY;
  // 14일은 하루 100건, 최근 7일은 처음 3일만 100건이고 그 뒤 4일은 한 건도 없음(기기는 연결돼 있음)
  const s = steadyState(d => (d < 14 ? 100 : d < 17 ? 100 : 0), 21);
  const t = P.weeklyTrend(s, now, { connected: true });
  assert.equal(t.status, "ok");
  assert.equal(t.level, "lower");
  assert.ok(Math.abs(t.change + 0.571) < 0.02, "변화 " + t.change);
});

test("추세: 앞선 기간을 5일도 추적하지 못했으면 비교하지 않는다", () => {
  const now = T0 + 21 * DAY;
  const t = P.weeklyTrend(steadyState(d => (d >= 11 ? 100 : 0), 21), now, { connected: true });
  assert.equal(t.status, "insufficient");
});

test("추세: 최근 주에만 누락이 생겨도 줄었다고 오해하지 않는다 (누락 보정)", () => {
  const now = T0 + 21 * DAY;
  const lastWeekStart = T0 + 14 * DAY;
  // 최근 7일의 기록 중 30 % 를 일련번호만 남기고 잃어버림(연속된 구간이 아니라 군데군데)
  const lossy = steadyState(100, 21, { drop: (r, i) => r.t >= lastWeekStart && i % 10 >= 7 && i % 10 <= 9 && i % 100 < 95 });
  const raw = lossy.puffs.filter(p => p.t >= lastWeekStart).length;
  assert.ok(raw < 600, "최근 주가 실제로 줄어 보여야 시험이 된다");
  const t = P.weeklyTrend(lossy, now, { connected: true });
  assert.equal(t.status, "ok");
  assert.equal(t.level, "similar");
  assert.ok(t.missingThis > 100);
});

test("추세: 주 경계에 걸친 누락이 있어도 실제 변화가 없으면 줄었다고 하지 않는다", () => {
  const now = T0 + 21 * DAY;
  // 13~15일째(0부터) 기록을 통째로 잃음 — 누락 구간이 최근 7일의 시작(14일째)에 걸친다
  const s = steadyState(100, 21, { drop: r => { const d = Math.floor((r.t - T0) / DAY); return d >= 13 && d <= 15; } });
  const t = P.weeklyTrend(s, now, { connected: true });
  assert.equal(t.status, "ok");
  assert.equal(t.level, "similar", "변화 " + t.change);
  assert.ok(Math.abs(t.change) < 0.1, "변화 " + t.change);
  assert.ok(t.missingThis > 100 && t.missingBase > 50, "경계에 걸친 누락이 두 기간에 나뉘어야 한다: " + t.missingThis + " / " + t.missingBase);
});

test("추세: 진짜로 줄었고 경계에 누락이 걸쳐도 줄었다고 알아본다", () => {
  const now = T0 + 21 * DAY;
  const s = steadyState(d => (d >= 14 ? 55 : 100), 21, { drop: r => { const d = Math.floor((r.t - T0) / DAY); return d >= 13 && d <= 15 && r.seq % 2 === 0; } });
  assert.equal(P.weeklyTrend(s, now, { connected: true }).level, "lower");
});

test("가짜 기기: thin 0 은 「완전히 끊음」이다 (1 로 바뀌지 않는다)", () => {
  const sim = P.simulateDevice(T0, T0 + 6 * DAY, { seed: 1, disconnects: "none", thinFrom: T0 + 3 * DAY, thin: 0 });
  assert.equal(sim.truthRecords.filter(p => p.t >= T0 + 3 * DAY).length, 0);
  assert.ok(sim.truthRecords.filter(p => p.t < T0 + 3 * DAY).length > 100);
  const full = P.simulateDevice(T0, T0 + 6 * DAY, { seed: 1, disconnects: "none", thinFrom: T0 + 3 * DAY });
  assert.ok(full.truthRecords.filter(p => p.t >= T0 + 3 * DAY).length > 100, "thin 을 안 주면 그대로");
});

test("추세 문장: 단정하지 않고 참고치라고 밝힌다", () => {
  assert.match(P.trendText({ status: "ok", level: "lower", change: -0.3 }), /약 30% 적어요.*참고치/);
  assert.match(P.trendText({ status: "ok", level: "similar", change: 0.05 }), /큰 차이가 없어요/);
  assert.match(P.trendText({ status: "pending" }), /끊겨/);
  assert.match(P.trendText({ status: "insufficient" }), /5일 이상/);
  for (const lv of ["lower", "higher", "similar"]) {
    const txt = P.trendText({ status: "ok", level: lv, change: lv === "lower" ? -0.3 : 0.3 });
    assert.doesNotMatch(txt, /실패|위험|진단|치료|중독/);
  }
});

test("니코틴 참고치: 범위를 벗어난 농도는 계산하지 않는다", () => {
  for (const bad of [0, -5, 100.5, 200, Infinity, NaN, "20", null, undefined]) assert.equal(P.nicotineMg(30, bad), null, String(bad));
  assert.equal(P.nicotineMg(30, 100) > 0, true);
  assert.equal(P.concValid(20), true);
  assert.equal(P.concValid(100), true);
  assert.equal(P.concValid(100.01), false);
  assert.equal(P.nicotineMg(Infinity, 20), null);
  assert.equal(P.nicotineMg("3", 20), null);
});

test("가짜 기기: 끊긴 구간이 지금을 덮으면 연결 안 됨(동기화 대기)이고 그 구간의 기록은 아직 없다", () => {
  const to = T0 + 5 * DAY;
  let hit = null;
  for (let seed = 1; seed < 400 && !hit; seed++) {
    const sim = P.simulateDevice(T0, to, { seed, disconnects: "heavy", bufferK: 64 });
    if (sim.intervals.some(iv => iv[0] <= to && to < iv[1])) hit = sim;
  }
  assert.ok(hit, "지금을 덮는 끊김이 있는 시드를 찾아야 한다");
  assert.deepEqual(P.linkAt(hit.intervals, to), { connected: false });
  const iv = hit.intervals.find(x => x[0] <= to && to < x[1]);
  const got = new Set(hit.records.map(r => r.seq));
  const inside = hit.truthRecords.filter(p => p.t >= iv[0] && p.t < to);
  assert.ok(inside.every(p => !got.has(p.seq)), "아직 재연결 전이라 그 구간의 기록은 앱에 없어야 한다");
  const s = P.newState(); P.ingest(s, hit.records, "live", to);
  assert.equal(P.completeness(s, P.linkAt(hit.intervals, to)).status, "pending");
  assert.equal(P.weeklyTrend(s, to, P.linkAt(hit.intervals, to)).status, "pending");
  assert.deepEqual(P.linkAt(hit.intervals, T0 - DAY), { connected: true });
});

test("가짜 기기: 같은 시드는 같은 결과", () => {
  const a = P.simulateDevice(T0, T0 + 7 * DAY, { seed: 5 }), b = P.simulateDevice(T0, T0 + 7 * DAY, { seed: 5 });
  assert.deepEqual(a.records, b.records);
  assert.notDeepEqual(a.records, P.simulateDevice(T0, T0 + 7 * DAY, { seed: 6 }).records);
});

test("가짜 기기: 하루 퍼프 수가 시뮬레이션 가정(평균 약 157)과 같은 규모", () => {
  const n = [1, 2, 3, 4].map(seed => P.simulateDevice(T0, T0 + 21 * DAY, { seed, disconnects: "none" }).truth / 21);
  const mean = n.reduce((a, b) => a + b) / n.length;
  assert.ok(mean > 120 && mean < 200, "평균 " + mean);
});

test("완전성: 끊김이 없으면 100 %, 기기 저장이 클수록 높다", () => {
  assert.equal(completenessOf(1, 64, "none").c, 1);
  const avg = K => [1, 2, 3, 4, 5, 6].reduce((s, seed) => s + completenessOf(seed, K).c, 0) / 6;
  const c0 = avg(0), c16 = avg(16), c64 = avg(64);
  assert.ok(c0 < 0.92, "기기 저장 없음 " + c0);
  assert.ok(c16 > c0 && c64 >= c16, [c0, c16, c64].join(" < "));
  assert.ok(c64 > 0.99, "링버퍼 64건 " + c64);
});

test("완전성: 일련번호로 계산한 값이 실제 완전성과 거의 같다 (재동기화가 끝난 뒤)", () => {
  for (const seed of [1, 2, 3]) {
    const { c, s } = completenessOf(seed, 16);
    const est = P.completeness(s, { connected: true }).pct / 100;
    assert.ok(Math.abs(est - c) < 0.02, `seed ${seed}: 표시 ${est} 실제 ${c}`);
  }
});

test("링버퍼: 가득 차면 가장 최근 것이 남고 옛것이 덮어써진다", () => {
  const sim = P.simulateDevice(T0, T0 + 14 * DAY, { seed: 11, bufferK: 3, disconnects: "heavy" });
  const got = new Set(sim.records.map(r => r.seq));
  let checked = 0;
  for (const [s, e] of sim.intervals) {
    if (e > T0 + 14 * DAY) continue;
    const inside = sim.truthRecords.filter(p => p.t >= s && p.t < e);
    if (inside.length <= 3) continue;
    const kept = inside.filter(p => got.has(p.seq)), lost = inside.filter(p => !got.has(p.seq));
    assert.equal(kept.length, 3);
    const lastLost = Math.max(...lost.map(p => p.seq)), firstKept = Math.min(...kept.map(p => p.seq));
    assert.ok(lastLost < firstKept, "덮어써진 것은 보존된 것보다 앞선 퍼프여야 한다");
    checked++;
  }
  assert.ok(checked >= 3, "시험할 구간이 충분해야 한다: " + checked);
});

test("재동기화: 실시간으로 받은 것을 다시 받아도 중복되지 않는다", () => {
  const sim = P.simulateDevice(T0, T0 + 5 * DAY, { seed: 3, bufferK: 64 });
  const s = P.newState();
  P.ingest(s, sim.records, "live", T0);
  const n = s.puffs.length;
  const again = P.ingest(s, sim.records, "resync", T0);
  assert.equal(again.added, 0);
  assert.equal(s.puffs.length, n);
});

test("숫자가 아닌 시각·길이는 받지 않는다 (문자열 \"3\" 이 합계를 \"033\" 으로 만들지 않게)", () => {
  const s = P.newState();
  const r = P.ingest(s, [
    { seq: 0, t: String(T0 + 1000), d: 3 }, { seq: 1, t: T0 + 2000, d: "3" }, { seq: 2, t: NaN, d: 3 }, { seq: 3, t: T0 + 3000, d: Infinity },
    { seq: 4, t: T0 + 4000, d: 3 }, { seq: 5, t: T0 + 5000, d: null }, { seq: 6, t: T0 + 6000 }], "live", T0);
  assert.deepEqual(r, { added: 3, dup: 0, bad: 4 });
  const day = P.daySummary(s, T0);
  assert.equal(day.count, 3);
  assert.equal(day.durS, 3);
  assert.equal(typeof day.durS, "number");
});

test("저장소에서 읽을 때도 깨진 기록은 걸러지고 일련번호 범위가 다시 계산된다", () => {
  const bad = { v: 1, puffs: [{ seq: 0, t: "x", d: "3" }, { seq: 5, t: T0 + 1000, d: 3 }, { seq: 4, t: T0 + 500, d: 3 }, { seq: 9, t: T0, d: 99 }], minSeq: 0, maxSeq: 9 };
  const s = P.load({ getItem: () => JSON.stringify(bad) });
  assert.deepEqual(s.puffs.map(p => p.seq), [4, 5]);
  assert.equal(s.minSeq, 4);
  assert.equal(s.maxSeq, 5);
  assert.equal(P.completeness(s, { connected: true }).pct, 100);
});

test("저장: 다른 키는 건드리지 않고, 깨진 값은 빈 상태로 시작한다", () => {
  const mem = {}; const st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = String(v); } };
  mem["smokefree.v1"] = '{"logs":[1,2,3]}';
  const s = P.newState(); P.ingest(s, [rec(0, T0), rec(1, T0 + 1000)], "live", T0);
  assert.equal(P.save(st, s), true);
  assert.equal(mem["smokefree.v1"], '{"logs":[1,2,3]}');
  assert.equal(P.load(st).puffs.length, 2);
  mem[P.KEY] = "{깨진";
  assert.equal(P.load(st).puffs.length, 0);
  mem[P.KEY] = '{"v":2,"puffs":[]}';
  assert.equal(P.load(st).puffs.length, 0);
  assert.equal(P.save({ setItem() { throw new Error("quota"); } }, s), false);
});
