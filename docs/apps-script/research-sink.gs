/**
 * 연구실 자료 수신기 — Google Apps Script (연구실 Google 계정에서 배포)
 *
 * 앱(금연노트·금주노트)이 참여자가 동의·켠 뒤에 보내는 표를, 연구실 Google 시트의 시트(탭)에 모읍니다.
 * 이름·연락처·글·사진은 앱이 보내지 않습니다. 연구 번호(P-xxxxxxxx)만 있습니다.
 *
 * 설정 (스크립트 속성): SHEET_ID = 연구실 시트의 id (주소의 /d/ 와 /edit 사이)
 * 배포: 배포 → 새 배포 → 웹 앱 → 실행 계정 「나」 · 액세스 「모든 사용자」 → 나온 주소(…/exec)를 research-config.js 의 labUrl 에.
 * 주의: 이 주소를 아는 사람은 누구나 보낼 수 있습니다(앱이 공개 코드라 숨길 수 없음). 그래서 아래에서 모양·크기·연구 번호 형식을 검사하고,
 *       의심스러운 요청은 버립니다. 필요하면 시트의 「_log」 탭으로 확인하세요. 주소가 새면 새로 배포해 주소를 바꾸세요.
 */
var ALLOWED = ['participant', 'records', 'measures', 'daily', 'meds'];   // meds: 코드북 v2 (2026-11-11)   // codebook 은 시트에 넣지 않습니다(틀 파일에 있음)
var MAX_ROWS = 20000, MAX_COLS = 60, PID_RE = /^P-[0-9a-f]{8}$/, HEAD_RE = /^[a-z][a-z0-9_]{0,39}$/;

function doPost(e) {
  var out = function (o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); };
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(25000);
    var b = JSON.parse(e.postData.contents);
    if (!b || !PID_RE.test(String(b.pid))) return out({ ok: false, error: 'bad_pid' });
    var ss = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID'));
    if (b.action === 'delete') { ALLOWED.forEach(function (n) { dropPid(ss, n, b.pid); }); log(ss, 'delete', b.pid); return out({ ok: true }); }
    if (b.action !== 'put' || !b.sheets || typeof b.sheets !== 'object') return out({ ok: false, error: 'bad_action' });
    var done = [], todo = [];
    // 1) 먼저 모든 탭을 검사만 한다 — 하나라도 어긋나면 아무 것도 바꾸지 않는다 (탭마다 다른 때의 자료가 섞이지 않게 · #88 Sourcery)
    ALLOWED.forEach(function (n) {
      var rows = b.sheets[n]; if (!rows) return;
      if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS + 1 || !Array.isArray(rows[0]) || rows[0].length > MAX_COLS) throw new Error('bad_shape_' + n);
      var head = rows[0].map(String);
      if (!head.every(function (h) { return HEAD_RE.test(h); })) throw new Error('bad_header_' + n);   // 머리글은 영문 소문자·숫자·밑줄만 — 수식(=IMPORTRANGE 등)이 새 탭 머리글로 들어가지 않게 (#88 Sourcery)
      var sh = ss.getSheetByName(n);
      if (sh && sh.getLastRow() > 0 && sh.getRange(1, 1, 1, head.length).getValues()[0].join('|') !== head.join('|')) throw new Error('header_changed_' + n);   // 열이 바뀌면(코드북 버전) 사람이 먼저 맞춘다
      todo.push({ n: n, rows: rows, head: head });
    });
    // 2) 그다음에 쓴다
    todo.forEach(function (t) {
      var n = t.n, rows = t.rows, head = t.head;
      var sh = ss.getSheetByName(n) || ss.insertSheet(n);
      if (sh.getLastRow() === 0) sh.getRange(1, 1, 1, head.length).setValues([head]);
      dropPid(ss, n, b.pid);
      var data = rows.slice(1).filter(function (r) { return Array.isArray(r) && String(r[0]) === b.pid && r.length === head.length; });   // 자기 번호의 줄만
      if (data.length) sh.getRange(sh.getLastRow() + 1, 1, data.length, head.length).setValues(data.map(function (r) { return r.map(cell); }));
      done.push(n + ':' + data.length);
    });
    log(ss, 'put', b.pid + ' ' + done.join(',') + ' v' + String(b.consentVersion || '').slice(0, 20));
    return out({ ok: true });
  } catch (err) {
    return out({ ok: false, error: String(err && err.message || err).slice(0, 40) });
  } finally { try { lock.releaseLock(); } catch (x) {} }
}
function cell(v) { return typeof v === 'string' && /^[=+\-@]/.test(v) ? "'" + v : v; }   // 수식으로 해석되지 않게
function dropPid(ss, n, pid) {
  var sh = ss.getSheetByName(n); if (!sh || sh.getLastRow() < 2) return;
  var vals = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues();
  var keep = vals.filter(function (r, i) { return i === 0 || String(r[0]) !== pid; });
  if (keep.length === vals.length) return;
  sh.getRange(1, 1, vals.length, vals[0].length).clearContent();
  sh.getRange(1, 1, keep.length, keep[0].length).setValues(keep);
}
function log(ss, what, note) { var l = ss.getSheetByName('_log') || ss.insertSheet('_log'); l.appendRow([new Date(), what, note]); }
