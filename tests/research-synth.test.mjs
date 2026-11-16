// 연구형 앱 7단계 — 합성 기록 분석 파이프라인 시험.  실행: node --test tests/research-synth.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const script = fileURLToPath(new URL("../tools/research-synth.cjs", import.meta.url));
const run = (...a) => spawnSync(process.execPath, [script, ...a], { encoding: "utf8" });

test("양성 대조: 심은 효과를 참여자 단위 구간으로 되찾는다", () => {
  const r = run("--seed", "1", "--n", "60", "--boot", "200");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /합성\(가짜\) 기록/);
  assert.match(r.stdout, /검증: 심은 효과/);
});
test("음성 대조: 효과가 없으면 산책 구간이 0 을 포함한다 (판정은 산책 한 가지만 — 다중 비교는 숫자로만 알린다)", () => {
  const r = run("--seed", "3", "--n", "60", "--effect", "0", "--boot", "200");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /음성 대조 · 산책 대비만 판정/);
  // 이 시드에서는 cope_brush 구간이 우연히 0 을 벗어난다 (Codex PR #92) — 줄에 그대로 보이고 판정에는 안 들어간다
  assert.match(r.stdout, /다중 비교: 7개 중 1개의 구간이 0 을 벗어남/);
  assert.match(r.stdout, /cope_brush .*← 구간이 0 을 포함하지 않음/);
});

// 짝이 없으면 「NaN%p [NaN, NaN]」이 아니라 말로 적는다 (참여자 1명 · 같은 날 구간 — 비교할 짝이 거의 안 생긴다)
test("짝 없음 표시: 비교할 짝이 없으면 NaN 대신 「짝 없음」으로 적고, 판정은 「검증 불가」로 말한다", () => {
  const r = run("--seed", "1", "--n", "1", "--within-week", "--pair-days", "1", "--boot", "50");
  assert.doesNotMatch(r.stdout, /NaN/, r.stdout);
  assert.match(r.stdout, /짝 없음 — 비교할 수 없음/);
  assert.match(r.stdout, /검증 불가: 산책 대비에 비교할 짝이 없어/);
  assert.notEqual(r.status, 0);   // 되찾았다고 말하지 않는다
});
test("짝 없음 표시는 짝이 있을 때의 출력을 바꾸지 않는다 (숫자 줄에 「짝 없음」이 끼지 않는다)", () => {
  const r = run("--seed", "1", "--n", "60", "--within-week", "--boot", "100");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.doesNotMatch(r.stdout, /짝 없음|NaN|검증 불가/);
});

// ── 금주노트 (--app alcohol): 이 저장소 옆 NonAlcoholNote 가 있을 때만 돈다 (없으면 건너뜀)
import fs from "node:fs";
import path from "node:path";
const ALC = path.resolve(process.env.ALC_DIR || path.join(path.dirname(script), "..", "..", "NonAlcoholNote"));   // 상대 경로여도 같은 곳을 가리키게 (Codex P2 · PR #95)
const hasAlc = fs.existsSync(path.join(ALC, "research.js"));
const alc = (...a) => run("--app", "alcohol", ...a);

