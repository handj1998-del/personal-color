// 관리자 모드: 로그인(해시·잠금·자동 로그아웃), 진단권 발급·카드/A4/PDF, 목록·취소, QR 없이 1회 허가, 비밀번호 변경
import { makeToken, tryLogin, lockState, makePwRecord, statusOf, fmtDay, ADMIN_IDLE_MS, LOCK_FAILS } from './ticket.js';
import { renderCard, renderSheet, makePdf, SHEET } from './qrcard.js';

export function initAdmin({ $, go, toast, ask, store, getScreen }) {
  const A = { authed: false, last: 0, idleMs: ADMIN_IDLE_MS, batch: [], idx: 0, tab: 'issue', pvList: [] };
  const touch = () => { A.last = Date.now(); };
  ['pointerdown', 'keydown', 'input', 'wheel'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
  setInterval(() => { if (A.authed && Date.now() - A.last > A.idleMs) logout('오래 사용하지 않아 관리자 모드에서 자동으로 나왔어요.'); }, 1000);

  function open() { if (A.authed) { touch(); return go('admin').then(render); } $('adminPw').value = ''; showLoginMsg(); go('adminLogin').then(() => $('adminPw').focus()); }
  function showLoginMsg(msg, bad = true) {
    const ls = lockState(store.lock()); const el = $('adminLoginMsg');
    if (ls.locked) { msg = `비밀번호를 ${LOCK_FAILS}번 틀려 잠겼어요. ${ls.waitS}초 후 다시 시도해 주세요.`; }
    el.hidden = !msg; el.textContent = msg || ''; el.className = 'status' + (bad ? ' bad' : '');
    $('btnAdminLogin').disabled = ls.locked;
    if (ls.locked) setTimeout(() => getScreen() === 'adminLogin' && showLoginMsg(), 1000);
  }
  async function login() {
    const pw = $('adminPw').value; $('adminPw').value = '';
    if (!pw) return showLoginMsg('비밀번호를 입력해 주세요.');
    const r = await tryLogin(store, pw);
    if (r.ok) { A.authed = true; touch(); toast('관리자 모드예요.'); await go('admin'); render(); return; }
    showLoginMsg(r.locked ? null : `비밀번호가 맞지 않아요. (남은 시도 ${r.left}번)`);
  }
  function logout(msg) { A.authed = false; A.batch = []; $('issueResult').hidden = true; $('cardPreview').removeAttribute('src'); closePv(); if (msg) toast(msg, 4000); if (String(getScreen()).startsWith('admin')) go('home'); }

  // ---------- 탭 ----------
  function setTab(t) { A.tab = t; render(); }
  function render() {
    for (const [t, id, box] of [['issue', 'tabIssue', 'admIssue'], ['list', 'tabList', 'admList'], ['settings', 'tabSettings', 'admSettings']]) { $(id).classList.toggle('on', A.tab === t); $(box).hidden = A.tab !== t; }
    const n = store.passCount(); $('adminPassChip').textContent = n ? `QR 없이 진단 ${n}회 대기 중` : ''; $('adminPassChip').hidden = !n;
    if (A.tab === 'list') renderList();
  }
  // ---------- 발급 ----------
  async function issue() {
    const q = Math.max(1, Math.min(50, parseInt($('issueQty').value, 10) || 0)); $('issueQty').value = q;
    const ev = $('issueExp').value; let opt = {};
    if (ev === 'date') { const d = $('issueDate').value; if (!d) return toast('만료일을 선택해 주세요.'); const [y, m, dd] = d.split('-').map(Number); opt.expMs = new Date(y, m - 1, dd).getTime(); if (opt.expMs < Date.now() - 86400000) return toast('만료일은 오늘 이후여야 해요.'); }
    else opt.expDays = parseInt(ev, 10) || 0;
    const now = Date.now(), list = [];
    for (let i = 0; i < q; i++) { const t = await makeToken({ ...opt, issuedMs: now }); list.push({ ...t, at: now }); }
    store.addIssued(list); A.batch = list; A.idx = 0;
    $('issueResult').hidden = false; preview(); toast(`진단권 ${q}장을 발급했어요.`);
  }
  function preview() {
    const t = A.batch[A.idx]; if (!t) return;
    const cv = renderCard(document.createElement('canvas'), t, 200);
    $('cardPreview').src = cv.toDataURL('image/png'); cv.width = cv.height = 1;
    $('cardIdx').textContent = `${A.idx + 1} / ${A.batch.length} · No. ${t.id}`;
  }
  const step = (d) => { if (!A.batch.length) return; A.idx = (A.idx + d + A.batch.length) % A.batch.length; preview(); };
  function download(blob, name) { const u = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = u; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(u), 5000); }
  const toBlob = (cv, type, q) => new Promise((r) => cv.toBlob(r, type, q));
  async function cardPng() { const t = A.batch[A.idx]; if (!t) return; const cv = renderCard(document.createElement('canvas'), t, 300); download(await toBlob(cv, 'image/png'), `진단권_${t.id}.png`); cv.width = 1; }
  const chunks = (list) => { const out = []; const per = SHEET.cols * SHEET.rows; for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per)); return out; };
  async function pdf(list = A.pvList.length ? A.pvList : A.batch) {
    if (!list.length) return toast('먼저 진단권을 발급해 주세요.');
    const pages = [];
    for (const ch of chunks(list)) { const cv = renderSheet(document.createElement('canvas'), ch, 300); const b = await toBlob(cv, 'image/jpeg', 0.92); pages.push({ bytes: new Uint8Array(await b.arrayBuffer()), w: cv.width, h: cv.height }); cv.width = 1; }
    download(makePdf(pages), `진단권_A4_${list.length}장.pdf`); toast('PDF를 저장했어요.');
  }
  async function printView(list = A.batch) {
    if (!list.length) return toast('인쇄할 진단권이 없어요.');
    A.pvList = list; const box = $('pvPages'); box.innerHTML = '';
    for (const ch of chunks(list)) { const cv = renderSheet(document.createElement('canvas'), ch, 300); const img = new Image(); img.className = 'pv-page'; img.alt = 'A4 인쇄 시트'; img.src = URL.createObjectURL(await toBlob(cv, 'image/png')); box.appendChild(img); cv.width = 1; }
    $('pvTitle').textContent = `인쇄 미리보기 · ${list.length}장 · A4 ${box.children.length}쪽 (배율 100%로 인쇄)`; $('printView').hidden = false;
  }
  function closePv() { const box = $('pvPages'); [...box.querySelectorAll('img')].forEach((i) => URL.revokeObjectURL(i.src)); box.innerHTML = ''; $('printView').hidden = true; A.pvList = []; }
  async function sheetPng() { const list = A.pvList; const cs = chunks(list); for (let i = 0; i < cs.length; i++) { const cv = renderSheet(document.createElement('canvas'), cs[i], 300); download(await toBlob(cv, 'image/png'), `진단권_A4_${i + 1}.png`); cv.width = 1; } }
  // ---------- 목록 ----------
  function renderList() {
    const items = store.issued(); const used = Object.keys(store.used()).length;
    const cnt = { new: 0, used: 0, revoked: 0, expired: 0 }; const rows = items.map((it) => { const [k, l] = statusOf(store, it); cnt[k]++; return { it, k, l }; });
    $('listSummary').textContent = `발급 ${items.length} · 미사용 ${cnt.new} · 사용됨 ${cnt.used} · 취소 ${cnt.revoked} · 만료 ${cnt.expired} (이 기기에서 사용 처리된 코드 ${used}개)`;
    $('qList').innerHTML = rows.length ? rows.map(({ it, k, l }) => `<div class="qrow" data-id="${it.id}"><span class="mono">${it.id.slice(0, 4)}-${it.id.slice(4)}</span><span class="qd">${fmtDay(it.issued)}${it.exp ? ' ~ ' + fmtDay(it.exp) : ''}</span><span class="st st-${k}">${l}</span>${k === 'new' ? `<button class="btn sm" type="button" data-revoke="${it.id}">취소</button>` : '<span></span>'}</div>`).join('') : '<p class="sub">아직 발급한 진단권이 없어요.</p>';
  }
  async function revoke(id) { if (!(await ask(`진단권 ${id}의 사용을 취소할까요? 취소하면 이 기기에서 더 이상 쓸 수 없어요.`))) return; store.revoke(id); toast('진단권을 취소했어요.'); renderList(); }
  // ---------- 설정 ----------
  async function changePw() {
    const cur = $('pwCur').value, n1 = $('pwNew').value, n2 = $('pwNew2').value;
    if (n1.length < 4 || n1.length > 12) return toast('새 비밀번호는 4~12자로 정해 주세요.');
    if (n1 !== n2) return toast('새 비밀번호가 서로 달라요.');
    const r = await tryLogin(store, cur); if (!r.ok) { $('pwCur').value = ''; return toast(r.locked ? '잠시 후 다시 시도해 주세요.' : '현재 비밀번호가 맞지 않아요.'); }
    store.setPw(await makePwRecord(n1)); ['pwCur', 'pwNew', 'pwNew2'].forEach((i) => ($(i).value = '')); toast('비밀번호를 바꿨어요.');
  }
  function grantPass() { store.grantPass(); logout(); toast('QR 없이 진단 1회를 허가했어요. 진단 시작을 눌러 주세요.', 4000); go('home'); }

  // ---------- 연결 ----------
  $('btnAdmin').onclick = open;
  (() => { let t = null; const b = $('brand'); const cancel = () => { clearTimeout(t); t = null; };
    b.addEventListener('pointerdown', () => { cancel(); t = setTimeout(() => { t = null; open(); }, 900); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => b.addEventListener(e, cancel)); b.addEventListener('contextmenu', (e) => e.preventDefault()); })();
  $('btnAdminLogin').onclick = login; $('adminPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('btnAdminCancel').onclick = () => go('home');
  $('tabIssue').onclick = () => setTab('issue'); $('tabList').onclick = () => setTab('list'); $('tabSettings').onclick = () => setTab('settings');
  $('issueExp').onchange = (e) => { $('issueDate').hidden = e.target.value !== 'date'; };
  $('btnIssue').onclick = issue; $('btnCardPrev').onclick = () => step(-1); $('btnCardNext').onclick = () => step(1);
  $('btnCardPng').onclick = cardPng; $('btnPdf').onclick = () => pdf(A.batch); $('btnPrintView').onclick = () => printView(A.batch);
  $('btnDoPrint').onclick = () => window.print(); $('btnSheetPng').onclick = sheetPng; $('btnPvPdf').onclick = () => pdf(A.pvList); $('btnPvClose').onclick = closePv;
  $('btnPrintUnused').onclick = () => { const items = store.issued().filter((it) => statusOf(store, it)[0] === 'new'); printView(items); };
  $('qList').addEventListener('click', (e) => { const b = e.target.closest('[data-revoke]'); if (b) revoke(b.dataset.revoke); });
  $('btnPwChange').onclick = changePw; $('btnGrantPass').onclick = grantPass; $('btnAdminLogout').onclick = () => logout('관리자 모드에서 나왔어요.');
  return { open, logout, state: A, get authed() { return A.authed; }, setIdleMs: (ms) => { A.idleMs = ms; } };
}
