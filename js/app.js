import { whiteBalanceFromPaper, applyDrape, classify, confidence, labToRgb, PROTOTYPES, WARM, lightCheck } from './color.js';
import { analyzeImage, ovalGeom, paperGeom, paperRgb, estimateCast } from './analyzer.js';
import { SEASONS, SEASON_ORDER, drapeRounds } from './seasons.js';
import { loadFace, detectFace, faceStatus } from './face.js';
import { renderCardCanvas } from './card.js';
import { createStore, admit, STORAGE_PREFIX } from './ticket.js';
import { initDecoder, decodeVideo } from './qr.js';
import { initAdmin } from './admin.js';
import { faceMetrics, classifyFaceShape, FACE_SHAPES, FACE_ORDER, GLASS_SHAPES, LIPS, FRAMES, glassesSvg, browSvg } from './style.js';

const $ = (id) => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';
const CAMERA_SCREENS = new Set(['ticket', 'calib', 'capture', 'drape']);
const STEP_LABELS = [['ticket', '진단권'], ['consent', '동의'], ['calib', '보정'], ['capture', '촬영'], ['auto', '분석'], ['drape', '드레이핑'], ['result', '결과']];

const fresh = () => ({ screen: 'home', wb: null, auto: null, votes: [], roundIdx: 0, rounds: null, browse: { L: 'spring_light', R: 'summer_light', i: 0 }, drapeTab: 'rounds', final: null, drapeOnly: false, faceShape: null, resTab: 'color' });
let S = fresh();
let stream = null, facing = 'user', meterTimer = null, cameraBusy = false, seq = 0;
const work = $('work');

