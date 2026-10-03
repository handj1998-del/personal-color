import { whiteBalanceFromPaper, applyDrape, classify, confidence, labToRgb, PROTOTYPES, WARM, lightCheck } from './color.js';
import { analyzeImage, ovalGeom, paperGeom, paperRgb, estimateCast } from './analyzer.js';
import { SEASONS, SEASON_ORDER, drapeRounds, OUTFITS, CELEBS, CELEB_NOTE } from './seasons.js';
import { loadFace, detectFace, faceStatus } from './face.js';
import { renderCardCanvas, renderStoryCanvas } from './card.js';
import { createStore, admit, STORAGE_PREFIX, readSyncQr } from './ticket.js';
import { drawQr } from './qrcard.js';
import { encodeResult, decodeResult, RESULT_RE } from './share.js';
// 고객 휴대폰으로 연 결과 보기(#r=…): 서비스 워커(분석 엔진·모델 내려받기)·화면 꺼짐 방지·시계 기록을 건너뜀
const SHARED_BOOT = RESULT_RE.test(location.hash);
import { initDecoder, decodeVideo, MAX_SIDE, MAX_SIDE_SYNC } from './qr.js';
import { initAdmin } from './admin.js';
import { faceMetrics, classifyFaceShape, FACE_SHAPES, FACE_ORDER, GLASS_SHAPES, LIPS, FRAMES, glassesSvg, browSvg, HAIR_COLORS, HAIR_STYLES, HAIR_REC, HAIR_GENDERS, hairSvg } from './style.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const CAMERA_SCREENS = new Set(['ticket', 'calib', 'capture', 'drape', 'adminScan']);
const SCAN_SCREENS = new Set(['ticket', 'adminScan']);
const NO_IDLE = new Set(['home', 'shared']); // 고객 무동작 자동 초기화 제외 화면 (관리자는 별도 자동 로그아웃)
const STEP_LABELS = [['consent', '동의'], ['ticket', '진단권'], ['calib', '보정'], ['capture', '촬영'], ['auto', '분석'], ['drape', '드레이핑'], ['result', '결과']];

const fresh = () => ({ screen: 'home', after: null, resume: false, ticket: null, wb: null, auto: null, votes: [], roundIdx: 0, rounds: null, browse: { L: 'spring_light', R: 'summer_light', i: 0 }, drapeTab: 'rounds', final: null, drapeOnly: false, faceShape: null, resTab: 'color', hairGender: 'f', photo: null });
let S = fresh();
let stream = null, facing = 'user', streamFacing = null, meterTimer = null, cameraBusy = false, seq = 0;
// QR 확인 화면은 뒤 카메라를 먼저 사용 (⇄로 바꾸면 이 기기에서 기억)
let qrFacing = (() => { try { return localStorage.getItem('pcqr.qrFacing') || 'environment'; } catch { return 'environment'; } })();
const wantFacing = (screen = S.screen) => (SCAN_SCREENS.has(screen) ? qrFacing : facing);
const work = $('work');

// ---------- 공통 UI ----------
function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
function ask(msg) {
  return new Promise((res) => {
    const prev = document.activeElement;
    $('modalMsg').textContent = msg; $('modal').hidden = false; setInert(true); $('modalYes').focus();
    // v1.7: 창이 열린 동안 뒤 화면은 inert(키보드·스크린리더 접근 막음), Tab은 창 안에서만 돎
    const esc = (e) => {
      if (e.key === 'Escape') done(false);
      else if (e.key === 'Tab') { const f = [$('modalYes'), $('modalNo')]; const i = f.indexOf(document.activeElement); e.preventDefault(); f[(i + (e.shiftKey ? f.length - 1 : 1)) % f.length].focus(); }
    };
    const done = (v) => { $('modal').hidden = true; setInert(false); $('modalYes').onclick = $('modalNo').onclick = null; document.removeEventListener('keydown', esc); prev?.focus?.(); res(v); };
    $('modalYes').onclick = () => done(true); $('modalNo').onclick = () => done(false);
    document.addEventListener('keydown', esc);
  });
}
function setInert(on) { for (const el of document.querySelectorAll('body > header, body > main, #updBar')) { el.inert = on; if (on) el.setAttribute('aria-hidden', 'true'); else el.removeAttribute('aria-hidden'); } }
function renderSteps() {
  const idx = STEP_LABELS.findIndex(([k]) => k === S.screen || (S.screen === 'analyzing' && k === 'auto'));
  $('steps').innerHTML = S.screen === 'home' || S.screen === 'shared' || S.screen.startsWith('admin') ? '' : STEP_LABELS.map(([k, l], i) => `<span class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${l}</span>`).join('');
}
async function go(screen) {
  const my = ++seq;
  if (!$('resMore').hidden) setMore(false);
  S.screen = screen; document.body.dataset.screen = screen;
  document.querySelectorAll('.screen').forEach((el) => (el.hidden = el.dataset.for !== screen));
  renderSteps();
  const photoDrape = screen === 'drape' && !!S.photo; // v1.6: 사진으로 진단했으면 드레이핑을 사진 위에 겹쳐 보여 줌 (카메라 안 씀)
  document.body.classList.toggle('photo-drape', photoDrape);
  const needCam = CAMERA_SCREENS.has(screen) && !photoDrape;
  document.body.classList.toggle('has-stage', needCam || photoDrape);
  if (needCam) { if (stream && streamFacing !== wantFacing(screen)) stopCamera(); await startCamera(); if (my !== seq) return; } else stopCamera();
  setOverlay(screen);
  if (SCAN_SCREENS.has(screen) && stream) startScan(); else stopScan();
  if (screen === 'home') renderHome();
  if (screen === 'consent') renderConsentInfo();
  touchIdle();
  if (screen === 'calib') renderCalibStatus();
  if (screen === 'capture') $('captureCalib').textContent = S.wb ? (S.wb.locked ? '✅ 흰 종이 보정 적용 중 (카메라 노출·색 고정)' : '✅ 흰 종이 보정 적용 중 — 보정할 때와 같은 자리·조명에서 바로 촬영해 주세요') : '⚠️ 보정 없이 측정해요 (조명 색의 영향을 받을 수 있어요)';
  if (screen === 'drape') { if (photoDrape) stageMsg(''); renderDrape(); }
  window.scrollTo(0, 0); $('panel').scrollTop = 0;
}

// ---------- 카메라 ----------
const video = $('video');
async function startCamera() {
  if (stream) return true;
  if (!navigator.mediaDevices?.getUserMedia) {
    camFail(window.isSecureContext ? '이 브라우저는 카메라를 지원하지 않아요.' : '카메라는 HTTPS 주소나 localhost에서만 켜져요.');
    return false;
  }
  if (cameraBusy) return false; cameraBusy = true;
  stageMsg('카메라를 켜는 중…');
  try {
    const want = wantFacing();
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: want }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    streamFacing = want;
    if (!CAMERA_SCREENS.has(S.screen)) { stopCamera(); return false; }
    video.srcObject = stream; await video.play().catch(() => {});
    await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
    const st = stream.getVideoTracks()[0]?.getSettings?.() || {};
    const mirror = (st.facingMode || streamFacing) === 'user';
    $('stage').classList.toggle('mirror', mirror);
    if (S.wb?.locked) S.wb.locked = false; // 카메라가 다시 켜지면 노출·색 고정이 풀림
    stageMsg(''); setOverlay(S.screen); startMeter();
    return true;
  } catch (e) {
    stream = null;
    camFail(camErrMsg(e));
    return false;
  } finally { cameraBusy = false; }
}
function stopCamera() {
  clearInterval(meterTimer); meterTimer = null; stopScan();
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; streamFacing = null; video.pause(); video.srcObject = null; $('meter').innerHTML = '';
}
// v1.7: 카메라 오류를 한국어로 (오류 이름을 그대로 보여 주지 않음)
function camErrMsg(e) {
  const n = e?.name || '';
  if (n === 'NotAllowedError' || n === 'SecurityError') return '카메라 권한이 거부됐어요. 브라우저 주소창(또는 설정 앱)의 권한에서 카메라를 허용해 주세요.';
  if (n === 'NotFoundError' || n === 'OverconstrainedError' || n === 'DevicesNotFoundError') return '이 기기에서 카메라를 찾을 수 없어요.';
  if (n === 'NotReadableError' || n === 'TrackStartError' || n === 'AbortError') return '다른 앱이 카메라를 쓰고 있거나 카메라를 켤 수 없어요. 다른 앱을 닫고 다시 시도해 주세요.';
  return '카메라를 켤 수 없어요. 기기를 다시 시작하거나 사진 파일로 진단해 주세요.';
}
// 카메라를 못 쓸 때: 화면에 맞는 대안 안내 (진단권 화면은 코드 입력, 나머지는 바로 누를 수 있는 [사진 파일로 진단] 버튼)
function camFail(why) {
  if (S.screen === 'ticket') { stageMsg(why + ' 아래 입력칸에 카드의 코드를 입력해 주세요.'); ticketMsg('📷 카메라를 쓸 수 없어요. 카드 아래쪽 코드를 입력해 주세요.', 'bad'); }
  else if (S.screen === 'adminScan') { stageMsg(why); $('syncMsg').textContent = '카메라를 쓸 수 없어요. 사용 기록 파일로 옮겨 주세요.'; }
  else stageMsg(why + ' 아래 버튼으로 사진 파일로 진단할 수 있어요.', true);
}
function stageMsg(m, photoBtn = false) { $('stageMsg').textContent = m; $('stageMsgBox').hidden = !m; $('btnStagePhoto').hidden = !(m && photoBtn); }
$('btnStagePhoto').onclick = () => { S.drapeOnly = false; $('fileInput').click(); };
$('btnSwitch').onclick = async () => {
  if (SCAN_SCREENS.has(S.screen)) { qrFacing = qrFacing === 'user' ? 'environment' : 'user'; try { localStorage.setItem('pcqr.qrFacing', qrFacing); } catch {} }
  else facing = facing === 'user' ? 'environment' : 'user';
  stopCamera(); const ok = await startCamera(); if (!ok) toast('카메라를 전환할 수 없어요.'); else { setOverlay(S.screen); if (SCAN_SCREENS.has(S.screen)) startScan(); }
};

