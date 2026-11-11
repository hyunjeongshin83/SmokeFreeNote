/* 연구용 Drive 저장 — 기록을 수치로 바꿔 엑셀(.xlsx)로 만들고, 참여자 본인의 Google Drive 에 올립니다.
 *
 * 기본값은 꺼짐입니다 (research-config.js). 꺼져 있거나 설정이 비어 있으면 이 파일은 아무 데도 접속하지 않습니다.
 * 켜져도 참여자가 동의 화면에서 직접 켜야 하고, 켜기 전에는 Google 스크립트도 불러오지 않습니다.
 *
 * 순수 로직(수치화 · 엑셀 만들기)은 화면 없이 node 에서도 돕니다 — tests/research.test.mjs.
 * 저장: localStorage 키 "smokefree.research.v1" 한 곳. 기존 기록 키(smokefree.v1)는 건드리지 않습니다.
 * 토큰은 메모리에만 둡니다 (저장하지 않음). 이름·연락처·「나의 금연 이유」 같은 글은 파일에 넣지 않습니다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(root);
  else root.Research = factory(root);
})(typeof window !== "undefined" ? window : globalThis, function (root) {
  "use strict";

  var CODEBOOK_VERSION = "1";
  var DAY = 86400000;
  var MAX_DAILY_DAYS = 5000;   // 일별 시트의 최대 날수(약 13년). 넘으면 오래된 날부터 빠지고 codebook 에 적는다 — 기록(records) 시트는 줄이지 않는다
  var STORE_KEY = "smokefree.research.v1";
  var SCOPE = "https://www.googleapis.com/auth/drive.file";
  var XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  // ── 코드 정의 (앱 index.html 의 LV · MOOD · TRIG · COPE 와 같은 순서) ──────────────────────
  var LV = ["약함", "보통", "강함"];
  var MOOD = ["좋음", "보통", "나쁨"];
  var TRIG = [
    ["trig_after_meal", "식사 후"], ["trig_coffee_alcohol", "커피·술"], ["trig_stress", "스트레스"], ["trig_boredom", "지루함"],
    ["trig_wakeup", "아침 기상"], ["trig_commute", "이동 중"], ["trig_home", "집에서"], ["trig_work", "일하다가"]
  ];
  var COPE = [
    ["cope_water", "물 마시기"], ["cope_breath", "심호흡"], ["cope_walk", "산책"], ["cope_brush", "양치질"],
    ["cope_gum", "껌·사탕"], ["cope_call", "전화 통화"], ["cope_hold5", "5분 버티기"]
  ];
  var KIND = { cig: 1, hnb: 2, liquid: 3 };
  // 측정값 종류 코드
  var MTYPE = { co_ppm: 1, puffs_week: 2, test_kit: 3, test_cotinine: 4, test_co_ppm: 5, sticker_use: 6, steps: 7, hr_avg: 8, sleep_min: 9 };
  var KIT = { neg: 0, faint: 1, pos: 2 };

  // ── 날짜 도우미 (앱의 dkey 와 같은 규칙: 기기의 현지 시각) ─────────────────────────────────
  function p2(n) { return ("0" + n).slice(-2); }
  function dkey(t) { var d = new Date(t); return d.getFullYear() + "-" + p2(d.getMonth() + 1) + "-" + p2(d.getDate()); }
  // 달력 날짜 차이 (시각이 아니라 날짜로 센다 — 일별 시트의 day_index 와 같은 기준)
  function calDays(from, to) { return Math.round((new Date(dkey(to) + "T12:00:00").getTime() - new Date(dkey(from) + "T12:00:00").getTime()) / DAY); }
  function isNum(x) { return typeof x === "number" && isFinite(x); }
  function has(list, x) { return list.indexOf(x) >= 0; }
  function bin(x) { return x === true ? 1 : x === false ? 0 : ""; }

  // ── 시도(attempt) 찾기 ─────────────────────────────────────────────────────────────────
  function attemptOf(st, t) {
    var at = st.attempts || [], i;
    for (i = 0; i < at.length; i++) { if (isNum(at[i].start) && isNum(at[i].end) && t >= at[i].start && t <= at[i].end) return { n: i + 1, start: at[i].start }; }
    if (isNum(st.start) && t >= st.start) return { n: at.length + 1, start: st.start };
    return null;
  }

  // ── 표 만들기 ──────────────────────────────────────────────────────────────────────────
  function recordsHeader() {
    var h = ["participant_id", "rec_no", "date", "hour", "weekday", "attempt_no", "day_of_attempt", "craving_level", "mood"];
    TRIG.forEach(function (t) { h.push(t[0]); }); h.push("trig_none");
    h.push("others_smoking", "cig_available");
    COPE.forEach(function (c) { h.push(c[0]); });
    h.push("slip", "record_version");
    return h;
  }

  function buildRecords(st, pid) {
    var logs = (st.logs || []).filter(function (r) { return r && isNum(r.t); }).slice().sort(function (a, b) { return a.t - b.t; });
    var rows = [recordsHeader()];
    logs.forEach(function (r, i) {
      var d = new Date(r.t), a = attemptOf(st, r.t), trig = Array.isArray(r.trig) ? r.trig : [], cope = Array.isArray(r.cope) ? r.cope : [];
      var row = [pid, i + 1, dkey(r.t), d.getHours(), d.getDay(), a ? a.n : "", a ? calDays(a.start, r.t) : "",
        LV.indexOf(r.lv) >= 0 ? LV.indexOf(r.lv) + 1 : "", MOOD.indexOf(r.mood) >= 0 ? MOOD.indexOf(r.mood) + 1 : ""];
      var any = 0;
      TRIG.forEach(function (t) { var on = has(trig, t[1]) ? 1 : 0; any += on; row.push(on); });
      row.push(any ? 0 : 1);
      row.push(bin(r.other), bin(r.avail));
      COPE.forEach(function (c) { row.push(has(cope, c[1]) ? 1 : 0); });
      row.push(r.slip ? 1 : 0, r.v === 2 ? 2 : 1);
      rows.push(row);
    });
    return rows;
  }

  function measureRows(st) {
    var out = [];
    (st.measures || []).forEach(function (m) {
      if (!m || !isNum(m.t)) return;
      var v = m.v, add = function (type, val) { if (isNum(val)) out.push([m.t, MTYPE[type], val]); };
      if (m.kind === "co") add("co_ppm", v);
      else if (m.kind === "puffs") add("puffs_week", v);
      else if (m.kind === "use") add("sticker_use", 1);
      else if (m.kind === "health" && v && typeof v === "object") { add("steps", v.steps); add("hr_avg", v.hrAvg); add("sleep_min", v.sleepMin); }
      else if (m.kind === "test" && v && typeof v === "object") {
        // 검사한 날은 사용자가 고른 날짜 문자열 그대로 (시간대가 바뀌어도 하루가 밀리지 않게)
        var t = m.t, date = typeof v.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.date) ? v.date : null;
        if (v.type === "kit" && v.res in KIT) out.push([t, MTYPE.test_kit, KIT[v.res], date]);
        else if (v.type === "cot") { if (isNum(v.val)) out.push([t, MTYPE.test_cotinine, v.val, date]); }
        else if (v.type === "co") { if (isNum(v.val)) out.push([t, MTYPE.test_co_ppm, v.val, date]); }
      }
    });
    return out.sort(function (a, b) { return a[0] - b[0]; });
  }

  function buildMeasures(st, pid) {
    var rows = [["participant_id", "date", "hour", "measure_type", "value"]];
    measureRows(st).forEach(function (m) {
      var d = new Date(m[0]);
      rows.push([pid, m[3] || dkey(m[0]), m[3] ? "" : d.getHours(), m[1], m[2]]);
    });
    return rows;
  }

  function buildDaily(st, pid, now) {
    var logs = (st.logs || []).filter(function (r) { return r && isNum(r.t); });
    var uses = (st.measures || []).filter(function (m) { return m && m.kind === "use" && isNum(m.t); });
    var meds = st.meds || {};
    var rows = [["participant_id", "date", "day_index", "n_cravings", "n_slips", "n_held", "craving_level_mean", "med_taken", "n_sticker_use"]];
    var times = logs.map(function (r) { return r.t; }).concat(uses.map(function (m) { return m.t; }));
    if (isNum(st.start)) times.push(st.start);
    (st.attempts || []).forEach(function (a) { if (a && isNum(a.start)) times.push(a.start); });   // 기록 없이 끝난 앞 시도의 날들도 일별에 남긴다
    if (!times.length) return rows;
    var first = Math.min.apply(null, times), last = Math.max(Math.max.apply(null, times), now || Date.now());
    if (calDays(first, last) > MAX_DAILY_DAYS - 1) first = new Date(dkey(last) + "T12:00:00").getTime() - (MAX_DAILY_DAYS - 1) * DAY;   // 오래된 쪽을 자른다 (최근·오늘은 항상 남김)
    var by = {}, bu = {};
    logs.forEach(function (r) { var k = dkey(r.t); (by[k] = by[k] || []).push(r); });
    uses.forEach(function (m) { var k = dkey(m.t); bu[k] = (bu[k] || 0) + 1; });
    var startKey = isNum(st.start) ? dkey(st.start) : null, idx = 0;
    var t = new Date(dkey(first) + "T12:00:00").getTime(), guard = 0;
    while (dkey(t) <= dkey(last) && guard++ < MAX_DAILY_DAYS + 2) {
      var k = dkey(t), L = by[k] || [], lv = L.map(function (r) { return LV.indexOf(r.lv) + 1; }).filter(function (x) { return x > 0; });
      var slips = L.filter(function (r) { return r.slip; }).length;
      rows.push([pid, k, startKey && k >= startKey ? calDays(st.start, new Date(k + "T12:00:00").getTime()) : "",
        L.length, slips, L.length - slips, lv.length ? Math.round(lv.reduce(function (a, b) { return a + b; }, 0) / lv.length * 100) / 100 : "", meds[k] ? 1 : 0, bu[k] || 0]);
      idx++; t += DAY;
    }
    return rows;
  }

  function buildParticipant(st, pid, now) {
    return [["participant_id", "product_kind", "baseline_per_day", "pack_price_won", "quit_start_date", "n_attempts", "exported_at_utc", "codebook_version"],
      [pid, KIND[st.kind] || 1, isNum(st.perDay) ? st.perDay : "", isNum(st.price) ? st.price : "", isNum(st.start) ? dkey(st.start) : "",
        (st.attempts || []).length + (isNum(st.start) ? 1 : 0), new Date(now || Date.now()).toISOString(), CODEBOOK_VERSION]];
  }

  function buildCodebook() {
    var R = [["sheet", "column", "meaning", "values"]];
    var s = function (sheet, col, meaning, values) { R.push([sheet, col, meaning, values || ""]); };
    s("participant", "participant_id", "연구용 무작위 번호 (이름·연락처와 무관). 이 기기에서 처음 켤 때 만들어짐", "P-xxxxxxxx");
    s("participant", "product_kind", "피우는 것", "1 일반 담배 · 2 궐련형 전자담배 · 3 액상 전자담배");
    s("participant", "baseline_per_day", "하루 평소 양 (개비·스틱·퍼프)", "숫자");
    s("participant", "pack_price_won", "한 갑 또는 액상·팟 가격(원)", "숫자");
    s("participant", "quit_start_date", "현재 시도의 금연 시작일", "YYYY-MM-DD");
    s("participant", "n_attempts", "지금까지의 시도 횟수 (현재 시도 포함)", "숫자");
    s("records", "rec_no", "기록 순번 (시간순)", "1부터");
    s("records", "date · hour · weekday", "기록한 날짜 · 시(0~23) · 요일", "weekday 0 일요일 … 6 토요일");
    s("records", "attempt_no · day_of_attempt", "몇 번째 시도인지 · 그 시도 시작일부터 달력으로 며칠째", "숫자 (시작한 날 0)");
    s("records", "craving_level", "얼마나 당겼나", "1 약함 · 2 보통 · 3 강함 · 빈칸 미입력");
    s("records", "mood", "그때 기분", "1 좋음 · 2 보통 · 3 나쁨 · 빈칸 미입력");
    TRIG.forEach(function (t) { s("records", t[0], "상황: " + t[1] + " (여러 개 가능)", "1 해당 · 0 아님"); });
    s("records", "trig_none", "상황을 하나도 고르지 않음", "1 · 0");
    s("records", "others_smoking", "옆에 담배 피우는 사람이 있었나", "1 예 · 0 아니오 · 빈칸 미입력");
    s("records", "cig_available", "담배를 바로 구할 수 있었나", "1 예 · 0 아니오 · 빈칸 미입력");
    COPE.forEach(function (c) { s("records", c[0], "넘긴 방법: " + c[1] + " (여러 개 가능)", "1 해당 · 0 아님"); });
    s("records", "slip", "결국 피웠나", "1 예 · 0 아니오");
    s("records", "record_version", "앱의 기록 형식", "2 현재 · 1 옛 기록");
    s("measures", "measure_type", "측정값 종류", "1 날숨 CO(ppm) · 2 주간 퍼프·스틱 · 3 자가 키트 · 4 코티닌 수치 · 5 의료기관 CO(ppm) · 6 스티커로 적은 사용 1회 · 7 걸음 · 8 평균 심박 · 9 수면(분)");
    s("measures", "value", "값", "키트: 0 음성 · 1 희미한 줄 · 2 양성. 나머지는 수치");
    s("daily", "day_index", "금연 시작일 기준 며칠째", "0 이 시작일. 시작 전은 빈칸");
    s("daily", "(범위)", "일별 시트는 가장 이른 기록·시작일·앞 시도 시작일부터 오늘까지. " + MAX_DAILY_DAYS + "일을 넘으면 가장 최근 " + MAX_DAILY_DAYS + "일만 담는다 (records 시트는 줄이지 않음)", "");
    s("daily", "n_cravings · n_slips · n_held", "그날 기록 수 · 피운 기록 수 · 넘긴 기록 수", "숫자");
    s("daily", "craving_level_mean", "그날 갈망 세기 평균 (1~3)", "숫자 · 기록 없으면 빈칸");
    s("daily", "med_taken", "그날 약 복용 표시", "1 · 0");
    s("daily", "n_sticker_use", "그날 스티커로 적은 사용 횟수", "숫자");
    s("(제외)", "이름·연락처·나의 금연 이유·검사 장소·기기 이름·사진", "자유로 적은 글과 사진은 파일에 넣지 않습니다", "");
    return R;
  }

  function buildSheets(st, pid, now) {
    return [
      { name: "participant", rows: buildParticipant(st, pid, now) },
      { name: "records", rows: buildRecords(st, pid) },
      { name: "measures", rows: buildMeasures(st, pid) },
      { name: "daily", rows: buildDaily(st, pid, now) },
      { name: "codebook", rows: buildCodebook() }
    ];
  }

  // ── .xlsx 만들기 (외부 라이브러리 없이: 압축 없는 zip + 최소 SpreadsheetML) ─────────────────
  var CRC = (function () { var t = [], c, n, k; for (n = 0; n < 256; n++) { c = n; for (k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  function crc32(b) { var c = 0xFFFFFFFF, i; for (i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; }
  function utf8(s) { return new TextEncoder().encode(s); }
  function esc(s) { return String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
  function colName(i) { var s = ""; i++; while (i > 0) { var m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; }

  function sheetXml(rows) {
    var out = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>'];
    rows.forEach(function (row, r) {
      out.push('<row r="' + (r + 1) + '">');
      row.forEach(function (v, c) {
        if (v === "" || v == null) return;
        var ref = colName(c) + (r + 1);
        if (typeof v === "number") { if (isFinite(v)) out.push('<c r="' + ref + '"><v>' + v + "</v></c>"); }
        else out.push('<c r="' + ref + '" t="inlineStr"><is><t xml:space="preserve">' + esc(v) + "</t></is></c>");
      });
      out.push("</row>");
    });
    out.push("</sheetData></worksheet>");
    return out.join("");
  }

  function zipStore(files) {
    var parts = [], central = [], offset = 0;
    files.forEach(function (f) {
      var name = utf8(f.name), data = f.data, crc = crc32(data);
      var lh = new DataView(new ArrayBuffer(30)); lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint16(10, 0, true); lh.setUint16(12, 0x0021, true); lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true);
      lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      var ch = new DataView(new ArrayBuffer(46)); ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, 0, true); ch.setUint16(12, 0, true); ch.setUint16(14, 0x0021, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
      ch.setUint16(28, name.length, true); ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + data.length;
    });
    var cdSize = central.reduce(function (a, b) { return a + b.length; }, 0);
    var end = new DataView(new ArrayBuffer(22)); end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
    var all = parts.concat(central, [new Uint8Array(end.buffer)]), total = all.reduce(function (a, b) { return a + b.length; }, 0), out = new Uint8Array(total), p = 0;
    all.forEach(function (b) { out.set(b, p); p += b.length; });
    return out;
  }

  function toXlsx(sheets) {
    var ct = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>';
    var wb = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>';
    var rels = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">';
    var files = [];
    sheets.forEach(function (s, i) {
      var n = i + 1;
      ct += '<Override PartName="/xl/worksheets/sheet' + n + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>';
      wb += '<sheet name="' + esc(s.name) + '" sheetId="' + n + '" r:id="rId' + n + '"/>';
      rels += '<Relationship Id="rId' + n + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + n + '.xml"/>';
      files.push({ name: "xl/worksheets/sheet" + n + ".xml", data: utf8(sheetXml(s.rows)) });
    });
    ct += "</Types>"; wb += "</sheets></workbook>"; rels += "</Relationships>";
    var root0 = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>';
    return zipStore([{ name: "[Content_Types].xml", data: utf8(ct) }, { name: "_rels/.rels", data: utf8(root0) }, { name: "xl/workbook.xml", data: utf8(wb) }, { name: "xl/_rels/workbook.xml.rels", data: utf8(rels) }].concat(files));
  }

  function newPid() {
    var a = new Uint8Array(4); (root.crypto || {}).getRandomValues ? root.crypto.getRandomValues(a) : a.forEach(function (_, i) { a[i] = Math.floor(Math.random() * 256); });
    return "P-" + Array.prototype.map.call(a, function (b) { return ("0" + b.toString(16)).slice(-2); }).join("");
  }

  // ── 설정 · 동의 상태 ──────────────────────────────────────────────────────────────────
  // 연구실 수신 주소 — Google Apps Script 웹앱(/macros/s/…/exec) 하나만 받는다. 다른 주소는 없는 것으로 본다 (docs/RESEARCH-LAB.md)
  function labOk(u) { return typeof u === "string" && /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(u); }
  function config() {
    var c = root.SF_RESEARCH_CONFIG || {};
    var lab = labOk(c.labUrl);
    var ready = c.enabled === true && (lab || (typeof c.clientId === "string" && c.clientId.length > 10)) && typeof c.consentText === "string" && c.consentText.trim().length > 0 && typeof c.consentVersion === "string" && c.consentVersion.length > 0;
    return { enabled: c.enabled === true, ready: ready, clientId: c.clientId || "", consentText: c.consentText || "", consentVersion: c.consentVersion || "", irb: c.irb || "", lab: lab, labUrl: lab ? c.labUrl : "" };
  }
  function readState() { try { return JSON.parse(root.localStorage.getItem(STORE_KEY)) || {}; } catch (e) { return {}; } }
  function writeState(s) { try { root.localStorage.setItem(STORE_KEY, JSON.stringify(s)); return true; } catch (e) { return false; } }

  // ── Google 로그인(토큰) · Drive 업로드 ─────────────────────────────────────────────────
  var token = null, tokenExp = 0, tc = null, gsiLoading = null;
  // 세대(epoch): 끄기·지우기를 하면 올라가고, 그 전에 시작한 로그인·조회·업로드는 이 값이 달라져 모두 멈춥니다.
  var epoch = 0, timer = null;
  function stopErr() { var e = new Error("stopped"); e.stopped = true; return e; }
  // 지금 보내도 되는 상태인가: 설정이 준비됐고, 참여자가 켜 두었고, **지금 설정의 동의 문구 버전**에 동의한 경우만.
  function consented() {
    var c = config(), s = readState();
    return c.ready && s.on === true && s.consentVersion === c.consentVersion;
  }
  function revokeToken(t) { try { if (t && root.google && root.google.accounts && root.google.accounts.oauth2) root.google.accounts.oauth2.revoke(t, function () {}); } catch (e) {} }
  function loadGsi() {
    if (root.google && root.google.accounts && root.google.accounts.oauth2) return Promise.resolve();
    if (gsiLoading) return gsiLoading;
    gsiLoading = new Promise(function (res, rej) {
      var s = root.document.createElement("script"); s.src = "https://accounts.google.com/gsi/client"; s.async = true;
      s.onload = function () { res(); }; s.onerror = function () { gsiLoading = null; rej(new Error("gsi_load")); };
      root.document.head.appendChild(s);
    });
    return gsiLoading;
  }
  // interactive=true 는 사용자가 단추를 누른 직후에만 (팝업이 막히지 않게). false 는 조용히 시도하고, 안 되면 거절됩니다.
  function getToken(interactive) {
    var c = config();
    if (token && Date.now() < tokenExp) return Promise.resolve(token);
    var my = epoch;
    return loadGsi().then(function () {
      if (my !== epoch) throw stopErr();
      return new Promise(function (res, rej) {
        tc = root.google.accounts.oauth2.initTokenClient({
          client_id: c.clientId, scope: SCOPE,
          callback: function (r) { if (my !== epoch) { if (r && r.access_token) revokeToken(r.access_token); rej(stopErr()); return; } if (r && r.access_token) { token = r.access_token; tokenExp = Date.now() + Math.max(60, (r.expires_in || 3600) - 120) * 1000; res(token); } else rej(new Error((r && r.error) || "no_token")); },
          error_callback: function (e) { rej(new Error((e && e.type) || "auth_error")); }
        });
        tc.requestAccessToken({ prompt: interactive ? "consent" : "" });
      });
    });
  }
  // 진행 중인 요청: 끄기·지우기·다른 탭의 철회가 오면 모두 abort 해서 남은 전송을 실제로 멈춘다 (이미 서버에 닿은 것은 회수할 수 없음)
  var inflight = [];
  // ── 전송 관문 ──────────────────────────────────────────────────────────────────────────────
  // Drive 로 나가는 모든 요청은 반드시 여기를 지납니다. 엑셀 만들기 같은 동기 작업이 모두 끝난 **fetch 직전 이 줄**에서
  // ① 작업 세대(gate.epoch)가 그대로인지 ② (건강 정보를 싣는 요청이면) 지금 이 순간 저장소에 적힌 동의가 유효한지를 마지막으로 확인합니다.
  // 앞에서 확인한 결과를 믿지 않습니다 — 다른 탭이 그 사이 바꿨을 수 있습니다. 새 전송 경로를 만들면 gate 를 반드시 넘기세요.
  function api(url, opts, tk, gate) {
    opts = opts || {}; opts.headers = Object.assign({ Authorization: "Bearer " + tk }, opts.headers || {});
    if (gate && (gate.epoch !== epoch || (gate.consent && !consented()))) return Promise.reject(stopErr());
    var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (ac) { opts.signal = ac.signal; inflight.push(ac); }
    var rm = function () { var i = inflight.indexOf(ac); if (i >= 0) inflight.splice(i, 1); };
    return (root.fetch)(url, opts).then(function (r) { rm(); if (!r.ok) { if (r.status === 401) { token = null; tokenExp = 0; }   // 구글이 거절한 토큰은 버린다 — 다음 「지금 저장」이 새로 로그인하게
      var e = new Error("drive_" + r.status); e.status = r.status; throw e; } return r; }, function (e) { rm(); throw e; });
  }
  // ── 연구실로 보내기 (labUrl 이 있을 때만) — 참여자 Google 로그인 없이 연구실 수신 주소로 표를 보낸다. 세대 · 동의 관문은 api() 와 같다 ──
  // needConsent=false 는 「지우기 요청」용 — 동의를 거두는 쪽이므로 동의가 꺼져 있어도 보낼 수 있다(세대만 확인).
  function labPost(body, my, needConsent) {
    var c = config();
    if (!c.lab) return Promise.reject(new Error("no_lab"));
    if (my !== epoch || (needConsent && !consented())) return Promise.reject(stopErr());
    var ac = typeof AbortController !== "undefined" ? new AbortController() : null;
    var opts = { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(body), credentials: "omit", referrerPolicy: "no-referrer", redirect: "follow" };
    if (ac) { opts.signal = ac.signal; inflight.push(ac); }
    var rm = function () { var i = inflight.indexOf(ac); if (i >= 0) inflight.splice(i, 1); };
    return (root.fetch)(c.labUrl, opts).then(function (r) { rm(); if (!r.ok) throw new Error("lab_" + r.status); return r.json(); }, function (e) { rm(); throw e; })
      .then(function (j) { if (!j || j.ok !== true) throw new Error("lab_" + String(j && j.error || "bad").slice(0, 20)); return j; });
  }
  function labPut(sheets, pid, my) {
    var o = {}; sheets.forEach(function (sh) { o[sh.name] = sh.rows; });
    return labPost({ action: "put", pid: pid, consentVersion: config().consentVersion, codebookVersion: CODEBOOK_VERSION, sheets: o }, my, true).then(function () { return "lab"; });
  }
  function cancelAll() {
    epoch++; busy = false; dirty = false;   // 진행 중인 로그인·조회·업로드를 모두 무효로 하고
    inflight.splice(0).forEach(function (ac) { try { ac.abort(); } catch (e) {} });   // 이미 나간 요청도 중단한다
    if (timer) { clearTimeout(timer); timer = null; }
  }
  // 같은 구글 계정으로 다른 기기·브라우저에서 켜면 연구 번호(pid)가 새로 만들어진다 — 번호까지 맞는 파일만 찾아, 서로 덮어쓰지 않게 한다 (파일은 번호마다 하나)
  function findFile(tk, my, pid) {
    var q = "appProperties has { key='sfResearch' and value='1' } and appProperties has { key='sfPid' and value='" + String(pid || "").replace(/[^A-Za-z0-9-]/g, "") + "' } and trashed=false";
    return api("https://www.googleapis.com/drive/v3/files?spaces=drive&fields=files(id)&q=" + encodeURIComponent(q), {}, tk, { epoch: my }).then(function (r) { return r.json(); }).then(function (j) { return j.files && j.files[0] ? j.files[0].id : null; });
  }
  function multipart(meta, bytes) {
    var b = "sfr" + Math.random().toString(36).slice(2), enc = new TextEncoder();
    var head = enc.encode("--" + b + "\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n" + JSON.stringify(meta) + "\r\n--" + b + "\r\nContent-Type: " + XLSX_MIME + "\r\n\r\n");
    var tail = enc.encode("\r\n--" + b + "--"), out = new Uint8Array(head.length + bytes.length + tail.length);
    out.set(head, 0); out.set(bytes, head.length); out.set(tail, head.length + bytes.length);
    return { body: out, type: "multipart/related; boundary=" + b };
  }
  function upload(tk, bytes, fileId, my, pid) {
    var props = { sfResearch: "1", sfPid: pid };
    var meta = fileId ? { appProperties: props } : { name: "금연노트_연구자료.xlsx", mimeType: XLSX_MIME, appProperties: props };
    var m = multipart(meta, bytes);
    var url = fileId ? "https://www.googleapis.com/upload/drive/v3/files/" + fileId + "?uploadType=multipart&fields=id" : "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id";
    return api(url, { method: fileId ? "PATCH" : "POST", headers: { "Content-Type": m.type }, body: m.body }, tk, { epoch: my, consent: true }).then(function (r) { return r.json(); }).then(function (j) { return j.id; });   // 건강 정보를 싣는 요청 — 관문이 동의까지 확인
  }

  // ── 동기화 · 켜기/끄기 ─────────────────────────────────────────────────────────────────
  var getSt = function () { return {}; }, onChange = function () {}, busy = false, lastRun = 0, dirty = false;   // dirty: 올리는 중에 기록이 또 바뀜 — 끝난 뒤 한 번 더 올린다

  // 내보낸 내용이 바뀌었는지 가려내는 표지 — 엑셀에 들어가는 표(참여자 · 기록 · 일별)의 내용 전체를 해시한다. 요약값(기록 수 · 가장 늦은 시각 등)만 보면
  // 오래된 기록을 지우고 다른 기록을 가져와도 같게 나와 따라잡기가 빠졌다 (Codex P2). 시각(exported_at)은 빼서 같은 내용이면 같은 값이 나온다.
  function fnv(str) { var h = 0x811c9dc5, i; for (i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(16); }
  function sigOf(st) {
    var part = buildParticipant(st || {}, "x", 0); part[1][part[0].indexOf("exported_at_utc")] = "";
    return fnv(JSON.stringify([part, buildRecords(st || {}, "x"), buildMeasures(st || {}, "x"), buildDaily(st || {}, "x", Date.now())]));
  }
  // 탭 사이 직렬화: 파일을 찾고·만들고·덮어쓰는 구간은 한 번에 한 탭만 (Web Locks). 기다리던 탭은 앞 탭이 남긴 파일 id 를 읽고 이어서 하므로,
  // 참여자가 Drive 에서 파일을 지운 뒤 두 탭이 동시에 404 를 받아 파일을 둘 만드는 일이 없다. Web Locks 가 없는 브라우저는 그대로 진행한다.
  function withLock(fn) {
    var nav = root.navigator;
    if (nav && nav.locks && typeof nav.locks.request === "function") return nav.locks.request("smokefree-research-sync", fn);
    return fn();
  }
  function sync(interactive) {
    if (!consented()) return Promise.resolve({ ok: false, why: "off" });
    if (busy) { dirty = true; return Promise.resolve({ ok: false, why: "busy" }); }   // 올리는 중이면 이 변경이 빠지지 않게 표시만 해 둔다
    busy = true;
    var my = epoch, sig = "", alive = function () { return my === epoch && consented(); };
    var done = function () { if (my === epoch) busy = false; };
    return (config().lab ? Promise.resolve(null) : getToken(!!interactive)).then(function (tk) {
      return withLock(function () {
      if (!alive()) throw stopErr();
      var s = readState();   // 잠금을 얻은 뒤에 읽는다 — 다른 탭이 방금 남긴 파일 id 를 본다
      return (config().lab || s.fileId ? Promise.resolve(s.fileId) : findFile(tk, my, s.pid)).then(function (id) {
        if (!alive()) throw stopErr();   // 로그인·조회를 기다리는 사이 꺼졌거나 동의 문구가 바뀌었으면 보내지 않는다
        var snap = getSt(); sig = sigOf(snap);
        if (config().lab) return labPut(buildSheets(snap, s.pid, Date.now()), s.pid, my);   // 연구실로 — 로그인 없음, 보내기 직전에 만든다
        var bytes = toXlsx(buildSheets(snap, s.pid, Date.now()));   // 보내기 직전에 만든다
        return upload(tk, bytes, id, my, s.pid).catch(function (e) {
          if (id && e.status === 404) return upload(tk, bytes, null, my, s.pid);   // 참여자가 Drive 에서 파일을 지웠으면 새로 만든다
          throw e;
        });
      }).then(function (id) {
        if (my === epoch) { var n0 = readState(); n0.fileId = id; writeState(n0); }   // 잠금을 놓기 전에 파일 id 를 남긴다 (기다리는 탭이 이어서 쓰게)
        return id;
      });
      });
    }).then(function (id) {
      if (my !== epoch) return { ok: false, why: "off" };   // 올리는 도중에 지우기·끄기를 했다면 상태를 되살리지 않는다
      var n = readState(); n.fileId = id; n.sig = sig; n.lastSync = Date.now(); n.lastError = null; n.needAuth = false; writeState(n); busy = false; lastRun = Date.now(); onChange();
      if (sig !== sigOf(getSt())) dirty = true;   // 올리는 동안 이 탭의 기록이 달라졌다(다른 탭의 변경을 합쳤거나 방금 적음) — 올린 것은 낡은 것이니 한 번 더
      if (dirty) { dirty = false; touch(); } return { ok: true };
    }).catch(function (e) {
      if (e && e.stopped) { done(); return { ok: false, why: "off" }; }
      if (my !== epoch) return { ok: false, why: "off" };
      var n = readState(); n.lastError = String(e && e.message || e).slice(0, 40); n.needAuth = !interactive; writeState(n); busy = false; onChange(); return { ok: false, why: n.lastError };
    });
  }
  // 기록이 바뀔 때마다 부르면 됩니다. 8초 모았다가 보내고, 마지막 전송 뒤 60초 안에는 다시 보내지 않습니다.
  function touch() {
    if (!consented()) return;
    if (busy) dirty = true;
    if (timer) clearTimeout(timer);
    var wait = Math.max(8000, 60000 - (Date.now() - lastRun));
    timer = setTimeout(function () { timer = null; sync(false); }, wait);
  }
  function enable() {
    var c = config(); if (!c.ready) return Promise.resolve({ ok: false, why: "not_ready" });
    var s = readState(); s.on = true; s.consentAt = Date.now(); s.consentVersion = c.consentVersion; s.pid = s.pid || newPid(); writeState(s); onChange();
    return sync(true);   // 켠 직후 한 번 — 사용자가 누른 직후라 로그인 창이 열릴 수 있다
  }
  function turnOff(keepToken) {
    cancelAll();   // 예약 · 진행 중인 로그인·조회·업로드를 모두 무효로 하고 중단
    var s = readState(); s.on = false; writeState(s);
    if (!keepToken) { revokeToken(token); token = null; tokenExp = 0; }
    onChange();
  }
  function disable() { turnOff(false); }
  // 「모든 기록 지우기」용: 끄고, 동의 시각·문구 버전·연구 번호·Drive 파일 id 까지 이 기기에서 모두 지운다 (다시 켜려면 처음부터 동의)
  function reset() {
    disable();
    try { root.localStorage.removeItem(STORE_KEY); } catch (e) {}
    onChange();
  }
  // 「Drive 파일 지우기」: **먼저 참여를 끈다**(예약·진행 중 요청 모두 중단) — 그다음 파일을 지운다.
  // 지우는 동안 자동 저장이 살아 있어 새 파일을 만들거나, 지우기가 실패했는데 참여가 켜진 채 남는 일이 없다.
  // 이미 가진 토큰은 지우기에만 쓰고 끝나면 취소한다.
  function deleteRemote() {
    var id = readState().fileId; if (!id) return Promise.resolve({ ok: true });
    if (config().lab) {   // 연구실로 보낸 자료 지우기: 먼저 참여를 끄고, 이 연구 번호의 줄을 지워 달라고 요청한다
      var pid0 = readState().pid; turnOff(true); var my0 = epoch;
      return labPost({ action: "delete", pid: pid0 }, my0, false)
        .then(function () { var n = readState(); n.fileId = null; n.lastSync = null; writeState(n); onChange(); return { ok: true }; },
          function (e) { onChange(); return { ok: false, why: String(e && e.message || e).slice(0, 40) }; });
    }
    var held = token && Date.now() < tokenExp ? token : null;
    turnOff(true);
    var my = epoch, done = function () { revokeToken(token); token = null; tokenExp = 0; };
    return (held ? Promise.resolve(held) : getToken(true)).then(function (tk) { return api("https://www.googleapis.com/drive/v3/files/" + id, { method: "DELETE" }, tk, { epoch: my }); })
      .catch(function (e) { if (e && e.status === 404) return null; throw e; })   // 이미 없으면 지운 것과 같다
      .then(function () { done(); var n = readState(); if (n.fileId === id) { n.fileId = null; n.lastSync = null; writeState(n); } onChange(); return { ok: true }; })
      .catch(function (e) { done(); onChange(); return { ok: false, why: String(e && e.message || e).slice(0, 40) }; });
  }
  // 다른 탭에서 끄거나 지웠다면(연구 저장 키가 바뀜) 이 탭의 예약·진행 중인 전송도 멈춘다
  if (root.addEventListener) root.addEventListener("storage", function (e) {
    if (e && e.key !== null && e.key !== STORE_KEY) return;
    if (!consented()) { cancelAll(); revokeToken(token); token = null; tokenExp = 0; onChange(); }
  });
  // 시작할 때: 동의한 상태에서 마지막으로 올린 뒤 기록이 바뀌었다면(앱을 닫아 예약이 사라졌거나 연결이 없던 때의 기록) 한 번 따라잡는다
  function init(opts) {
    getSt = opts.getState || getSt; onChange = opts.onChange || onChange;
    try { if (consented() && readState().sig !== sigOf(getSt())) touch(); } catch (e) {}
  }

  return { config: config, state: readState, consented: consented, init: init, touch: touch, sync: sync, enable: enable, disable: disable, reset: reset, deleteRemote: deleteRemote,
    buildSheets: buildSheets, buildRecords: buildRecords, buildMeasures: buildMeasures, buildDaily: buildDaily, buildCodebook: buildCodebook, toXlsx: toXlsx, newPid: newPid,
    CODEBOOK_VERSION: CODEBOOK_VERSION, _crc32: crc32, _sigOf: sigOf };
});
