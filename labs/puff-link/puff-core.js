/* 퍼프 연동 뼈대 — 순수 로직 (화면·블루투스 없음)
 *
 * 실험 단계입니다. 실제 기기와는 아직 연결하지 않았고, 가짜 기기(simulateDevice)로만 돕니다.
 * 근거와 가정: docs/experiments/ecig-sensing/report.md (모든 수치는 시뮬레이션 · 보정 전)
 * 설계 요약: docs/PUFF-LINK.md
 *
 * 저장: localStorage 키 "smokefree.puffs.v1" 한 곳 — 기존 기록 키(smokefree.v1)는 건드리지 않습니다.
 * 서버로 보내지 않습니다 (CLAUDE.md §2 · 건강 데이터가 기기 밖으로 나가는 일은 대표님 결정).
 *
 * 브라우저에서는 window.PuffCore, node 에서는 require() 로 쓸 수 있습니다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PuffCore = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var KEY = "smokefree.puffs.v1";
  var MAX_PUFFS = 20000;                 // 하루 200건 기준 약 100일
  var DAY = 86400000;
  var MG_PER_S = 0.45;                   // 가정: 퍼프 1초당 기화 액상 mg (보고서 §2 · 기기마다 크게 다름)
  var LIQ_DENSITY = 1.1;                 // mg/µL

  /* ───────────── 기기 연결 계약 (실기기 구현이 맞춰야 할 모양) ─────────────
   * provider = {
   *   id, name,
   *   capabilities: { seq: bool, duration: bool, ringBuffer: bool },
   *   connect(): Promise<void>, disconnect(): void,
   *   onPuff(cb): cb({seq,t,d})            // 연결 중 실시간
   *   onLink(cb): cb({connected: bool})
   *   readSince(seq): Promise<[{seq,t,d}]> // 끊긴 동안 기기에 쌓인 것 (링버퍼)
   * }
   * 일련번호(seq)가 없으면 완전성을 잴 수 없고, 길이(d)가 없으면 니코틴 추정을 하지 않습니다.
   */

  function newState() {
    return { v: 1, device: null, puffs: [], lastSync: null, minSeq: null, maxSeq: null };
  }

  function validRecord(r) {
    return r && Number.isInteger(r.seq) && r.seq >= 0 && isFinite(r.t) && r.t > 0 &&
      (r.d === null || r.d === undefined || (isFinite(r.d) && r.d > 0 && r.d <= 30));
  }

  /* 받은 기록을 합칩니다. 같은 seq 는 한 번만 (실시간으로 받은 것을 재동기화로 또 받아도 중복되지 않음). */
  function ingest(state, records, src, now) {
    var have = {}, i, added = 0, dup = 0, bad = 0;
    for (i = 0; i < state.puffs.length; i++) have[state.puffs[i].seq] = true;
    for (i = 0; i < records.length; i++) {
      var r = records[i];
      if (!validRecord(r)) { bad++; continue; }
      if (have[r.seq]) { dup++; continue; }
      have[r.seq] = true;
      state.puffs.push({ seq: r.seq, t: r.t, d: r.d == null ? null : r.d, src: src || "live" });
      added++;
      if (state.minSeq === null || r.seq < state.minSeq) state.minSeq = r.seq;
      if (state.maxSeq === null || r.seq > state.maxSeq) state.maxSeq = r.seq;
    }
    state.puffs.sort(function (a, b) { return a.seq - b.seq; });
    if (state.puffs.length > MAX_PUFFS) {
      state.puffs = state.puffs.slice(state.puffs.length - MAX_PUFFS);
      state.minSeq = state.puffs[0].seq;
    }
    if (added) state.lastSync = now || Date.now();
    return { added: added, dup: dup, bad: bad };
  }

  /* 누락된 일련번호 구간 [[시작, 끝], …] — 받은 seq 사이의 빈 곳 */
  function gaps(state) {
    var out = [], p = state.puffs, i;
    for (i = 1; i < p.length; i++) {
      if (p[i].seq - p[i - 1].seq > 1) out.push([p[i - 1].seq + 1, p[i].seq - 1]);
    }
    return out;
  }

  function missingCount(state) {
    return gaps(state).reduce(function (s, g) { return s + (g[1] - g[0] + 1); }, 0);
  }

  /* 완전성. 끊겨 있는 동안은 숫자를 주지 않습니다 — 끊긴 사이 생긴 퍼프는 일련번호 뒤쪽에 있어 앱이 존재를 모르기 때문
   * (시뮬레이션: 끊긴 중인 순간의 39 % 에서 5 %p 넘게 과대표시). */
  function completeness(state, link) {
    if (!state.puffs.length || state.minSeq === null) return { status: "no-data", pct: null };
    if (link && link.connected === false) return { status: "pending", pct: null, lastSync: state.lastSync };
    var known = state.maxSeq - state.minSeq + 1;
    var got = state.puffs.length;
    return { status: "ok", pct: Math.round(1000 * got / known) / 10, known: known, received: got, missing: known - got };
  }

  /* 하루 요약. dayStart = 그날 0시(ms) */
  function daySummary(state, dayStart) {
    var hours = [], i;
    for (i = 0; i < 24; i++) hours.push(0);
    var count = 0, durS = 0, durN = 0;
    for (i = 0; i < state.puffs.length; i++) {
      var p = state.puffs[i];
      if (p.t >= dayStart && p.t < dayStart + DAY) {
        count++;
        hours[Math.min(23, Math.floor((p.t - dayStart) / 3600000))]++;
        if (p.d) { durS += p.d; durN++; }
      }
    }
    return { count: count, hours: hours, durS: durS, durN: durN };
  }

  /* 기화된 액상 속 니코틴 참고치(mg). 체내 흡수량이 아닙니다. 길이 없는 기록은 세지 않습니다. */
  function nicotineMg(durS, concMgMl, mgPerS) {
    if (!(concMgMl > 0) || !(durS > 0)) return null;
    var ul = (mgPerS || MG_PER_S) * durS / LIQ_DENSITY;
    return Math.round(concMgMl * ul / 1000 * 100) / 100;
  }

  /* 구간 [t0, t1) 의 누락 추정 — 받은 기록 a,b 사이가 비었고 둘 다 구간 안에 있을 때만 셉니다 */
  function missingIn(state, t0, t1) {
    var p = state.puffs, i, n = 0;
    for (i = 1; i < p.length; i++) {
      if (p[i].seq - p[i - 1].seq > 1 && p[i - 1].t >= t0 && p[i].t < t1) n += p[i].seq - p[i - 1].seq - 1;
    }
    return n;
  }

  function countIn(state, t0, t1) {
    var n = 0;
    for (var i = 0; i < state.puffs.length; i++) if (state.puffs[i].t >= t0 && state.puffs[i].t < t1) n++;
    return n;
  }

  function daysWithData(state, t0, t1) {
    var seen = {}, n = 0;
    for (var i = 0; i < state.puffs.length; i++) {
      var t = state.puffs[i].t;
      if (t >= t0 && t < t1) { var k = Math.floor((t - t0) / DAY); if (!seen[k]) { seen[k] = 1; n++; } }
    }
    return n;
  }

  /* 전주 대비 추세.
   * 시뮬레이션에서 나온 규칙: ① 이전 2주 평균과 비교 ② 문턱 20 % (10 % 는 자연 변동만으로 거짓경보 13~19 %)
   * ③ 두 기간 모두 5일 이상 기록 ④ 일련번호 누락을 보정(주 사이 완전성이 바뀐 것을 변화로 오해하지 않게).
   * 끊긴 중에는 만들지 않습니다(link.connected === false → pending). */
  function weeklyTrend(state, nowMs, link, opts) {
    opts = opts || {};
    var threshold = opts.threshold || 0.2, minDays = opts.minDays || 5;
    if (link && link.connected === false) return { status: "pending" };
    var thisT0 = nowMs - 7 * DAY, baseT0 = nowMs - 21 * DAY;
    var dThis = daysWithData(state, thisT0, nowMs), dBase = daysWithData(state, baseT0, thisT0);
    if (dThis < minDays || dBase < minDays) return { status: "insufficient", daysThis: dThis, daysBase: dBase };
    var cThis = countIn(state, thisT0, nowMs), cBase = countIn(state, baseT0, thisT0);
    var mThis = missingIn(state, thisT0, nowMs), mBase = missingIn(state, baseT0, thisT0);
    var adjThis = cThis + mThis, adjBase = cBase + mBase;        // 누락을 채워 넣은 추정치
    if (adjBase <= 0) return { status: "insufficient", daysThis: dThis, daysBase: dBase };
    var perWeekBase = adjBase / 2;
    var ratio = adjThis / perWeekBase;
    var change = ratio - 1;                                        // −0.25 = 25 % 적음
    var level = Math.abs(change) >= threshold ? (change < 0 ? "lower" : "higher") : "similar";
    return { status: "ok", level: level, change: change, thisWeek: adjThis, baselineWeek: Math.round(perWeekBase),
             rawThis: cThis, rawBase: cBase, missingThis: mThis, missingBase: mBase, threshold: threshold };
  }

  /* 화면에 쓸 문장 — 판단·단정 없이 사실과 한계만 (문구는 대표님 확인 전의 시안) */
  function trendText(t) {
    if (t.status === "pending") return "기기와 연결이 끊겨 있어요. 연결되면 다시 계산해 드릴게요.";
    if (t.status === "insufficient") return "비교하려면 최근 일주일과 그 앞 이주일에 각각 5일 이상의 기록이 필요해요.";
    var pct = Math.round(Math.abs(t.change) * 100);
    if (t.level === "similar") return "최근 7일 퍼프 수는 앞선 2주 평균과 큰 차이가 없어요. (참고치)";
    if (t.level === "lower") return "최근 7일 퍼프 수가 앞선 2주 평균보다 약 " + pct + "% 적어요. (참고치)";
    return "최근 7일 퍼프 수가 앞선 2주 평균보다 약 " + pct + "% 많아요. 갈망이 컸던 때를 기록해 두면 도움이 돼요. (참고치)";
  }

  /* 카운터만 주는 기기(퍼프 수만 누적) — 시각을 모르므로 읽은 시각에 몰아 기록하고 길이는 없음.
   * state.counter 에 마지막 값을 두고 차이만큼 만듭니다. seq 는 이어 붙입니다. */
  function ingestCounter(state, counterValue, now) {
    if (!Number.isInteger(counterValue) || counterValue < 0) return { added: 0, reset: false };
    var last = state.counter;
    state.counter = counterValue;
    if (last === undefined || last === null) return { added: 0, reset: false, first: true };
    if (counterValue < last) return { added: 0, reset: true };       // 기기 초기화·오버플로 — 차분 무의미
    var n = counterValue - last, base = state.maxSeq === null ? 0 : state.maxSeq + 1, recs = [];
    for (var i = 0; i < n; i++) recs.push({ seq: base + i, t: now, d: null });
    var r = ingest(state, recs, "counter", now);
    return { added: r.added, reset: false };
  }

  /* ───────────── 저장 ───────────── */
  function load(storage) {
    try {
      var raw = storage.getItem(KEY);
      if (!raw) return newState();
      var s = JSON.parse(raw);
      if (!s || s.v !== 1 || !Array.isArray(s.puffs)) return newState();
      return s;
    } catch (e) { return newState(); }
  }
  function save(storage, state) {
    try { storage.setItem(KEY, JSON.stringify(state)); return true; } catch (e) { return false; }
  }

  /* ───────────── 가짜 기기 ─────────────
   * 시뮬레이션(docs/experiments/ecig-sensing/sim.py)과 같은 모형을 쓰는 시험용 발생기입니다.
   * 실제 사용자 데이터가 아니며, 화면에는 항상 「가짜 기기」라고 밝혀야 합니다. */
  function rng(seed) {                                              // mulberry32
    var a = seed >>> 0;
    return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  function gauss(r) { var u = 1 - r(), v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function logn(r, median, sigma) { return Math.exp(Math.log(median) + sigma * gauss(r)); }

  function genPuffsForDay(r, dayStart, thin) {
    var out = [], t = dayStart + 7 * 3600000, end = dayStart + 23 * 3600000;
    for (;;) {
      t += logn(r, 40 * 60000, 0.6);
      if (t >= end) break;
      var n = Math.max(1, Math.floor(logn(r, 8, 0.5))), tt = t, keep = r() < thin, i;
      for (i = 0; i < n; i++) {
        var d = Math.min(10, Math.max(0.5, logn(r, 3.0, 0.35)));
        if (keep && tt < end) out.push({ t: Math.round(tt), d: Math.round(d * 10) / 10 });
        tt += d * 1000 + logn(r, 20000, 0.6);
      }
      t = tt;
    }
    return out;
  }

  function genDisconnects(r, fromMs, toMs, profile) {
    if (profile === "none") return [];
    var scale = profile === "heavy" ? 2 : 1, iv = [], days = (toMs - fromMs) / DAY, i, k;
    function poisson(l) { var L = Math.exp(-l), p = 1, n = 0; do { n++; p *= r(); } while (p > L); return n - 1; }
    var kinds = [[5, 25 * 60000, 0.8], [8, 45000, 0.7], [1.5, 15 * 60000, 0.8]];     // 멀어짐 · 무선 끊김 · 앱 중지
    for (k = 0; k < kinds.length; k++) {
      var cnt = poisson(kinds[k][0] * scale * days);
      for (i = 0; i < cnt; i++) {
        var d0 = Math.floor(r() * days), s = fromMs + d0 * DAY + (6 + r() * 17) * 3600000;
        iv.push([s, s + logn(r, kinds[k][1], kinds[k][2]) + (1000 + r() * 29000)]);
      }
    }
    iv.sort(function (a, b) { return a[0] - b[0]; });
    var m = [];
    iv.forEach(function (x) { if (m.length && x[0] <= m[m.length - 1][1]) m[m.length - 1][1] = Math.max(m[m.length - 1][1], x[1]); else m.push(x); });
    return m;
  }

  /* 가짜 기기가 [fromMs, toMs) 동안 만든 퍼프가 앱에 도착하는 모습.
   * opts: { seed, bufferK(0=저장 없음), disconnects:'none'|'normal'|'heavy', thinFrom, thin, startSeq, noDuration }
   * 반환: { records:[{seq,t,d,src}], truth, intervals, truthRecords } — records 는 앱이 받게 되는 것(seq 오름차순),
   *       truthRecords 는 기기가 실제로 만든 전부(시험용 정답) */
  function simulateDevice(fromMs, toMs, opts) {
    opts = opts || {};
    var r = rng(opts.seed || 1), K = opts.bufferK === undefined ? 64 : opts.bufferK, seq = opts.startSeq || 0;
    var all = [], day;
    for (day = fromMs; day < toMs; day += DAY) {
      var thin = (opts.thinFrom && day >= opts.thinFrom) ? (opts.thin || 1) : 1;
      genPuffsForDay(r, day, thin).forEach(function (p) { if (p.t >= fromMs && p.t < toMs) all.push(p); });
    }
    all.sort(function (a, b) { return a.t - b.t; });
    all.forEach(function (p) { p.seq = seq++; if (opts.noDuration) p.d = null; });
    var iv = genDisconnects(r, fromMs, toMs, opts.disconnects || "normal");
    function ivOf(t) { for (var i = 0; i < iv.length; i++) { if (t >= iv[i][0] && t < iv[i][1]) return i; if (iv[i][0] > t) break; } return -1; }
    var out = [], per = {};
    all.forEach(function (p) {
      var k = ivOf(p.t);
      if (k < 0) out.push({ seq: p.seq, t: p.t, d: p.d, src: "live" });
      else (per[k] = per[k] || []).push(p);
    });
    Object.keys(per).forEach(function (k) {
      var lst = per[k], kept = K > 0 ? lst.slice(Math.max(0, lst.length - K)) : [];     // 가득 차면 옛것부터 덮어씀
      if (iv[k][1] > toMs) return;                                                      // 아직 재연결 전 — 앱은 모름
      kept.forEach(function (p) { out.push({ seq: p.seq, t: p.t, d: p.d, src: "resync" }); });
    });
    out.sort(function (a, b) { return a.seq - b.seq; });
    return { records: out, truth: all.length, intervals: iv, truthRecords: all };
  }

  return { KEY: KEY, MAX_PUFFS: MAX_PUFFS, DAY: DAY, newState: newState, ingest: ingest, gaps: gaps, missingCount: missingCount,
           completeness: completeness, daySummary: daySummary, nicotineMg: nicotineMg, weeklyTrend: weeklyTrend, trendText: trendText,
           ingestCounter: ingestCounter, load: load, save: save, simulateDevice: simulateDevice, validRecord: validRecord };
});
