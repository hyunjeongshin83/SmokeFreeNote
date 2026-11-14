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
