#!/usr/bin/env node
/* 연구형 앱 7단계 — 합성(가짜) 기록으로 「분석·결과 한 장」의 모양을 시험한다.
 *
 * 실제 참여자 데이터는 쓰지 않습니다. 시드가 고정된 난수로 가짜 참여자를 만들고, 앱의 내보내기 코드(research.js buildRecords)를
 * 그대로 거쳐 표를 만든 뒤, 비교마다 「있음 − 없음」 비율 차를 참여자 묶음(cluster) 부트스트랩 구간과 함께 낸다.
 * 일부러 심은 효과(--effect)를 분석이 되찾는지로 파이프라인을 검증한다 — 숫자는 어떤 결론도 아니다.
 *
 * 두 앱 (결과 변수 lapse 는 앱마다 열이 다르다 — 2단계 맞춤표):
 *   --app smoke (기본)  금연노트: lapse = slip==1 (피움). 비교 = 대처(cope_*) 일곱 개. 미리 정한 대비 = 산책
 *   --app alcohol       금주노트: lapse = kind==2 (마심). 비교 = 상황(trig_*) 여덟 + 갈망 높음(≥7) + 기분 나쁨. 미리 정한 대비 = 모임·회식
 *                       **대처는 비교하지 않는다** — 금주 앱은 「마셨어요」를 고르면 대처 칸을 숨겨(NonAlcohol_app.html 의 cope: drank ? [] : …)
 *                       대처가 「넘김」 기록에만 남으므로 「대처별 마심 비율」은 구조상 늘 0% 다.
 *                       금주 research.js 는 ALC_DIR 또는 이 폴더 옆 NonAlcoholNote 에서 읽는다.
 *
 * 실행: node tools/research-synth.cjs [--app smoke|alcohol] [--seed 1] [--n 60] [--effect 0.25] [--boot 400]
 * 종료 코드: 양성 대조(효과를 심음)는 되찾으면 0, 음성 대조(--effect 0)는 구간이 0 을 포함하면 0, 아니면 1. 금주 폴더가 없으면 2.
 */
"use strict";
const path = require("path");
const fs = require("fs");

const sarg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? String(process.argv[i + 1]) : d; };
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APP = sarg("app", "smoke");
if (APP !== "smoke" && APP !== "alcohol") { console.error("--app 은 smoke 또는 alcohol"); process.exit(2); }
const APPDIR = APP === "smoke" ? path.join(__dirname, "..") : (process.env.ALC_DIR || path.join(__dirname, "..", "..", "NonAlcoholNote"));
if (!fs.existsSync(path.join(APPDIR, "research.js"))) { console.error(APPDIR + "/research.js 가 없습니다 (ALC_DIR 로 알려 주세요)"); process.exit(2); }
const R = require(path.join(APPDIR, "research.js"));
const SEED = arg("seed", 1), N = arg("n", 60), EFFECT = arg("effect", 0.25), BOOT = arg("boot", 400);
const BASE = 0.35;                                   // 기준 피움 확률 (가짜)

function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const DAY = 86400000, T0 = new Date(2026, 8, 1, 9, 0).getTime();
const LV = ["약함", "보통", "강함"], MOOD = ["좋음", "보통", "나쁨"];
const TRIG = ["식사 후", "커피·술", "스트레스", "지루함", "아침 기상", "이동 중", "집에서", "일하다가"];
const COPE = ["물 마시기", "심호흡", "산책", "양치질", "껌·사탕", "전화 통화", "5분 버티기"];

function makeSmoke(i) {
  const st = { kind: "cig", perDay: 10, price: 4500, start: T0, attempts: [], meds: {}, logs: [], measures: [] };
  const days = 14 + Math.floor(rand() * 60), rate = 0.5 + rand() * 2;     // 사람마다 기록 빈도가 다르다
  for (let d = 0; d < days; d++) {
    const n = Math.floor(rate * rand() * 2);
    for (let k = 0; k < n; k++) {
      const cope = COPE.filter(() => rand() < 0.25);
      let p = BASE;
      if (cope.includes("산책")) p -= EFFECT;                              // 심은 효과: 「산책」이 있으면 피울 확률이 내려간다
      st.logs.push({ v: 2, t: T0 + d * DAY + Math.floor(rand() * 14) * 3600000 + 8 * 3600000, lv: pick(LV), mood: pick(MOOD),
        trig: TRIG.filter(() => rand() < 0.2), other: rand() < 0.3, avail: rand() < 0.5, cope, slip: rand() < Math.max(0.02, p) });
    }
  }
  return { pid: "P-synth" + String(i).padStart(3, "0"), st };
}

