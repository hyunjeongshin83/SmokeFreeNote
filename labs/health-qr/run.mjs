import QRCode from 'qrcode';
import jsQR from 'jsqr';
import { PNG } from 'pngjs';
import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import * as H from './hq.mjs';

const keys = Object.keys(H.DICT);
const sample = (n) => ({ v: 1, t: 'checkup', d: '2026-09-01', x: keys.slice(0, n).map(k => [k, H.DICT[k].sample]) });
let pass = 0, fail = 0;
const ok = (name, cond, extra = '') => { cond ? pass++ : fail++; console.log((cond ? 'PASS ' : 'FAIL ') + name + (extra ? '  · ' + extra : '')); };

// QR 만들기: 'url' 은 바이트 모드, 'b45' 는 접두어(바이트) + 본문(영숫자) 한 덩어리
function makeQR(text, ecl, mode) {
  const segs = mode === 'b45' ? [{ data: 'HQ1:', mode: 'alphanumeric' }, { data: text.slice(4), mode: 'alphanumeric' }] : text;
  return QRCode.create(segs, { errorCorrectionLevel: ecl });
}
function toImage(text, ecl, mode) {
  const q = makeQR(text, ecl, mode), n = q.modules.size, scale = 6, margin = 4, W = (n + margin * 2) * scale;
  const png = new PNG({ width: W, height: W }); png.data.fill(255);
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(y, x)) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
    const i = ((((y + margin) * scale + dy) * W) + (x + margin) * scale + dx) * 4; png.data[i] = png.data[i + 1] = png.data[i + 2] = 0;
  }
  return { png, W, version: q.version };
}
const scanImage = (png, W) => jsQR(new Uint8ClampedArray(png.data), W, W);

console.log('\n══ 1. 크기: 가상 종합검진 값 n개를 QR 한 장에 (오류정정 L/M, 폰 카메라 읽기 쉬운 선은 대략 버전 ≤ 25)');
console.log('항목수 | 원본JSON | 압축후 | URL글자 | URL·M버전 | HQ1글자 | HQ1·M버전 | HQ1·L버전');
const rows = {};
for (const n of [10, 20, 30, 40, 50, keys.length]) {
  const o = sample(n), raw = JSON.stringify(o).length;
  const url = await H.encodeHQ(o, 'url'), b45 = await H.encodeHQ(o, 'b45'), z = (await H.deflateRaw(new TextEncoder().encode(JSON.stringify(o)))).length;
  const v = (t, e, m) => { try { return makeQR(t, e, m).version; } catch { return '>40'; } };
  rows[n] = { url, b45 };
  console.log(`${String(n).padStart(5)} | ${String(raw).padStart(7)}B | ${String(z).padStart(5)}B | ${String(url.length).padStart(6)} | ${String(v(url, 'M', 'url')).padStart(8)} | ${String(b45.length).padStart(6)} | ${String(v(b45, 'M', 'b45')).padStart(8)} | ${String(v(b45, 'L', 'b45')).padStart(8)}`);
}
const N = keys.length;
ok(`사전 항목 ${N}개 (종합검진 숫자 항목 규모)`, N >= 60);
ok('전체 항목이 HQ1·M 한 장에 들어감 (버전 ≤ 25)', makeQR(rows[N].b45, 'M', 'b45').version <= 25, 'v' + makeQR(rows[N].b45, 'M', 'b45').version);

console.log('\n══ 2. QR 그림을 만들고 jsQR 로 다시 읽어 같은 값이 나오는가');
for (const [label, text, ecl, mode] of [['HQ1 전체·M', rows[N].b45, 'M', 'b45'], ['HQ1 전체·L', rows[N].b45, 'L', 'b45'], ['URL 30개·M', rows[30].url, 'M', 'url'], ['URL 전체·L', rows[N].url, 'L', 'url']]) {
  let r = null, ver = '-';
  try { const im = toImage(text, ecl, mode); ver = im.version; const res = scanImage(im.png, im.W); r = res && res.data; } catch (e) { r = 'ERR ' + e.message; }
  ok(`${label} (버전 ${ver}) 되읽기 문자열 일치`, r === text);
  if (r === text) {
    const d = await H.decodeAny(r), v = H.validateHQ(d.obj, new Date('2026-10-19'));
    ok(`   → 해석 type=${d.type} 항목 ${v.items && v.items.length}개 · 거부 ${v.rejected && v.rejected.length}`, d.type === 'hq1' && v.ok && v.rejected.length === 0 && v.items.every(i => i.val === H.DICT[i.k].sample));
  }
}

console.log('\n══ 3. 기록으로 바꾸기: 같은 검진일 항목이 가져오기에서 겹치지 않는가 (앱 가져오기는 t+kind 가 같으면 같은 기록으로 봄)');
{
  const v = H.validateHQ(sample(N), new Date('2026-10-19')), recs = H.toRecords(v, 'b1');
  const keyTK = new Set(recs.map(r => r.t + '|' + r.kind)), ids = new Set(recs.map(r => r.id));
  ok(`${recs.length}개 기록의 t+kind 가 모두 다름`, keyTK.size === recs.length);
  ok('id 도 모두 다름', ids.size === recs.length);
  console.log('   예: ' + JSON.stringify(recs[10]));
}

