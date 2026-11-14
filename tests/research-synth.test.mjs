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

// ── 금주노트 (--app alcohol): 이 저장소 옆 NonAlcoholNote 가 있을 때만 돈다 (없으면 건너뜀)
import fs from "node:fs";
import path from "node:path";
const ALC = process.env.ALC_DIR || path.join(path.dirname(script), "..", "..", "NonAlcoholNote");
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
  assert.match(r.stdout, /제외: 갈망\(0~10\) 칸이 없는 기록 [1-9]\d*건/);
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