// ---------- 공통 UI ----------
function toast(msg, ms = 3200) { const t = $('toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast._t); toast._t = setTimeout(() => (t.hidden = true), ms); }
function ask(msg) {
  return new Promise((res) => {
    $('modalMsg').textContent = msg; $('modal').hidden = false;
    const done = (v) => { $('modal').hidden = true; $('modalYes').onclick = $('modalNo').onclick = null; res(v); };
    $('modalYes').onclick = () => done(true); $('modalNo').onclick = () => done(false);
  });
}
function renderSteps() {
  const idx = STEP_LABELS.findIndex(([k]) => k === S.screen || (S.screen === 'analyzing' && k === 'auto'));
  $('steps').innerHTML = S.screen === 'home' || S.screen.startsWith('admin') ? '' : STEP_LABELS.map(([k, l], i) => `<span class="${i < idx ? 'done' : i === idx ? 'cur' : ''}">${l}</span>`).join('');
}
async function go(screen) {
  const my = ++seq;
  S.screen = screen; document.body.dataset.screen = screen;
  document.querySelectorAll('.screen').forEach((el) => (el.hidden = el.dataset.for !== screen));
  renderSteps();
  const needCam = CAMERA_SCREENS.has(screen);
  document.body.classList.toggle('has-stage', needCam);
  if (needCam) { await startCamera(); if (my !== seq) return; } else stopCamera();
  setOverlay(screen);
  if (screen === 'ticket') startScan(); else stopScan();
  if (screen === 'home') renderHomePass();
  if (screen === 'calib') renderCalibStatus();
  if (screen === 'capture') $('captureCalib').textContent = S.wb ? '✅ 흰 종이 보정 적용 중' : '⚠️ 보정 없이 측정해요 (조명 색의 영향을 받을 수 있어요)';
  if (screen === 'drape') renderDrape();
  window.scrollTo(0, 0); $('panel').scrollTop = 0;
}

// ---------- 카메라 ----------
const video = $('video');
async function startCamera() {
  if (stream) return true;
  if (!navigator.mediaDevices?.getUserMedia) {
    stageMsg(window.isSecureContext ? '이 브라우저는 카메라를 지원하지 않아요. 사진 파일로 진단해 주세요.' : '카메라는 HTTPS 주소나 localhost에서만 켜져요. 사진 파일로 진단하거나 HTTPS로 접속해 주세요.');
    return false;
  }
  if (cameraBusy) return false; cameraBusy = true;
  stageMsg('카메라를 켜는 중…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    if (!CAMERA_SCREENS.has(S.screen)) { stopCamera(); return false; }
    video.srcObject = stream; await video.play().catch(() => {});
    await new Promise((r) => (video.videoWidth ? r() : video.addEventListener('loadedmetadata', r, { once: true })));
    const st = stream.getVideoTracks()[0]?.getSettings?.() || {};
    const mirror = (st.facingMode || facing) === 'user';
    $('stage').classList.toggle('mirror', mirror);
    stageMsg(''); setOverlay(S.screen); startMeter();
    return true;
  } catch (e) {
    stream = null;
    stageMsg(e.name === 'NotAllowedError' ? '카메라 권한이 거부됐어요. 브라우저 주소창의 권한 설정에서 카메라를 허용하거나, 사진 파일로 진단해 주세요.' : '카메라를 켤 수 없어요 (' + e.name + '). 사진 파일로 진단해 주세요.');
    return false;
  } finally { cameraBusy = false; }
}
function stopCamera() {
  clearInterval(meterTimer); meterTimer = null;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  stream = null; video.pause(); video.srcObject = null; $('meter').innerHTML = '';
}
function stageMsg(m) { $('stageMsg').textContent = m; $('stageMsg').hidden = !m; }
$('btnSwitch').onclick = async () => { facing = facing === 'user' ? 'environment' : 'user'; stopCamera(); const ok = await startCamera(); if (!ok) toast('카메라를 전환할 수 없어요.'); };

function grabFrame(maxSide = 1280) {
  const vw = video.videoWidth, vh = video.videoHeight; if (!vw) return null;
  const k = Math.min(1, maxSide / Math.max(vw, vh)); work.width = Math.round(vw * k); work.height = Math.round(vh * k);
  const ctx = work.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, work.width, work.height);
  return ctx.getImageData(0, 0, work.width, work.height);
}
function wipeWork() { const ctx = work.getContext('2d'); ctx.clearRect(0, 0, work.width, work.height); work.width = 1; work.height = 1; }

// ---------- 오버레이 ----------
function setOverlay(screen) {
  const W = video.videoWidth || 1280, H = video.videoHeight || 720, svg = $('overlay');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
  const o = ovalGeom(W, H);
  for (const id of ['ovalHole', 'ovalLine']) { const e = $(id); e.setAttribute('cx', o.cx); e.setAttribute('cy', o.cy); e.setAttribute('rx', o.rx); e.setAttribute('ry', o.ry); }
  const mr = svg.querySelector('#ovalMask rect'); mr.setAttribute('x', -W); mr.setAttribute('y', -H); mr.setAttribute('width', 3 * W); mr.setAttribute('height', 3 * H);
  const p = paperGeom(W, H); const pr = $('paperRect'); pr.setAttribute('x', p.x); pr.setAttribute('y', p.y); pr.setAttribute('width', p.s); pr.setAttribute('height', p.s);
  $('layerOval').style.display = screen === 'capture' || screen === 'drape' ? '' : 'none';
  $('layerOval').classList.toggle('faint', screen === 'drape');
  $('layerPaper').style.display = screen === 'calib' ? '' : 'none';
  const qs = Math.min(W, H) * 0.62, qr = $('qrRect'); qr.setAttribute('x', (W - qs) / 2); qr.setAttribute('y', (H - qs) / 2); qr.setAttribute('width', qs); qr.setAttribute('height', qs);
  $('layerQr').style.display = screen === 'ticket' ? '' : 'none';
  $('layerDrape').style.display = screen === 'drape' ? '' : 'none';
  // 드레이프 모양: 턱 아래에서 어깨까지
  const top = o.cy + o.ry * 0.94, side = Math.min(H - 4, o.cy + o.ry * 1.18);
  const d = `M${-W},${side} L${o.cx - o.rx * 1.5},${side} Q${o.cx},${top - o.ry * 0.08} ${o.cx + o.rx * 1.5},${side} L${2 * W},${side} L${2 * W},${2 * H} L${-W},${2 * H} Z`;
  $('drapeL').setAttribute('d', d); $('drapeR').setAttribute('d', d);
  const cl = $('clipLRect'), cr = $('clipRRect');
  cl.setAttribute('x', -W); cl.setAttribute('y', -H); cl.setAttribute('width', W + W / 2); cl.setAttribute('height', 3 * H);
  cr.setAttribute('x', W / 2); cr.setAttribute('y', -H); cr.setAttribute('width', 1.5 * W); cr.setAttribute('height', 3 * H);
  const dv = $('drapeDivider'); dv.setAttribute('x1', W / 2); dv.setAttribute('x2', W / 2); dv.setAttribute('y1', top - 10); dv.setAttribute('y2', 2 * H);
  const ty = Math.min(H - 24, side + (H - side) / 2 + 14);
  $('drapeTagL').setAttribute('x', W * 0.25); $('drapeTagR').setAttribute('x', W * 0.75);
  $('drapeTagL').setAttribute('y', ty); $('drapeTagR').setAttribute('y', ty);
  $('drapeTagL').style.fontSize = $('drapeTagR').style.fontSize = Math.round(H * 0.05) + 'px';
}
function fillOf(f) { return f === 'gold' ? 'url(#gGold)' : f === 'silver' ? 'url(#gSilver)' : f; }
function setDrape(left, right, tagL, tagR) {
  // 화면 기준 왼쪽/오른쪽. 전면 카메라(거울 모드)에서도 화면 기준으로 맞춤
  const mirror = $('stage').classList.contains('mirror');
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
    if (!stream || !video.videoWidth || S.screen === 'drape' || S.screen === 'ticket') { if (S.screen === 'drape' || S.screen === 'ticket') $('meter').innerHTML = ''; return; }
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
function startFlow(drapeOnly) {
  S.drapeOnly = drapeOnly;
  const a = store.active();
  if (a) { S.ticket = a.id; toast('진행 중인 진단권으로 이어서 진행해요.'); return go('consent'); }
  if (store.takePass()) { const id = 'PASS' + Date.now().toString(36).toUpperCase(); store.markUsed(id, Date.now(), 'admin'); store.startSession(id, 'admin'); S.ticket = id; toast('관리자 허가로 QR 없이 1회 진단을 시작해요.'); return go('consent'); }
  $('ticketCode').value = ''; ticketMsg('QR 코드를 찾는 중이에요…'); go('ticket');
}
function renderHomePass() {
  const n = store.passCount(), a = store.active(), el = $('homePass');
  el.hidden = !n && !a;
  el.textContent = a ? '진행 중인 진단이 있어요. 진단 시작을 누르면 이어서 할 수 있어요.' : n ? `관리자 허가: QR 없이 진단 ${n}회 가능` : '';
}
function ticketMsg(m, kind = '') { const el = $('ticketMsg'); el.textContent = m; el.className = 'status' + (kind ? ' ' + kind : ''); }
let scanTimer = null, scanBusy = false, lastBad = { t: '', at: 0 }, admitting = false;
const qrCanvas = document.createElement('canvas');
function startScan() {
  stopScan(); initDecoder(); lastBad = { t: '', at: 0 };
  scanTimer = setInterval(async () => {
    if (scanBusy || admitting || S.screen !== 'ticket' || !video.videoWidth) return;
    scanBusy = true;
    try { const txt = await decodeVideo(video, qrCanvas); if (txt && S.screen === 'ticket') await onCode(txt, 'qr'); } catch {} finally { scanBusy = false; }
  }, 250);
}
function stopScan() { clearInterval(scanTimer); scanTimer = null; qrCanvas.width = qrCanvas.height = 1; }
async function onCode(txt, src) {
  if (src === 'qr' && txt === lastBad.t && Date.now() - lastBad.at < 20000) return; // 같은 거부 코드는 20초 동안 다시 알리지 않음
  admitting = true;
  try {
    const r = await admit(store, txt);
    if (!r.ok) { if (src === 'qr') lastBad = { t: txt, at: Date.now() }; ticketMsg('⛔ ' + r.msg, 'bad'); toast(r.msg, 4000); return; }
    stopScan(); S.ticket = r.id; ticketMsg('✅ 진단권 확인 완료', 'ok');
    toast(r.resumed ? '진행 중인 진단권으로 이어서 진행해요.' : `진단권 ${r.id.slice(0, 4)}-${r.id.slice(4)} 확인 완료! 진단을 시작해요.`);
    await go('consent');
  } finally { admitting = false; }
}
$('btnTicketCode').onclick = () => { const v = $('ticketCode').value.trim(); if (!v) return toast('카드에 적힌 코드를 입력해 주세요.'); onCode(v, 'manual'); };
$('ticketCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') $('btnTicketCode').click(); });
$('btnTicketCancel').onclick = () => go('home');
$('btnStart').onclick = () => startFlow(false);
$('btnDrapeOnly').onclick = () => startFlow(true);
$('chkConsent').onchange = (e) => { $('btnConsentCam').disabled = $('btnConsentPhoto').disabled = !e.target.checked; };
$('btnConsentCam').onclick = () => { loadFace(); go(S.drapeOnly ? 'drape' : 'calib'); };
$('btnConsentPhoto').onclick = () => { loadFace(); S.drapeOnly = false; $('fileInput').click(); };
$('btnConsentNo').onclick = () => resetAll(false);
$('btnUpload').onclick = () => $('fileInput').click();

