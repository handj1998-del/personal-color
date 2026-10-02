// 진단권(QR) 서명·검증, 1회 사용 기록, 관리자 비밀번호·잠금 로직
// ⚠️ 서버가 없는 정적 사이트라 비밀키와 해시가 코드에 들어 있어요. 무작위·위조 QR을 막는 '억제' 수준의 보안이며,
//    1회 사용 기록은 이 기기(브라우저 저장소)에만 남아요. 여러 기기에서 공유하려면 서버가 필요해요.
const APP_SECRET = '295b9078d5b6b506e5cfda37d3cac3bbfa49e304ae92244b262d48ea3e89ecde';
export const ALPHA = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford Base32 (I L O U 없음)
const EPOCH = Date.UTC(2024, 0, 1); const DAY = 86400000;
export const SESSION_MS = 10 * 60 * 1000;          // 진행 중 진단 이어하기 허용 시간 (이 기기의 [이어하기] 버튼으로만)
export const PASS_MS = 60 * 60 * 1000;             // 관리자 'QR 없이 1회 허가' 유효 시간 (1개만 대기)
export const CLOCK_BACK_MS = 5 * 60 * 1000;        // 마지막 기록보다 5분 넘게 이르면 '시계가 뒤로 바뀜' 경고
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
  future: '발급일이 이 기기 날짜보다 뒤예요. 기기 날짜가 맞는지 직원에게 확인해 주세요.',
  expired: '유효기간이 지난 QR 코드예요.',
  used: '이미 사용된 QR 코드예요.',
  revoked: '사용이 취소된 QR 코드예요. 직원에게 문의해 주세요.',
};

// ---------- 이 기기의 기록 (localStorage, 개인정보 없음: 코드 ID·시각만) ----------
const K = { used: 'pcqr.used', issued: 'pcqr.issued', revoked: 'pcqr.revoked', active: 'pcqr.active', pass: 'pcqr.pass', lock: 'pcqr.lock', pw: 'pcqr.pw', seen: 'pcqr.seen', clock: 'pcqr.clock', cfg: 'pcqr.cfg' };
export const DEFAULT_CFG = { operator: 'H.O.W', contact: '', wake: true };
export const OLD_DEFAULT_OPERATORS = ['롯데렌터카 김해공항']; // 예전 기본값을 그대로 둔 기기는 새 기본값으로 바꿈
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
    revoke(id, now = Date.now()) { const all = get(K.issued, []); const it = all.find((x) => x.id === id); if (it) it.revoked = now; set(K.issued, all); const r = get(K.revoked, {}); r[id] = now; set(K.revoked, r); },
    revoked: () => get(K.revoked, {}), isRevoked: (id) => !!get(K.revoked, {})[id],
    // 다른 기기·백업에서 가져온 기록 합치기 (이미 있는 기록은 유지)
    mergeUsed(map, src = 'sync') { const u = get(K.used, {}); let n = 0; for (const [id, v] of Object.entries(map || {})) if (!u[id]) { u[id] = { at: +v?.at || Date.now(), src: v?.src || src }; n++; } set(K.used, u); return n; },
    mergeRevoked(map) { const r = get(K.revoked, {}); let n = 0; for (const [id, at] of Object.entries(map || {})) if (!r[id]) { r[id] = +at || Date.now(); n++; } set(K.revoked, r); const all = get(K.issued, []); for (const it of all) if (r[it.id] && !it.revoked) it.revoked = r[it.id]; set(K.issued, all); return n; },
    mergeIssued(list) { const all = get(K.issued, []); const have = new Set(all.map((x) => x.id)); const add = (list || []).filter((x) => x && typeof x.id === 'string' && !have.has(x.id)); set(K.issued, [...add, ...all].sort((a, b) => (b.at || 0) - (a.at || 0))); return add.length; },
    cfg() { const c = get(K.cfg, {}); if (OLD_DEFAULT_OPERATORS.includes(c.operator)) { c.operator = DEFAULT_CFG.operator; set(K.cfg, c); } return { ...DEFAULT_CFG, ...c }; }, setCfg(v) { set(K.cfg, { ...get(K.cfg, {}), ...v }); },
    // 시계 확인: 지금까지 본 가장 늦은 시각 기억 (시계를 뒤로 돌려 만료·잠금을 피하지 못하게)
    seen: () => +get(K.seen, 0) || 0,
    touchSeen(now = Date.now()) { const s = +get(K.seen, 0) || 0; if (now > s) set(K.seen, now); if (s && now < s - CLOCK_BACK_MS) { const w = { kind: 'back', by: s - now, at: now }; set(K.clock, w); return w; } return null; },
    clockWarn: () => get(K.clock, null), setClockWarn: (w) => set(K.clock, w), clearClockWarn: () => del(K.clock),
    // 진행 중 세션
    active(now = Date.now()) { const a = get(K.active, null); return a && !a.done && now - a.at < SESSION_MS && now >= a.at - CLOCK_BACK_MS ? a : null; },
    startSession(id, src, now = Date.now(), extra = {}) { set(K.active, { id, src, at: now, done: false, ...extra }); },
    finishSession() { const a = get(K.active, null); if (a) { a.done = true; set(K.active, a); } },
    endSession() { del(K.active); },
    // 관리자 1회 허가
    // 관리자 1회 허가: 쌓이지 않음(최대 1개), 1시간 뒤 자동 만료, 취소 가능
    passInfo(now = Date.now()) { const p = get(K.pass, null); return p && typeof p === 'object' && (p.n | 0) > 0 && p.until > now && now >= (p.at || 0) - CLOCK_BACK_MS ? p : null; },
    grantPass(now = Date.now()) { const had = !!this.passInfo(now); set(K.pass, { at: now, until: now + PASS_MS, n: 1 }); return { renewed: had }; },
    takePass(now = Date.now()) { const p = this.passInfo(now); if (!p) { del(K.pass); return false; } if ((p.n | 0) > 1) set(K.pass, { ...p, n: p.n - 1 }); else del(K.pass); return true; },
    cancelPass() { del(K.pass); },
    lock: () => get(K.lock, { fails: 0, until: 0 }), setLock: (v) => set(K.lock, v),
    pw: () => get(K.pw, null), setPw: (v) => set(K.pw, v),
  };
}
// 스캔/입력한 코드를 받아들일지 판단 (같은 세션 이어하기는 허용)
export async function admit(store, text, now = Date.now(), src = 'qr') {
  // 만료 판정은 '지금까지 본 가장 늦은 시각' 기준 (시계를 뒤로 돌려도 만료 코드가 통과하지 않게)
  const v = await verifyToken(text, Math.max(now, store.seen?.() || 0));
  if (!v.ok) { if (v.reason === 'future' && store.setClockWarn) store.setClockWarn({ kind: 'behind', at: now, id: v.id }); return { ...v, msg: REJECT_MSG[v.reason] }; }
  if (store.isRevoked(v.id)) return { ok: false, reason: 'revoked', id: v.id, msg: REJECT_MSG.revoked };
  const a = store.active(now);
  if (store.isUsed(v.id)) {
    if (a && a.id === v.id) return { ok: true, resumed: true, ...v };
    return { ok: false, reason: 'used', id: v.id, msg: REJECT_MSG.used };
  }
  store.markUsed(v.id, now, src); store.startSession(v.id, src, now);
  return { ok: true, resumed: false, ...v };
}
export function statusOf(store, item, now = Date.now()) {
  if (item.revoked || store.isRevoked(item.id)) return ['revoked', '취소됨'];
  if (store.isUsed(item.id)) return ['used', '사용됨'];
  if (item.exp && localDay(Math.max(now, store.seen?.() || 0)) > item.exp) return ['expired', '만료'];
  return ['new', '미사용'];
}

