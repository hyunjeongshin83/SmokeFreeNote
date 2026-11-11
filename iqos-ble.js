/* IQOS ILUMA 퍼프 수 읽기 (Web Bluetooth) — 참여자가 「연결」을 누를 때만 동작합니다.
 *
 * 프로토콜은 공개 역분석(okhsunrog/iqos, MIT)을 옮긴 것입니다. 제조사가 공개한 규격이 아니고,
 * **실기기로는 아직 확인하지 못했습니다.** 프레임 해석은 참조 저장소의 시험 값 3건으로만 확인했습니다 (tests/iqos-ble.test.mjs).
 * 기기는 「누적 퍼프 수(u16)」만 줍니다 — 퍼프 길이·세기는 없어서 니코틴 추정은 하지 않습니다.
 * 읽은 값은 이 기기 안에서만 쓰고 서버로 보내지 않습니다 (연구 참여를 켠 경우는 research.js 의 규칙을 따름).
 * 브라우저: https(또는 localhost) · 누르기 동작 · 크롬/엣지(안드로이드 포함)만. iOS 사파리·안드로이드 앱 셸(WebView)은 안 됩니다.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.IqosBle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";
  var CORE_SERVICE = "daebb240-b041-11e4-9e45-0002a5d5c51b";
  var SCP_CHAR = "e16c6e20-b041-11e4-a4c3-0002a5d5c51b";
  var CMD_TELEMETRY = [0x00, 0xC9, 0x10, 0x02, 0x01, 0x01, 0x75, 0xD6];
  var TAG_PUFF = 0x8E, TAG_DAY = 0x17;

  function u16(b, o) { return b[o] | (b[o + 1] << 8); }

  /* 응답 프레임 → { puffCount, daysUsed } (모르는 모양은 빈 객체) */
  function parseFrame(frame) {
    var b = frame && frame.buffer ? new Uint8Array(frame.buffer, frame.byteOffset || 0, frame.byteLength) : new Uint8Array(frame || []);
    var out = {};
    if (b.length < 6 || b[2] !== 0x90 || b[3] !== 0x22 || u16(b, 4) !== 0x0101) return out;
    var n = Math.floor(Math.max(b[3] - 2, 0) / 8);
    for (var i = 0; i < n; i++) {
      var off = 6 + i * 8; if (off + 8 > b.length) break;
      var v = u16(b, off + 4), tag = b[off + 7];
      if (tag === TAG_PUFF) out.puffCount = v; else if (tag === TAG_DAY) out.daysUsed = v;
    }
    return out;
  }

  /* 이전·현재 누적값의 차이(0~65535 돌아감). 0 이하이거나 1000 이상이면 null — 초기화·튀는 값으로 보고 버림 */
  function delta(prev, cur) {
    if (!Number.isInteger(prev) || !Number.isInteger(cur)) return null;
    var d = (cur - prev) & 0xFFFF;
    return d > 0 && d < 1000 ? d : null;
  }

  /* opts: { bluetooth?, intervalMs?, onCount(cur,delta), onLink(bool), onError(e) } */
  function create(opts) {
    opts = opts || {};
    var bt = opts.bluetooth || (typeof navigator !== "undefined" ? navigator.bluetooth : null);
    var dev = null, chr = null, timer = null, last = null, waiter = null, connected = false, onVal = null, onDisc = null;
    function link(c) { connected = c; if (opts.onLink) try { opts.onLink(c); } catch (e) {} }
    function stop() {
      if (timer) { clearInterval(timer); timer = null; }
      if (chr && onVal) { try { chr.removeEventListener("characteristicvaluechanged", onVal); } catch (e) {} }
      if (dev && onDisc) { try { dev.removeEventListener("gattserverdisconnected", onDisc); } catch (e) {} }
      chr = null; onVal = null; onDisc = null; waiter = null;
    }
    function poll() {
      if (!chr || waiter) return;
      waiter = true;
      chr.writeValue(new Uint8Array(CMD_TELEMETRY)).catch(function (e) { waiter = null; if (opts.onError) opts.onError(e); });
    }
    return {
      isConnected: function () { return connected; },
      connect: function () {
        if (!bt) return Promise.reject(new Error("no_web_bluetooth"));
        return bt.requestDevice({ filters: [{ services: [CORE_SERVICE] }, { namePrefix: "IQOS" }], optionalServices: [CORE_SERVICE] }).then(function (d) {
          dev = d; onDisc = function () { stop(); link(false); };
          dev.addEventListener("gattserverdisconnected", onDisc);
          return dev.gatt.connect();
        }).then(function (s) { return s.getPrimaryService(CORE_SERVICE); })
          .then(function (svc) { return svc.getCharacteristic(SCP_CHAR); })
          .then(function (c) {
            chr = c;
            onVal = function (ev) {
              waiter = null;
              var p = parseFrame(ev && ev.target ? ev.target.value : null);
              if (p.puffCount === undefined) return;
              var d = last === null ? null : delta(last, p.puffCount);
              last = p.puffCount;
              if (opts.onCount) try { opts.onCount(p.puffCount, d); } catch (e) {}
            };
            chr.addEventListener("characteristicvaluechanged", onVal);
            return chr.startNotifications();
          }).then(function () {
            link(true); poll();
            timer = setInterval(poll, opts.intervalMs || 2000);
          }, function (e) { try { stop(); if (dev && dev.gatt && dev.gatt.connected) dev.gatt.disconnect(); } catch (x) {} link(false); throw e; });
      },
      disconnect: function () { var d = dev; stop(); try { if (d && d.gatt && d.gatt.connected) d.gatt.disconnect(); } catch (e) {} if (connected) link(false); }
    };
  }
  return { CORE_SERVICE: CORE_SERVICE, SCP_CHAR: SCP_CHAR, CMD_TELEMETRY: CMD_TELEMETRY, parseFrame: parseFrame, delta: delta, create: create };
});