// ---------- 보정 ----------
function renderCalibStatus() {
  const st = $('calibStatus');
  if (!S.wb) { st.className = 'status'; st.textContent = '보정 안 함'; $('btnCalibClear').hidden = true; $('btnCalibNext').textContent = '보정 없이 다음'; return; }
  st.className = 'status ok';
  st.textContent = `✅ 보정 완료 — 원래 조명: ${S.wb.castChroma < 4 ? '거의 중립' : castName(S.wb.paperLab) + ' (치우침 ' + S.wb.castChroma.toFixed(1) + ')'}`;
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
  S.wb = { gains: wb.gains, paperLab: wb.paperLab, castChroma: wb.castChroma };
  renderCalibStatus(); toast('흰 종이 보정을 적용했어요.');
};
$('btnCalibClear').onclick = () => { S.wb = null; renderCalibStatus(); };
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
  try { bmp = await createImageBitmap(f); } catch { return toast('이미지를 열 수 없어요.'); }
  const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  work.width = Math.round(bmp.width * k); work.height = Math.round(bmp.height * k);
  const ctx = work.getContext('2d', { willReadFrequently: true }); ctx.drawImage(bmp, 0, 0, work.width, work.height); bmp.close?.();
  const img = ctx.getImageData(0, 0, work.width, work.height);
  stopCamera();
  await runAnalysis(img, 'photo');
};
async function runAnalysis(img, source) {
  await go('analyzing');
  $('analyzingMsg').textContent = faceStatus() === 'ready' ? '분석 중이에요…' : '얼굴 인식 준비 중이에요…';
  // 얼굴 인식용 캔버스는 work(이미 그려져 있음)를 그대로 사용
  const ctx = work.getContext('2d'); ctx.putImageData(img, 0, 0);
  let lm = null;
  try { lm = await detectFace(work); } catch { lm = null; }
  $('analyzingMsg').textContent = '분석 중이에요…';
  let res = analyzeImage(img, { landmarks: lm, gains: S.wb?.gains || null, calibrated: !!S.wb, source });
  if (res.ok && lm) { try { res.face = classifyFaceShape(faceMetrics(lm, img.width, img.height)); } catch { res.face = null; } }
  if (!lm && source === 'photo') res.notes?.unshift('사진에서 얼굴을 찾지 못해 사진 가운데 영역으로 측정했어요. 얼굴이 가운데 오는 정면 사진을 써 주세요.');
  // 이미지 데이터 폐기
  img.data.fill(0); wipeWork();
  if (!res.ok) { toast(source === 'photo' ? '얼굴 피부를 찾지 못했어요. 얼굴이 크게 나온 정면 사진을 써 주세요.' : '피부색을 찾지 못했어요. 얼굴을 타원 안에 맞추고 다시 촬영해 주세요.', 4500); return go(source === 'photo' ? 'consent' : 'capture'); }
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
$('btnRetake').onclick = () => go('capture');
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
const RTABS = [['color', '컬러'], ['lip', '립'], ['glasses', '안경'], ['brow', '눈썹']];
function faceId() { return S.faceShape || S.final?.face?.id || null; }
function needFace() { return `<p class="warn pick">얼굴형을 위에서 선택하면 맞춤 추천이 나와요.</p>`; }
function resultPane(tab) {
  const r = S.final, s = r.season, fid = faceId(), F = fid ? FACE_SHAPES[fid] : null;
  if (tab === 'lip') {
    const L = LIPS[r.id];
    return `<h3>💄 추천 립 컬러</h3><div class="palette lips">${L.best.map((c) => sw(c, 'lip')).join('')}</div>
      <p class="tip">${L.tip}</p><h3>피하면 좋은 립 컬러</h3><div class="palette lips avoid">${L.avoid.map((c) => sw(c, 'lip sm')).join('')}</div>`;
  }
  if (tab === 'glasses') {
    const G = FRAMES[r.id];
    return `<h3>👓 안경테 컬러 <small>${s.name}</small></h3><div class="palette frames">${G.best.map((c) => sw(c, 'frame')).join('')}</div>
      <p class="tip">${G.tip} <span class="sub">피하면 좋은 테: ${G.avoid}</span></p>
      <h3>안경테 모양 <small>${F ? F.name : ''}</small></h3>
      ${F ? `<div class="glist">${F.glasses.map((g) => `<div class="gitem" data-g="${g}">${glassesSvg(g)}<span>${GLASS_SHAPES[g]}</span></div>`).join('')}</div>
      <p class="tip">${F.glassesTip} <span class="sub">피하면 좋은 모양: ${F.glassesAvoid}</span></p>` : needFace()}`;
  }
  if (tab === 'brow') {
    const browColor = s.tone === '웜' ? '#6b4a32' : '#4d4646';
    const colorTip = s.tone === '웜' ? '눈썹 색은 브라운·카키 브라운처럼 따뜻한 갈색이 자연스러워요.' : '눈썹 색은 그레이 브라운·애쉬 브라운처럼 차가운 갈색이 자연스러워요.';
    return `<h3>✏️ 눈썹 모양 추천 <small>${F ? F.name : ''}</small></h3>
      ${F ? `<div class="browrec">${browSvg(F.brow, browColor)}<div><b id="browName">${F.browName}</b><p>${F.browTip}</p></div></div>` : needFace()}
      <p class="tip">${colorTip}</p>`;
  }
  return `<p class="desc">${s.desc}</p>
    <h3>베스트 컬러</h3><div class="palette">${s.best.map((c) => sw(c)).join('')}</div>
    <h3>피하면 좋은 컬러</h3><div class="palette avoid">${s.avoid.map((c) => sw(c, 'sm')).join('')}</div>
    <div class="tipsgrid"><div><h4>💄 메이크업</h4><p>${s.makeup}</p></div><div><h4>💇 헤어</h4><p>${s.hair}</p></div><div><h4>💍 액세서리</h4><p>${s.acc}</p></div></div>`;
}
function renderResult() {
  const r = S.final, s = r.season, fid = faceId(), auto = r.face;
  const opts = (fid ? '' : '<option value="" selected>선택해 주세요</option>') + FACE_ORDER.map((id) => `<option value="${id}" ${id === fid ? 'selected' : ''}>${FACE_SHAPES[id].name}</option>`).join('');
  const fnote = S.faceShape && auto && S.faceShape !== auto.id ? `직접 선택 (자동 추정: ${FACE_SHAPES[auto.id].name})`
    : S.faceShape && !auto ? '직접 선택'
    : auto ? `자동 추정 · ${auto.label} — ${auto.note}` : '얼굴 자동 인식이 없어요. 고객 얼굴을 보고 직접 골라 주세요.';
  $('resultCard').innerHTML = `
    <div class="card-top" style="background:linear-gradient(90deg,${s.best.slice(0, 6).map((c) => c.hex).join(',')})"></div>
    <div class="card-head"><small>나의 퍼스널컬러</small><h1 id="resName">${s.name}</h1><p class="kw">${s.short} · ${s.keywords.join(' · ')}</p>
      <p class="meta"><span class="chip ${r.conf.level}">신뢰도 ${r.conf.label}</span> <span class="chip">${r.method}</span> <span class="chip ghost">2순위 ${r.second.name}</span></p></div>
    <div class="facerow"><label for="selFace">얼굴형</label><select id="selFace">${opts}</select><span class="fnote" id="faceNote">${fnote}</span></div>
    <div class="rtabs" role="tablist">${RTABS.map(([k, l]) => `<button type="button" role="tab" class="rtab ${S.resTab === k ? 'on' : ''}" data-rtab="${k}" aria-selected="${S.resTab === k}">${l}</button>`).join('')}</div>
    <div class="rpane" id="rpane" data-tab="${S.resTab}">${resultPane(S.resTab)}</div>
    ${r.changed ? `<p class="note">드레이핑 선택을 반영해 자동 분석(${SEASONS[S.auto.cls.top[0].id].name})과 다른 결과가 나왔어요.</p>` : ''}
    <p class="note">카메라와 조명에 따라 달라질 수 있는 추정 결과이고, 추천은 일반적인 스타일링 가이드에 따른 제안이에요. 실제 옷·안경·화장품을 대 보며 함께 확인해 주세요.</p>`;
}
$('resultCard').addEventListener('click', (e) => { const t = e.target.closest('[data-rtab]'); if (!t || !S.final) return; S.resTab = t.dataset.rtab; renderResult(); });
$('resultCard').addEventListener('change', (e) => { if (e.target.id !== 'selFace' || !S.final) return; S.faceShape = e.target.value || null; renderResult(); });
$('btnSavePng').onclick = async () => {
  if (!S.final) return;
  const cv = document.createElement('canvas'); renderCardCanvas(cv, { ...S.final, faceId: faceId() });
  const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
  cv.width = cv.height = 1;
  const name = `퍼스널컬러_${S.final.season.short}_${S.final.date.replaceAll('.', '')}.png`;
  const file = new File([blob], name, { type: 'image/png' });
  if (/iPhone|iPad|Android/i.test(navigator.userAgent) && navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: '퍼스널컬러 결과' }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const url = URL.createObjectURL(blob); const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000); toast('결과 이미지를 저장했어요.');
};

