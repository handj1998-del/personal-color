// 진단권(QR) 서명·검증, 1회 사용 기록, 관리자 비밀번호·잠금 로직
// ⚠️ 서버가 없는 정적 사이트라 비밀키와 해시가 코드에 들어 있어요. 무작위·위조 QR을 막는 '억제' 수준의 보안이며,
//    1회 사용 기록은 이 기기(브라우저 저장소)에만 남아요. 여러 기기에서 공유하려면 서버가 필요해요.
const APP_SECRET = '295b9078d5b6b506e5cfda37d3cac3bbfa49e304ae92244b262d48ea3e89ecde';
export const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32 (I L O U 없음)
const EPOCH = Date.UTC(2024, 0, 1); const DAY = 86400000;
export const SESSION_MS = 30 * 60 * 1000;          // 진행 중 진단 이어하기 허용 시간
export const LOCK_FAILS = 5, LOCK_MS = 60 * 1000;  // 비밀번호 5회 오류 → 60초 잠금
export const ADMIN_IDLE_MS = 3 * 60 * 1000;        // 관리자 3분 무동작 → 자동 로그아웃
// 기본 관리자 비밀번호의 PBKDF2-SHA256 해시 (평문은 코드에 넣지 않음, 사용방법.txt 참고)
export const DEFAULT_PW = { salt: '794222c6f54d72bc0ba026c537f3063c', hash: '52a9ba73e2bb49f98d4780f6914281403a53107a1051da99cadbf8d786aa2b56', iter: 150000 };

const enc = new TextEncoder();
const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const unhex = (h) => new Uint8Array(h.match(/../g).map((x) => parseInt(x, 16)));
const subtle = () => { const s = globalThis.crypto?.subtle; if (!s) throw new Error('nocrypto'); return s; };

export function b32(n, len) { let s = ''; for (let i = 0; i < len; i++) { s = ALPHA[n % 32] + s; n = Math.floor(n / 32); } return s; }
export function unb32(s) { let n = 0; for (const ch of s) { const v = ALPHA.indexOf(ch); if (v < 0) return NaN; n = n * 32 + v; } return n; }
const bitsToB32 = (bytes, chars) => { let bits = ''; for (const b of bytes) bits += b.toString(2).padStart(8, '0'); let s = ''; for (let i = 0; i < chars; i++) s += ALPHA[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]; return s; };
export const dayOf = (ms) => Math.floor((ms - EPOCH) / DAY);
export const dateOfDay = (d) => new Date(EPOCH + d * DAY);
export const fmtDay = (d) => { const t = dateOfDay(d); return `${t.getUTCFullYear()}.${String(t.getUTCMonth() + 1).padStart(2, '0')}.${String(t.getUTCDate()).padStart(2, '0')}`; };
const localDay = (ms) => { const t = new Date(ms); return dayOf(Date.UTC(t.getFullYear(), t.getMonth(), t.getDate())); };