test("금주 맞춤 규칙: lapse = kind 2(마심) — 앱 저장 모양이 내보내기에서 이렇게 바뀐다", { skip: !hasAlc }, async () => {
  const R = (await import("node:module")).createRequire(import.meta.url)(path.join(ALC, "research.js"));
  const t = Date.UTC(2026, 10, 5, 12);
  const st = { start: t - 86400000, attempts: [], logs: [
    { v: 1, t, kind: "drink", cups: 2, bev: "소주", cr: 8, lv: "강함", mood: "나쁨", trig: ["모임·회식"], cope: [] },
    { v: 1, t: t + 1, kind: "urge", cups: 0, cr: 8, lv: "강함", mood: "나쁨", trig: ["모임·회식"], cope: ["산책"] }] };
  const rows = R.buildRecords(st, "P-x"), H = rows[0], col = (r, n) => r[H.indexOf(n)];
  assert.deepEqual(rows.slice(1).map((r) => col(r, "kind")), [2, 1]);               // 마심 2 · 넘김 1
  assert.equal(col(rows[1], "cope_walk"), 0); assert.equal(col(rows[2], "cope_walk"), 1);
});
test("금주 대처는 「마셨어요」에서 숨겨 넘김 기록에만 남는다 — 이 가정이 깨지면 분석을 다시 본다", { skip: !hasAlc }, () => {
  const html = fs.readFileSync(path.join(ALC, "NonAlcohol_app.html"), "utf8");
  assert.match(html, /cope:\s*drank\s*\?\s*\[\]\s*:/, "마심 기록의 대처가 빈 배열이어야 「대처별 마심 비율」을 안 내는 설계가 맞다");
  assert.match(html, /l_cope_box"\)\.style\.display\s*=\s*drank\s*\?\s*"none"/, "마셨어요에서 대처 칸이 숨겨져야 한다");
});
test("금주 양성 대조: 심은 모임·회식 효과를 되찾고, 대처는 비교하지 않으며, 자동 기록은 뺀다", { skip: !hasAlc }, () => {
  const r = alc("--seed", "1", "--n", "60", "--boot", "200");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /검증: 심은 효과\(모임·회식\)/);
  assert.match(r.stdout, /대처는 비교하지 않음/);
  assert.match(r.stdout, /제외: (자동 기록\(auto_record=1\)|갈망\(0~10\) 칸이 없는 기록) [1-9]\d*건/);   // 금주 research.js 가 코드북 2 면 auto_record, 옛 것이면 갈망 칸 규칙
  assert.doesNotMatch(r.stdout, /cope_/, "대처 열이 비교 표에 없어야 한다");
});
test("금주 음성 대조: 효과가 없으면 모임·회식 구간이 0 을 포함한다", { skip: !hasAlc }, () => {
  const r = alc("--seed", "3", "--n", "60", "--effect", "0", "--boot", "200");
  assert.equal(r.status, 0, r.stdout + r.stderr);
  assert.match(r.stdout, /음성 대조 · 모임·회식 대비만 판정/);
});
test("자동 기록을 안 빼면 심지 않은 상황까지 가짜 연관이 생긴다 — 제외가 필요한 이유", { skip: !hasAlc }, () => {
  const r = alc("--seed", "1", "--n", "60", "--boot", "200");
  const outside = (r.stdout.match(/←/g) || []).length;
  assert.ok(outside <= 3, "제외 뒤에는 심은 효과 말고 0 을 벗어나는 비교가 거의 없어야 한다 (지금 " + outside + "개)");
});

// ── 보정 시험: 효과를 안 심은 여러 시드에서 「미리 정한 대비」의 구간이 0 을 벗어나는 비율이 5% 근처인지 (한 시드는 우연으로 어긋날 수 있다 — 시드 7 이 그렇다)
function falsePositives(app, k) {
  let bad = 0;
  for (let s = 100; s < 100 + k; s++) { const r = run(...(app ? ["--app", app] : []), "--seed", String(s), "--n", "60", "--effect", "0", "--boot", "100"); if (r.status !== 0) bad++; }
  return bad;
}
test("보정: 금연 음성 대조의 오탐이 30 시드 중 7 이하 (기대 약 1.5)", () => { const bad = falsePositives(null, 30); assert.ok(bad <= 7, "오탐 " + bad + "/30"); });
test("보정: 금주 음성 대조의 오탐이 30 시드 중 7 이하 (기대 약 1.5)", { skip: !hasAlc }, () => { const bad = falsePositives("alcohol", 30); assert.ok(bad <= 7, "오탐 " + bad + "/30"); });