function grabFrame(maxSide = 1280) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
  const k = Math.min(1, maxSide / Math.max(vw, vh)); work.width = Math.round(vw * k); work.height = Math.round(vh * k);
  const ctx = work.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, work.width, work.height);
  return ctx.getImageData(0, 0, work.width, work.height);
}
function wipeWork() { const ctx = work.getContext('2d'); ctx.clearRect(0, 0, work.width, work.height); work.width = 1; work.height = 1; }

// ---------- 오버레이 ----------
function setOverlay(screen) {
  const ph = screen === 'drape' && S.photo ? S.photo : null;
  const W = ph ? ph.W : video.videoWidth || 1280, H = ph ? ph.H : video.videoHeight || 720, svg = $('overlay');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  // 사진 드레이핑은 사진 전체가 보이게(meet), 카메라는 화면을 꽉 채움(slice)
  svg.setAttribute('preserveAspectRatio', ph ? 'xMidYMid meet' : 'xMidYMid slice');
  // 사진이면 얼굴 인식 틀(턱 위치)에 맞춰 드레이프를 놓음
  const o = ph ? { cx: ph.face.cx, cy: ph.face.cy, rx: ph.face.rx, ry: ph.face.ry * 1.06 } : ovalGeom(W, H);
  for (const id of ['ovalHole', 'ovalLine']) { const e = $(id); e.setAttribute('cx', o.cx); e.setAttribute('cy', o.cy); e.setAttribute('rx', o.rx); e.setAttribute('ry', o.ry); }
  const mr = svg.querySelector('#ovalMask rect'); mr.setAttribute('x', -W); mr.setAttribute('y', -H); mr.setAttribute('width', 3 * W); mr.setAttribute('height', 3 * H);
  const p = paperGeom(W, H); const pr = $('paperRect'); pr.setAttribute('x', p.x); pr.setAttribute('y', p.y); pr.setAttribute('width', p.s); pr.setAttribute('height', p.s);
  $('layerOval').style.display = screen === 'capture' || screen === 'drape' ? '' : 'none';
  $('layerOval').classList.toggle('faint', screen === 'drape');
  $('layerPaper').style.display = screen === 'calib' ? '' : 'none';
  const qs = Math.min(W, H) * 0.62, qr = $('qrRect'); qr.setAttribute('x', (W - qs) / 2); qr.setAttribute('y', (H - qs) / 2); qr.setAttribute('width', qs); qr.setAttribute('height', qs);
  $('layerQr').style.display = SCAN_SCREENS.has(screen) ? '' : 'none';
  $('layerDrape').style.display = screen === 'drape' ? '' : 'none';
  // 드레이프 모양: 턱 아래에서 어깨까지
  const top = o.cy + o.ry * 0.94, side = Math.min(H - 4, o.cy + o.ry * 1.18);
  const d = `M${-W},${side} L${o.cx - o.rx * 1.5},${side} Q${o.cx},${top - o.ry * 0.08} ${o.cx + o.rx * 1.5},${side} L${2 * W},${side} L${2 * W},${2 * H} L${-W},${2 * H} Z`;
  $('drapeL').setAttribute('d', d); $('drapeR').setAttribute('d', d);
  const cl = $('clipLRect'), cr = $('clipRRect');
  cl.setAttribute('x', -W); cl.setAttribute('y', -H); cl.setAttribute('width', W + W / 2); cl.setAttribute('height', 3 * H);
  cr.setAttribute('x', W / 2); cr.setAttribute('y', -H); cr.setAttribute('width', 1.5 * W); cr.setAttribute('height', 3 * H);
  const dv = $('drapeDivider'); dv.setAttribute('x1', W / 2); dv.setAttribute('x2', W / 2); dv.setAttribute('y1', top - 10); dv.setAttribute('y2', 2 * H);
  // v1.6: 이름표를 '화면에 실제로 보이는 영역' 기준으로 배치 (세로 화면에서 slice로 양옆이 잘려 '랄', '쿨 핑'처럼 보이던 문제)
  const vis = visibleBox(W, H, !ph), fs = Math.round(Math.min(vis.h * 0.05, vis.w * 0.06));
  const ty = Math.min(vis.y + vis.h - fs * 0.6, side + (H - side) / 2 + 14);
  $('drapeTagL').setAttribute('x', vis.x + vis.w * 0.25); $('drapeTagR').setAttribute('x', vis.x + vis.w * 0.75);
  $('drapeTagL').setAttribute('y', ty); $('drapeTagR').setAttribute('y', ty);
  $('drapeTagL').style.fontSize = $('drapeTagR').style.fontSize = fs + 'px';
}
// viewBox(W×H) 중 무대 화면에 보이는 부분 (slice: 넘치는 쪽이 잘림, meet: 전부 보임 + 여백)
function visibleBox(W, H, slice) {
  const st = $('stage'), sw = st.clientWidth || W, sh = st.clientHeight || H;
  const k = slice ? Math.max(sw / W, sh / H) : Math.min(sw / W, sh / H), w = sw / k, h = sh / k;
  return slice ? { x: (W - w) / 2, y: (H - h) / 2, w, h } : { x: (W - w) / 2, y: (H - h) / 2, w, h };
}
function fillOf(f) { return f === 'gold' ? 'url(#gGold)' : f === 'silver' ? 'url(#gSilver)' : f; }
function setDrape(left, right, tagL, tagR) {
  // 화면 기준 왼쪽/오른쪽. 전면 카메라(거울 모드)에서도 화면 기준으로 맞춤
  const mirror = !S.photo && $('stage').classList.contains('mirror');
  $('overlay').classList.toggle('unmirror', mirror);
  $('drapeL').setAttribute('fill', fillOf(left)); $('drapeR').setAttribute('fill', fillOf(right ?? left));
  $('drapeDivider').style.display = right ? '' : 'none';
  $('drapeTagL').textContent = tagL || ''; $('drapeTagR').textContent = right ? (tagR || '') : '';
}

