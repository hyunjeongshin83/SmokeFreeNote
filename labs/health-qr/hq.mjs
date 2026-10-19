// HQ1 — 건강검진 QR 가져오기 시안 (제안 · 앱에 아직 넣지 않음). 브라우저·Node 22 공통 (CompressionStream 'deflate-raw').
// 원칙: 서버로 보내지 않는다 · 읽은 것은 먼저 미리 보여 주고 사용자가 확인한 뒤에만 기기 안에 저장한다 · 모르는 것은 버린다.

// 항목 사전 [코드, 이름, 단위, 최소, 최대, 시험용 값]. QR 에는 코드와 값만 싣고 이름·단위는 앱이 가진다 (QR 을 짧게).
export const DICT = Object.fromEntries([
  ['ht','키','cm',100,220,168.2],['wt','체중','kg',20,250,63.4],['bmi','체질량지수','kg/m²',10,70,22.4],['sbp','수축기혈압','mmHg',60,260,118],
  ['dbp','이완기혈압','mmHg',30,160,76],['bf','체지방률','%',2,70,24.1],['smm','골격근량','kg',5,80,26.3],['waist','허리둘레','cm',40,200,78.5],
  ['wbc','백혈구','10³/µL',0.5,100,6.1],['rbc','적혈구','10⁶/µL',1,9,4.62],['hgb','혈색소','g/dL',3,22,14.2],['hct','헤마토크릿','%',10,65,42.3],
  ['mcv','MCV','fL',50,130,91.6],['mch','MCH','pg',15,45,30.7],['mchc','MCHC','g/dL',25,40,33.5],['plt','혈소판','10³/µL',5,1500,251],
  ['rdw','RDW','%',8,30,12.9],['neut','호중구','%',0,100,58.2],['lymph','림프구','%',0,100,32.4],['mono','단핵구','%',0,100,6.1],
  ['eos','호산구','%',0,100,2.5],['baso','호염기구','%',0,100,0.8],['mpv','MPV','fL',5,15,10.2],['esr','적혈구침강속도','mm/h',0,150,8],
  ['ast','AST','U/L',1,5000,21],['alt','ALT','U/L',1,5000,18],['ggt','γ-GTP','U/L',1,3000,24],['alp','ALP','U/L',10,2000,68],
  ['tbil','총빌리루빈','mg/dL',0.1,30,0.7],['dbil','직접빌리루빈','mg/dL',0,20,0.2],['alb','알부민','g/dL',1,6,4.4],['tp','총단백','g/dL',3,12,7.2],
  ['fbs','공복혈당','mg/dL',20,800,92],['a1c','당화혈색소','%',3,20,5.5],['tc','총콜레스테롤','mg/dL',50,600,186],['tg','중성지방','mg/dL',20,3000,98],
  ['hdl','HDL','mg/dL',10,150,58],['ldl','LDL','mg/dL',10,500,108],['bun','BUN','mg/dL',2,200,13.4],['cr','크레아티닌','mg/dL',0.2,20,0.82],
  ['egfr','eGFR','mL/min/1.73m²',1,200,104],['ua','요산','mg/dL',1,20,5.1],['hscrp','hs-CRP','mg/L',0,300,0.6],['hcy','호모시스테인','µmol/L',2,100,9.4],
  ['tsh','TSH','µIU/mL',0.01,100,2.1],['ft4','Free T4','ng/dL',0.2,8,1.2],['t3','T3','ng/dL',20,600,118],['fvc','FVC','L',0.5,8,4.1],
  ['fev1','FEV1','L',0.3,7,3.4],['fev1r','FEV1/FVC','%',20,100,83],['bapwv','baPWV','cm/s',500,4000,1280],['abi','ABI','',0.3,1.8,1.1],
  ['vitd','비타민D','ng/mL',2,200,27],['ca','칼슘','mg/dL',5,15,9.4],['fib4','FIB-4','',0,20,0.8],['ldh','LDH','U/L',50,3000,176],
  ['amy','아밀라아제','U/L',5,2000,62],['cysc','Cystatin C','mg/L',0.2,10,0.8],['mg','마그네슘','mg/dL',0.5,6,2.0],['folate','엽산','ng/mL',0.5,50,9.8],
].map(([k, name, unit, min, max, sample]) => [k, { name, unit, min, max, sample }]));

