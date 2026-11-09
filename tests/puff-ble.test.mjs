// 퍼프 연동 블루투스 프로토타입 — 형식 해석 · 연결 흐름 시험(가짜 navigator.bluetooth).  실행: node --test tests/puff-ble.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const B = require("../labs/puff-link/ble-provider.js");
const P = require("../labs/puff-link/puff-core.js");

const dv = (...bytes) => new DataView(new Uint8Array(bytes).buffer);
const u32le = n => [n & 255, (n >> 8) & 255, (n >> 16) & 255, (n >>> 24) & 255];

test("seq32-dur16: 일련번호와 길이(10ms 단위)를 읽는다", () => {
  const r = B.parsePacket("seq32-dur16", dv(...u32le(70000), 250 & 255, 250 >> 8), 123);
  assert.deepEqual(r, { seq: 70000, t: 123, d: 2.5 });
});

test("seq32: 길이는 null (카운터형)", () => {
  assert.deepEqual(B.parsePacket("seq32", dv(...u32le(7)), 5), { seq: 7, t: 5, d: null });
});

test("길이가 모자라거나 모르는 형식은 버린다", () => {
  assert.equal(B.parsePacket("seq32-dur16", dv(1, 2, 3), 1), null);
  assert.equal(B.parsePacket("seq32", dv(1, 2), 1), null);
  assert.equal(B.parsePacket("없는형식", dv(1, 2, 3, 4, 5, 6), 1), null);
  assert.equal(B.parsePacket("seq32", null, 1), null);
});

test("UUID 정리: 짧은 이름과 전체 UUID 를 받고 모양이 틀리면 null", () => {
  assert.equal(B.cleanUuid("0x180D"), 0x180d); assert.equal(B.cleanUuid("180d"), 0x180d);
  assert.equal(B.cleanUuid("0000FFE0-0000-1000-8000-00805F9B34FB"), "0000ffe0-0000-1000-8000-00805f9b34fb");
  assert.equal(B.cleanUuid("zz"), null); assert.equal(B.cleanUuid(""), null); assert.equal(B.cleanUuid(null), null);
  assert.throws(() => B.createProvider({ serviceUuid: "zz", notifyUuid: "180d" }), /bad_uuid/);
  assert.throws(() => B.createProvider({ serviceUuid: "180d", notifyUuid: "180e", formatId: "x" }), /unknown_format/);
});

function fakeBluetooth({ failAt = null } = {}) {
  const handlers = { chr: {}, dev: {} }; const log = [];
  const chr = { properties: { notify: true }, addEventListener: (t, f) => { handlers.chr[t] = f; }, removeEventListener: (t) => { delete handlers.chr[t]; }, startNotifications: async () => { if (failAt === "notify") throw new Error("notify_fail"); log.push("notify"); } };
  const svc = { uuid: "svc", getCharacteristic: async () => chr, getCharacteristics: async () => [chr] };
  const server = { getPrimaryService: async () => svc, getPrimaryServices: async () => [svc] };
  const device = { name: "시험기기", gatt: { connected: false, connect: async () => { device.gatt.connected = true; return server; }, disconnect: () => { device.gatt.connected = false; log.push("disconnect"); } },
    addEventListener: (t, f) => { handlers.dev[t] = f; }, removeEventListener: (t) => { delete handlers.dev[t]; } };
  return { bt: { requestDevice: async req => { log.push(JSON.stringify(req)); return device; } }, handlers, log, device };
}

test("연결 → 알림을 받아 onPuff · 끊기면 onLink(false)", async () => {
  const f = fakeBluetooth(); const prov = B.createProvider({ serviceUuid: "0xffe0", notifyUuid: "0xffe1", bluetooth: f.bt });
  const puffs = [], links = []; prov.onPuff(r => puffs.push(r)); prov.onLink(l => links.push(l.connected));
  await prov.connect(); assert.equal(prov.isConnected(), true); assert.deepEqual(links, [true]);
  assert.match(f.log[0], /acceptAllDevices/); assert.match(f.log[0], /optionalServices/);
  f.handlers.chr.characteristicvaluechanged({ target: { value: dv(...u32le(11), 200, 0) } });
  f.handlers.chr.characteristicvaluechanged({ target: { value: dv(1, 2) } });      // 모자란 것은 버림
  assert.equal(puffs.length, 1); assert.equal(puffs[0].seq, 11); assert.equal(puffs[0].d, 2);
  f.handlers.dev.gattserverdisconnected(); assert.deepEqual(links, [true, false]); assert.equal(prov.isConnected(), false);
});

test("이름 접두어를 주면 그 필터로 기기를 찾는다 · 연결 실패는 정리하고 던진다", async () => {
  const f = fakeBluetooth(); const prov = B.createProvider({ serviceUuid: "180d", notifyUuid: "2a37", namePrefix: "PUFF", bluetooth: f.bt });
  await prov.connect(); assert.match(f.log[0], /namePrefix/);
  const g = fakeBluetooth({ failAt: "notify" }); const p2 = B.createProvider({ serviceUuid: "180d", notifyUuid: "2a37", bluetooth: g.bt });
  await assert.rejects(p2.connect(), /notify_fail/); assert.equal(p2.isConnected(), false); assert.ok(g.log.includes("disconnect"));
});

test("Web Bluetooth 가 없으면 분명한 오류 · readSince 는 아직 지원하지 않는다", async () => {
  const prov = B.createProvider({ serviceUuid: "180d", notifyUuid: "2a37", bluetooth: null });
  const had = globalThis.navigator; await assert.rejects(prov.connect(), /no_web_bluetooth/);
  await assert.rejects(prov.readSince(0), /not_supported/); assert.equal(prov.capabilities.ringBuffer, false);
  void had;
});

test("받은 퍼프를 PuffCore.ingest 로 합치면 같은 일련번호는 한 번만 센다", async () => {
  const f = fakeBluetooth(); const prov = B.createProvider({ serviceUuid: "0xffe0", notifyUuid: "0xffe1", bluetooth: f.bt });
  const state = P.newState(); prov.onPuff(r => P.ingest(state, [r], "live", Date.now()));
  await prov.connect();
  for (const s of [1, 2, 2, 3]) f.handlers.chr.characteristicvaluechanged({ target: { value: dv(...u32le(s), 150, 0) } });
  assert.equal(state.puffs.length, 3); assert.equal(state.maxSeq, 3);
});

test("서비스 탐색기: 서비스와 특성(읽기·알림)을 모은다", async () => {
  const f = fakeBluetooth(); const r = await B.explore({ serviceUuids: ["180d", "zz"], bluetooth: f.bt });
  assert.equal(r.name, "시험기기"); assert.equal(r.services.length, 1); assert.equal(r.services[0].characteristics[0].notify, true);
  assert.match(f.log[0], /optionalServices/); assert.ok(f.log.includes("disconnect"));
});
