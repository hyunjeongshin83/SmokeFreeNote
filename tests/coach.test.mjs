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

// ── 주별 흐름 ──
test("5분 버티기 완료 기록(from)은 코칭 규칙에서도 새 당김으로 세지 않는다", () => {
  const logs = [{ t: D(0), from: "sos" }, { t: D(1), from: "sos" }, { t: D(2), from: "sos" }];
  assert.equal(C.pick(logs, D(10), NOW).id, "gap");                         // 새 당김이 아니라 기록이 없는 것으로 본다
});
test("weekly: 시작 전 구간은 빠지고 부분 구간은 날수를 알려 준다", () => {
  const w = C.weekly(L([0, 1, 8]), D(9), NOW, 4);                            // 시작 10일째(오늘 포함)
  assert.equal(w.length, 2); assert.deepEqual(w.map(x => x.days), [3, 7]);
  assert.deepEqual(w.map(x => x.crave), [1, 2]);                             // 오래된 구간: 8일 전 1건 · 최근 구간: 0·1일 전 2건
});
test("weekly: 피움 · from 제외 · 시작 전/깨진 기록 무시", () => {
  const logs = [{ t: D(0), slip: true }, { t: D(0) }, { t: D(1), from: "sos" }, { t: D(40) }, null, { t: "x" }];
  const w = C.weekly(logs, D(20), NOW, 4); const last = w[w.length - 1];
  assert.equal(last.crave, 2); assert.equal(last.slip, 1);
});
test("weekly: 시작 시각 없음 · 미래 시작은 빈 배열", () => { assert.deepEqual(C.weekly([], null, NOW), []); assert.deepEqual(C.weekly([], NOW + 1, NOW), []); });
test("weekly: 시작한 날 하루뿐이면 구간 하나(1일)", () => { const w = C.weekly([], NOW - 1000, NOW, 4); assert.equal(w.length, 1); assert.equal(w[0].days, 1); });

test("앱의 주 라벨은 달력 날짜 뺄셈 — 여름시간 전환 구간에서도 weekly 의 구간과 같다 (Codex #80 P2)", () => {
  // 앱 코드와 같은 방식(setDate)으로 구간 끝·처음을 만들어, 그 구간 안의 날짜가 weekly() 의 같은 구간에 세어지는지 본다
  const now = new Date(2026, 2, 10, 15).getTime(), start = new Date(2026, 0, 1).getTime();
  const day0 = new Date(now); day0.setHours(0, 0, 0, 0);
  for (const ago of [0, 1, 2]) {
    const endD = new Date(day0); endD.setDate(endD.getDate() - 7 * ago);
    const fromD = new Date(endD); fromD.setDate(fromD.getDate() - 6);
    for (const d of [fromD, endD]) {
      const t = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
      const w = C.weekly([{ t }], start, now, 4).find(x => x.ago === ago); assert.equal(w.crave, 1, `ago ${ago} ${d.toDateString()}`);
    }
  }
});

// ── 코칭 이력 ──
const card = { id: "gap", title: "기록이 없는 날은 실패로 세지 않아요", body: "생각날 때 한 번만 남겨 보세요. 15초면 돼요." };
test("이력: 처음 보여 주면 한 줄, 같은 날 같은 안내는 다시 더하지 않는다", () => {
  let r = C.addHistory([], card, NOW); assert.equal(r.changed, true); assert.equal(r.items.length, 1);
  r = C.addHistory(r.items, card, NOW + 3600000); assert.equal(r.changed, false); assert.equal(r.items.length, 1);
});
test("이력: 같은 날 숫자가 바뀌면 그날 한 줄만 새 값으로, 다른 날·다른 규칙은 새 줄", () => {
  const a = { id: "up", title: "최근 7일 당김 기록이 늘었어요", body: "앞선 7일에는 2번, 최근 7일에는 5번 남겼어요." };
  let r = C.addHistory([], a, NOW); r = C.addHistory(r.items, { ...a, body: "앞선 7일에는 2번, 최근 7일에는 6번 남겼어요." }, NOW + 1000);
  assert.equal(r.items.length, 1); assert.match(r.items[0].body, /6번/); assert.equal(r.changed, true);
  r = C.addHistory(r.items, card, NOW + 2000); assert.equal(r.items.length, 2);
  r = C.addHistory(r.items, a, NOW + 86400000 * 1.2); assert.equal(r.items.length, 3);
  assert.ok(r.items[0].t >= r.items[1].t && r.items[1].t >= r.items[2].t);          // 최신이 맨 위
});
test("이력: 30개를 넘으면 오래된 것부터 버린다", () => {
  let items = []; for (let i = 0; i < 40; i++) items = C.addHistory(items, { ...card, id: "r" + i }, NOW + i * 1000).items;
  assert.equal(items.length, C.HISTORY_MAX); assert.equal(items[0].id, "r39"); assert.ok(!items.some(x => x.id === "r0"));
});
test("이력: 깨진 저장값은 걸러내고, 카드가 없으면 그대로", () => {
  assert.deepEqual(C.cleanHistory(null), []); assert.deepEqual(C.cleanHistory("x"), []);
  const ok = { d: "2026-11-01", t: 5, id: "gap", title: "a", body: "b" };
  assert.deepEqual(C.cleanHistory([ok, null, { d: "x" }, { ...ok, t: "q" }, { ...ok, id: 3 }]), [ok]);
  assert.equal(C.addHistory([ok], null, NOW).changed, false); assert.equal(C.addHistory([ok], card, "x").changed, false);
});
test("이력: 너무 긴 글은 잘라 저장한다", () => { const r = C.addHistory([], { id: "x".repeat(50), title: "t".repeat(200), body: "b".repeat(900) }, NOW).items[0]; assert.equal(r.id.length, 20); assert.equal(r.title.length, 80); assert.equal(r.body.length, 300); });