const B45 = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';
export const MAX_TEXT = 8000, MAX_INFLATED = 16384, MAX_ITEMS = 300;

export function b64uEnc(u8) { let s = ''; for (let i = 0; i < u8.length; i++) s += String.fromCharCode(u8[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export function b64uDec(t) { if (!/^[A-Za-z0-9_-]*$/.test(t)) throw new Error('bad-b64u'); const s = atob(t.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - t.length % 4) % 4)); const u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i); return u; }
export function b45Enc(u8) { let o = ''; for (let i = 0; i < u8.length; i += 2) { if (i + 1 < u8.length) { const n = u8[i] * 256 + u8[i + 1]; o += B45[n % 45] + B45[Math.floor(n / 45) % 45] + B45[Math.floor(n / 2025)]; } else { const n = u8[i]; o += B45[n % 45] + B45[Math.floor(n / 45)]; } } return o; }
export function b45Dec(t) {
  if (t.length % 3 === 1) throw new Error('bad-b45'); const out = [];
  for (let i = 0; i < t.length; i += 3) {
    const c = B45.indexOf(t[i]), d = B45.indexOf(t[i + 1]), e = i + 2 < t.length ? B45.indexOf(t[i + 2]) : 0;
    if (c < 0 || d < 0 || e < 0) throw new Error('bad-b45');
    if (i + 2 < t.length) { const n = c + d * 45 + e * 2025; if (n > 65535) throw new Error('bad-b45'); out.push(n >> 8, n & 255); } else { const n = c + d * 45; if (n > 255) throw new Error('bad-b45'); out.push(n); }
  } return Uint8Array.from(out);
}

async function run(stream, bytes, cap) {   // 한도를 넘으면 그 자리에서 끊는다 (압축 폭탄 방어)
  const w = stream.writable.getWriter(); w.write(bytes).catch(() => {}); w.close().catch(() => {});
  const r = stream.readable.getReader(), chunks = []; let n = 0;
  for (;;) { const { done, value } = await r.read(); if (done) break; n += value.length; if (n > cap) { await r.cancel().catch(() => {}); throw new Error('too-big'); } chunks.push(value); }
  const o = new Uint8Array(n); let p = 0; for (const c of chunks) { o.set(c, p); p += c.length; } return o;
}
export const deflateRaw = u8 => run(new CompressionStream('deflate-raw'), u8, 1 << 20);
export const inflateRaw = (u8, cap = MAX_INFLATED) => run(new DecompressionStream('deflate-raw'), u8, cap);

export const BASE_URL = 'https://hyunjeongshin83.github.io/SmokeFreeNote/';
// 보내는 쪽: 'url' = 폰 카메라로 찍으면 앱이 열림(#뒤는 서버로 가지 않음) · 'b45' = 앱 안 스캐너용(영숫자 모드라 같은 크기에 더 많이 담김)
export async function encodeHQ(obj, mode = 'url') {
  const z = await deflateRaw(new TextEncoder().encode(JSON.stringify(obj)));
  return mode === 'b45' ? 'HQ1:' + b45Enc(z) : BASE_URL + '#hq1=' + b64uEnc(z);
}