// ---------- 실시간 조명 측정 ----------
function startMeter() {
  clearInterval(meterTimer);
  const small = document.createElement('canvas');
  meterTimer = setInterval(() => {
    if (!stream || !video.videoWidth || S.screen === 'drape' || SCAN_SCREENS.has(S.screen)) { if (S.screen === 'drape' || SCAN_SCREENS.has(S.screen)) $('meter').innerHTML = ''; return; }
    const W = 160, H = Math.round(160 * video.videoHeight / video.videoWidth); small.width = W; small.height = H;
    const c = small.getContext('2d', { willReadFrequently: true }); c.drawImage(video, 0, 0, W, H);
    const img = c.getImageData(0, 0, W, H);
    const gains = S.wb?.gains || null; let r;
    if (S.screen === 'calib') {
      const rgb = paperRgb(img); const wb = whiteBalanceFromPaper(rgb);
      const L = wb.paperLab[0];
      r = [L < 35 ? ['bad', '종이가 어두워요'] : Math.max(...rgb) > 252 ? ['bad', '종이가 너무 밝아요(하얗게 날아감)'] : ['ok', '종이 밝기 적당'],
        rgb.uniformity < 0.65 ? ['bad', '사각형 안을 흰 종이로 채워 주세요'] : wb.castChroma > 12 ? ['warn', `조명 색 치우침 있음 (${castName(wb.paperLab)})`] : ['ok', '색 치우침 적음']];
    } else {
      const res = analyzeImage(img, { gains, calibrated: !!S.wb });
      if (!res.ok) r = [['warn', '얼굴을 타원 안에 맞춰 주세요']];
      else {
        const li = res.light.issues;
        r = [li.find((x) => x.code === 'dark') ? ['bad', '어두움'] : li.find((x) => x.code === 'bright') ? ['bad', '너무 밝음'] : ['ok', '밝기 적당'],
          li.find((x) => ['yellow', 'blue', 'red', 'green'].includes(x.code)) ? ['warn', '색 치우침: ' + castName([0, res.cast.a, res.cast.b])] : ['ok', S.wb ? '보정됨' : '색 치우침 적음']];
      }
    }
    c.clearRect(0, 0, W, H);
    $('meter').innerHTML = r.map(([k, t]) => `<span class="m ${k}">${t}</span>`).join('');
  }, 500);
}
function castName([, a, b]) { if (Math.abs(b) >= Math.abs(a)) return b > 0 ? '노란빛' : '푸른빛'; return a > 0 ? '붉은빛' : '초록빛'; }

// ---------- 홈/동의 ----------
// ---------- 진단권(QR) ----------
const store = createStore();
// 순서: 동의 → (이어하기 / 관리자 허가 / 진단권 QR) → 보정·드레이핑. 카메라는 동의 후에만 켬
function startFlow(drapeOnly) { S.drapeOnly = drapeOnly; S.resume = false; go('consent'); }
function resumeFlow() { const a = store.active(); if (!a) { renderHome(); return toast('이어서 할 진단이 없어요.'); } S.drapeOnly = !!a.drapeOnly; S.resume = true; go('consent'); }
function gate(after) {
  S.after = after; loadFace();
  const a = store.active();
  if (S.resume && a) { S.ticket = a.id; toast('진행 중인 진단으로 이어서 해요.'); return proceed(); }
  // v1.7: 같은 고객이 사진 선택을 취소했거나 사진이 실패해 다시 누른 경우 → 이미 확인한 진단권(관리자 허가 포함)으로 계속
  if (S.ticket && a && a.id === S.ticket && !a.done) return proceed();
  if (store.takePass()) { const id = 'PASS' + Date.now().toString(36).toUpperCase(); store.markUsed(id, Date.now(), 'admin'); store.startSession(id, 'admin', Date.now(), { drapeOnly: S.drapeOnly }); S.ticket = id; toast('관리자 허가로 QR 없이 1회 진단을 시작해요.'); return proceed(); }
  $('ticketCode').value = ''; ticketMsg('QR 코드를 찾는 중이에요…'); go('ticket');
}
function proceed(fromTicket = false) {
  if (S.after === 'photo') { if (fromTicket) { toast('[사진 파일로 진단]을 눌러 사진을 골라 주세요.', 4500); return go('capture'); } S.drapeOnly = false; return $('fileInput').click(); }
  return go(S.after || (S.drapeOnly ? 'drape' : 'calib'));
}
function renderHome() {
  $('btnResume').hidden = !store.active();
  $('passDot').hidden = !store.passInfo(); // 직원만 알아보는 작은 점 (고객 화면에 횟수 표시 안 함)
  if (!SHARED_BOOT && document.readyState === 'complete') renderOffline();
}
function renderConsentInfo() {
  const c = store.cfg(); $('cfgOperatorTxt').textContent = c.operator || '매장'; $('cfgContactTxt').textContent = c.contact ? '문의 ' + c.contact : '매장 직원에게 문의해 주세요';
}
function ticketMsg(m, kind = '') { const el = $('ticketMsg'); el.textContent = m; el.className = 'status' + (kind ? ' ' + kind : ''); }
let scanTimer = null, scanGen = 0, lastBad = { t: '', at: 0 }, admitting = false;
const qrCanvas = document.createElement('canvas');
function startScan() {
  stopScan(); initDecoder(); lastBad = { t: '', at: 0 };
  const gen = ++scanGen;
  // 저사양 기기 배려: 한 번 읽는 데 걸린 시간의 2배만큼 쉬고 다시 시도 (최소 250ms)
  const loop = async () => {
    if (gen !== scanGen) return;
    let wait = 250;
    if (!admitting && SCAN_SCREENS.has(S.screen) && video.videoWidth && !document.hidden) {
      const t0 = performance.now();
      try { const txt = await decodeVideo(video, qrCanvas, S.screen === 'adminScan' ? MAX_SIDE_SYNC : MAX_SIDE); if (gen !== scanGen) return; if (txt) await (S.screen === 'adminScan' ? onSyncCode(txt) : S.screen === 'ticket' ? onCode(txt, 'qr') : null); } catch {}
      wait = Math.max(250, 2 * (performance.now() - t0));
    }
    if (gen === scanGen) scanTimer = setTimeout(loop, wait);
  };
  scanTimer = setTimeout(loop, 150);
}
function stopScan() { scanGen++; clearTimeout(scanTimer); scanTimer = null; qrCanvas.width = qrCanvas.height = 1; }
async function onCode(txt, src) {
  if (src === 'qr' && txt === lastBad.t && Date.now() - lastBad.at < 20000) return; // 같은 거부 코드는 20초 동안 다시 알리지 않음
  admitting = true;
  try {
    const r = await admit(store, txt, Date.now(), src);
    if (!r.ok) { if (src === 'qr') lastBad = { t: txt, at: Date.now() }; ticketMsg('⛔ ' + r.msg, 'bad'); toast(r.msg, 4000); return; }
    stopScan(); S.ticket = r.id; ticketMsg('✅ 진단권 확인 완료', 'ok');
    if (!r.resumed) store.startSession(r.id, src, Date.now(), { drapeOnly: S.drapeOnly });
    toast(r.resumed ? '진행 중인 진단으로 이어서 해요.' : `진단권 ${r.id.slice(0, 4)}-${r.id.slice(4)} 확인 완료! 진단을 시작해요.`);
    await proceed(true);
  } finally { admitting = false; }
}
// 관리자: 다른 기기의 사용 기록 QR
const syncSeen = new Set();
async function onSyncCode(txt) {
  if (syncSeen.has(txt)) return;
  const r = await readSyncQr(txt); if (!r.ok) { $('syncMsg').textContent = '⛔ ' + r.msg; return; }
  syncSeen.add(txt); const nu = store.mergeUsed(r.used), nr = store.mergeRevoked(r.revoked);
  $('syncMsg').className = 'status ok'; $('syncMsg').textContent = `✅ ${r.page}/${r.pages}쪽 가져옴 — 새 사용 기록 ${nu}개 · 취소 ${nr}개${r.pages > 1 ? ' (다음 쪽을 비춰 주세요)' : ''}`;
  toast(`사용 기록 ${r.page}/${r.pages}쪽을 가져왔어요.`);
}
function openSyncScan() { syncSeen.clear(); $('syncMsg').className = 'status'; $('syncMsg').textContent = 'QR 코드를 찾는 중이에요…'; go('adminScan'); }
$('btnSyncDone').onclick = () => admin.open();
$('btnTicketCode').onclick = () => { const v = $('ticketCode').value.trim(); if (!v) return toast('카드에 적힌 코드를 입력해 주세요.'); onCode(v, 'manual'); };
$('ticketCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnTicketCode').click(); });
$('btnTicketCancel').onclick = () => resetAll(false);
$('btnStart').onclick = () => startFlow(false);
$('btnDrapeOnly').onclick = () => startFlow(true);
$('btnResume').onclick = resumeFlow;
const consentOk = () => $('chkConsent').checked;
$('chkConsent').onchange = () => { $('btnConsentCam').disabled = $('btnConsentPhoto').disabled = !consentOk(); };
$('btnConsentCam').onclick = () => { if (consentOk()) gate(S.drapeOnly ? 'drape' : 'calib'); };
$('btnConsentPhoto').onclick = () => { if (consentOk()) gate('photo'); };
$('btnConsentNo').onclick = () => resetAll(false);
$('btnUpload').onclick = () => $('fileInput').click();