// ── 한 사람 안의 변화 (--within · 2026-11-16 대표님 결정): 사람 사이 차이(교란)를 뺀다
test("--hetero 0 이면 기본 출력이 그대로다 (난수 순서를 안 건드린다)", () => {
  const a = run("--seed", "1", "--n", "40", "--boot", "100");
  const b = run("--seed", "1", "--n", "40", "--boot", "100", "--hetero", "0");
  assert.equal(a.status, 0); assert.equal(a.stdout, b.stdout);
});
test("한 사람 안의 변화 · 양성 대조: 사람 사이 차이가 섞여도 심은 효과를 되찾고, 모아 보면 효과가 줄어 보인다", () => {
  const w = run("--seed", "1", "--n", "60", "--boot", "200", "--hetero", "0.6", "--within");
  assert.equal(w.status, 0, w.stdout + w.stderr);
  assert.match(w.stdout, /한 사람 안의 변화/);
  assert.match(w.stdout, /검증: 심은 효과\(산책\)를 되찾았다/);
  const d = (out, re) => Number((out.match(re) || [])[1]);                                  // cope_walk 의 「차이」(%p)
  const pooled = d(run("--seed", "1", "--n", "60", "--boot", "200", "--hetero", "0.6").stdout, /cope_walk\s+[\d.]+%\s+[\d.]+%\s+(-?[\d.]+)%p/);
  const within = d(w.stdout, /cope_walk\s+\d+\s+(-?[\d.]+)%p/);
  assert.ok(within < pooled - 5, "한 사람 안의 변화(" + within + "%p)가 모은 값(" + pooled + "%p)보다 심은 효과(-25%p) 쪽으로 더 가야 한다");
});
// 효과를 안 심고 사람 사이 차이만 준 30 시드 — 모아 보면 거의 늘 가짜 연관이 나오고, 한 사람 안의 변화는 5% 근처다
function fpHet(app, within, k) {
  let bad = 0;
  for (let s = 100; s < 100 + k; s++) { const r = run(...(app ? ["--app", app] : []), "--seed", String(s), "--n", "60", "--effect", "0", "--boot", "100", "--hetero", "0.6", ...(within ? ["--within"] : [])); if (r.status !== 0) bad++; }
  return bad;
}
test("보정(사람 사이 차이): 금연 — 모아 보면 오탐이 30 시드 중 20 이상, 한 사람 안의 변화는 7 이하", () => {
  const pooled = fpHet(null, false, 30), within = fpHet(null, true, 30);
  assert.ok(pooled >= 20, "모아 보면 교란이 보여야 한다 (지금 " + pooled + "/30)"); assert.ok(within <= 7, "한 사람 안의 변화 오탐 " + within + "/30");
});
test("보정(사람 사이 차이): 금주 — 모아 보면 오탐이 30 시드 중 20 이상, 한 사람 안의 변화는 7 이하", { skip: !hasAlc }, () => {
  const pooled = fpHet("alcohol", false, 30), within = fpHet("alcohol", true, 30);
  assert.ok(pooled >= 20, "모아 보면 교란이 보여야 한다 (지금 " + pooled + "/30)"); assert.ok(within <= 7, "한 사람 안의 변화 오탐 " + within + "/30");
});