// 읽는 쪽: 무엇이 들어와도 던지지 않고 {type, ...} 로 돌려준다
export async function decodeAny(text) {
  try {
    if (typeof text !== 'string' || !text.length) return { type: 'empty' };
    if (text.length > MAX_TEXT) return { type: 'rejected', why: '너무 길어요' };
    const t = text.trim();
    let m;
    if (t.startsWith('HQ1:')) return { type: 'hq1', obj: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await inflateRaw(b45Dec(t.slice(4))))) };
    if ((m = t.match(/#hq1=([A-Za-z0-9_-]+)$/))) return { type: 'hq1', obj: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(await inflateRaw(b64uDec(m[1])))) };
    if (t.startsWith('shc:/')) return await decodeSHC(t);
    if (t[0] === '{') { const o = JSON.parse(t); return o && o.resourceType === 'Bundle' ? { type: 'fhir', obj: o } : { type: 'json', obj: o }; }
    return { type: 'unknown', head: t.slice(0, 40) };
  } catch (e) { return { type: 'rejected', why: String(e.message || e).slice(0, 60) }; }
}

// SMART Health Card (shc:/) — 서명은 검증하지 않는다 (발급기관 공개키를 받아 와야 하는데 그러면 「스캔했다」는 사실이 밖으로 나감 → 사용자에게 「서명 미검증」으로 표시)
async function decodeSHC(t) {
  const d = t.slice(5); if (!/^\d+$/.test(d) || d.length % 2) return { type: 'rejected', why: 'shc 숫자 아님' };
  let jws = ''; for (let i = 0; i < d.length; i += 2) jws += String.fromCharCode(parseInt(d.slice(i, i + 2), 10) + 45);
  const p = jws.split('.'); if (p.length !== 3) return { type: 'rejected', why: 'JWS 아님' };
  const hdr = JSON.parse(new TextDecoder().decode(b64uDec(p[0])));
  const raw = b64uDec(p[1]); const body = hdr.zip === 'DEF' ? await inflateRaw(raw) : raw;
  const o = JSON.parse(new TextDecoder().decode(body)); const b = o && o.vc && o.vc.credentialSubject && o.vc.credentialSubject.fhirBundle;
  return { type: 'shc', signed: false, iss: String(o.iss || '').slice(0, 80), obj: b };
}

// 검증: 사전에 있는 항목만, 값은 유한한 숫자이고 사람이 가능한 범위 안, 날짜는 오늘 이전
export function validateHQ(o, now = new Date()) {
  const rej = [], warn = [], items = [], seen = new Set();
  if (!o || typeof o !== 'object' || o.v !== 1 || o.t !== 'checkup') return { ok: false, why: '이 앱이 아는 형식이 아니에요' };
  const dm = typeof o.d === 'string' && /^(\d{4})-(\d{2})-(\d{2})$/.exec(o.d); if (!dm) return { ok: false, why: '검진일이 없어요' };
  const dt = new Date(Date.UTC(+dm[1], +dm[2] - 1, +dm[3]));
  if (dt.getUTCFullYear() !== +dm[1] || dt.getUTCMonth() !== +dm[2] - 1 || dt.getUTCDate() !== +dm[3]) return { ok: false, why: '검진일이 달력에 없는 날이에요' };
  const pad = n => String(n).padStart(2, '0'), today = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;   // 사용자의 달력 날짜로 비교 — UTC 자정과 지금 시각을 비교하면 한국의 0~9시에 「오늘」이 미래가 된다
  if (o.d > today) return { ok: false, why: '검진일이 오늘 이후예요' };
  if (+dm[1] < 1990) return { ok: false, why: '검진일이 너무 옛날이에요' };
  if (!Array.isArray(o.x)) return { ok: false, why: '항목이 없어요' };
  if (o.x.length > MAX_ITEMS) return { ok: false, why: '항목이 너무 많아요' };
  for (const e of o.x) {
    if (!Array.isArray(e) || e.length !== 2 || typeof e[0] !== 'string') { rej.push('모양이 다른 항목'); continue; }
    const [k, v] = e;
    if (!Object.hasOwn(DICT, k)) { rej.push('모르는 항목: ' + k.slice(0, 12).replace(/[^\w.-]/g, '?')); continue; }
    if (typeof v !== 'number' || !Number.isFinite(v)) { rej.push(k + ': 숫자가 아니에요'); continue; }
    const s = DICT[k]; if (v < s.min || v > s.max) { rej.push(`${k}: 가능한 범위(${s.min}~${s.max}) 밖`); continue; }
    if (seen.has(k)) { warn.push(k + ': 두 번 나와 첫 값만 씀'); continue; } seen.add(k);
    items.push({ k, val: v, unit: s.unit, name: s.name });
  }
  return { ok: items.length > 0, date: o.d, items, rejected: rej, warnings: warn };
}

// 앱 기록으로: measures[] 에 kind:"lab". 가져오기가 t+kind 가 같으면 같은 기록으로 보므로 항목마다 t 를 1초씩 비켜 둔다
export function toRecords(v, batch) {
  const noon = new Date(v.date + 'T12:00:00').getTime(), order = Object.keys(DICT);
  // t 는 묶음 안의 순서가 아니라 사전의 항목 순서로 — 같은 검진을 다른 순서로 다시 읽어도 같은 항목은 같은 t·id 라 중복으로 걸러지고, 다른 항목은 t 가 다르다
  return v.items.map(it => ({ t: noon + order.indexOf(it.k) * 1000, kind: 'lab', id: `lab:${v.date}:${it.k}`, v: { k: it.k, val: it.val, u: it.unit, src: 'qr', imp: batch } }));
}