// ---------- 보정 ----------
function renderCalibStatus() {
  const st = $('calibStatus');
  if (!S.wb) { st.className = 'status'; st.textContent = '보정 안 함'; $('btnCalibClear').hidden = true; $('btnCalibNext').textContent = '보정 없이 다음'; return; }
  st.className = 'status ok';
  st.textContent = `✅ 보정 완료 — 원래 조명: ${S.wb.castChroma < 4 ? '거의 중립' : castName(S.wb.paperLab) + ' (치우침 ' + S.wb.castChroma.toFixed(1) + ')'}` + (S.wb.locked ? ' · 카메라 노출·색 고정됨' : ' · 조명·자세를 바꾸지 말고 바로 촬영해 주세요');
  $('btnCalibClear').hidden = false; $('btnCalibNext').textContent = '다음: 얼굴 촬영';
}
$('btnCalib').onclick = () => {
  const img = grabFrame(640); if (!img) return toast('카메라가 아직 준비되지 않았어요.');
  const rgb = paperRgb(img); wipeWork();
  const wb = whiteBalanceFromPaper(rgb);
  if (wb.valid && rgb.uniformity < 0.65) { wb.valid = false; wb.problem = 'notwhite'; }
  if (!wb.valid) {
    const m = { dark: '종이가 너무 어둡게 보여요. 더 밝은 곳에서 다시 해 주세요.', clipped: '종이가 너무 밝아 하얗게 날아갔어요. 빛을 조금 줄이거나 종이를 기울여 주세요.', notwhite: '흰 종이가 아닌 것 같아요. 사각형 안을 흰 종이로 가득 채워 주세요.' };
    return toast(m[wb.problem] || '보정에 실패했어요. 다시 시도해 주세요.', 4500);
  }
  S.wb = { gains: wb.gains, paperLab: wb.paperLab, castChroma: wb.castChroma, locked: false };
  renderCalibStatus(); toast('흰 종이 보정을 적용했어요.');
  // v1.6: 보정한 순간의 노출·화이트밸런스를 고정해 촬영 때 카메라가 다시 바꾸지 않게 함 (지원 기기만)
  lock3A(true).then((ok) => { if (S.wb) { S.wb.locked = ok; renderCalibStatus(); } });
};
// 카메라 자동 노출·자동 화이트밸런스 고정/해제 (MediaStreamTrack 이미지 캡처 확장, 주로 안드로이드 크롬)
async function lock3A(on) {
  const t = stream?.getVideoTracks?.()[0]; if (!t?.getCapabilities) return false;
  let cap, st; try { cap = t.getCapabilities() || {}; st = t.getSettings() || {}; } catch { return false; }
  const adv = {}, mode = on ? 'manual' : 'continuous';
  // 고정할 때는 지금 값(색온도·노출 시간)을 알 수 있을 때만 수동으로 바꿈 (값 없이 수동 전환하면 기기마다 동작이 달라 위험)
  if (cap.whiteBalanceMode?.includes(mode) && (!on || st.colorTemperature)) { adv.whiteBalanceMode = mode; if (on) adv.colorTemperature = st.colorTemperature; }
  if (cap.exposureMode?.includes(mode) && (!on || st.exposureTime)) { adv.exposureMode = mode; if (on) adv.exposureTime = st.exposureTime; }
  if (!adv.whiteBalanceMode && !adv.exposureMode) return false;
  try { await t.applyConstraints({ advanced: [adv] }); return !!on; } catch { return false; }
}
$('btnCalibClear').onclick = () => { if (S.wb?.locked) lock3A(false); S.wb = null; renderCalibStatus(); };
$('btnCalibNext').onclick = () => go('capture');
$('btnBackCalib').onclick = () => go('calib');

// ---------- 촬영/분석 ----------
$('btnCapture').onclick = async () => {
  const img = grabFrame(1280); if (!img) return toast('카메라가 아직 준비되지 않았어요.');
  stopCamera(); // 촬영 직후 카메라 해제
  await runAnalysis(img, 'camera');
};
$('fileInput').onchange = async (e) => {
  const f = e.target.files?.[0]; e.target.value = '';
  if (!f) return;
  let bmp;
  try { bmp = await createImageBitmap(f); } catch {
    const heic = /hei[cf]/i.test(f.type) || /\.hei[cf]$/i.test(f.name || '');
    return toast(heic ? 'HEIC(고효율) 사진은 이 브라우저에서 열 수 없어요. JPG로 저장하거나 화면을 캡처한 사진으로 다시 골라 주세요.' : '이미지를 열 수 없어요. JPG·PNG 사진을 골라 주세요.', 5000);
  }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  work.width = Math.round(bmp.width * k); work.height = Math.round(bmp.height * k);
  const ctx = work.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, work.width, work.height); bmp.close?.();
  const img = ctx.getImageData(0, 0, work.width, work.height);
  stopCamera();
  await runAnalysis(img, 'photo');
};
function keepPhoto(img, fb) {
  const cv = $('photo'); cv.width = img.width; cv.height = img.height; cv.getContext('2d').putImageData(img, 0, 0);
  S.photo = { W: img.width, H: img.height, face: fb };
}
function clearPhoto() { const cv = $('photo'); if (cv) { cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); cv.width = cv.height = 1; } S.photo = null; document.body.classList.remove('photo-drape'); }
async function runAnalysis(img, source) {
  await go('analyzing');
  $('analyzingMsg').textContent = faceStatus() === 'ready' ? '분석 중이에요…' : '얼굴 인식 준비 중이에요…';
  // 얼굴 인식용 캔버스는 work(이미 그려져 있음)를 그대로 사용
  const ctx = work.getContext('2d'); ctx.putImageData(img, 0, 0);
  let lm = null;
  try { lm = await detectFace(work); } catch { lm = null; }
  $('analyzingMsg').textContent = '분석 중이에요…';
  // 사진 파일에는 카메라 흰 종이 보정을 적용하지 않음 (analyzeImage 안에서도 한 번 더 막음)
  const useWb = source !== 'photo' && S.wb;
  let res = analyzeImage(img, { landmarks: lm, gains: useWb ? S.wb.gains : null, calibrated: !!useWb, source });
  if (res.ok && lm) { try { res.face = classifyFaceShape(faceMetrics(lm, img.width, img.height)); } catch { res.face = null; } }
  if (!lm && source === 'photo') res.notes?.unshift('사진에서 얼굴을 찾지 못해 사진 가운데 영역으로 측정했어요. 얼굴이 가운데 오는 정면 사진을 써 주세요.');
  if (res.ok && useWb && !S.wb.locked) res.notes?.push('이 기기는 카메라 노출·색 자동 조절을 고정할 수 없어요. 보정한 뒤 조명이나 자리가 바뀌었다면 보정을 다시 해 주세요.');
  // v1.6: 사진 진단이면 드레이핑용으로 사진을 화면(메모리)에만 잠시 둠. 저장·전송 없음, 처음으로/다음 고객/자동 초기화 때 지움
  clearPhoto();
  if (res.ok && source === 'photo') keepPhoto(img, res.faceBox);
  // 이미지 데이터 폐기
  img.data.fill(0); wipeWork();
  if (!res.ok) { toast(res.reason === 'dark' ? '너무 어두워서 피부색을 읽을 수 없어요. 밝은 곳에서 다시 찍거나 더 밝은 사진을 골라 주세요.' : res.reason === 'mono' ? '흑백·세피아 사진은 피부색을 읽을 수 없어요. 컬러 사진으로 진단해 주세요.' : source === 'photo' ? '얼굴 피부를 찾지 못했어요. 얼굴이 크게 나온 정면 사진을 써 주세요.' : '피부색을 찾지 못했어요. 얼굴을 타원 안에 맞추고 다시 촬영해 주세요.', 4500); return go('capture'); } // v1.7: 사진 실패도 촬영 화면(사진 다시 고르기 버튼 있음)으로
  S.auto = res; S.votes = []; S.roundIdx = 0; S.rounds = null; S.faceShape = null;
  renderAuto(); go('auto');
}

