/* 퍼프 연동 — 블루투스(Web Bluetooth) 연결 프로토타입 (실험 · 앱 본체에 연결 안 됨)
 *
 * `puff-core.js` 머리의 「기기 연결 계약」(provider)을 블루투스로 구현한 뼈대입니다.
 *   provider = { id, name, capabilities, connect(), disconnect(), onPuff(cb), onLink(cb), readSince(seq) }
 *
 * 꼭 알아 둘 것 (docs/PUFF-LINK.md · docs/DEVICES.md):
 *  - **IQOS 같은 시판 궐련형 기기의 서비스 UUID · 데이터 형식은 공개돼 있지 않습니다.** 이 코드는 그 기기를 읽지 못합니다.
 *    제조사 앱의 성인 인증·페어링이 앞에 있고, 기기가 외부 연결을 받아 주는지도 확인되지 않았습니다.
 *  - 그래서 UUID 와 데이터 형식을 **밖에서 넣게** 만들었습니다. 연구용 센서나 UUID 를 아는 기기가 생기면 값만 채워 시험할 수 있습니다.
 *  - 데이터 형식 두 가지(FORMATS)는 **가정**입니다. 실제 기기와 맞춰 본 적이 없습니다.
 *  - Web Bluetooth 는 https 주소(또는 localhost)와 사용자의 누르기 동작이 있어야 하고, 크롬·엣지(안드로이드 포함)에서만 됩니다 — iOS 사파리는 지원하지 않습니다.
 *  - 기기 시계를 모르므로 퍼프 시각(t)은 **받은 시각**입니다. 끊겼다 다시 연결해 한꺼번에 받은 것은 시각이 틀립니다.
 *  - 받은 값은 화면 안(메모리)에만 둡니다. 서버로 보내지 않고 저장하지도 않습니다.
 *
 * 브라우저에서는 window.PuffBle, node 에서는 require() 로 쓸 수 있습니다 (시험: tests/puff-ble.test.mjs).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.PuffBle = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  // ── 데이터 형식 (가정) ───────────────────────────────────────────────────────────────
  // 알림(notify) 한 번에 퍼프 하나가 온다고 가정합니다. 길이가 모자라면 버립니다.
  var FORMATS = {
    // 4바이트 일련번호(uint32 리틀엔디언) + 2바이트 길이(uint16 리틀엔디언 · 10ms 단위)
    "seq32-dur16": { seq: true, duration: true, parse: function (dv) {
      if (!dv || dv.byteLength < 6) return null;
      return { seq: dv.getUint32(0, true), d: dv.getUint16(4, true) / 100 };
    } },
    // 4바이트 일련번호만 — 길이를 모르는 카운터형 (니코틴 참고치는 만들지 않음)
    "seq32": { seq: true, duration: false, parse: function (dv) {
      if (!dv || dv.byteLength < 4) return null;
      return { seq: dv.getUint32(0, true), d: null };
    } }
  };

  function toDataView(v) {
    if (!v) return null;
    if (typeof v.getUint8 === "function") return v;                       // 이미 DataView
    if (v.buffer) return new DataView(v.buffer, v.byteOffset || 0, v.byteLength);   // Uint8Array 등
    return null;
  }

  function parsePacket(formatId, value, now) {
    var f = FORMATS[formatId]; if (!f) return null;
    var p = f.parse(toDataView(value)); if (!p) return null;
    return { seq: p.seq, t: now == null ? Date.now() : now, d: p.d };
  }

  // 사용자가 적은 UUID 를 정리: 16비트 짧은 이름(0x180d · "180d")과 전체 UUID 를 받는다. 모양이 틀리면 null
  function cleanUuid(s) {
    s = String(s == null ? "" : s).trim().toLowerCase();
    if (/^0x[0-9a-f]{4}$/.test(s)) return parseInt(s, 16);
    if (/^[0-9a-f]{4}$/.test(s)) return parseInt(s, 16);
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(s)) return s;
    return null;
  }

  /* opts = { serviceUuid, notifyUuid, formatId?, namePrefix?, acceptAll?, bluetooth? }
   *   bluetooth: 시험에서 가짜 navigator.bluetooth 를 넣는 자리 (기본은 navigator.bluetooth) */
  function createProvider(opts) {
    opts = opts || {};
    var fmt = FORMATS[opts.formatId || "seq32-dur16"];
    if (!fmt) throw new Error("unknown_format");
    var service = cleanUuid(opts.serviceUuid), notify = cleanUuid(opts.notifyUuid);
    if (service === null || notify === null) throw new Error("bad_uuid");
    var puffCbs = [], linkCbs = [], device = null, chr = null, onValue = null, onDisc = null, connected = false;

    function emitLink(c) { connected = c; linkCbs.slice().forEach(function (f) { try { f({ connected: c }); } catch (e) {} }); }

    function cleanup() {
      if (chr && onValue) { try { chr.removeEventListener("characteristicvaluechanged", onValue); } catch (e) {} }
      if (device && onDisc) { try { device.removeEventListener("gattserverdisconnected", onDisc); } catch (e) {} }
      chr = null; onValue = null; onDisc = null;
    }

    return {
      id: "web-bluetooth", name: "블루투스 기기 (프로토타입)",
      capabilities: { seq: fmt.seq, duration: fmt.duration, ringBuffer: false },   // 끊긴 동안 쌓인 기록을 읽는 길은 아직 없음 (readSince)
      isConnected: function () { return connected; },
      connect: function () {
        var bt = opts.bluetooth || (typeof navigator !== "undefined" ? navigator.bluetooth : null);
        if (!bt) return Promise.reject(new Error("no_web_bluetooth"));
        var req = opts.acceptAll || !opts.namePrefix ? { acceptAllDevices: true, optionalServices: [service] }
          : { filters: [{ namePrefix: opts.namePrefix }], optionalServices: [service] };
        return bt.requestDevice(req).then(function (d) {
          device = d;
          onDisc = function () { cleanup(); emitLink(false); };
          device.addEventListener("gattserverdisconnected", onDisc);
          return device.gatt.connect();
        }).then(function (server) { return server.getPrimaryService(service); })
          .then(function (svc) { return svc.getCharacteristic(notify); })
          .then(function (c) {
            chr = c;
            onValue = function (ev) {
              var rec = parsePacket(opts.formatId || "seq32-dur16", ev && ev.target ? ev.target.value : null, Date.now());
              if (!rec) return;   // 길이가 모자라거나 모르는 모양은 버린다
              puffCbs.slice().forEach(function (f) { try { f(rec); } catch (e) {} });
            };
            chr.addEventListener("characteristicvaluechanged", onValue);
            return chr.startNotifications();
          }).then(function () { emitLink(true); }, function (e) { try { cleanup(); if (device && device.gatt && device.gatt.connected) device.gatt.disconnect(); } catch (x) {} emitLink(false); throw e; });
      },
      disconnect: function () {
        var d = device; cleanup();
        try { if (d && d.gatt && d.gatt.connected) d.gatt.disconnect(); } catch (e) {}
        if (connected) emitLink(false);
      },
      onPuff: function (cb) { puffCbs.push(cb); },
      onLink: function (cb) { linkCbs.push(cb); },
      readSince: function () { return Promise.reject(new Error("not_supported")); }   // 기기가 기록을 쌓아 두는지·어떻게 읽는지 모름
    };
  }

  /* 서비스 탐색기: 연결한 기기의 서비스 · 특성(읽기·알림 가능 여부)을 글로 모아 돌려준다. 실기기의 UUID 를 알아낼 때 씁니다.
   * 기기가 알려 주는 서비스는 optionalServices 에 적어 둔 것뿐이라, 모르는 서비스는 보이지 않습니다 (Web Bluetooth 의 제한). */
  function explore(opts) {
    opts = opts || {};
    var bt = opts.bluetooth || (typeof navigator !== "undefined" ? navigator.bluetooth : null);
    if (!bt) return Promise.reject(new Error("no_web_bluetooth"));
    var list = (opts.serviceUuids || []).map(cleanUuid).filter(function (x) { return x !== null; });
    var out = [], dev = null;
    return bt.requestDevice({ acceptAllDevices: true, optionalServices: list }).then(function (d) {
      dev = d; return d.gatt.connect();
    }).then(function (server) { return server.getPrimaryServices(); })
      .then(function (svcs) {
        return svcs.reduce(function (p, s) {
          return p.then(function () {
            return s.getCharacteristics().then(function (cs) {
              out.push({ service: s.uuid, characteristics: cs.map(function (c) { var pr = c.properties || {}; return { uuid: c.uuid, read: !!pr.read, write: !!pr.write, notify: !!pr.notify }; }) });
            }, function () { out.push({ service: s.uuid, characteristics: [], error: "특성을 읽지 못함" }); });
          });
        }, Promise.resolve());
      }).then(function () { try { dev.gatt.disconnect(); } catch (e) {} return { name: dev && dev.name || "", services: out }; },
        function (e) { try { if (dev && dev.gatt) dev.gatt.disconnect(); } catch (x) {} throw e; });
  }

  return { FORMATS: FORMATS, parsePacket: parsePacket, cleanUuid: cleanUuid, createProvider: createProvider, explore: explore };
});