// ── 금주노트: 앱이 저장하는 모양 그대로 (kind drink/urge · cr 0~10 · 마심 기록은 cope 가 빈 배열)
const A_TRIG = ["퇴근 후", "식사 중", "모임·회식", "스트레스", "외로움", "지루함", "주말", "기쁜 일"];
const A_COPE = ["물·차 마시기", "심호흡", "산책", "연락하기", "자리 피하기", "간식 먹기"];
const A_BEV = ["소주", "맥주", "와인", "막걸리", "양주", "소주(병)", "맥주(500cc)", "와인(병)", "막걸리(병)"];
function makeAlcohol(i) {
  const st = { goal: "cut", start: T0, attempts: [], logs: [], freq: 3, price: 30000 };
  const days = 14 + Math.floor(rand() * 60), rate = 0.5 + rand() * 2;
  for (let d = 0; d < days; d++) {
    const n = Math.floor(rate * rand() * 2);
    for (let k = 0; k < n; k++) {
      const t = T0 + d * DAY + Math.floor(rand() * 14) * 3600000 + 8 * 3600000;
      if (rand() < 0.1) { st.logs.push({ v: 1, t, kind: "urge", cups: 0, lv: "보통", mood: null, trig: [], cope: ["5분 버티기"] }); continue; }   // 5분 버티기 자동 기록: 갈망·기분·상황이 없다
      const cr = Math.floor(rand() * 11), trig = A_TRIG.filter(() => rand() < 0.2);
      let p = BASE;
      if (trig.includes("모임·회식")) p += EFFECT;                         // 심은 효과: 「모임·회식」이 있으면 마실 확률이 올라간다
      const drank = rand() < Math.min(0.95, p);
      st.logs.push({ v: 1, t, kind: drank ? "drink" : "urge", cups: drank ? 1 + Math.floor(rand() * 4) : 0, bev: drank ? pick(A_BEV) : null, cr,
        lv: cr >= 7 ? "강함" : cr >= 4 ? "보통" : "약함", mood: pick(MOOD), trig, cope: drank ? [] : A_COPE.filter(() => rand() < 0.25) });
    }
  }
  return { pid: "P-synth" + String(i).padStart(3, "0"), st };
}

// ── 앱별 설정: 비교 목록(이름 · 한 기록에서 0/1/null) · 결과 변수 · 미리 정한 대비
const CFG = APP === "smoke" ? {
  make: makeSmoke, groupLabel: "대처 방법", outcome: "피움 비율", with: "대처 있음", prespec: "cope_walk", prespecLabel: "산책", plantedText: "산책 " + (-EFFECT * 100) + "%p",
  lapse: (col) => (col("slip") === 1 ? 1 : 0),
  contrasts: (H) => H.filter((h) => /^cope_/.test(h) && h !== "cope_none").map((h) => ({ name: h, val: (col) => col(h) }))
} : {
  make: makeAlcohol, groupLabel: "상황 · 기분 · 갈망", outcome: "마심 비율", with: "있음", prespec: "trig_gathering", prespecLabel: "모임·회식", plantedText: "모임·회식 +" + (EFFECT * 100) + "%p",
  lapse: (col) => (col("kind") === 2 ? 1 : 0),
  // 「5분 버티기」 완료 때 앱이 자동으로 남기는 기록은 갈망(0~10)·기분·상황이 비어 있는 「넘김」이다. 그대로 두면 모든 비교의 「없음」 쪽에 쌓여 가짜 연관을 만든다 → 갈망 칸이 없는 기록은 뺀다
  skip: (col) => typeof col("craving_0_10") !== "number",
  contrasts: (H) => H.filter((h) => /^trig_/.test(h) && h !== "trig_none").map((h) => ({ name: h, val: (col) => col(h) }))
    .concat([{ name: "craving_high(≥7)", val: (col) => (typeof col("craving_0_10") === "number" ? (col("craving_0_10") >= 7 ? 1 : 0) : null) },
             { name: "mood_bad", val: (col) => (col("mood") === 3 ? 1 : col("mood") === 1 || col("mood") === 2 ? 0 : null) }])
};
const people = Array.from({ length: N }, (_, i) => CFG.make(i + 1));

// 앱의 내보내기 코드를 그대로 거친다 (records 표) — 열 이름으로 읽는다
const HEAD = R.buildRecords(people[0].st, "x")[0];
const CONTRASTS = CFG.contrasts(HEAD);
const rows = [];
let skipped = 0;
people.forEach((p) => {
  const t = R.buildRecords(p.st, p.pid), col = (r) => (n) => r[HEAD.indexOf(n)];
  t.slice(1).forEach((r) => {
    const c = col(r);
    if (CFG.skip && CFG.skip(c)) { skipped++; return; }
    rows.push({ pid: p.pid, lapse: CFG.lapse(c), x: CONTRASTS.map((k) => k.val(c)) });
  });
});

function rate(rs, j, on) { const s = rs.filter((r) => r.x[j] === on); return s.length ? s.reduce((a, r) => a + r.lapse, 0) / s.length : NaN; }
function diff(rs, j) { return rate(rs, j, 1) - rate(rs, j, 0); }                    // (있음) − (없음) 결과 비율 차
function bootCI(j) {                                                                 // 참여자 단위로 다시 뽑는다 (한 사람의 기록은 서로 닮았으므로)
  const by = {}; rows.forEach((r) => (by[r.pid] = by[r.pid] || []).push(r));
  const ids = Object.keys(by), out = [];
  for (let b = 0; b < BOOT; b++) { const rs = []; for (let i = 0; i < ids.length; i++) rs.push.apply(rs, by[ids[Math.floor(rand() * ids.length)]]); const d = diff(rs, j); if (!isNaN(d)) out.push(d); }
  out.sort((a, b) => a - b); return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}