// ---------- 초기화 ----------
async function resetAll(confirmFirst = true) {
  if (confirmFirst && S.screen !== 'home' && !(await ask('지금까지의 진단 내용을 모두 지우고 처음으로 돌아갈까요?'))) return;
  stopCamera(); wipeWork();
  S = fresh();
  $('chkConsent').checked = false; $('btnConsentCam').disabled = $('btnConsentPhoto').disabled = true;
  $('fileInput').value = '';
  for (const id of ['autoBody', 'resultCard', 'voteSummary', 'meter', 'autoConf', 'roundProg', 'roundTitle', 'roundQ', 'btnPickL', 'btnPickR', 'browseName', 'selL', 'selR']) $(id).innerHTML = '';
  $('toast').hidden = true; $('modal').hidden = true;
  setDrape('transparent', null, '', '');
  // 진단 데이터는 저장하지 않지만, 혹시 남은 값이 있으면 지움 (진단권 사용 기록 pcqr.* 만 유지: 코드 ID·시각, 개인정보 없음)
  try { sessionStorage.clear(); for (const k of Object.keys(localStorage)) if (!k.startsWith(STORAGE_PREFIX)) localStorage.removeItem(k); } catch {}
  await go('home');
}
$('btnReset').onclick = () => resetAll(true);
$('btnNextCustomer').onclick = () => resetAll(false);

// 화면 전환/백그라운드 시 카메라 해제
document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); else if (CAMERA_SCREENS.has(S.screen)) startCamera(); });
window.addEventListener('resize', () => setOverlay(S.screen));

// 테스트용 읽기 전용 상태 노출
const admin = initAdmin({ $, go, toast, ask, store, getScreen: () => S.screen });
window.__pc = { get state() { return S; }, get stream() { return stream; }, faceStatus, admin, store };

// 서비스 워커 (HTTPS 또는 localhost)
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
go('home');