async function sig(body) {
  const key = await subtle().importKey('raw', unhex(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return bitsToB32(new Uint8Array(await subtle().sign('HMAC', key, enc.encode('PC1|' + body))), 10);
}
export function randomId() { const b = new Uint8Array(5); globalThis.crypto.getRandomValues(b); return bitsToB32(b, 8); }
const group = (s) => s.match(/.{1,4}/g).join('-');
// 코드: PC1-[ID 8][발급일 3][만료일 3][서명 10] → 24자를 4자씩 끊어 표시
export async function makeToken({ id = randomId(), issuedMs = Date.now(), expDays = 0, expMs = null } = {}) {
  const iss = localDay(issuedMs), exp = expMs ? localDay(expMs) : expDays ? iss + expDays : 0;
  const body = id + b32(iss, 3) + b32(exp, 3);
  const raw = body + (await sig(body));
  return { id, issued: iss, exp, code: group(raw), token: 'PC1-' + group(raw) };
}
// 사람 입력/QR 내용 정규화: 대소문자·공백·하이픈 무시, 헷갈리는 글자(O→0, I/L→1) 보정
export function normalize(text) {
  let s = String(text || '').toUpperCase().replace(/[^0-9A-Z]/g, '');
  if (s.length === 27 && s.startsWith('PC1')) s = s.slice(3);
  return s.replace(/O/g, '0').replace(/[IL]/g, '1');
}
export async function verifyToken(text, now = Date.now()) {
  const s = normalize(text);
  if (s.length !== 24 || /[^0-9A-HJKMNP-TV-Z]/.test(s)) return { ok: false, reason: 'format' };
  const body = s.slice(0, 14), given = s.slice(14);
  let expect; try { expect = await sig(body); } catch { return { ok: false, reason: 'crypto' }; }
  if (expect !== given) return { ok: false, reason: 'signature' };
  const id = s.slice(0, 8), issued = unb32(s.slice(8, 11)), exp = unb32(s.slice(11, 14));
  const today = localDay(now);
  if (issued > today + 1) return { ok: false, reason: 'future', id };
  if (exp && today > exp) return { ok: false, reason: 'expired', id, issued, exp };
  return { ok: true, id, issued, exp, code: group(s) };
}
export const REJECT_MSG = {
  format: '진단권 QR 코드가 아니에요. 매장에서 받은 진단권을 보여 주세요.',
  signature: '유효하지 않은 QR 코드예요. 매장에서 발급한 진단권인지 확인해 주세요.',
  crypto: '이 브라우저에서는 진단권을 확인할 수 없어요 (HTTPS 주소로 접속해 주세요).',
  future: '유효하지 않은 QR 코드예요 (발급일 오류).',
  expired: '유효기간이 지난 QR 코드예요.',
  used: '이미 사용된 QR 코드예요.',
  revoked: '사용이 취소된 QR 코드예요. 직원에게 문의해 주세요.',
};

// ---------- 이 기기의 기록 (localStorage, 개인정보 없음: 코드 ID·시각만) ----------
const K = { used: 'pcqr.used', issued: 'pcqr.issued', active: 'pcqr.active', pass: 'pcqr.pass', lock: 'pcqr.lock', pw: 'pcqr.pw' };
export const STORAGE_PREFIX = 'pcqr.';
export function createStore(backend = globalThis.localStorage) {
  const get = (k, d) => { try { const v = backend.getItem(k); return v == null ? d : JSON.parse(v); } catch { return d; } };
  const set = (k, v) => { try { backend.setItem(k, JSON.stringify(v)); } catch {} };
  const del = (k) => { try { backend.removeItem(k); } catch {} };
  return {
    used: () => get(K.used, {}), isUsed: (id) => !!get(K.used, {})[id],
    markUsed(id, now = Date.now(), src = 'qr') { const u = get(K.used, {}); if (!u[id]) u[id] = { at: now, src }; set(K.used, u); },
    issued: () => get(K.issued, []),
    addIssued(list) { const all = get(K.issued, []); set(K.issued, [...list, ...all]); },
    revoke(id, now = Date.now()) { const all = get(K.issued, []); const it = all.find((x) => x.id === id); if (it) it.revoked = now; set(K.issued, all); const r = get('pcqr.revoked', {}); r[id] = now; set('pcqr.revoked', r); },
    isRevoked: (id) => !!get('pcqr.revoked', {})[id],
    // 진행 중 세션
    active(now = Date.now()) { const a = get(K.active, null); return a && !a.done && now - a.at < SESSION_MS ? a : null; },
    startSession(id, src, now = Date.now()) { set(K.active, { id, src, at: now, done: false }); },
    finishSession() { const a = get(K.active, null); if (a) { a.done = true; set(K.active, a); } },
    endSession() { del(K.active); },
    // 관리자 1회 허가
    passCount: () => get(K.pass, 0) | 0,
    grantPass() { set(K.pass, (get(K.pass, 0) | 0) + 1); },
    takePass() { const n = get(K.pass, 0) | 0; if (n <= 0) return false; set(K.pass, n - 1); return true; },
    lock: () => get(K.lock, { fails: 0, until: 0 }), setLock: (v) => set(K.lock, v),
    pw: () => get(K.pw, null), setPw: (v) => set(K.pw, v),
  };
}
// 스캔/입력한 코드를 받아들일지 판단 (같은 세션 이어하기는 허용)
export async function admit(store, text, now = Date.now()) {
  const v = await verifyToken(text, now);
  if (!v.ok) return { ...v, msg: REJECT_MSG[v.reason] };
  if (store.isRevoked(v.id)) return { ok: false, reason: 'revoked', id: v.id, msg: REJECT_MSG.revoked };
  const a = store.active(now);
  if (store.isUsed(v.id)) {
    if (a && a.id === v.id) return { ok: true, resumed: true, ...v };
    return { ok: false, reason: 'used', id: v.id, msg: REJECT_MSG.used };
  }
  store.markUsed(v.id, now, 'qr'); store.startSession(v.id, 'qr', now);
  return { ok: true, resumed: false, ...v };
}
export function statusOf(store, item, now = Date.now()) {
  if (item.revoked || store.isRevoked(item.id)) return ['revoked', '취소됨'];
  if (store.isUsed(item.id)) return ['used', '사용됨'];
  if (item.exp && localDay(now) > item.exp) return ['expired', '만료'];
  return ['new', '미사용'];
}

// ---------- 비밀번호 (PBKDF2-SHA256) + 잠금 ----------
export async function hashPw(pw, saltHex, iter = DEFAULT_PW.iter) {
  const key = await subtle().importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
export async function makePwRecord(pw) { const s = new Uint8Array(16); globalThis.crypto.getRandomValues(s); const salt = hex(s); return { salt, hash: await hashPw(pw, salt), iter: DEFAULT_PW.iter }; }
export function lockState(lock, now = Date.now()) { return lock.until > now ? { locked: true, waitS: Math.ceil((lock.until - now) / 1000) } : { locked: false, left: LOCK_FAILS - (lock.fails || 0) }; }
export function afterFail(lock, now = Date.now()) {
  const base = lock.until && lock.until <= now ? { fails: 0, until: 0 } : lock;
  const fails = (base.fails || 0) + 1;
  return fails >= LOCK_FAILS ? { fails: 0, until: now + LOCK_MS } : { fails, until: 0 };
}
export async function tryLogin(store, pw, now = Date.now()) {
  const ls = lockState(store.lock(), now);
  if (ls.locked) return { ok: false, locked: true, waitS: ls.waitS };
  const rec = store.pw() || DEFAULT_PW;
  const ok = (await hashPw(pw, rec.salt, rec.iter)) === rec.hash;
  if (ok) { store.setLock({ fails: 0, until: 0 }); return { ok: true }; }
  const nl = afterFail(store.lock(), now); store.setLock(nl);
  return nl.until ? { ok: false, locked: true, waitS: Math.ceil(LOCK_MS / 1000) } : { ok: false, left: LOCK_FAILS - nl.fails };
}
