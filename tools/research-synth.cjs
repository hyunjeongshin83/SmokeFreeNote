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
 * 한 사람 안의 변화 (--within · 2026-11-16 대표님 결정): 모아서 비교하면 「모임·회식이 잦은 사람이 원래 더 마시는 사람」이라는 사람 사이의 차이가
 *   섞인다. --within 은 같은 사람의 「있던 순간」과 「없던 순간」을 짝지어 사람마다 차이를 구한 뒤(두 쪽 모두 있는 사람만) 정밀도 가중 평균을 내고,
 *   구간은 사람 단위 부트스트랩으로 낸다. --hetero H(0~1)는 사람마다 기준 확률과 상황 빈도가 함께 달라 사람 사이 교란이 생기게 한다 (H=0 이면 난수 순서가 그대로).
 *
 * 같은 주 안에서만 짝짓기 (--within-week · 2026-11-16 대표님 결정): 한 사람 안에서도 「있던 순간」과 「없던 순간」이 다른 시기에 있으면 그 사이에 변한 것
 *   (그 주의 스트레스·모임 철)이 섞인다. --within-week 은 사람×달력 주(월~일)마다 짝을 지어 차이를 구하고 같은 가중으로 평균한다(두 쪽 모두 있는 주만).
 *   --drift D(0~1)는 합성 기록에 사람×주마다 달라지는 교란(그 주에 기준 확률과 상황 빈도가 함께 오르내림)을 넣는다 (D=0 이면 난수 순서가 그대로).
 *
 *   --pair-days N 은 짝을 짓는 구간을 N 일로 바꾼다(기본 7 · 1 이면 같은 날). 교란이 달력 주와 어긋나게 바뀔 때(--drift-shift)는 구간이 짧을수록 덜 샌다.
 *
 * 실행: node tools/research-synth.cjs [--app smoke|alcohol] [--seed 1] [--n 60] [--effect 0.25] [--boot 400] [--hetero 0] [--drift 0] [--drift-shift 0] [--within] [--within-week] [--pair-days 7]
 * 종료 코드: 양성 대조(효과를 심음)는 되찾으면 0, 음성 대조(--effect 0)는 구간이 0 을 포함하면 0, 아니면 1. 금주 폴더가 없으면 2.
 */
"use strict";
const path = require("path");
const fs = require("fs");

const sarg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? String(process.argv[i + 1]) : d; };
const arg = (k, d) => { const i = process.argv.indexOf("--" + k); return i > 0 ? Number(process.argv[i + 1]) : d; };
const APP = sarg("app", "smoke");
if (APP !== "smoke" && APP !== "alcohol") { console.error("--app 은 smoke 또는 alcohol"); process.exit(2); }
const APPDIR = APP === "smoke" ? path.join(__dirname, "..") : path.resolve(process.env.ALC_DIR || path.join(__dirname, "..", "..", "NonAlcoholNote"));
if (!fs.existsSync(path.join(APPDIR, "research.js"))) { console.error(APPDIR + "/research.js 가 없습니다 (ALC_DIR 로 알려 주세요)"); process.exit(2); }
const R = require(path.join(APPDIR, "research.js"));
const SEED = arg("seed", 1), N = arg("n", 60), EFFECT = arg("effect", 0.25), BOOT = arg("boot", 400);
const PAIR = arg("pair-days", 7);                                                // --within-week 이 짝을 짓는 구간의 일수 (기본 7 = 달력 주 · 1 = 같은 날)
const HET = arg("hetero", 0), DRIFT = arg("drift", 0), WEEK = process.argv.includes("--within-week"), WITHIN = process.argv.includes("--within") || WEEK;
// 사람마다 다른 정도(u ∈ [-HET, HET]) — 별도 난수에서 뽑아 HET=0 이면 기본 난수 순서·출력이 그대로다
const personU = (i) => (HET > 0 ? HET * (2 * rng(SEED * 7919 + i * 104729 + 13)() - 1) : 0);
// 달력 주(월~일) 번호 — records 의 date(YYYY-MM-DD)로. 1970-01-01 은 목요일이라 (일수+3)/7 이 월요일마다 바뀐다
const weekOf = (dateStr, span) => { const [y, m, d] = String(dateStr).split("-").map(Number); return Math.floor((Math.floor(Date.UTC(y, m - 1, d) / 86400000) + 3) / (span || 7)); };
// 사람×주마다 다른 정도(v ∈ [-DRIFT, DRIFT]) — 그 주에 기준 확률(+0.5v)과 상황 빈도(+0.3v)가 함께 오르내린다. DRIFT=0 이면 0
// 교란이 바뀌는 주는 기본으로 분석의 달력 주(월~일)와 같다. --drift-shift k 는 그 경계를 k 일 밀어 「짝 짓는 주」와 어긋나게 한다(실제 교란은 달력 주를 따르지 않는다)
const SHIFT = arg("drift-shift", 0);
const calWeekOfDay = (d) => { const t = new Date(T0 + (d + SHIFT) * DAY); return weekOf(t.getFullYear() + "-" + (t.getMonth() + 1) + "-" + t.getDate()); };
const weekV = (i, d) => (DRIFT > 0 ? DRIFT * (2 * rng(SEED * 6007 + i * 7919 + calWeekOfDay(d) * 104729 + 29)() - 1) : 0);
const BASE = 0.35;                                   // 기준 피움 확률 (가짜)

