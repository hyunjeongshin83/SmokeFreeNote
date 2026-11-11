// 연구실 수신(labUrl) 길 시험.  실행: node --test tests/research-lab.test.mjs
import test from "node:test"; import assert from "node:assert/strict"; import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const KEY = "smokefree.research.v1", LAB = "https://script.google.com/macros/s/AKfycbxTEST_abc-123/exec";
const at = (y, m, d, h = 9) => new Date(y, m - 1, d, h).getTime();
const st = () => ({ kind: "hnb", perDay: 12, price: 4500, start: at(2026, 11, 3), reason: "비밀 이유 문장", logs: [{ v: 2, t: at(2026, 11, 5, 21), lv: "강함", mood: "나쁨", trig: ["스트레스"], cope: [], slip: false }], measures: [] });
function fresh(cfg = {}, { fail = null, seed = null } = {}) {
  delete require.cache[require.resolve("../research.js")];
  const store = {}, reqs = [];
  globalThis.addEventListener = () => {};
  globalThis.localStorage = { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } };
  if (seed) store[KEY] = JSON.stringify(seed);
  globalThis.fetch = async (url, opts = {}) => { reqs.push({ url: String(url), opts, body: opts.body ? JSON.parse(opts.body) : null });
    if (fail) return { ok: fail !== 200, status: fail, json: async () => ({ ok: false, error: "boom" }) };
    return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  globalThis.google = { accounts: { oauth2: { initTokenClient() { throw new Error("로그인이 불리면 안 됨"); }, revoke() {} } } };
  globalThis.SF_RESEARCH_CONFIG = { enabled: true, clientId: "", labUrl: LAB, consentText: "문구", consentVersion: "v1", ...cfg };
  const R = require("../research.js"); R.init({ getState: () => st() });
  return { R, store, reqs };
}
test("labUrl 만 있어도(clientId 없이) 준비되고, 모양이 다른 주소는 없는 것으로 본다", () => {
  assert.equal(fresh().R.config().ready, true); assert.equal(fresh().R.config().lab, true);
  for (const bad of ["http://script.google.com/macros/s/AK/exec", "https://evil.example/macros/s/AK/exec", "https://script.google.com/macros/s/AK/exec?x=1", "https://script.google.com/macros/s/AK/dev", ""]) {
    const c = fresh({ labUrl: bad }).R.config(); assert.equal(c.lab, false, bad); assert.equal(c.ready, false, bad);
  }
});
test("동의 문구가 비면 labUrl 이 있어도 준비되지 않는다", () => { assert.equal(fresh({ consentText: "" }).R.config().ready, false); });
test("켜면 Google 로그인 없이 연구실 주소로 표를 보낸다 (참여자 이름·이유 글은 없음)", async () => {
  const { R, reqs, store } = fresh(); const r = await R.enable(); assert.equal(r.ok, true);
  assert.equal(reqs.length, 1); const q = reqs[0];
  assert.equal(q.url, LAB); assert.equal(q.opts.method, "POST"); assert.equal(q.opts.credentials, "omit"); assert.equal(q.opts.referrerPolicy, "no-referrer");
  assert.match(q.opts.headers["Content-Type"], /^text\/plain/);
  assert.equal(q.body.action, "put"); assert.match(q.body.pid, /^P-[0-9a-f]{8}$/); assert.equal(q.body.consentVersion, "v1");
  assert.deepEqual(Object.keys(q.body.sheets).sort(), ["codebook", "daily", "measures", "meds", "participant", "records"]);
  assert.ok(!JSON.stringify(q.body).includes("비밀 이유"));
  assert.equal(JSON.parse(store[KEY]).fileId, "lab");
});
test("동의하지 않았으면(꺼짐) sync 는 아무 데도 보내지 않는다", async () => {
  const { R, reqs } = fresh(); const r = await R.sync(true); assert.equal(r.ok, false); assert.equal(reqs.length, 0);
});
test("연구실이 거절하거나 끊기면 실패로 남고 참여 표시는 그대로", async () => {
  const { R, store } = fresh({}, { fail: 500 }); const r = await R.enable(); assert.equal(r.ok, false);
  assert.match(JSON.parse(store[KEY]).lastError, /^lab_/);
});
test("끄면 이후 touch 는 보내지 않는다", async () => {
  const { R, reqs } = fresh(); await R.enable(); R.disable(); const n = reqs.length; R.touch(); await new Promise(r => setTimeout(r, 30)); assert.equal(reqs.length, n);
});
test("보낸 자료 지우기: 참여를 끄고 연구 번호로 delete 요청, 동의가 꺼져 있어도 나간다", async () => {
  const { R, reqs, store } = fresh(); await R.enable(); const pid = JSON.parse(store[KEY]).pid;
  const r = await R.deleteRemote(); assert.equal(r.ok, true);
  const last = reqs[reqs.length - 1]; assert.deepEqual(last.body, { action: "delete", pid });
  assert.equal(R.consented(), false); assert.equal(JSON.parse(store[KEY]).fileId, null);
});
test("지우기 요청이 실패하면 ok:false 이고 참여는 꺼진 채", async () => {
  const { R, store } = fresh(); await R.enable();
  globalThis.fetch = async () => ({ ok: false, status: 500, json: async () => ({}) });
  const r = await R.deleteRemote(); assert.equal(r.ok, false); assert.equal(R.consented(), false);
});