const pct = (p) => Math.round(p * 100) + '%';
function bar(label, lo, hi, v) { const x = Math.max(0, Math.min(100, 50 + v * 20)); return `<div class="axis"><div class="axis-l">${label}</div><div class="axis-track"><span class="axis-end">${lo}</span><div class="axis-bar"><i style="left:${x}%"></i></div><span class="axis-end">${hi}</span></div></div>`; }
function renderAuto() {
  const r = S.auto, [a, b] = r.cls.top, A = SEASONS[a.id], B = SEASONS[b.id];
  $('autoConf').textContent = '신뢰도 ' + r.conf.label; $('autoConf').className = 'chip ' + r.conf.level;
  const skinHex = '#' + labToRgb(r.skin.L, r.skin.a, r.skin.b).map((v) => v.toString(16).padStart(2, '0')).join('');
  const wp = r.cls.warmP, strength = Math.abs(wp - 0.5) * 2; const und = strength < 0.3 ? '뉴트럴에 가까움' : `${wp >= 0.5 ? '웜톤' : '쿨톤'} 경향 ${strength > 0.8 ? '뚜렷함' : '보통'}`;
  $('autoBody').innerHTML = `
    <div class="cands">
      <div class="cand first" data-id="${a.id}"><div class="sw" style="background:linear-gradient(90deg,${A.best.slice(2, 8).map((c) => c.hex).join(',')})"></div><b>${A.name}</b><span>1순위 · ${pct(a.p)}</span></div>
      <div class="cand" data-id="${b.id}"><div class="sw" style="background:linear-gradient(90deg,${B.best.slice(2, 8).map((c) => c.hex).join(',')})"></div><b>${B.name}</b><span>2순위 · ${pct(b.p)}</span></div>
    </div>
    <div class="measure"><div class="skinchip" style="background:${skinHex}" title="측정된 피부색"></div>
      <div><b>측정한 피부색</b> (${und})<br><small>L* ${r.skin.L.toFixed(1)} · a* ${r.skin.a.toFixed(1)} · b* ${r.skin.b.toFixed(1)} · 색상각 ${r.feat.hue.toFixed(0)}° · 대비 ${r.feat.contrast.toFixed(0)}</small><br>
      <small>머리카락 ${r.hair ? '측정됨' : '측정 못함'} · 눈동자 ${r.eye ? '측정됨' : '측정 못함'} · ${r.mode === 'landmark' ? '얼굴 자동 인식' : '타원 가이드'} · ${r.calibrated ? '흰 종이 보정' : '보정 안 함'}${r.face ? ` · 얼굴형 추정 ${FACE_SHAPES[r.face.id].name}` : ''}</small></div></div>
    ${bar('언더톤', '쿨', '웜', r.feat.w)}${bar('명도', '깊음', '밝음', r.feat.l)}${bar('채도·대비', '부드러움', '선명함', r.feat.c)}
    ${r.conf.hint ? `<p class="warn">ℹ️ ${r.conf.hint}</p>` : ''}
    ${[...r.light.issues.map((i) => i.msg), ...r.notes].map((n) => `<p class="warn">⚠️ ${n}</p>`).join('')}
    <p class="honest">카메라와 조명에 따라 달라지는 <b>추정 결과</b>예요. 드레이핑으로 직접 비교하면 더 정확해져요.</p>`;
}
$('btnRetake').onclick = () => { clearPhoto(); go('capture'); };
$('btnToDrape').onclick = () => go('drape');
$('btnToResult').onclick = () => { buildFinal(); go('result'); };

// ---------- 드레이핑 ----------
function seasonOptions(sel) { return SEASON_ORDER.map((id) => `<option value="${id}" ${id === sel ? 'selected' : ''}>${SEASONS[id].name}</option>`).join(''); }
function renderDrape() {
  if (!S.rounds) {
    S.rounds = drapeRounds(S.auto ? S.auto.feat.w : 0);
    if (S.auto) { S.browse.L = S.auto.cls.top[0].id; S.browse.R = S.auto.cls.top[1].id; }
    if (S.browse.L === S.browse.R) S.browse.R = SEASON_ORDER.find((x) => x !== S.browse.L);
  }
  $('tabRounds').classList.toggle('on', S.drapeTab === 'rounds'); $('tabBrowse').classList.toggle('on', S.drapeTab === 'browse');
  $('tabRounds').setAttribute('aria-selected', S.drapeTab === 'rounds'); $('tabBrowse').setAttribute('aria-selected', S.drapeTab === 'browse');
  $('drapeRoundsBox').hidden = S.drapeTab !== 'rounds'; $('drapeBrowseBox').hidden = S.drapeTab !== 'browse';
  $('selL').innerHTML = seasonOptions(S.browse.L); $('selR').innerHTML = seasonOptions(S.browse.R);
  if (S.drapeTab === 'rounds') renderRound(); else { $('btnPickSame').hidden = true; renderBrowse(); }
  renderVotes();
}
function currentRound() {
  const r = S.rounds[S.roundIdx]; if (!r) return null;
  const swap = S.roundIdx % 2 === 1; // 좌우 위치를 번갈아 바꿔 위치 편향 줄임
  return { ...r, L: swap ? r.B : r.A, R: swap ? r.A : r.B };
}
function renderRound() {
  const r = currentRound(), done = !r;
  $('roundDone').hidden = !done;
  for (const id of ['btnPickL', 'btnPickR', 'btnPickSame', 'roundQ']) $(id).hidden = done;
  $('roundProg').innerHTML = S.rounds.map((_, i) => `<i class="${i < S.roundIdx ? 'done' : i === S.roundIdx ? 'cur' : ''}"></i>`).join('') + `<span>${Math.min(S.roundIdx + 1, S.rounds.length)} / ${S.rounds.length}</span>`;
  if (done) { $('roundTitle').textContent = '비교 완료'; setDrape('#d9d4cc', null, '', ''); return; }
  $('roundTitle').textContent = r.title; $('roundQ').textContent = r.q;
  $('btnPickL').innerHTML = `<span class="dot" style="background:${dotBg(r.L.fill)}"></span><span class="ct"><small>왼쪽</small>${r.L.name}</span>`;
  $('btnPickR').innerHTML = `<span class="dot" style="background:${dotBg(r.R.fill)}"></span><span class="ct"><small>오른쪽</small>${r.R.name}</span>`;
  $('btnPickL').dataset.dim = JSON.stringify(r.L.v); $('btnPickR').dataset.dim = JSON.stringify(r.R.v);
  setDrape(r.L.fill, r.R.fill, r.L.name, r.R.name);
}
const dotBg = (f) => f === 'gold' ? 'linear-gradient(135deg,#8a6a1f,#f6dc8a,#c79a35)' : f === 'silver' ? 'linear-gradient(135deg,#6f747c,#eef1f5,#a7adb6)' : f;
function pickRound(side) {
  if (!S.rounds) return;
  const r = currentRound(); if (!r) return;
  if (side) { const chosen = side === 'L' ? r.L : r.R, other = side === 'L' ? r.R : r.L; S.votes.push({ kind: 'round', id: r.id, title: r.title, pick: chosen.name, chosen: chosen.v, other: other.v }); }
  else S.votes.push({ kind: 'round', id: r.id, title: r.title, pick: '비슷함', chosen: {}, other: {} });
  // 웜/쿨 라운드가 끝나면 이후 라운드(명도·채도) 색을 다시 고름
  if (r.id === 'white') { const f = currentFeat(); const nr = drapeRounds(f.w); S.rounds = [...S.rounds.slice(0, 3), nr[3], nr[4]]; }
  S.roundIdx++; renderRound(); renderVotes();
}
$('btnPickL').onclick = () => pickRound('L'); $('btnPickR').onclick = () => pickRound('R'); $('btnPickSame').onclick = () => pickRound(null);
$('tabRounds').onclick = () => { S.drapeTab = 'rounds'; renderDrape(); };
$('tabBrowse').onclick = () => { S.drapeTab = 'browse'; renderDrape(); };
function renderBrowse() {
  const A = SEASONS[S.browse.L], B = SEASONS[S.browse.R], i = ((S.browse.i % 12) + 12) % 12;
  $('browseName').innerHTML = `<b>${i + 1}/12</b><span>${A.best[i].name}</span><span>${B.best[i].name}</span>`;
  setDrape(A.best[i].hex, B.best[i].hex, A.short, B.short);
}
$('selL').onchange = (e) => { S.browse.L = e.target.value; renderBrowse(); };
$('selR').onchange = (e) => { S.browse.R = e.target.value; renderBrowse(); };
const step = (d) => { S.browse.i = (S.browse.i + d + 12) % 12; renderBrowse(); };
$('btnPrev').onclick = () => step(-1); $('btnNext').onclick = () => step(1);
function pickBrowse(side) {
  const a = side === 'L' ? S.browse.L : S.browse.R, b = side === 'L' ? S.browse.R : S.browse.L;
  if (a === b) return toast('서로 다른 시즌을 골라 주세요.');
  S.votes.push({ kind: 'palette', title: `${SEASONS[a].short} vs ${SEASONS[b].short}`, pick: SEASONS[a].name, chosen: PROTOTYPES[a], other: PROTOTYPES[b], scale: 0.5 });
  renderVotes(); toast(`${SEASONS[a].name} 선택을 반영했어요.`);
}
$('btnBrowseL').onclick = () => pickBrowse('L'); $('btnBrowseR').onclick = () => pickBrowse('R');
// 스와이프
(() => { let x0 = null; const st = $('stage');
  st.addEventListener('pointerdown', (e) => { x0 = e.clientX; });
  st.addEventListener('pointerup', (e) => { if (x0 == null || S.screen !== 'drape' || S.drapeTab !== 'browse') return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) > 40) step(dx < 0 ? 1 : -1); });
})();
function renderVotes() {
  $('voteSummary').innerHTML = S.votes.length ? '<b>고객 선택</b> ' + S.votes.map((v) => `<span class="vote">${v.title}: ${v.pick}</span>`).join('') : '';
}
function scaledVotes() { return S.votes.map((v) => { const s = v.scale ?? 1; const m = (o) => ({ w: (o.w || 0) * s, l: (o.l || 0) * s, c: (o.c || 0) * s }); return { chosen: m(v.chosen), other: m(v.other) }; }); }
function currentFeat() { const base = S.auto ? S.auto.feat : { w: 0, l: 0, c: 0 }; return applyDrape(base, scaledVotes()); }
$('btnDrapeDone').onclick = () => {
  if (!S.auto && !S.votes.filter((v) => v.pick !== '비슷함').length) return toast('비교를 한 번 이상 진행해 주세요.');
  buildFinal(); go('result');
};
$('btnBackDrape').onclick = () => go('drape');