// ---------- 비밀번호 (PBKDF2-SHA256) + 잠금 ----------
export async function hashPw(pw, saltHex, iter = DEFAULT_PW.iter) {
  const key = await subtle().importKey('raw', enc.encode(String(pw)), 'PBKDF2', false, ['deriveBits']);
  return hex(await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: iter }, key, 256));
}
export async function makePwRecord(pw) { const s = new Uint8Array(16); globalThis.crypto.getRandomValues(s); const salt = hex(s); return { salt, hash: await hashPw(pw, salt), iter: DEFAULT_PW.iter }; }
export function lockState(lock, now = Date.now()) { return lock.until > now && lock.until - now <= LOCK_MS ? { locked: true, waitS: Math.ceil((lock.until - now) / 1000) } : { locked: false, left: LOCK_FAILS - (lock.fails || 0) }; }
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

// ---------- 서명된 파일·QR (백업, 기기 간 사용 기록 옮기기) ----------
export async function hmacHex(str) {
  const key = await subtle().importKey('raw', unhex(APP_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return hex(await subtle().sign('HMAC', key, enc.encode('PCF|' + str)));
}
const canon = (o) => JSON.stringify(o);
export async function makeBackup(store, kind = 'backup', now = Date.now()) {
  const data = kind === 'used' ? { used: store.used(), revoked: store.revoked() }
    : { issued: store.issued(), used: store.used(), revoked: store.revoked(), cfg: store.cfg(), pw: store.pw() };
  return { app: 'personal-color', kind, v: 1, at: now, data, sig: await hmacHex(kind + '|' + canon(data)) };
}
export async function readBackup(obj) {
  if (!obj || obj.app !== 'personal-color' || !['backup', 'used'].includes(obj.kind) || !obj.data) return { ok: false, msg: '이 앱의 백업 파일이 아니에요.' };
  if ((await hmacHex(obj.kind + '|' + canon(obj.data))) !== obj.sig) return { ok: false, msg: '파일 내용이 바뀌었거나 손상돼서 가져올 수 없어요.' };
  return { ok: true, kind: obj.kind, data: obj.data, at: obj.at };
}
export function applyBackup(store, { kind, data }, { withPw = false } = {}) {
  const r = { issued: 0, used: 0, revoked: 0, pw: false };
  if (kind === 'backup') { r.issued = store.mergeIssued(data.issued); if (data.cfg) store.setCfg({ operator: data.cfg.operator, contact: data.cfg.contact }); if (withPw && data.pw?.salt && data.pw?.hash) { store.setPw(data.pw); r.pw = true; } }
  r.used = store.mergeUsed(data.used); r.revoked = store.mergeRevoked(data.revoked);
  return r;
}
// 사용 기록 QR: PCU1:<쪽>/<전체>:<사용 ID…>.<취소 ID…>:<서명>  (ID 8자, 영숫자 QR 모드)
export const SYNC_PER_QR = 60;
const isId = (id) => /^[0-9A-HJKMNP-TV-Z]{8}$/.test(id);
export async function makeSyncQrs(store, per = SYNC_PER_QR) {
  const u = Object.keys(store.used()).filter(isId).map((id) => 'U' + id), r = Object.keys(store.revoked()).filter(isId).map((id) => 'R' + id);
  const all = [...u, ...r], pages = [];
  for (let i = 0; i < Math.max(1, all.length); i += per) pages.push(all.slice(i, i + per));
  const out = [];
  for (let i = 0; i < pages.length; i++) { const body = `PCU1:${i + 1}/${pages.length}:${pages[i].join('')}`; out.push(body + ':' + (await hmacHex(body)).slice(0, 12).toUpperCase()); }
  return out;
}
export async function readSyncQr(text) {
  const m = /^PCU1:(\d+)\/(\d+):((?:[UR][0-9A-HJKMNP-TV-Z]{8})*):([0-9A-F]{12})$/.exec(String(text || '').trim());
  if (!m) return { ok: false, msg: '사용 기록 QR이 아니에요.' };
  const body = `PCU1:${m[1]}/${m[2]}:${m[3]}`;
  if ((await hmacHex(body)).slice(0, 12).toUpperCase() !== m[4]) return { ok: false, msg: '사용 기록 QR이 올바르지 않아요.' };
  const used = {}, revoked = {}, now = Date.now();
  for (const x of m[3].match(/.{9}/g) || []) (x[0] === 'U' ? (used[x.slice(1)] = { at: now, src: 'sync' }) : (revoked[x.slice(1)] = now));
  return { ok: true, page: +m[1], pages: +m[2], used, revoked };
}
// ---------- 통계 ----------
export function stats(store, now = Date.now()) {
  const used = store.used(), issued = store.issued(), today = localDay(now);
  const days = Array.from({ length: 7 }, (_, i) => ({ day: today - 6 + i, n: 0 }));
  const src = { qr: 0, manual: 0, admin: 0, sync: 0 }; let todayN = 0, weekN = 0, monthN = 0;
  for (const v of Object.values(used)) {
    const s = v.src in src ? v.src : 'qr'; src[s]++;
    if (s === 'sync') continue; // 다른 기기에서 쓴 기록은 이 기기 이용 수에서 뺌
    const d = localDay(v.at); if (d === today) todayN++; if (d > today - 7) weekN++; if (d > today - 30) monthN++;
    const slot = days.find((x) => x.day === d); if (slot) slot.n++;
  }
  const st = { new: 0, used: 0, revoked: 0, expired: 0 }; let soon = 0; const batches = {};
  for (const it of issued) {
    const [k] = statusOf(store, it, now); st[k]++;
    if (k === 'new' && it.exp && it.exp - today <= 7) soon++;
    const b = it.batch || 'b' + (it.at || 0), B = (batches[b] ||= { memo: it.memo || '', at: it.at || 0, n: 0, used: 0 }); B.n++; if (k === 'used') B.used++;
  }
  return { today: todayN, week: weekN, month: monthN, days: days.map((x) => ({ label: fmtDay(x.day).slice(5), n: x.n })), src, issued: issued.length, status: st, soon, batches: Object.values(batches).sort((a, b) => b.at - a.at) };
}
export function toCsv(store, now = Date.now()) {
  const used = store.used(), esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`, t = (ms) => (ms ? new Date(ms).toLocaleString('ko-KR', { hour12: false }) : '');
  const rows = [['일련번호', '코드', '발급일', '만료일', '묶음 메모', '상태', '사용 시각', '사용 방법', '취소 시각']];
  for (const it of store.issued()) { const [, l] = statusOf(store, it, now); const u = used[it.id]; rows.push([it.id, it.token || '', fmtDay(it.issued), it.exp ? fmtDay(it.exp) : '', it.memo || '', l, t(u?.at), u ? { qr: 'QR', manual: '코드 입력', sync: '다른 기기', admin: '관리자' }[u.src] || u.src : '', t(it.revoked)]); }
  return '\ufeff' + rows.map((r) => r.map(esc).join(',')).join('\r\n');
}
