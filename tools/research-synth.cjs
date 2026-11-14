#!/usr/bin/env node
/* 연구형 앱 7단계 — 합성(가짜) 기록으로 「분석·결과 한 장」의 모양을 시험한다.
 *
 * 실제 참여자 데이터는 쓰지 않습니다. 시드가 고정된 난수로 가짜 참여자를 만들고, 앱의 내보내기 코드(research.js buildRecords)를
 * 그대로 거쳐 표를 만든 뒤, 「대처 방법별 피움 비율」을 참여자 묶음(cluster) 부트스트랩 구간과 함께 낸다.
 * 일부러 심은 효과(--effect)를 분석이 되찾는지로 파이프라인을 검증한다 — 숫자는 어떤 결론도 아니다.
 *
 * 실행: node tools/research-synth.cjs [--seed 1] [--n 60] [--effect 0.25] [--boot 400]
 * 종료 코드: 양성 대조(효과를 심음)는 되찾으면 0, 음성 대조(--effect 0)는 구간이 0 을 포함하면 0, 아니면 1.
 */
"use strict";
const path = require("path");
const R = require(path.join(__dirname, "..", "research.js"));

const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const SEED = arg("seed", 1), N = arg("n", 60), EFFECT = arg("effect", 0.25), BOOT = arg("boot", 400);
const BASE = 0.35;                                   // 기준 피움 확률 (가짜)

function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const DAY = 86400000, T0 = new Date(2026, 8, 1, 9, 0).getTime();
const LV = ["약함", "보통", "강함"], MOOD = ["좋음", "보통", "나쁨"];
const TRIG = ["식사 후", "커피·술", "스트레스", "지루함", "아침 기상", "이동 중", "집에서", "일하다가"];
const COPE = ["물 마시기", "심호흡", "산책", "양치질", "껌·사탕", "전화 통화", "5분 버티기"];

function makeParticipant(i) {
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

const people = Array.from({ length: N }, (_, i) => makeParticipant(i + 1));

// 앱의 내보내기 코드를 그대로 거친다 (records 표) — 열 이름으로 읽는다
const COPEHEAD = R.buildRecords(people[0].st, "x")[0].filter((h) => /^cope_/.test(h) && h !== "cope_none");
const rows = [];
people.forEach((p) => {
  const t = R.buildRecords(p.st, p.pid), H = t[0], col = (r, n) => r[H.indexOf(n)];
  t.slice(1).forEach((r) => rows.push({ pid: p.pid, lapse: col(r, "slip") === 1 ? 1 : 0, cope: COPEHEAD.map((c) => col(r, c)) }));
});

function rate(rs, j, on) { const s = rs.filter((r) => r.cope[j] === on); return s.length ? s.reduce((a, r) => a + r.lapse, 0) / s.length : NaN; }
function diff(rs, j) { return rate(rs, j, 1) - rate(rs, j, 0); }                    // (대처 있음) − (없음) 피움 비율 차
function bootCI(j) {                                                                 // 참여자 단위로 다시 뽑는다 (한 사람의 기록은 서로 닮았으므로)
  const by = {}; rows.forEach((r) => (by[r.pid] = by[r.pid] || []).push(r));
  const ids = Object.keys(by), out = [];
  for (let b = 0; b < BOOT; b++) { const rs = []; for (let i = 0; i < ids.length; i++) rs.push.apply(rs, by[ids[Math.floor(rand() * ids.length)]]); const d = diff(rs, j); if (!isNaN(d)) out.push(d); }
  out.sort((a, b) => a - b); return [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]];
}

const f = (x) => (isNaN(x) ? "  -  " : (x * 100).toFixed(1).padStart(5) + "%");
console.log("※ 합성(가짜) 기록 — 시드 " + SEED + " · 참여자 " + N + "명 · 기록 " + rows.length + "건 · 심은 효과: 산책 " + (-EFFECT * 100) + "%p");
console.log("대처 방법".padEnd(14) + "있음".padStart(7) + "없음".padStart(7) + "차이".padStart(8) + "   95% 구간 (참여자 단위 부트스트랩 " + BOOT + "회)");
let planted = null, outside = 0;
COPEHEAD.forEach((c, j) => {
  const d = diff(rows, j), ci = bootCI(j);
  console.log(c.padEnd(14) + f(rate(rows, j, 1)).padStart(7) + f(rate(rows, j, 0)).padStart(7) + (d * 100).toFixed(1).padStart(7) + "%p   [" + (ci[0] * 100).toFixed(1) + ", " + (ci[1] * 100).toFixed(1) + "]" + (ci[0] > 0 || ci[1] < 0 ? "  ← 구간이 0 을 포함하지 않음" : ""));
  if (ci[0] > 0 || ci[1] < 0) outside++;
  if (c === "cope_walk") planted = { d, ci };
});
console.log("\n읽는 법: 「차이」는 피움 비율의 차(대처 있음 − 없음)이며 효과·인과가 아니다. 구간이 0 을 포함하면 이 표본으로는 방향을 말하지 않는다.");
// 판정은 「미리 정한 한 가지 대비」(산책)만 본다. 양성 대조(효과를 심음): 산책 구간이 0 아래에 있어야 한다. 음성 대조(--effect 0): 산책 구간이 0 을 포함해야 한다.
// 일곱 대처를 한꺼번에 보므로 음성 대조에서도 우연히 한두 구간이 0 을 벗어날 수 있다(구간 하나당 약 5% → 일곱 개 중 하나라도일 확률 약 30%) — 그래서 아래 「다중 비교」 줄로 숫자만 알리고 판정에는 넣지 않는다.
const ok = planted && (EFFECT > 0 ? planted.ci[1] < 0 && planted.d < 0 : planted.ci[0] <= 0 && planted.ci[1] >= 0);
console.log("다중 비교: " + COPEHEAD.length + "개 중 " + outside + "개의 구간이 0 을 벗어남" + (EFFECT > 0 ? " (심은 효과 하나가 포함됨)" : " (효과를 안 심었으니 우연 — 비교 " + COPEHEAD.length + "개 × 5% ≈ " + (COPEHEAD.length * 0.05).toFixed(2) + "개가 기대값)"));
console.log(ok ? (EFFECT > 0 ? "검증: 심은 효과(산책)를 되찾았다." : "검증(음성 대조 · 산책 대비만 판정): 효과를 안 심었더니 산책 구간이 0 을 포함한다.") : "검증 실패: " + (EFFECT > 0 ? "심은 효과를 되찾지 못했다." : "효과가 없는데 산책 구간이 0 을 벗어났다."));
process.exit(ok ? 0 : 1);