// ---------- 최종 결과 ----------
function buildFinal() {
  store.finishSession(); // 결과까지 오면 진단권 사용 완료 (이후 같은 QR로 다시 시작 불가)
  const feat = currentFeat(); const cls = classify(feat);
  const realVotes = S.votes.filter((v) => v.pick !== '비슷함').length;
  const baseQ = S.auto ? S.auto.quality : 0.55;
  const q = Math.min(1, baseQ + 0.06 * realVotes);
  const conf = confidence(cls, q);
  const method = S.auto && realVotes ? '자동 분석 + 드레이핑' : S.auto ? '자동 분석' : '드레이핑';
  const d = new Date(); const date = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
  S.final = { face: S.auto?.face || null, id: cls.top[0].id, season: SEASONS[cls.top[0].id], second: SEASONS[cls.top[1].id], secondP: cls.top[1].p, p: cls.top[0].p, conf, method, date, changed: S.auto ? S.auto.cls.top[0].id !== cls.top[0].id : false };
  renderResult();
}
const sw = (c, cls = '') => `<div class="swatch ${cls}"><i style="background:${c.hex}"></i><span>${c.name}</span></div>`;
const RTABS = [['color', '컬러'], ['lip', '립'], ['glasses', '안경'], ['brow', '눈썹'], ['hair', '헤어']];
function faceId() { return S.faceShape || S.final?.face?.id || null; }
function needFace() { return `<p class="warn pick">얼굴형을 위에서 선택하면 맞춤 추천이 나와요.</p>`; }
function resultPane(tab) {
  const r = S.final, s = r.season, fid = faceId(), F = fid ? FACE_SHAPES[fid] : null;
  if (tab === 'lip') {
    const L = LIPS[r.id];
    return `<h2 class="sec">💄 추천 립 컬러</h2><div class="palette lips">${L.best.map((c) => sw(c, 'lip')).join('')}</div>
      <p class="tip">${L.tip}</p><h2 class="sec">피하면 좋은 립 컬러</h2><div class="palette lips avoid">${L.avoid.map((c) => sw(c, 'lip sm')).join('')}</div>`;
  }
  if (tab === 'glasses') {
    const G = FRAMES[r.id];
    return `<h2 class="sec">👓 안경테 컬러 <small>${s.name}</small></h2><div class="palette frames">${G.best.map((c) => sw(c, 'frame')).join('')}</div>
      <p class="tip">${G.tip} <span class="sub">피하면 좋은 테: ${G.avoid}</span></p>
      <h2 class="sec">안경테 모양 <small>${F ? F.name : ''}</small></h2>
      ${F ? `<div class="glist">${F.glasses.map((g) => `<div class="gitem" data-g="${g}">${glassesSvg(g)}<span>${GLASS_SHAPES[g]}</span></div>`).join('')}</div>
      <p class="tip">${F.glassesTip} <span class="sub">피하면 좋은 모양: ${F.glassesAvoid}</span></p>` : needFace()}`;
  }
  if (tab === 'hair') {
    const HC = HAIR_COLORS[r.id], g = S.hairGender === 'm' ? 'm' : 'f', H = F ? HAIR_REC[fid][g] : null, hc = HC.best[1].hex;
    return `<h2 class="sec">💇 헤어 컬러 추천 <small>${s.name}</small></h2><div class="palette hairc">${HC.best.map((c) => sw(c, 'hairc')).join('')}</div>
      <p class="tip">${HC.tip} <span class="sub">피하면 좋은 색: ${HC.avoid.map((c) => c.name).join(', ')}</span></p>
      <div class="hairhead"><h2 class="sec">헤어스타일 추천 <small>${F ? F.name : ''}</small></h2><div class="seg" role="group" aria-label="스타일 기준">${Object.entries(HAIR_GENDERS).map(([k, l]) => `<button type="button" class="segbtn ${g === k ? 'on' : ''}" data-hg="${k}" aria-pressed="${g === k}">${l}</button>`).join('')}</div></div>
      ${H ? `<div class="hlist">${H.styles.map((id) => `<div class="hitem" data-h="${id}">${hairSvg(id, hc)}<b>${HAIR_STYLES[id].name}</b><span class="hlen">${HAIR_STYLES[id].len}</span><span class="hdesc">${HAIR_STYLES[id].desc}</span></div>`).join('')}</div>
      <p class="tip">${H.tip} <span class="sub">피하면 좋은 스타일: ${H.avoid}</span></p>` : needFace()}`;
  }
  if (tab === 'brow') {
    const browColor = s.tone === '웜' ? '#6b4a32' : '#4d4646';
    const colorTip = s.tone === '웜' ? '눈썹 색은 브라운·카키 브라운처럼 따뜻한 갈색이 자연스러워요.' : '눈썹 색은 그레이 브라운·애쉬 브라운처럼 차가운 갈색이 자연스러워요.';
    return `<h2 class="sec">✏️ 눈썹 모양 추천 <small>${F ? F.name : ''}</small></h2>
      ${F ? `<div class="browrec">${browSvg(F.brow, browColor)}<div><b id="browName">${F.browName}</b><p>${F.browTip}</p></div></div>` : needFace()}
      <p class="tip">${colorTip}</p>`;
  }
  return `<p class="desc">${s.desc}</p>
    <h2 class="sec">베스트 컬러</h2><div class="palette">${s.best.map((c) => sw(c)).join('')}</div>
    <h2 class="sec">피하면 좋은 컬러</h2><div class="palette avoid">${s.avoid.map((c) => sw(c, 'sm')).join('')}</div>
    <div class="tipsgrid"><div><h3>💄 메이크업</h3><p>${s.makeup}</p></div><div><h3>💇 헤어</h3><p>${s.hair}</p></div><div><h3>💍 액세서리</h3><p>${s.acc}</p></div></div>
    <h2 class="sec">👚 코디 색 조합</h2><div class="outfits">${OUTFITS[r.id].map((x) => `<div class="outfit"><div class="ofsw" aria-hidden="true"><i style="background:${x.top.hex}"></i><i style="background:${x.bottom.hex}"></i><i class="pt" style="background:${x.point.hex}"></i></div><b>${x.title}</b><span>상의 ${x.top.name} · 하의 ${x.bottom.name} · 포인트 ${x.point.name}</span></div>`).join('')}</div>
    <div class="celebs"><h3>⭐ 같은 타입으로 자주 언급되는 예시 <small>(참고)</small></h3><p>${CELEBS[r.id].join(', ')}</p><p class="sub">${CELEB_NOTE}</p></div>`;
}
// 관리자 설정 '얼굴형 측정값 보기' (직원 확인용): 측정 비율·표준점수·후보 확률
function faceDebug() {
  const f = S.final?.face; if (S.screen === 'shared' || !store.cfg().faceDebug || !f?.metrics) return '';
  const m = f.metrics, z = f.z || {}, sg = (v) => (v >= 0 ? '+' : '') + v.toFixed(1);
  return `<p class="dbg" id="faceDbg">측정값 · 길이/광대 ${m.ratio.toFixed(3)} (z ${sg(z.ratio ?? 0)}) · 이마/광대 ${m.fore.toFixed(3)} (z ${sg(z.fore ?? 0)}) · 턱/광대 ${m.jaw.toFixed(3)} (z ${sg(z.jaw ?? 0)}) · 턱끝 ${m.chin.toFixed(1)}° (z ${sg(z.chin ?? 0)}) · 좌우 돌림 ${m.yaw.toFixed(2)} · 숙임 ${Number.isFinite(m.pitch) ? m.pitch.toFixed(0) + '°' : '-'}<br>후보 ${f.probs.slice(0, 3).map((x) => `${FACE_SHAPES[x.id].name} ${Math.round(x.p * 100)}%`).join(' / ')}</p>`;
}
function renderResult() {
  const r = S.final, s = r.season, fid = faceId(), auto = r.face, box = S.screen === 'shared' ? $('sharedCard') : $('resultCard');
  const opts = (fid ? '' : '<option value="" selected>선택해 주세요</option>') + FACE_ORDER.map((id) => `<option value="${id}" ${id === fid ? 'selected' : ''}>${FACE_SHAPES[id].name}</option>`).join('');
  const fnote = S.faceShape && auto && S.faceShape !== auto.id ? `직접 선택 (자동 추정: ${FACE_SHAPES[auto.id].name})`
    : S.faceShape && !auto ? '직접 선택'
    : auto ? `자동 추정 · ${auto.label} — ${auto.note}` : r.sharedFace ? '매장에서 고른 얼굴형이에요.' : S.screen === 'shared' ? '얼굴형을 고르면 안경·눈썹·헤어스타일 추천이 나와요.' : '얼굴 자동 인식이 없어요. 고객 얼굴을 보고 직접 골라 주세요.';
  box.innerHTML = `
    <div class="card-top" style="background:linear-gradient(90deg,${s.best.slice(0, 6).map((c) => c.hex).join(',')})"></div>
    <div class="card-head"><small>나의 퍼스널컬러</small><h1 id="resName">${s.name}</h1><p class="kw">${s.short} · ${s.keywords.join(' · ')}</p>
      <p class="meta"><span class="chip ${r.conf.level}">신뢰도 ${r.conf.label}</span> <span class="chip">${r.method}</span> <span class="chip ghost">2순위 ${r.second.name}</span></p></div>
    <div class="facerow"><label for="selFace">얼굴형</label><select id="selFace">${opts}</select><span class="fnote" id="faceNote">${fnote}</span></div>
    <div class="rtabs" role="tablist">${RTABS.map(([k, l]) => `<button type="button" role="tab" class="rtab ${S.resTab === k ? 'on' : ''}" data-rtab="${k}" aria-selected="${S.resTab === k}">${l}</button>`).join('')}</div>
    <div class="rpane" id="rpane" data-tab="${S.resTab}">${resultPane(S.resTab)}</div>
    ${faceDebug()}
    ${r.changed && S.auto ? `<p class="note">드레이핑 선택을 반영해 자동 분석(${SEASONS[S.auto.cls.top[0].id].name})과 다른 결과가 나왔어요.</p>` : ''}
    <p class="note">카메라와 조명에 따라 달라질 수 있는 추정 결과이고, 추천은 일반적인 스타일링 가이드에 따른 제안이에요. 실제 옷·안경·화장품·헤어를 대 보며 함께 확인해 주세요.</p>`;
  prepCards();
}
for (const id of ['resultCard', 'sharedCard']) {
  $(id).addEventListener('click', (e) => { if (!S.final) return; const hg = e.target.closest('[data-hg]'); if (hg) { S.hairGender = hg.dataset.hg; renderResult(); return; } const t = e.target.closest('[data-rtab]'); if (!t) return; S.resTab = t.dataset.rtab; renderResult(); });
  $(id).addEventListener('change', (e) => { if (e.target.id !== 'selFace' || !S.final) return; S.faceShape = e.target.value || null; renderResult(); });
}
// v1.7: 결과 버튼 '더보기' (스토리 이미지·드레이핑 다시 보기)
function setMore(open) { $('resMore').hidden = !open; $('btnResMore').setAttribute('aria-expanded', String(open)); $('btnResMore').textContent = open ? '닫기 ▾' : '더보기 ▴'; if (open) $('resMore').querySelector('button').focus(); }
$('btnResMore').onclick = (e) => { e.stopPropagation(); setMore($('resMore').hidden); };
$('resMore').addEventListener('click', () => setMore(false));
document.addEventListener('click', (e) => { if (!$('resMore').hidden && !e.target.closest('#resMore, #btnResMore')) setMore(false); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !$('resMore').hidden) { setMore(false); $('btnResMore').focus(); } });
$('btnSharedPng').onclick = () => saveCard('full');
$('btnSharedStory').onclick = () => saveCard('story');
$('btnSavePng').onclick = () => saveCard('full');
$('btnSaveStory').onclick = () => saveCard('story');
// v1.6: 'full' = 긴 결과 카드, 'story' = 인스타 스토리 크기(1080×1920). 둘 다 결과 보기 QR·주소 포함 (얼굴 사진 없음)
// v1.7: 결과 이미지를 미리 만들어 둠 → 버튼을 누르는 즉시 공유 시트를 엶 (iPhone은 누른 뒤 시간이 걸리면 공유를 막음)
const cardKey = () => (S.final ? [S.final.id, S.final.second?.id, S.final.conf.level, S.final.method, S.final.date, faceId(), S.hairGender].join('|') : '');
let cardCache = { key: '', files: {} }, prepTimer = null;
async function makeCardFile(kind) {
  const data = { ...S.final, faceId: faceId(), hairGender: S.hairGender, url: resultUrl(), appUrl: location.origin + location.pathname, outfits: OUTFITS[S.final.id], celebs: CELEBS[S.final.id] };
  const cv = document.createElement('canvas'); (kind === 'story' ? renderStoryCanvas : renderCardCanvas)(cv, data);
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  cv.width = cv.height = 1;
  const name = `퍼스널컬러_${S.final.season.short}_${S.final.date.replaceAll('.', '')}${kind === 'story' ? '_스토리' : ''}.png`;
  return new File([blob], name, { type: 'image/png' });
}
function prepCards() {
  clearTimeout(prepTimer);
  prepTimer = setTimeout(async () => {
    const key = cardKey(); if (!key || cardCache.key === key) return;
    const files = {};
    for (const kind of ['full', 'story']) { files[kind] = await makeCardFile(kind); if (cardKey() !== key) return; }
    cardCache = { key, files };
  }, 400);
}
function dropCards() { clearTimeout(prepTimer); cardCache = { key: '', files: {} }; }
async function saveCard(kind = 'full') {
  if (!S.final) return;
  const ready = cardCache.key === cardKey() ? cardCache.files[kind] : null;
  const file = ready || (await makeCardFile(kind)), blob = file;
  const name = file.name;
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '퍼스널컬러 결과' }); return; } catch (e) {
      if (e.name === 'AbortError') return;
      // 공유가 막혔으면(사용자 동작 시간 초과 등) 아래 다운로드로 대신 저장
    }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); toast('결과 이미지를 저장했어요.');
}