// ── 같은 주 안에서만 짝짓기 (--within-week · 2026-11-16 대표님 결정): 시간에 따라 변하는 교란(그 주의 스트레스 등)을 뺀다
test("--drift 0 · --drift-shift 는 기본 출력을 안 바꾼다 (난수 순서를 안 건드린다)", () => {
  const a = run("--seed", "2", "--n", "40", "--boot", "100");
  const b = run("--seed", "2", "--n", "40", "--boot", "100", "--drift", "0", "--drift-shift", "3", "--pair-days", "3");
  assert.equal(a.status, 0); assert.equal(a.stdout, b.stdout);
});
test("같은 주 안에서만 짝짓기 · 양성 대조: 주마다 변하는 교란이 있어도 심은 효과를 되찾고, 사람 안만 봐서는 효과가 줄어 보인다", () => {
  const w = run("--seed", "1", "--n", "60", "--boot", "200", "--drift", "0.8", "--within-week");
  assert.equal(w.status, 0, w.stdout + w.stderr);
  assert.match(w.stdout, /같은 주 안에서만 짝짓기/);
  assert.match(w.stdout, /검증: 심은 효과\(산책\)를 되찾았다/);
  const person = Number((w.stdout.match(/한 사람 안의 변화[\s\S]*?cope_walk\s+\d+\s+(-?[\d.]+)%p/) || [])[1]);   // 사람 안만 본 값
  const week = Number((w.stdout.match(/같은 주 안에서만 짝짓기[\s\S]*?cope_walk\s+\d+\s+\d+\s+(-?[\d.]+)%p/) || [])[1]);
  assert.ok(week < person - 5, "같은 주 안의 값(" + week + "%p)이 사람 안의 값(" + person + "%p)보다 심은 효과(-25%p) 쪽으로 더 가야 한다");
});
function fpDrift(app, flags, k) {
  let bad = 0;
  for (let s = 100; s < 100 + k; s++) { const r = run(...(app ? ["--app", app] : []), "--seed", String(s), "--n", "60", "--effect", "0", "--boot", "100", "--drift", "0.8", ...flags); if (r.status !== 0) bad++; }
  return bad;
}
test("보정(주마다 변하는 교란 · 금연): 사람 안의 변화는 오탐이 30 시드 중 20 이상, 같은 주 안에서만 짝지으면 7 이하", () => {
  const person = fpDrift(null, ["--within"], 30), week = fpDrift(null, ["--within-week"], 30);
  assert.ok(person >= 20, "사람 안만 보면 교란이 남아야 한다 (지금 " + person + "/30)"); assert.ok(week <= 7, "같은 주 안의 오탐 " + week + "/30");
});
test("보정(주마다 변하는 교란 · 금주): 사람 안의 변화는 오탐이 30 시드 중 20 이상, 같은 주 안에서만 짝지으면 7 이하", { skip: !hasAlc }, () => {
  const person = fpDrift("alcohol", ["--within"], 30), week = fpDrift("alcohol", ["--within-week"], 30);
  assert.ok(person >= 20, "사람 안만 보면 교란이 남아야 한다 (지금 " + person + "/30)"); assert.ok(week <= 7, "같은 주 안의 오탐 " + week + "/30");
});
// 한계: 교란이 달력 주와 어긋나게 바뀌면(--drift-shift 3) 주 단위 짝짓기는 거의 못 막고, 같은 날로 줄이면(--pair-days 1) 다시 막힌다
test("한계(교란이 달력 주와 어긋남 · 금연): 주 단위 짝짓기의 오탐이 30 시드 중 20 이상, 같은 날 짝짓기는 7 이하", () => {
  const weekly = fpDrift(null, ["--drift-shift", "3", "--within-week"], 30), daily = fpDrift(null, ["--drift-shift", "3", "--within-week", "--pair-days", "1"], 30);
  assert.ok(weekly >= 20, "어긋난 교란은 주 단위로는 안 막혀야 한다 (지금 " + weekly + "/30)"); assert.ok(daily <= 7, "같은 날 짝짓기 오탐 " + daily + "/30");
});
test("한계(교란이 달력 주와 어긋남 · 금주): 주 단위 짝짓기의 오탐이 30 시드 중 20 이상, 같은 날 짝짓기는 7 이하", { skip: !hasAlc }, () => {
  const weekly = fpDrift("alcohol", ["--drift-shift", "3", "--within-week"], 30), daily = fpDrift("alcohol", ["--drift-shift", "3", "--within-week", "--pair-days", "1"], 30);
  assert.ok(weekly >= 20, "어긋난 교란은 주 단위로는 안 막혀야 한다 (지금 " + weekly + "/30)"); assert.ok(daily <= 7, "같은 날 짝짓기 오탐 " + daily + "/30");
});
