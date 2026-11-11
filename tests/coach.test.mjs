import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const C = createRequire(import.meta.url)("../coach.js");
const at = (y, m, d, h = 12) => new Date(y, m - 1, d, h).getTime();
const NOW = at(2026, 11, 20), D = n => at(2026, 11, 20 - n, 9);          // D(0)=오늘, D(7)=7일 전
const L = ns => ns.map(n => ({ t: D(n) }));
test("시작 전·시작 시각 없음·미래는 카드 없음", () => { assert.equal(C.pick(L([0]), null, NOW), null); assert.equal(C.pick(L([0]), NOW + 1, NOW), null); });
test("시작 3일 안이면 기록이 없어도 카드 없음", () => assert.equal(C.pick([], D(2), NOW), null));
test("3일째부터 기록이 하나도 없으면 gap — 실패라는 말 없음", () => {
  const r = C.pick([], D(3), NOW); assert.equal(r.id, "gap"); assert.ok(!/재발|실패했|성공/.test(r.title + r.body.replace("실패로 세지 않아요", "")));
  assert.equal(C.pick(L([5]), D(10), NOW).id, "gap");                       // 마지막 기록이 5일 전
});
test("최근 3일 안에 기록이 있으면 gap 아님", () => assert.equal(C.pick(L([2]), D(10), NOW), null));
test("14일이 안 지났으면 늘고 줆을 견주지 않는다", () => assert.equal(C.pick(L([0, 0, 0, 1, 1, 1, 1, 1]), D(10), NOW), null));
test("up: 앞선 7일 2번 → 최근 7일 5번", () => { const r = C.pick(L([0, 1, 2, 3, 4, 8, 9]), D(30), NOW); assert.equal(r.id, "up"); assert.match(r.body, /2번.*5번/); assert.equal(r.go2, "help"); });
test("down: 앞선 7일 6번 → 최근 7일 2번, 기록하지 않은 날은 안 센다고 밝힘", () => { const r = C.pick(L([0, 1, 7, 8, 9, 10, 11, 12]), D(30), NOW); assert.equal(r.id, "down"); assert.match(r.body, /기록하지 않은 날/); });
test("비슷하거나 앞선 구간 기록이 1번이면 카드 없음", () => { assert.equal(C.pick(L([0, 1, 2, 8, 9, 10]), D(30), NOW), null); assert.equal(C.pick(L([0, 1, 2, 3, 9]), D(30), NOW), null); });
test("시작 전 기록·깨진 기록은 무시", () => { assert.equal(C.pick([{ t: "x" }, null, {}, { t: D(40) }], D(30), NOW).id, "gap"); });
test("문구에 금지어가 없다", () => { for (const ns of [[], [0, 1, 2, 3, 4, 8, 9], [0, 1, 7, 8, 9, 10, 11, 12]]) { const r = C.pick(L(ns), D(30), NOW); if (r) assert.ok(!/재발|스트레스|위험|진단|성공했|실패했/.test(r.title + r.body)); } });