// ---------- 결과를 고객 휴대폰으로 (서버 없이: 주소의 # 뒤에 결과 코드만 담음, #은 서버로 전송되지 않음) ----------
const resultUrl = () => location.origin + location.pathname + '#r=' + encodeResult(S.final, faceId(), S.hairGender);
$('btnResultQr').onclick = () => {
  if (!S.final) return;
  const cv = $('rqCanvas'), ctx = cv.getContext('2d'); ctx.clearRect(0, 0, cv.width, cv.height); drawQr(ctx, resultUrl(), 0, 0, cv.width, 3);
  cv.dataset.url = resultUrl(); $('rqView').hidden = false;
};
$('btnRqClose').onclick = () => { $('rqView').hidden = true; const cv = $('rqCanvas'); cv.getContext('2d').clearRect(0, 0, cv.width, cv.height); delete cv.dataset.url; };
function openShared() {
  const m = /^#r=([0-9a-z]+)$/.exec(location.hash); if (!m) return false;
  const f = decodeResult(m[1]);
  S = fresh(); S.screen = 'shared';
  if (!f) { go('home'); toast('결과 주소가 올바르지 않아요.', 4500); return true; }
  S.final = f; S.faceShape = f.sharedFace; S.hairGender = f.sharedGender || 'f'; wake(); go('shared').then(renderResult); return true;
}
window.addEventListener('hashchange', () => { if (location.hash.startsWith('#r=')) openShared(); });

