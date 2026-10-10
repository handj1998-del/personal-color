// 결과물 이용 안내 (화면·저장 흐름·결과 이미지에 함께 표시)
export const LEGAL_NOTICE = '이 결과는 받은 분 본인의 개인 참고용이에요. 무단 복제·배포·상업적 이용은 저작권법 등 관련 법령에 따라 법적 책임이 따를 수 있습니다.';
// 결과 → 짧은 코드 (고객 휴대폰용 주소 #r=… 에 담음). 얼굴 사진·측정값 없이 타입·신뢰도·방법·날짜·얼굴형만
import { SEASONS, SEASON_ORDER } from './seasons.js';
import { FACE_ORDER } from './style.js';
export const CONF_C = { high: 'h', mid: 'm', low: 'l' }, METHODS = ['자동 분석', '드레이핑', '자동 분석 + 드레이핑'];
function encodeV1(f, faceSel, gender = 'f') {
  const fi = FACE_ORDER.indexOf(faceSel || ''), d = f.date.replaceAll('.', '');
  return '1' + SEASON_ORDER.indexOf(f.id) + SEASON_ORDER.findIndex((k) => SEASONS[k] === f.second || k === f.second?.id) + CONF_C[f.conf.level] + Math.max(0, METHODS.indexOf(f.method)) + (fi < 0 ? 'x' : fi) + d + (gender === 'm' ? 'm' : 'f'); // v1.5: 끝에 헤어 스타일 기준(f/m)
}
// ---- v1.8: 24시간 유효 + 위·변조 확인 (주소의 만료 시각까지 서명) ----
// 서버가 없어 키가 앱 안에 있으므로 '손으로 고친 주소'를 막는 정도의 확인이에요(암호학적 보안은 아님).
export const RESULT_TTL_MS = 24 * 60 * 60 * 1000;
const MAC_KEY = 'pc-result-v2:how-personal-color';
function sha256(bytes) {
  const K = new Uint32Array([0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2]);
  const H = new Uint32Array([0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19]);
  const n = bytes.length, len = ((n + 9 + 63) >> 6) << 6, m = new Uint8Array(len); m.set(bytes); m[n] = 0x80;
  const dv = new DataView(m.buffer); dv.setUint32(len - 4, n * 8); dv.setUint32(len - 8, Math.floor(n / 0x20000000));
  const w = new Uint32Array(64), r = (x, k) => (x >>> k) | (x << (32 - k));
  for (let o = 0; o < len; o += 64) {
    for (let i = 0; i < 16; i++) w[i] = dv.getUint32(o + i * 4);
    for (let i = 16; i < 64; i++) { const s0 = r(w[i-15], 7) ^ r(w[i-15], 18) ^ (w[i-15] >>> 3), s1 = r(w[i-2], 17) ^ r(w[i-2], 19) ^ (w[i-2] >>> 10); w[i] = (w[i-16] + s0 + w[i-7] + s1) | 0; }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) { const t1 = (h + (r(e, 6) ^ r(e, 11) ^ r(e, 25)) + ((e & f) ^ (~e & g)) + K[i] + w[i]) | 0, t2 = ((r(a, 2) ^ r(a, 13) ^ r(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0; h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0; }
    H[0] += a; H[1] += b; H[2] += c; H[3] += d; H[4] += e; H[5] += f; H[6] += g; H[7] += h;
  }
  const out = new Uint8Array(32); const ov = new DataView(out.buffer); H.forEach((v, i) => ov.setUint32(i * 4, v)); return out;
}
function hmac(msg) {
  const enc = new TextEncoder(), k = new Uint8Array(64); k.set(enc.encode(MAC_KEY).slice(0, 64));
  const ip = k.map((x) => x ^ 0x36), op = k.map((x) => x ^ 0x5c), mb = enc.encode(msg);
  const inner = new Uint8Array(64 + mb.length); inner.set(ip); inner.set(mb, 64);
  const outer = new Uint8Array(96); outer.set(op); outer.set(sha256(inner), 64);
  const h = sha256(outer); return ((((h[0] << 24) | (h[1] << 16) | (h[2] << 8) | h[3]) >>> 0) * 256 + h[4]).toString(36).padStart(8, '0').slice(-8);
}
// 형식: '2' + 결과(14자) + 만료 시각(분 단위, 36진수 7자) + 서명 8자 [+ '&b=' 상호(운영 주체, 서명에 포함)]
export function encodeResult(f, faceSel, gender = 'f', expMs, brand = '') {
  const body = encodeV1(f, faceSel, gender).slice(1), exp = Math.floor(expMs / 60000).toString(36).padStart(7, '0');
  const core = '2' + body + exp, b = String(brand || '').trim().slice(0, 20);
  return core + hmac(core + (b ? '|' + b : '')) + (b ? '&b=' + encodeURIComponent(b) : '');
}
// 돌려주는 값: null(잘못된 주소·변조) / { expired:true } (24시간 지남·예전 주소) / 결과(+ exp)
export function decodeResult(code, now = Date.now()) {
  code = String(code || ''); let brand = '';
  const bi = code.indexOf('&b='); if (bi >= 0) { try { brand = decodeURIComponent(code.slice(bi + 3)); } catch { return null; } code = code.slice(0, bi); if (!brand || brand.length > 20) return null; }
  if (/^1/.test(code)) return decodeV1(code) ? { expired: true, legacy: true } : null; // v1.7 이전 주소(유효기간 없음)는 만료로 봄
  const m = /^2([0-9a-z]{14})([0-9a-z]{7})([0-9a-z]{8})$/.exec(code); if (!m) return null;
  if (hmac('2' + m[1] + m[2] + (brand ? '|' + brand : '')) !== m[3]) return null;
  const f = decodeV1('1' + m[1]); if (!f) return null;
  const exp = parseInt(m[2], 36) * 60000;
  if (!(exp > 0) || exp - now > RESULT_TTL_MS + 5 * 60000) return null; // 기기 시계 오차 5분까지만 허용
  if (now >= exp) return { expired: true, exp };
  return { ...f, exp, brand };
}
function decodeV1(code) {
  const m = /^1([0-7])([0-7])([hml])([0-2])([0-5x])(\d{8})([fm])?$/.exec(String(code || '')); if (!m) return null; // 예전(14자) 주소도 열림
  const id = SEASON_ORDER[+m[1]], level = { h: 'high', m: 'mid', l: 'low' }[m[3]], face = m[5] === 'x' ? null : FACE_ORDER[+m[5]];
  // v1.7: 없는 날짜(13월·32일 등)는 잘못된 주소로 봄
  const y = +m[6].slice(0, 4), mo = +m[6].slice(4, 6), dd = +m[6].slice(6), dt = new Date(Date.UTC(y, mo - 1, dd));
  if (y < 2020 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== dd) return null;
  const date = `${m[6].slice(0, 4)}.${m[6].slice(4, 6)}.${m[6].slice(6)}`;
  return { id, season: SEASONS[id], second: SEASONS[SEASON_ORDER[+m[2]]], conf: { level, label: { high: '높음', mid: '보통', low: '낮음' }[level] }, method: METHODS[+m[4]], date, face: null, sharedFace: face, sharedGender: m[7] || 'f', changed: false };
}
export const RESULT_RE = /^#r=([0-9a-z]+(?:&b=[^&#]{1,200})?)$/;
