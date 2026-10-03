// 관리자 모드: 로그인(해시·잠금·자동 로그아웃), 진단권 발급·카드/A4/PDF, 목록·취소, QR 없이 1회 허가, 비밀번호 변경
import { makeToken, tryLogin, lockState, makePwRecord, statusOf, fmtDay, ADMIN_IDLE_MS, LOCK_FAILS, randomId, makeBackup, readBackup, applyBackup, makeSyncQrs, stats, toCsv } from './ticket.js';
import { renderCard, renderSheet, makePdf, SHEET, drawQr } from './qrcard.js';

export function initAdmin({ $, go, toast, ask, store, getScreen, openSyncScan = () => {}, onCfg = () => {} }) {
  const PRINT_IDLE_MS = 15 * 60 * 1000;
  const A = { printing: false, authed: false, last: 0, idleMs: ADMIN_IDLE_MS, batch: [], idx: 0, tab: 'issue', pvList: [], busy: false, sync: [], syncIdx: 0, installEvt: null };
  window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); A.installEvt = e; });
  const touch = () => { A.last = Date.now(); };
  ['pointerdown', 'keydown', 'input', 'wheel'].forEach((ev) => document.addEventListener(ev, touch, { passive: true, capture: true }));
  // 인쇄 창이 열려 있는 동안은 멈추고, 인쇄 미리보기가 열려 있으면 15분까지 늘림 (인쇄 도중 로그아웃 방지)
  window.addEventListener('beforeprint', () => { A.printing = true; touch(); });
  window.addEventListener('afterprint', () => { A.printing = false; touch(); });
  const idleLimit = () => ($('printView').hidden ? A.idleMs : Math.max(A.idleMs, PRINT_IDLE_MS));
  setInterval(() => { if (A.printing) { touch(); return; } if (A.authed && Date.now() - A.last > idleLimit()) logout('오래 사용하지 않아 관리자 모드에서 자동으로 나왔어요.'); }, 1000);

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
    if (r.ok) { A.authed = true; touch(); toast('관리자 모드예요.'); try { await navigator.storage?.persist?.(); } catch {} await go('admin'); render(); return; }
    showLoginMsg(r.locked ? null : `비밀번호가 맞지 않아요. (남은 시도 ${r.left}번)`);
  }
  function logout(msg) { A.authed = false; A.batch = []; closeSync(); $('issueResult').hidden = true; $('cardPreview').removeAttribute('src'); closePv(); if (msg) toast(msg, 4000); if (String(getScreen()).startsWith('admin')) go('home'); }

  // ---------- 탭 ----------
  function setTab(t) { A.tab = t; render(); }
  function render() {
    for (const [t, id, box] of [['issue', 'tabIssue', 'admIssue'], ['list', 'tabList', 'admList'], ['stats', 'tabStats', 'admStats'], ['settings', 'tabSettings', 'admSettings']]) { $(id).classList.toggle('on', A.tab === t); $(box).hidden = A.tab !== t; }
    renderPass(); renderClock();
    if (A.tab === 'list') renderList();
    if (A.tab === 'stats') renderStats();
    if (A.tab === 'settings') renderSettings();
  }
  // ---------- 발급 ----------
  async function issue() {
    const q = Math.max(1, Math.min(50, parseInt($('issueQty').value, 10) || 0)); $('issueQty').value = q;
    const ev = $('issueExp').value; let opt = {};
    if (ev === 'date') { const d = $('issueDate').value; if (!d) return toast('만료일을 선택해 주세요.'); const [y, m, dd] = d.split('-').map(Number); opt.expMs = new Date(y, m - 1, dd).getTime(); if (opt.expMs < Date.now() - 86400000) return toast('만료일은 오늘 이후여야 해요.'); }
    else opt.expDays = parseInt(ev, 10) || 0;
    const now = Date.now(), list = [], memo = $('issueMemo').value.trim().slice(0, 20), batch = 'B' + randomId();
    if (store.seen() > now + 5 * 60 * 1000) toast('⚠️ 기기 시계가 이전 기록보다 뒤로 바뀌었어요. 날짜를 확인한 뒤 발급해 주세요.', 5000);
    for (let i = 0; i < q; i++) { const t = await makeToken({ ...opt, issuedMs: now }); list.push({ ...t, at: now, batch, memo }); }
    store.addIssued(list); A.batch = list; A.idx = 0;
    $('issueResult').hidden = false; preview(); toast(`진단권 ${q}장을 발급했어요.${memo ? ' (' + memo + ')' : ''}`);
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
    if (A.busy) return; A.busy = true;
    A.pvList = list; const box = $('pvPages'); box.innerHTML = ''; const cs = chunks(list);
    const btns = ['btnDoPrint', 'btnSheetPng', 'btnPvPdf'].map($); btns.forEach((b) => (b.disabled = true));
    $('printView').hidden = false; $('pvProgress').hidden = false;
    try {
      for (let i = 0; i < cs.length; i++) {
        $('pvTitle').textContent = `인쇄 시트 만드는 중… ${i + 1} / ${cs.length}쪽`; $('pvBar').style.width = Math.round((i / cs.length) * 100) + '%';
        await new Promise((r) => setTimeout(r, 16)); // 화면에 진행 상황을 먼저 그림
        const cv = renderSheet(document.createElement('canvas'), cs[i], 300); const img = new Image(); img.className = 'pv-page'; img.alt = 'A4 인쇄 시트'; img.src = URL.createObjectURL(await toBlob(cv, 'image/png')); box.appendChild(img); cv.width = 1;
      }
      $('pvTitle').textContent = `인쇄 미리보기 · ${list.length}장 · A4 ${box.children.length}쪽 (배율 100%로 인쇄)`;
    } finally { $('pvProgress').hidden = true; btns.forEach((b) => (b.disabled = false)); A.busy = false; }
  }
  function closePv() { const box = $('pvPages'); [...box.querySelectorAll('img')].forEach((i) => URL.revokeObjectURL(i.src)); box.innerHTML = ''; $('printView').hidden = true; A.pvList = []; }
  async function sheetPng() { const list = A.pvList; const cs = chunks(list); for (let i = 0; i < cs.length; i++) { const cv = renderSheet(document.createElement('canvas'), cs[i], 300); download(await toBlob(cv, 'image/png'), `진단권_A4_${i + 1}.png`); cv.width = 1; } }
  // ---------- 목록 ----------
  const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const batchKey = (it) => it.batch || 'b' + (it.at || 0);
  function listItems() {
    const b = $('listBatch').value, f = $('listStatus').value;
    return store.issued().map((it) => { const [k, l] = statusOf(store, it); return { it, k, l }; }).filter((x) => (!b || batchKey(x.it) === b) && (!f || x.k === f));
  }
  function renderList() {
    const all = store.issued(), used = Object.keys(store.used()).length, sel = $('listBatch').value;
    const groups = new Map(); for (const it of all) { const k = batchKey(it); if (!groups.has(k)) groups.set(k, { memo: it.memo || '', at: it.at || 0, n: 0 }); groups.get(k).n++; }
    $('listBatch').innerHTML = '<option value="">전체 묶음</option>' + [...groups].map(([k, g]) => `<option value="${esc(k)}" ${k === sel ? 'selected' : ''}>${esc(g.memo || '메모 없음')} · ${new Date(g.at).toLocaleDateString('ko-KR')} · ${g.n}장</option>`).join('');
    const rows = listItems(), cnt = { new: 0, used: 0, revoked: 0, expired: 0 }; rows.forEach((r) => cnt[r.k]++);
    $('listSummary').textContent = `${rows.length}장 · 미사용 ${cnt.new} · 사용됨 ${cnt.used} · 취소 ${cnt.revoked} · 만료 ${cnt.expired} (이 기기의 사용 기록 ${used}개)`;
    $('qList').innerHTML = rows.length ? rows.map(({ it, k, l }) => `<div class="qrow" data-id="${it.id}"><span class="mono">${it.id.slice(0, 4)}-${it.id.slice(4)}</span><span class="qd">${fmtDay(it.issued)}${it.exp ? ' ~ ' + fmtDay(it.exp) : ' · 기한 없음'}${it.memo ? ' · ' + esc(it.memo) : ''}</span><span class="st st-${k}">${l}</span>${k === 'new' ? `<button class="btn sm" type="button" data-revoke="${it.id}">취소</button>` : '<span></span>'}</div>`).join('') : '<p class="sub">해당하는 진단권이 없어요.</p>';
  }
  // ---------- 통계 ----------
  function renderStats() {
    const s = stats(store), max = Math.max(1, ...s.days.map((d) => d.n));
    $('admStats').innerHTML = `
      <div class="statgrid"><div><b id="stToday">${s.today}</b><span>오늘 이용</span></div><div><b>${s.week}</b><span>최근 7일</span></div><div><b>${s.month}</b><span>최근 30일</span></div></div>
      <h3>최근 7일 이용</h3><div class="bars">${s.days.map((d) => `<div class="barcol"><i style="height:${Math.round((d.n / max) * 100)}%"></i><b>${d.n}</b><span>${d.label}</span></div>`).join('')}</div>
      <h3>진단권 현황 <small>발급 ${s.issued}장</small></h3>
      <div class="statgrid five"><div><b>${s.status.new}</b><span>미사용</span></div><div><b>${s.status.used}</b><span>사용됨</span></div><div><b>${s.status.revoked}</b><span>취소</span></div><div><b>${s.status.expired}</b><span>만료</span></div><div class="${s.soon ? 'warnbox' : ''}"><b>${s.soon}</b><span>7일 안에 만료</span></div></div>
      <h3>시작 방법</h3><p class="sub" id="stSrc">QR ${s.src.qr} · 코드 입력 ${s.src.manual} · 관리자 허가 ${s.src.admin} · 다른 기기에서 가져온 기록 ${s.src.sync}</p>
      <h3>묶음별</h3>${s.batches.length ? `<div class="qlist">${s.batches.map((b) => `<div class="qrow brow"><span>${esc(b.memo || '메모 없음')}</span><span class="qd">${new Date(b.at).toLocaleDateString('ko-KR')}</span><span class="st">${b.used} / ${b.n}장 사용</span></div>`).join('')}</div>` : '<p class="sub">아직 발급한 진단권이 없어요.</p>'}
      <p class="note">통계는 이 기기의 기록만 세요.</p>`;
  }
  // ---------- 허가 · 시계 ----------
  function renderPass() {
    const p = store.passInfo(); $('adminPassChip').hidden = $('btnPassCancel').hidden = !p;
    if (p) $('adminPassChip').textContent = `QR 없이 1회 허가 대기 중 (${new Date(p.until).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}까지)`;
  }
  function renderClock() {
    // ahead: 이 기기가 본 가장 늦은 시각이 지금보다 앞섬. 하루 넘게 앞서면 만료 판정에 영향 → [확인함]을 눌러도 계속 표시
    const w = store.clockWarn(), ahead = store.clockAhead(), big = ahead > 86400000;
    $('clockWarn').hidden = !w && !big; $('btnClockReset').hidden = !ahead; if (!w && !big) return;
    const fix = ahead ? ` 예전에 시계가 미래로 잘못 맞춰졌다가 바로잡힌 거라면, 지금 날짜·시간이 맞는지 확인한 뒤 [지금 시각으로 기준 재설정]을 눌러 주세요.${big ? ' 그 전까지는 정상 진단권도 만료로 보일 수 있어요.' : ''}` : '';
    $('clockWarnTxt').textContent = (w?.kind === 'behind' ? '⚠️ 발급일이 이 기기 날짜보다 뒤인 진단권이 있었어요. 기기 날짜·시간이 맞는지 확인해 주세요.'
      : `⚠️ 기기 시계가 이전 기록(${new Date(Date.now() + ahead).toLocaleString('ko-KR', { hour12: false })})보다 뒤로 바뀌었어요. 날짜·시간 설정을 확인해 주세요.`) + fix;
  }
  // ---------- 설정: 운영 정보 · 백업 · 기기 간 기록 · 기기 설정 ----------
  async function renderSettings() {
    const c = store.cfg(); $('cfgOp').value = c.operator || ''; $('cfgCt').value = c.contact || ''; $('cfgWake').checked = c.wake !== false; $('cfgFaceDbg').checked = !!c.faceDebug;
    $('btnInstall').hidden = !A.installEvt;
    let ps = '저장소 보호: 이 브라우저는 지원하지 않아요.';
    try { if (navigator.storage?.persisted) ps = (await navigator.storage.persisted()) ? '저장소 보호: 켜짐 ✅ (브라우저가 기록을 임의로 지우지 않아요)' : '저장소 보호: 꺼짐 — [저장소 보호 요청]을 누르거나 홈 화면에 추가해 주세요.'; } catch {}
    $('persistStatus').textContent = ps;
    const lg = store.clockLog(); $('clockLogTxt').hidden = !lg.length; if (lg.length) $('clockLogTxt').textContent = `시계 기준 재설정 기록 ${lg.length}건 · 마지막 ${new Date(lg[0].at).toLocaleString('ko-KR', { hour12: false })} (이전 기준 ${lg[0].from ? new Date(lg[0].from).toLocaleString('ko-KR', { hour12: false }) : '없음'})`;
  }
  function saveCfg() { store.setCfg({ operator: $('cfgOp').value.trim().slice(0, 40) || '매장', contact: $('cfgCt').value.trim().slice(0, 40) }); toast('운영 정보를 저장했어요. 동의 화면에 표시돼요.'); }
  const stamp = () => { const d = new Date(); return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}_${String(d.getHours()).padStart(2, '0')}${String(d.getMinutes()).padStart(2, '0')}`; };
  async function backup(kind) {
    const b = await makeBackup(store, kind);
    download(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }), kind === 'used' ? `진단권_사용기록_${stamp()}.json` : `진단권_백업_${stamp()}.json`);
    toast(kind === 'used' ? '사용 기록 파일을 저장했어요. 다른 기기에서 [백업·기록 파일 불러오기]로 가져오세요.' : '백업 파일을 저장했어요. 안전한 곳에 보관해 주세요.', 4500);
  }
  async function restoreFile(file) {
    let obj; try { obj = JSON.parse(await file.text()); } catch { return toast('파일을 읽을 수 없어요.'); }
    const r = await readBackup(obj); if (!r.ok) return toast(r.msg, 4500);
    const when = r.at ? new Date(r.at).toLocaleString('ko-KR', { hour12: false }) : '';
    if (!(await ask(r.kind === 'used' ? `사용 기록 파일(${when})을 가져올까요? 이 기기의 기록에 합쳐져요.` : `백업 파일(${when})을 불러올까요? 발급 목록·사용 기록은 지금 기록에 합쳐지고, 운영 정보는 백업 것으로 바뀌어요.`))) return;
    let withPw = false; if (r.kind === 'backup' && r.data.pw && (await ask('관리자 비밀번호도 백업 파일의 비밀번호로 바꿀까요?'))) withPw = true;
    const n = applyBackup(store, r, { withPw });
    toast(`가져왔어요: 발급 ${n.issued} · 사용 ${n.used} · 취소 ${n.revoked}${n.pw ? ' · 비밀번호' : ''}`, 4500); render();
  }
  async function showSync() {
    A.sync = await makeSyncQrs(store); A.syncIdx = 0; drawSync(); $('syncView').hidden = false;
  }
  function drawSync() { const cv = $('syncCanvas'), ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); drawQr(ctx, A.sync[A.syncIdx], 0, 0, cv.width, 4); cv.dataset.text = A.sync[A.syncIdx]; $('syncIdx').textContent = `${A.syncIdx + 1} / ${A.sync.length}쪽 · 사용 ${Object.keys(store.used()).filter((k) => !k.startsWith('PASS')).length} · 취소 ${Object.keys(store.revoked()).length}`; }
  function closeSync() { $('syncView').hidden = true; A.sync = []; }
  async function revoke(id) { if (!(await ask(`진단권 ${id}의 사용을 취소할까요? 취소하면 이 기기에서 더 이상 쓸 수 없어요.`))) return; store.revoke(id); toast('진단권을 취소했어요.'); renderList(); }
  // ---------- 설정 ----------
  async function changePw() {
    const cur = $('pwCur').value, n1 = $('pwNew').value, n2 = $('pwNew2').value;
    if (n1.length < 4 || n1.length > 12) return toast('새 비밀번호는 4~12자로 정해 주세요.');
    if (n1 !== n2) return toast('새 비밀번호가 서로 달라요.');
    const r = await tryLogin(store, cur); if (!r.ok) { $('pwCur').value = ''; return toast(r.locked ? '잠시 후 다시 시도해 주세요.' : '현재 비밀번호가 맞지 않아요.'); }
    store.setPw(await makePwRecord(n1)); ['pwCur', 'pwNew', 'pwNew2'].forEach((i) => ($(i).value = '')); toast('비밀번호를 바꿨어요.');
  }
  function grantPass() { const r = store.grantPass(); logout(); toast(r.renewed ? '이미 대기 중인 허가가 있어서 1시간 연장했어요 (1회만).' : 'QR 없이 진단 1회를 허가했어요 (1시간 안에 사용). 진단 시작을 눌러 주세요.', 4500); go('home'); }
  async function cancelPass() { if (!(await ask('대기 중인 QR 없이 1회 허가를 취소할까요?'))) return; store.cancelPass(); toast('허가를 취소했어요.'); render(); }

  // ---------- 연결 ----------
  $('btnAdmin').onclick = open;
  (() => { let t = null; const b = $('brand'); const cancel = () => { clearTimeout(t); t = null; };
    b.addEventListener('pointerdown', () => { cancel(); t = setTimeout(() => { t = null; open(); }, 900); }); ['pointerup', 'pointerleave', 'pointercancel'].forEach((e) => b.addEventListener(e, cancel)); b.addEventListener('contextmenu', (e) => e.preventDefault()); })();
  $('btnAdminLogin').onclick = login; $('adminPw').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('btnAdminCancel').onclick = () => go('home');
  $('tabIssue').onclick = () => setTab('issue'); $('tabList').onclick = () => setTab('list'); $('tabStats').onclick = () => setTab('stats'); $('tabSettings').onclick = () => setTab('settings');
  $('listBatch').onchange = $('listStatus').onchange = renderList;
  $('btnPassCancel').onclick = cancelPass; $('btnClockOk').onclick = () => { store.clearClockWarn(); renderClock(); };
  $('btnClockReset').onclick = async () => {
    const now = new Date().toLocaleString('ko-KR', { hour12: false });
    if (!(await ask(`기기 시계가 지금 맞나요? (${now}) 맞다면 이 시각을 새 기준으로 정해요. 기록이 남아요.`))) return;
    store.resetSeen(); toast('시계 기준을 지금 시각으로 다시 정했어요.', 4000); render();
  };
  $('cfgFaceDbg').onchange = (e) => { store.setCfg({ faceDebug: e.target.checked }); toast(e.target.checked ? '결과 화면에 얼굴형 측정값을 보여 줘요 (직원 확인용).' : '얼굴형 측정값을 숨겼어요.'); };
  $('btnCfgSave').onclick = saveCfg; $('cfgWake').onchange = (e) => { store.setCfg({ wake: e.target.checked }); onCfg(); toast(e.target.checked ? '화면 꺼짐 방지를 켰어요.' : '화면 꺼짐 방지를 껐어요.'); };
  $('btnBackup').onclick = () => backup('backup'); $('btnUsedExport').onclick = () => backup('used');
  $('btnCsv').onclick = () => { download(new Blob([toCsv(store)], { type: 'text/csv;charset=utf-8' }), `진단권_목록_${stamp()}.csv`); toast('CSV 파일을 저장했어요 (엑셀에서 열 수 있어요).'); };
  $('btnRestore').onclick = () => $('restoreFile').click(); $('restoreFile').onchange = (e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) restoreFile(f); };
  $('btnSyncQr').onclick = showSync; $('btnSyncClose').onclick = closeSync;
  $('btnSyncPrev').onclick = () => { if (!A.sync.length) return; A.syncIdx = (A.syncIdx - 1 + A.sync.length) % A.sync.length; drawSync(); };
  $('btnSyncNext').onclick = () => { if (!A.sync.length) return; A.syncIdx = (A.syncIdx + 1) % A.sync.length; drawSync(); };
  $('btnSyncScan').onclick = () => openSyncScan();
  $('btnPersist').onclick = async () => { let ok = false; try { ok = await navigator.storage?.persist?.(); } catch {} toast(ok ? '저장소 보호를 켰어요.' : '브라우저가 허용하지 않았어요. 홈 화면에 추가(앱 설치)하면 보호돼요.', 4500); renderSettings(); };
  $('btnInstall').onclick = async () => { if (!A.installEvt) return; A.installEvt.prompt(); try { await A.installEvt.userChoice; } catch {} A.installEvt = null; renderSettings(); };
  $('issueExp').onchange = (e) => { $('issueDate').hidden = e.target.value !== 'date'; };
  $('btnIssue').onclick = issue; $('btnCardPrev').onclick = () => step(-1); $('btnCardNext').onclick = () => step(1);
  $('btnCardPng').onclick = cardPng; $('btnPdf').onclick = () => pdf(A.batch); $('btnPrintView').onclick = () => printView(A.batch);
  $('btnDoPrint').onclick = () => window.print(); $('btnSheetPng').onclick = sheetPng; $('btnPvPdf').onclick = () => pdf(A.pvList); $('btnPvClose').onclick = closePv;
  $('btnPrintUnused').onclick = () => { const items = listItems().filter((x) => x.k === 'new').map((x) => x.it); printView(items); };
  $('qList').addEventListener('click', (e) => { const b = e.target.closest('[data-revoke]'); if (b) revoke(b.dataset.revoke); });
  $('btnPwChange').onclick = changePw; $('btnGrantPass').onclick = grantPass; $('btnAdminLogout').onclick = () => logout('관리자 모드에서 나왔어요.');
  return { open, logout, state: A, get authed() { return A.authed; }, setIdleMs: (ms) => { A.idleMs = ms; } };
}