function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const rand = rng(SEED);
const pick = (arr) => arr[Math.floor(rand() * arr.length)];
const DAY = 86400000, T0 = new Date(2026, 8, 1, 9, 0).getTime();
const LV = ["약함", "보통", "강함"], MOOD = ["좋음", "보통", "나쁨"];
const TRIG = ["식사 후", "커피·술", "스트레스", "지루함", "아침 기상", "이동 중", "집에서", "일하다가"];
const COPE = ["물 마시기", "심호흡", "산책", "양치질", "껌·사탕", "전화 통화", "5분 버티기"];

function makeSmoke(i) {
  const u = personU(i);                                                          // u 가 크면 원래 더 피우고(기준 +0.5u) 산책도 더 자주 한다(+0.3u) → 사람 사이 교란
  const st = { kind: "cig", perDay: 10, price: 4500, start: T0, attempts: [], meds: {}, logs: [], measures: [] };
  const days = 14 + Math.floor(rand() * 60), rate = 0.5 + rand() * 2;     // 사람마다 기록 빈도가 다르다
  for (let d = 0; d < days; d++) {
    const n = Math.floor(rate * rand() * 2);
    for (let k = 0; k < n; k++) {
      const uu = u + weekV(i, d);
      const cope = COPE.filter((c) => rand() < (c === "산책" ? 0.25 + 0.3 * uu : 0.25));
      let p = BASE + 0.5 * uu;
      if (cope.includes("산책")) p -= EFFECT;                              // 심은 효과: 「산책」이 있으면 피울 확률이 내려간다
      st.logs.push({ v: 2, t: T0 + d * DAY + Math.floor(rand() * 14) * 3600000,   // 09:00~22:00 — 같은 날짜 안 (자정을 넘으면 달력 주가 어긋난다)
        lv: pick(LV), mood: pick(MOOD),
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
  const u = personU(i);                                                          // u 가 크면 원래 더 마시고(기준 +0.5u) 모임·회식도 더 잦다(+0.3u) → 사람 사이 교란
  const st = { goal: "cut", start: T0, attempts: [], logs: [], freq: 3, price: 30000 };
  const days = 14 + Math.floor(rand() * 60), rate = 0.5 + rand() * 2;
  for (let d = 0; d < days; d++) {
    const n = Math.floor(rate * rand() * 2);
    for (let k = 0; k < n; k++) {
      const t = T0 + d * DAY + Math.floor(rand() * 14) * 3600000;   // 09:00~22:00 — 같은 날짜 안 (자정을 넘으면 달력 주가 어긋난다)
      if (rand() < 0.1) { st.logs.push({ v: 1, t, kind: "urge", cups: 0, lv: "보통", mood: null, trig: [], cope: ["5분 버티기"] }); continue; }   // 5분 버티기 자동 기록: 갈망·기분·상황이 없다
      const cr = Math.floor(rand() * 11), uu = u + weekV(i, d), trig = A_TRIG.filter((x) => rand() < (x === "모임·회식" ? 0.2 + 0.3 * uu : 0.2));
      let p = BASE + 0.5 * uu;
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
// 「5분 버티기」 완료 자동 기록은 갈망·기분·상황이 비어 있는 「넘김」이라 모든 비교의 「없음」 쪽에 쌓여 가짜 연관을 만든다 → 뺀다.
// 코드북 3(금연)·2(금주) 부터는 내보내기에 auto_record 칸이 있어 그것으로 뺀다. 칸이 없는 옛 research.js 면 금주는 예전 규칙(갈망 칸이 없는 기록)을 쓰고 금연은 뺄 수 없다.
const AUTO = HEAD.indexOf("auto_record");
const SKIP = AUTO >= 0 ? (c) => c("auto_record") === 1 : (CFG.skip || null);
const rows = [];
let skipped = 0;

people.forEach((p) => {
  const t = R.buildRecords(p.st, p.pid), col = (r) => (n) => r[HEAD.indexOf(n)];
  t.slice(1).forEach((r) => {
    const c = col(r);
    if (SKIP && SKIP(c)) { skipped++; return; }
    rows.push({ pid: p.pid, wk: weekOf(c("date"), PAIR), lapse: CFG.lapse(c), x: CONTRASTS.map((k) => k.val(c)) });
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
// 비교할 짝(사람)이 없으면 차이·구간이 NaN 이 된다 — 숫자처럼 보이는 「NaN%p」 대신 말로 적는다. 숫자가 있을 때는 출력이 그대로다.
const NOPAIR = "   짝 없음 — 비교할 수 없음";
const diffText = (d, ci) => (isNaN(d) || isNaN(ci[0]) || isNaN(ci[1]) ? NOPAIR : (d * 100).toFixed(1).padStart(7) + "%p   [" + (ci[0] * 100).toFixed(1) + ", " + (ci[1] * 100).toFixed(1) + "]" + (ci[0] > 0 || ci[1] < 0 ? "  ← 구간이 0 을 포함하지 않음" : ""));
const SIGN = APP === "smoke" ? -1 : 1;                                   // 심은 효과의 방향: 금연은 산책이 피움을 낮추고, 금주는 모임·회식이 마심을 높인다
console.log("※ 합성(가짜) 기록 — 시드 " + SEED + " · 참여자 " + N + "명 · 기록 " + rows.length + "건 · 심은 효과: " + CFG.plantedText.replace(/^(.*?) ([+-]?-?[\d.]+%p)$/, (m, l, v) => l + " " + (EFFECT === 0 ? "0%p" : v)));
console.log(CFG.groupLabel.padEnd(14) + CFG.with.padStart(7) + "없음".padStart(7) + "차이".padStart(8) + "   95% 구간 (참여자 단위 부트스트랩 " + BOOT + "회)");
let planted = null, outside = 0;
CONTRASTS.forEach((c, j) => {
  const d = diff(rows, j), ci = bootCI(j);
  console.log(c.name.padEnd(14) + f(rate(rows, j, 1)).padStart(7) + f(rate(rows, j, 0)).padStart(7) + diffText(d, ci));
  if (ci[0] > 0 || ci[1] < 0) outside++;
  if (c.name === CFG.prespec) planted = { d, ci };
});
console.log("\n읽는 법: 「차이」는 " + CFG.outcome + "의 차(" + CFG.with + " − 없음)이며 효과·인과가 아니다. 구간이 0 을 포함하면 이 표본으로는 방향을 말하지 않는다.");
if (SKIP) console.log("제외: " + (AUTO >= 0 ? "자동 기록(auto_record=1)" : "갈망(0~10) 칸이 없는 기록") + " " + skipped + "건 — 「5분 버티기」 완료 자동 기록처럼 갈망·기분·상황이 비어 있어 모든 비교의 「없음」 쪽을 부풀린다(안 빼면 심지 않은 상황까지 「있음」이 높게 나온다).");
if (APP === "smoke" && AUTO >= 0) console.log("주의: 금연 앱의 손으로 적는 기록에는 「5분 버티기」 칸이 없어(그 대처는 자동 기록에만 붙는다) 자동 기록을 빼면 cope_hold5 는 비교할 수 없다 — 합성 기록의 이 칸은 앱과 다르게 아무 기록에나 붙는다.");
if (APP === "smoke" && AUTO < 0) console.log("주의: 이 research.js 에는 auto_record 칸이 없어 금연 자동 기록을 뺄 수 없다 — cope_hold5 비교는 해석하지 않는다.");
if (APP === "alcohol") console.log("대처는 비교하지 않음: 금주 앱은 「마셨어요」에서 대처 칸을 숨겨 대처가 「넘김」 기록에만 남으므로 「대처별 마심 비율」은 구조상 늘 0% 다.");
// 판정은 「미리 정한 한 가지 대비」만 본다(금연 산책 · 금주 모임·회식). 양성 대조(효과를 심음): 그 구간이 0 의 심은 방향 쪽에 있어야 한다. 음성 대조(--effect 0): 그 구간이 0 을 포함해야 한다.
// 비교를 여러 개 한꺼번에 보므로 음성 대조에서도 우연히 한두 구간이 0 을 벗어날 수 있다(구간 하나당 약 5%, 일곱 개면 하나라도일 확률 약 30%) — 그래서 아래 「다중 비교」 줄로 숫자만 알리고 판정에는 넣지 않는다.
// ── 한 사람 안의 변화 (--within): 사람마다 「있던 순간」과 「없던 순간」의 결과 비율 차를 구하고(두 쪽 모두 있는 사람만),
//    두 쪽 기록 수의 조화 가중(n_on·n_off/(n_on+n_off))으로 평균한다 — 기록이 한쪽에 쏠린 사람은 적게 센다. 구간은 사람 단위 부트스트랩(별도 난수).
//    사람 사이의 차이(원래 더 마시는 사람이 모임·회식도 잦음)는 사람마다 빼므로 섞이지 않는다.
let within = null;
if (WITHIN) {
  const wrand = rng(SEED * 31 + 977);
  const by = {}; rows.forEach((r) => (by[r.pid] = by[r.pid] || []).push(r));
  const ids = Object.keys(by);
  // 층(짝을 짓는 단위): 사람 하나(기본) 또는 사람×달력 주(--within-week). 층 안에서 「있음」과 「없음」이 모두 있어야 센다
  const strata = (rs, weekly) => { if (!weekly) return [rs]; const m = {}; rs.forEach((r) => (m[r.wk] = m[r.wk] || []).push(r)); return Object.keys(m).map((k) => m[k]); };
  const est = (people, j, weekly) => {                                            // people: 사람별 기록 묶음의 목록 (같은 사람이 여러 번 뽑혀도 따로 센다)
    let num = 0, den = 0, m = 0, k = 0;
    people.forEach((rs) => {
      let any = false;
      strata(rs, weekly).forEach((g) => {
        let a1 = 0, n1 = 0, a0 = 0, n0 = 0;
        g.forEach((r) => { if (r.x[j] === 1) { n1++; a1 += r.lapse; } else if (r.x[j] === 0) { n0++; a0 += r.lapse; } });
        if (n1 && n0) { const w = (n1 * n0) / (n1 + n0); num += w * (a1 / n1 - a0 / n0); den += w; k++; any = true; }
      });
      if (any) m++;
    });
    return { d: den ? num / den : NaN, m: m, k: k };
  };
  const table = (weekly) => CONTRASTS.map((c, j) => {
    const e = est(ids.map((id) => by[id]), j, weekly), out = [];
    for (let b = 0; b < BOOT; b++) { const gs = []; for (let i = 0; i < ids.length; i++) gs.push(by[ids[Math.floor(wrand() * ids.length)]]); const d = est(gs, j, weekly).d; if (!isNaN(d)) out.push(d); }
    out.sort((a, b) => a - b);
    return { name: c.name, d: e.d, m: e.m, k: e.k, ci: out.length ? [out[Math.floor(out.length * 0.025)], out[Math.floor(out.length * 0.975)]] : [NaN, NaN] };
  });
  const show = (tbl, weekly) => {
    console.log("\n" + (weekly ? "같은 주 안에서만 짝짓기" : "한 사람 안의 변화") + " — " + (weekly ? (PAIR === 7 ? "같은 사람·같은 달력 주(월~일) 안의" : "같은 사람·같은 " + PAIR + "일 구간 안의") : "같은 사람의") + " 「" + CFG.with + "」 순간 − 「없음」 순간 (두 쪽 모두 있는 " + (weekly ? "구간만" : "사람만") + " · 기록 수 조화 가중 평균 · 사람 단위 부트스트랩 " + BOOT + "회)");
    console.log(CFG.groupLabel.padEnd(14) + "사람 수".padStart(8) + (weekly ? "짝 수".padStart(8) : "") + "차이".padStart(8) + "   95% 구간");
    tbl.forEach((w) => console.log(w.name.padEnd(14) + String(w.m).padStart(8) + (weekly ? String(w.k).padStart(8) : "") + diffText(w.d, w.ci)));
  };
  const tPerson = table(false);
  show(tPerson, false);
  within = tPerson;
  if (WEEK) { const tWeek = table(true); show(tWeek, true); within = tWeek; }
  const wp = within.find((w) => w.name === CFG.prespec);
  if (wp) planted = { d: wp.d, ci: wp.ci };                                         // 판정은 가장 촘촘한 짝(--within-week 이면 주 안, 아니면 사람 안)의 미리 정한 한 가지 대비
  outside = within.filter((w) => w.ci[0] > 0 || w.ci[1] < 0).length;
  console.log("읽는 법: " + (WEEK ? "같은 주 안에서만 짝지어 사람 사이의 차이와 주마다 변하는 것을 뺀 값이다. 짝이 되는 주가 적으면 구간이 넓다. " : "사람 사이의 차이를 뺀 값이다. ") + "효과·인과가 아니다.");
}
const hit = planted && (SIGN < 0 ? planted.ci[1] < 0 && planted.d < 0 : planted.ci[0] > 0 && planted.d > 0);
const ok = planted && (EFFECT > 0 ? hit : planted.ci[0] <= 0 && planted.ci[1] >= 0);
console.log("다중 비교: " + CONTRASTS.length + "개 중 " + outside + "개의 구간이 0 을 벗어남" + (EFFECT > 0 ? " (심은 효과 하나가 포함됨)" : " (효과를 안 심었으니 우연 — 비교 " + CONTRASTS.length + "개 × 5% ≈ " + (CONTRASTS.length * 0.05).toFixed(2) + "개가 기대값)"));
const noPlanted = !planted || isNaN(planted.d) || isNaN(planted.ci[0]) || isNaN(planted.ci[1]);   // 판정할 대비에 짝이 없음 — 「못 되찾았다」가 아니라 「판정할 수 없다」
console.log(noPlanted ? "검증 불가: " + CFG.prespecLabel + " 대비에 비교할 짝이 없어 판정하지 않았다." : ok ? (EFFECT > 0 ? "검증: 심은 효과(" + CFG.prespecLabel + ")를 되찾았다." : "검증(음성 대조 · " + CFG.prespecLabel + " 대비만 판정): 효과를 안 심었더니 " + CFG.prespecLabel + " 구간이 0 을 포함한다.") : "검증 실패: " + (EFFECT > 0 ? "심은 효과를 되찾지 못했다." : "효과가 없는데 " + CFG.prespecLabel + " 구간이 0 을 벗어났다."));
process.exit(ok ? 0 : 1);