const f = (x) => (isNaN(x) ? "  -  " : (x * 100).toFixed(1).padStart(5) + "%");
const SIGN = APP === "smoke" ? -1 : 1;                                   // 심은 효과의 방향: 금연은 산책이 피움을 낮추고, 금주는 모임·회식이 마심을 높인다
console.log("※ 합성(가짜) 기록 — 시드 " + SEED + " · 참여자 " + N + "명 · 기록 " + rows.length + "건 · 심은 효과: " + CFG.plantedText.replace(/^(.*?) ([+-]?-?[\d.]+%p)$/, (m, l, v) => l + " " + (EFFECT === 0 ? "0%p" : v)));
console.log(CFG.groupLabel.padEnd(14) + CFG.with.padStart(7) + "없음".padStart(7) + "차이".padStart(8) + "   95% 구간 (참여자 단위 부트스트랩 " + BOOT + "회)");
let planted = null, outside = 0;
CONTRASTS.forEach((c, j) => {
  const d = diff(rows, j), ci = bootCI(j);
  console.log(c.name.padEnd(14) + f(rate(rows, j, 1)).padStart(7) + f(rate(rows, j, 0)).padStart(7) + (d * 100).toFixed(1).padStart(7) + "%p   [" + (ci[0] * 100).toFixed(1) + ", " + (ci[1] * 100).toFixed(1) + "]" + (ci[0] > 0 || ci[1] < 0 ? "  ← 구간이 0 을 포함하지 않음" : ""));
  if (ci[0] > 0 || ci[1] < 0) outside++;
  if (c.name === CFG.prespec) planted = { d, ci };
});
console.log("\n읽는 법: 「차이」는 " + CFG.outcome + "의 차(" + CFG.with + " − 없음)이며 효과·인과가 아니다. 구간이 0 을 포함하면 이 표본으로는 방향을 말하지 않는다.");
if (CFG.skip) console.log("제외: 갈망(0~10) 칸이 없는 기록 " + skipped + "건 — 「5분 버티기」 완료 자동 기록처럼 갈망·기분·상황이 비어 있어 모든 비교의 「없음」 쪽을 부풀린다(안 빼면 심지 않은 상황까지 「있음」이 높게 나온다).");
if (APP === "smoke") console.log("주의: cope_hold5 는 「5분 버티기」 완료 자동 기록(늘 피우지 않음 · 갈망 단계 「보통」 기본값 · 같은 당김에 두 번째 기록)과 섞여 있어 이 비교는 해석하지 않는다 — 내보내기에는 자동 기록 표시가 없다.");
if (APP === "alcohol") console.log("대처는 비교하지 않음: 금주 앱은 「마셨어요」에서 대처 칸을 숨겨 대처가 「넘김」 기록에만 남으므로 「대처별 마심 비율」은 구조상 늘 0% 다.");
// 판정은 「미리 정한 한 가지 대비」만 본다(금연 산책 · 금주 모임·회식). 양성 대조(효과를 심음): 그 구간이 0 의 심은 방향 쪽에 있어야 한다. 음성 대조(--effect 0): 그 구간이 0 을 포함해야 한다.
// 비교를 여러 개 한꺼번에 보므로 음성 대조에서도 우연히 한두 구간이 0 을 벗어날 수 있다(구간 하나당 약 5%, 일곱 개면 하나라도일 확률 약 30%) — 그래서 아래 「다중 비교」 줄로 숫자만 알리고 판정에는 넣지 않는다.
const hit = planted && (SIGN < 0 ? planted.ci[1] < 0 && planted.d < 0 : planted.ci[0] > 0 && planted.d > 0);
const ok = planted && (EFFECT > 0 ? hit : planted.ci[0] <= 0 && planted.ci[1] >= 0);
console.log("다중 비교: " + CONTRASTS.length + "개 중 " + outside + "개의 구간이 0 을 벗어남" + (EFFECT > 0 ? " (심은 효과 하나가 포함됨)" : " (효과를 안 심었으니 우연 — 비교 " + CONTRASTS.length + "개 × 5% ≈ " + (CONTRASTS.length * 0.05).toFixed(2) + "개가 기대값)"));
console.log(ok ? (EFFECT > 0 ? "검증: 심은 효과(" + CFG.prespecLabel + ")를 되찾았다." : "검증(음성 대조 · " + CFG.prespecLabel + " 대비만 판정): 효과를 안 심었더니 " + CFG.prespecLabel + " 구간이 0 을 포함한다.") : "검증 실패: " + (EFFECT > 0 ? "심은 효과를 되찾지 못했다." : "효과가 없는데 " + CFG.prespecLabel + " 구간이 0 을 벗어났다."));
process.exit(ok ? 0 : 1);