// ---------- 고객 무동작 자동 초기화 (2분 30초 → '계속하시겠어요?' 20초 → 카메라 끄고 처음으로) ----------
const IDLE = { ms: 150000, cd: 20000, last: Date.now(), promptAt: 0 };
function touchIdle() { IDLE.last = Date.now(); if (IDLE.promptAt) hideIdle(); }
function hideIdle() { IDLE.promptAt = 0; $('idlePrompt').hidden = true; }
['pointerdown', 'keydown', 'input', 'wheel', 'touchstart'].forEach((ev) => document.addEventListener(ev, () => touchIdle(), { passive: true, capture: true }));
setInterval(() => {
  const now = Date.now();
  if (NO_IDLE.has(S.screen) || S.screen.startsWith('admin')) { if (IDLE.promptAt) hideIdle(); IDLE.last = now; return; }
  if (!IDLE.promptAt && now - IDLE.last >= IDLE.ms) { IDLE.promptAt = now; $('idlePrompt').hidden = false; }
  if (IDLE.promptAt) {
    const left = Math.max(0, Math.ceil((IDLE.cd - (now - IDLE.promptAt)) / 1000)); $('idleCount').textContent = left;
    if (now - IDLE.promptAt >= IDLE.cd) { hideIdle(); store.endSession(); resetAll(false).then(() => toast('오래 사용하지 않아 처음 화면으로 돌아왔어요.', 4000)); }
  }
}, 250);
$('btnIdleContinue').onclick = () => touchIdle();

// ---------- 초기화 ----------
async function resetAll(confirmFirst = true) {
  if (confirmFirst && S.screen !== 'home' && !(await ask('지금까지의 진단 내용을 모두 지우고 처음으로 돌아갈까요?'))) return;
  stopCamera(); wipeWork(); clearPhoto(); dropCards(); setMore(false);
  S = fresh();
  $('chkConsent').checked = false; $('btnConsentCam').disabled = $('btnConsentPhoto').disabled = true;
  $('rqView').hidden = true; hideIdle(); if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  $('fileInput').value = '';
  for (const id of ['autoBody', 'resultCard', 'sharedCard', 'voteSummary', 'meter', 'autoConf', 'roundProg', 'roundTitle', 'roundQ', 'btnPickL', 'btnPickR', 'browseName', 'selL', 'selR']) $(id).innerHTML = '';
  $('toast').hidden = true; $('modal').hidden = true;
  setDrape('transparent', null, '', '');
  // 진단 데이터는 저장하지 않지만, 혹시 남은 값이 있으면 지움 (진단권 사용 기록 pcqr.* 만 유지: 코드 ID·시각, 개인정보 없음)
  try { sessionStorage.clear(); for (const k of Object.keys(localStorage)) if (!k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k); } catch {}
  await go('home');
}
$('btnReset').onclick = () => resetAll(true);
$('btnNextCustomer').onclick = () => resetAll(false);

// 화면 전환/백그라운드 시 카메라 해제
document.addEventListener('visibilitychange', async () => {
  if (document.hidden) { stopCamera(); return; }
  if (CAMERA_SCREENS.has(S.screen)) { await startCamera(); if (SCAN_SCREENS.has(S.screen) && stream) startScan(); }
  wake();
});
window.addEventListener('resize', () => setOverlay(S.screen));

// 테스트용 읽기 전용 상태 노출
const admin = initAdmin({ $, go, toast, ask, store, getScreen: () => S.screen, openSyncScan, onCfg: () => wake(), diag: { camErrMsg, faceStatus, loadFace, swStatus, appStream: () => stream } });
window.__pc = { get state() { return S; }, get stream() { return stream; }, faceStatus, admin, store, setIdle: (ms, cd) => { IDLE.ms = ms; IDLE.cd = cd ?? IDLE.cd; IDLE.last = Date.now(); }, get wakeLock() { return wakeLock; }, encodeResult, decodeResult, resultUrl: () => (S.final ? resultUrl() : null), saveCard };

// ---------- 기기 시계 확인 (시계를 뒤로 돌리면 관리자에게 경고) ----------
if (!SHARED_BOOT) { store.touchSeen(); setInterval(() => store.touchSeen(), 60000); }

// ---------- 화면 꺼짐 방지 · 전체 화면 ----------
let wakeLock = null;
async function wake() {
  try {
    if (SHARED_BOOT || S.screen === 'shared' || store.cfg().wake === false) { await wakeLock?.release(); wakeLock = null; return; }
    if (!('wakeLock' in navigator) || document.hidden || (wakeLock && !wakeLock.released)) return;
    wakeLock = await navigator.wakeLock.request('screen');
  } catch { wakeLock = null; }
}
document.addEventListener('pointerdown', () => { if (!wakeLock || wakeLock.released) wake(); }, { passive: true });
wake();
const fsOk = !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
$('btnFull').hidden = !fsOk;
$('btnFull').onclick = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { toast('전체 화면을 쓸 수 없어요.'); } };
document.addEventListener('fullscreenchange', () => { $('btnFull').textContent = document.fullscreenElement ? '🗗' : '⛶'; $('btnFull').setAttribute('aria-label', document.fullscreenElement ? '전체 화면 끝내기' : '전체 화면'); });

// 서비스 워커 (HTTPS 또는 localhost)
if (!SHARED_BOOT && 'serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  // 새 버전이 설치되면 진행 중인 진단을 방해하지 않게 '새로고침' 안내만 띄움
  const hadController = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadController) $('updBar').hidden = false; });
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').then((reg) => { setInterval(() => { if (S.screen === 'home') reg.update().catch(() => {}); }, 30 * 60 * 1000); }).catch(() => {}));
}
// 첫 화면 아래 버전 표시: 실행 중인 서비스 워커에 물어봄 (없으면 sw.js 파일의 값). 버전 값은 sw.js 한 곳에만 있음
async function appVersion() {
  const ctl = navigator.serviceWorker?.controller;
  if (ctl) { const v = await new Promise((res) => { const ch = new MessageChannel(); const t = setTimeout(() => res(null), 2000); ch.port1.onmessage = (e) => { clearTimeout(t); res(e.data); }; ctl.postMessage({ type: 'version' }, [ch.port2]); }); if (v?.version) return v; }
  try { const s = await (await fetch('sw.js', { cache: 'no-store' })).text(); const m = /VERSION = '([^']+)', BUILD_DATE = '([^']+)'/.exec(s); if (m) return { version: m[1], date: m[2] }; } catch {}
  return null;
}
if (!SHARED_BOOT) appVersion().then((v) => { if (v) { const n = v.version.replace(/^pc-/, ''); $('appVer').textContent = `버전 ${n} · ${v.date}`; $('appVer').dataset.version = v.version; } });
// v1.7: 첫 화면 '오프라인 준비' 표시 (서비스 워커 캐시에 앱 파일·얼굴 인식 파일이 다 있는지)
async function swStatus() {
  const sw = navigator.serviceWorker; if (!sw) return null;
  const reg = await sw.getRegistration().catch(() => null); const w = sw.controller || reg?.active; if (!w) return reg ? { pending: true } : null;
  return new Promise((res) => { const ch = new MessageChannel(); const end = (v) => { clearTimeout(t); ch.port1.onmessage = null; ch.port1.close(); res(v); }; const t = setTimeout(() => end(null), 3000); ch.port1.onmessage = (e) => end(e.data); w.postMessage({ type: 'status' }, [ch.port2]); });
}
let offTimer = null;
async function renderOffline() {
  clearTimeout(offTimer); const el = $('offReady');
  const st = await swStatus().catch(() => null);
  if (!st) { el.hidden = true; return; }
  el.hidden = false;
  if (st.pending || st.core[0] < st.core[1]) { el.className = 'offready'; el.textContent = '⏳ 오프라인 준비 중… (인터넷 연결을 유지해 주세요)'; offTimer = setTimeout(renderOffline, 3000); return; }
  if (st.face[0] < st.face[1]) { el.className = 'offready warn'; el.textContent = `⚠️ 오프라인 준비: 앱은 완료, 얼굴 인식 파일 ${st.face[0]}/${st.face[1]} — 인터넷에 연결된 상태로 다시 열어 주세요`; return; }
  el.className = 'offready ok'; el.textContent = '✅ 오프라인 준비 완료 (인터넷 없이도 진단할 수 있어요)';
}
if (!SHARED_BOOT) { window.addEventListener('load', () => setTimeout(renderOffline, 800)); navigator.serviceWorker?.addEventListener('controllerchange', () => setTimeout(renderOffline, 500)); }
$('btnUpdReload').onclick = () => location.reload(); // 진행 중이던 진단은 첫 화면의 [이어하기]로 계속
$('btnUpdLater').onclick = () => { $('updBar').hidden = true; };
if (!openShared()) go('home');
// v1.6.2: v1.6.1에서 불러 둔 발급 키(개인키)는 더 이상 쓰지 않으므로 기기에서 지움
try { globalThis.indexedDB?.deleteDatabase('pc-keys'); } catch {}
