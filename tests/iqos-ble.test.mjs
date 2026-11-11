import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const I = createRequire(import.meta.url)("../iqos-ble.js");
const blk = (v, tag) => [0,0,0,0, v & 255, v >> 8, 0, tag];
const tele = (puff, days) => Uint8Array.from([0,0,0x90,0x22,1,1, ...blk(puff,0x8E), ...blk(days,0x17), ...blk(0,0), ...blk(0,0)]);
test("프레임: 퍼프 수·사용일 (참조 저장소 모양)", () => { const p = I.parseFrame(tele(777, 30)); assert.equal(p.puffCount, 777); assert.equal(p.daysUsed, 30); });
test("프레임: 모르는 머리·짧은 것·마커 불일치는 빈 객체", () => {
  assert.deepEqual(I.parseFrame(Uint8Array.from([0,8,0x88,0x21,0,0xE8,0x0F])), {});
  assert.deepEqual(I.parseFrame(Uint8Array.from([1,2])), {});
  const f = tele(5, 1); f[4] = 2; assert.deepEqual(I.parseFrame(f), {});
});
test("차이: 돌아감 · 0 · 튀는 값", () => {
  assert.equal(I.delta(10, 13), 3); assert.equal(I.delta(65535, 1), 2);
  assert.equal(I.delta(10, 10), null); assert.equal(I.delta(10, 5000), null); assert.equal(I.delta(null, 5), null);
});
function fake(counters) {
  let i = 0, listener, ch;
  ch = { addEventListener: (_, f) => { listener = f; }, removeEventListener() {}, startNotifications: async () => {},
    writeValue: async () => { const c = counters[Math.min(i++, counters.length - 1)]; setTimeout(() => listener({ target: { value: new DataView(tele(c, 1).buffer) } }), 0); } };
  const dev = { addEventListener() {}, removeEventListener() {}, gatt: { connected: true, connect: async () => ({ getPrimaryService: async () => ({ getCharacteristic: async () => ch }) }), disconnect() {} } };
  return { requestDevice: async (r) => { fake.req = r; return dev; } };
}
test("연결: 첫 읽기는 기준값, 이후 차이만 알림", async () => {
  const got = [];
  const p = I.create({ bluetooth: fake([100, 100, 103]), intervalMs: 5, onCount: (c, d) => got.push([c, d]) });
  await p.connect(); await new Promise(r => setTimeout(r, 60)); p.disconnect();
  assert.deepEqual(got[0], [100, null]); assert.ok(got.some(x => x[1] === 3)); assert.equal(p.isConnected(), false);
  assert.ok(fake.req.filters.some(f => f.services && f.services[0] === I.CORE_SERVICE));
});
test("연결 거부: 정리하고 거절", async () => {
  const p = I.create({ bluetooth: { requestDevice: async () => { throw new Error("denied"); } } });
  await assert.rejects(p.connect(), /denied/); assert.equal(p.isConnected(), false);
});
test("Web Bluetooth 없음", async () => { await assert.rejects(I.create({ bluetooth: null }).connect(), /no_web_bluetooth/); });