console.log('\n══ 4. 악의적·깨진 입력 (던지지 않고 안전하게 거부하는가)');
const bad = async (name, text, expectOk) => { const d = await H.decodeAny(text); let v = null; if (d.type === 'hq1') v = H.validateHQ(d.obj, new Date('2026-10-19')); const accepted = !!(v && v.ok); ok(name, accepted === expectOk, `type=${d.type}${d.why ? ' · ' + d.why : ''}${v ? ' · ' + (v.ok ? '받음 ' + v.items.length : '거부: ' + (v.why || '')) : ''}`); return { d, v }; };
const mk = async (o, mode = 'b45') => H.encodeHQ(o, mode);
await bad('정상', await mk(sample(5)), true);
await bad('압축 폭탄 (6KB 이하 → 1MB 이상으로 풀림)', await (async () => { const z = await H.deflateRaw(new Uint8Array(2 * 1024 * 1024)); return 'HQ1:' + H.b45Enc(z); })(), false);
await bad('미래 검진일', await mk({ ...sample(3), d: '2027-01-01' }), false);
await bad('없는 날짜 (2월 30일)', await mk({ ...sample(3), d: '2026-02-30' }), false);
await bad('너무 옛날', await mk({ ...sample(3), d: '1980-01-01' }), false);
await bad('버전 다름', await mk({ ...sample(3), v: 2 }), false);
await bad('항목 301개', await mk({ ...sample(3), x: Array.from({ length: 301 }, () => ['hgb', 14]) }), false);
{ const { v } = await bad('범위 밖·문자열·모르는 코드 섞임 → 정상 항목만', await mk({ v: 1, t: 'checkup', d: '2026-09-01', x: [['hgb', 14.2], ['hgb', 15], ['wbc', 99999], ['ast', '21'], ['__proto__', 1], ['constructor', 2], ['<img src=x onerror=alert(1)>', 3], ['alt', 18], [1, 2], 'x'] }), true);
  ok('   → 받은 것은 hgb·alt 둘뿐', v.items.map(i => i.k).join() === 'hgb,alt', JSON.stringify(v.items.map(i => i.k)) + ' 거부 ' + v.rejected.length); }
await bad('HQ1 접두어만', 'HQ1:', false);
await bad('깨진 base45', 'HQ1:!!!', false);
await bad('깨진 압축', 'HQ1:' + H.b45Enc(Uint8Array.from([1, 2, 3, 4, 5, 6])), false);
await bad('8KB 초과 텍스트', 'HQ1:' + 'A'.repeat(9000), false);
await bad('엉뚱한 QR (웹주소)', 'https://example.com/x', false);
await bad('엉뚱한 QR (와이파이)', 'WIFI:T:WPA;S:x;P:y;;', false);
{ const t = await mk(sample(3), 'url'); await bad('URL 조각 방식', t, true); await bad('URL 조각이 아닌 쿼리(?hq1=)는 무시', t.replace('#hq1=', '?hq1='), false); }

console.log('\n══ 5. 국제 표준 SMART Health Card (shc:/) — 서명 포함 실제 크기');
{
  const { privateKey } = generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const dictKeys = keys;
  async function shc(n) {
    const entries = [{ fullUrl: 'resource:0', resource: { resourceType: 'Patient', name: [{ family: 'X' }], birthDate: '1980-01-01' } }];
    for (let i = 0; i < n; i++) { const k = dictKeys[i]; entries.push({ fullUrl: 'resource:' + (i + 1), resource: { resourceType: 'Observation', status: 'final', code: { coding: [{ system: 'http://loinc.org', code: '1' + String(1000 + i * 37).padStart(4, '0') + '-' + (i % 10) }] }, subject: { reference: 'resource:0' }, effectiveDateTime: '2026-09-01', valueQuantity: { value: H.DICT[k].sample, unit: H.DICT[k].unit, system: 'http://unitsofmeasure.org', code: H.DICT[k].unit } } }); }
    const payload = { iss: 'https://example.invalid/issuer', nbf: 1788000000, vc: { type: ['https://smarthealth.cards#health-card'], credentialSubject: { fhirVersion: '4.0.1', fhirBundle: { resourceType: 'Bundle', type: 'collection', entry: entries } } } };
    const z = await H.deflateRaw(new TextEncoder().encode(JSON.stringify(payload)));
    const hdr = H.b64uEnc(new TextEncoder().encode(JSON.stringify({ zip: 'DEF', alg: 'ES256', kid: 'testkey' }))), body = H.b64uEnc(z), input = hdr + '.' + body;
    const sig = sign('sha256', Buffer.from(input), { key: privateKey, dsaEncoding: 'ieee-p1363' }), jws = input + '.' + H.b64uEnc(sig);
    return { jws, text: 'shc:/' + [...jws].map(c => String(c.charCodeAt(0) - 45).padStart(2, '0')).join('') };
  }
  console.log('관찰값수 | JWS글자(한 장 한도 1195) | shc 글자 | QR버전(M)');
  let maxFit = 0;
  for (const n of [5, 10, 15, 20, 25, 30, keys.length]) { const s = await shc(n); let v; try { v = QRCode.create([{ data: 'shc:/', mode: 'byte' }, { data: s.text.slice(5), mode: 'numeric' }], { errorCorrectionLevel: 'L' }).version; } catch { v = '>40'; } if (s.jws.length <= 1195) maxFit = n; console.log(`${String(n).padStart(7)} | ${String(s.jws.length).padStart(10)}${s.jws.length <= 1195 ? ' ✓' : ' ✗ 한도 초과'} | ${String(s.text.length).padStart(8)} | ${v}`); }
  ok('전체(60개)는 SHC 한 장(1195자)에 안 들어감 — 표준을 그대로 쓰면 항목 수가 제한됨', (await shc(keys.length)).jws.length > 1195, '이 표본에서 한 장에 들어가는 최대 ' + maxFit + '개');
  const s = await shc(8); const d = await H.decodeAny(s.text);
  ok('shc:/ 되읽기 → 관찰값 8개, 서명 미검증으로 표시', d.type === 'shc' && d.signed === false && d.obj.entry.filter(e => e.resource.resourceType === 'Observation').length === 8);
}

console.log(`\n합계: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
