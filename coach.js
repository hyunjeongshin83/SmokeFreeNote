/* 메인 코칭 카드 — 기록만으로 고르는 규칙 (이 기기 안에서 계산 · 서버 없음 · 생성형 AI 없음)
 *
 * 입력은 기록의 시각(logs[].t)과 금연 시작 시각(start)뿐이고, 카드 한 장(또는 없음)을 돌려줍니다.
 * 쓰지 않는 말: 실패·재발·성공 판정·원인 추정(스트레스 등)·위험 진단. 기록이 없는 날은 실패로 세지 않습니다 (docs/DESIGN.md).
 * 규칙의 숫자(3일 · 7일 · 1.5배 · 0.7배 · 최소 2번)는 근거로 정한 값이 아니라 처음 안입니다 — 써 보고 고칩니다.
 * 브라우저에서는 window.Coach, node 에서는 require() 로 씁니다 (시험: tests/coach.test.mjs).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.Coach = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var DAY = 86400000;
  function p2(n) { return ("0" + n).slice(-2); }
  function dkey(t) { var d = new Date(t); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  // 달력 날짜 차이 (한낮 기준이라 여름시간·자정 걸침에 안 흔들림)
  function calDays(from, to) { return Math.round((new Date(dkey(to) + "T12:00:00").getTime() - new Date(dkey(from) + "T12:00:00").getTime()) / DAY); }
  function isNum(x) { return typeof x === "number" && isFinite(x); }

  var RULES = { GAP_DAYS: 3, WINDOW: 7, MIN_PREV: 2, UP: 1.5, DOWN: 0.7, MIN_DIFF: 2 };

  function pick(logs, start, now) {
    if (!isNum(start) || !isNum(now) || now < start) return null;
    var days = calDays(start, now);
    var ts = (Array.isArray(logs) ? logs : []).filter(function (l) { return l && !l.from; }).map(function (l) { return l.t; }).filter(isNum).filter(function (t) { return t >= start && t <= now; });
    // ① 기록이 며칠 없다 — 실패로 세지 않는다고 알리고 한 번만 남기게
    if (days >= RULES.GAP_DAYS) {
      var recentAny = ts.some(function (t) { return calDays(t, now) < RULES.GAP_DAYS; });
      if (!recentAny) return { id: "gap", title: "기록이 없는 날은 실패로 세지 않아요", body: "생각날 때 한 번만 남겨 보세요. 15초면 돼요.", go: "log", goText: "기록하기" };
    }
    // ② 최근 7일과 그 앞 7일을 견준다 — 두 구간이 모두 시작 뒤여야 함
    if (days >= 2 * RULES.WINDOW) {
      var recent = 0, prev = 0;
      ts.forEach(function (t) { var a = calDays(t, now); if (a < RULES.WINDOW) recent++; else if (a < 2 * RULES.WINDOW) prev++; });
      if (prev >= RULES.MIN_PREV && recent - prev >= RULES.MIN_DIFF && recent >= prev * RULES.UP)
        return { id: "up", title: "최근 7일 당김 기록이 늘었어요", body: "앞선 7일에는 " + prev + "번, 최근 7일에는 " + recent + "번 남겼어요. 어떤 상황에서 늘었는지 기록해 보면 도움이 돼요.", go: "log", goText: "기록하기", go2: "help", go2Text: "도움·상담" };
      if (prev >= RULES.MIN_PREV && prev - recent >= RULES.MIN_DIFF && recent <= prev * RULES.DOWN)
        return { id: "down", title: "최근 7일 당김 기록이 줄었어요", body: "앞선 7일에는 " + prev + "번, 최근 7일에는 " + recent + "번 남겼어요. 남긴 횟수 기준이라 기록하지 않은 날은 들어 있지 않아요. 이 흐름을 이어 가 봐요.", go: "stats", goText: "통계 보기" };
    }
    return null;
  }

  /* 주별 흐름 — 오늘로 끝나는 7일 구간 n개(가장 오래된 것부터). 시작 전 날은 세지 않고, 기록하지 않은 날은 0 이 아니라 「기록 없음」입니다(여기서는 세지 않음).
   * 5분 버티기 완료 기록(from)은 새 당김이 아니라 세지 않습니다 — 통계 · 상담자 요약과 같은 기준 (VN-150-1). */
  function weekly(logs, start, now, n) {
    n = n || 4;
    if (!isNum(start) || !isNum(now) || now < start) return [];
    var days = calDays(start, now) + 1;                       // 시작한 날부터 오늘까지의 날수
    var out = [], i;
    for (i = n - 1; i >= 0; i--) out.push({ ago: i, days: Math.max(0, Math.min(7, days - 7 * i)), crave: 0, slip: 0 });
    (Array.isArray(logs) ? logs : []).forEach(function (l) {
      if (!l || l.from || !isNum(l.t) || l.t < start || l.t > now) return;
      var ago = Math.floor(calDays(l.t, now) / 7);
      for (var k = 0; k < out.length; k++) if (out[k].ago === ago) { out[k].crave++; if (l.slip) out[k].slip++; }
    });
    return out.filter(function (w) { return w.days > 0; });
  }

  /* 코칭 이력 — 메인 카드로 보여 준 안내를 날짜별로 남긴 목록(이 기기 안, 새 키 smokefree.coach.v1). 같은 날 같은 규칙은 한 줄 · 최근 30개만.
   * 순수 함수라 저장은 호출하는 쪽이 합니다. 지난 안내의 본문(횟수)은 그때 값 그대로 남깁니다. */
  var HISTORY_MAX = 30;
  function cleanHistory(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.filter(function (x) { return x && typeof x.d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(x.d) && isNum(x.t) && typeof x.id === "string" && typeof x.title === "string" && typeof x.body === "string"; })
      .map(function (x) { return { d: x.d, t: x.t, id: x.id.slice(0, 20), title: x.title.slice(0, 80), body: x.body.slice(0, 300) }; })
      .sort(function (a, b) { return b.t - a.t; }).slice(0, HISTORY_MAX);
  }
  function addHistory(items, card, now) {
    items = cleanHistory(items);
    if (!card || !isNum(now)) return { items: items, changed: false };
    var d = dkey(now), i;
    for (i = 0; i < items.length; i++) if (items[i].d === d && items[i].id === card.id) {
      if (items[i].title === card.title && items[i].body === card.body) return { items: items, changed: false };
      items[i] = { d: d, t: now, id: card.id, title: card.title, body: card.body };           // 같은 날 숫자가 바뀌었으면 그날 한 줄만 새 값으로
      return { items: cleanHistory(items), changed: true };
    }
    items.unshift({ d: d, t: now, id: card.id, title: card.title, body: card.body });
    return { items: cleanHistory(items), changed: true };
  }
  return { RULES: RULES, pick: pick, weekly: weekly, addHistory: addHistory, cleanHistory: cleanHistory, HISTORY_MAX: HISTORY_MAX, calDays: calDays };
});
