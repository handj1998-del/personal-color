import test from 'node:test';
import assert from 'node:assert/strict';
import * as C from '../js/color.js';
import { analyzeImage, paperRgb } from '../js/analyzer.js';
import { SEASONS, SEASON_ORDER, drapeRounds } from '../js/seasons.js';
import { synthFace, paperFrame } from './synth.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg}: ${a} vs ${b} (±${tol})`);
const dE = (p, q) => Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
// 한국인 피부 예시 (카메라 sRGB 기준 Lab)
const WARM_SKIN = [64, 9, 22], COOL_SKIN = [64, 13, 11.5], NEUTRAL_SKIN = [63, 10, 17];
const YELLOW_LIGHT = [1.0, 0.9, 0.62], BLUE_LIGHT = [0.8, 0.93, 1.15];
const featOf = (lab, extra = {}) => C.computeFeatures({ skin: { L: lab[0], a: lab[1], b: lab[2] }, ...extra });

test('sRGB→Lab 기준값', () => {
  const w = C.rgbToLab(255, 255, 255); near(w[0], 100, 0.01, 'white L'); near(w[1], 0, 0.01, 'a'); near(w[2], 0, 0.01, 'b');
  const r = C.rgbToLab(255, 0, 0); near(r[0], 53.24, 0.05, 'red L'); near(r[1], 80.09, 0.1, 'red a'); near(r[2], 67.2, 0.1, 'red b');
  const g = C.rgbToLab(128, 128, 128); near(g[0], 53.59, 0.05, 'gray L'); near(Math.hypot(g[1], g[2]), 0, 0.01, 'gray chroma');
  for (const lab of [WARM_SKIN, COOL_SKIN, [30, 5, -10], [80, -5, 30]]) { const back = C.rgbToLab(...C.labToRgb(...lab)); assert.ok(dE(back, lab) < 1, 'roundtrip ' + lab); }
  near(C.hueDeg(10, 10), 45, 1e-9, 'hue'); near(C.hueDeg(-1, -1), 225, 1e-9, 'hue wrap');
});

test('웜 샘플은 웜, 쿨 샘플은 쿨로 판정', () => {
  const warm = featOf(WARM_SKIN), cool = featOf(COOL_SKIN);
  assert.ok(warm.w > 0.5, 'warm.w=' + warm.w); assert.ok(cool.w < -0.5, 'cool.w=' + cool.w);
  assert.ok(C.classify(warm).warmP > 0.8); assert.ok(C.classify(cool).warmP < 0.2);
  assert.ok(C.WARM.has(C.classify(warm).top[0].id)); assert.ok(!C.WARM.has(C.classify(cool).top[0].id));
  // 한국인 평균 근처는 중간값
  assert.ok(Math.abs(featOf(NEUTRAL_SKIN).w) < 0.4);
  // 색상각이 커질수록(노란기) 웜 점수 단조 증가
  let prev = -Infinity;
  for (let h = 35; h <= 80; h += 2.5) { const a = 20 * Math.cos(h * Math.PI / 180), b = 20 * Math.sin(h * Math.PI / 180); const w = featOf([63, a, b]).w; assert.ok(w >= prev - 1e-9, 'monotonic at ' + h); prev = w; }
  // 노란기 있는 갈색 머리는 웜 쪽, 푸른 흑발은 쿨 쪽으로 약간 이동
  assert.ok(featOf(NEUTRAL_SKIN, { hair: { L: 25, a: 5, b: 12 } }).w > featOf(NEUTRAL_SKIN, { hair: { L: 15, a: 0, b: -1 } }).w);
});

test('흰 종이 화이트밸런스 보정', () => {
  for (const illum of [YELLOW_LIGHT, BLUE_LIGHT, [1, 1, 1]]) {
    const paper = [0, 1, 2].map((k) => C.linearToSrgb(0.7 * illum[k]));
    const wb = C.whiteBalanceFromPaper(paper);
    assert.ok(wb.valid);
    const fixed = C.rgbToLab(...C.applyGainsRgb(paper, wb.gains));
    near(fixed[1], 0, 0.6, 'paper a'); near(fixed[2], 0, 0.6, 'paper b'); near(fixed[0], 93, 1, 'paper L');
    // 종이와 같은 조명 아래 피부 → 보정 후 원래 색(종이가 L93일 때 기준)으로 복원
    for (const lab of [WARM_SKIN, COOL_SKIN]) {
      const lin = C.labToRgb(...lab).map(C.srgbToLinear).map((v, k) => v * illum[k] * (0.7 / C.WB_TARGET_LIN));
      const seen = lin.map(C.linearToSrgb);
      const corr = C.rgbToLab(...C.applyGainsRgb(seen, wb.gains));
      assert.ok(dE(corr, lab) < 2.0, `restore ${lab} under ${illum}: ${corr.map((v) => v.toFixed(1))}`);
    }
  }
  // 노란 조명 아래 쿨 피부: 보정 없으면 웜으로 오판, 보정하면 쿨
  const seen = C.labToRgb(...COOL_SKIN).map(C.srgbToLinear).map((v, k) => C.linearToSrgb(v * YELLOW_LIGHT[k]));
  const raw = C.rgbToLab(...seen); assert.ok(featOf(raw).w > 0, 'uncorrected looks warm');
  const wb = C.whiteBalanceFromPaper([0, 1, 2].map((k) => C.linearToSrgb(C.WB_TARGET_LIN * YELLOW_LIGHT[k])));
  assert.ok(featOf(C.rgbToLab(...C.applyGainsRgb(seen, wb.gains))).w < -0.5, 'corrected looks cool');
  // 종이가 아닌 것/어두운 것/날아간 것 거부
  assert.equal(C.whiteBalanceFromPaper([40, 20, 20]).valid, false);
  assert.equal(C.whiteBalanceFromPaper([255, 255, 255]).valid, false);
  assert.equal(C.whiteBalanceFromPaper([230, 120, 90]).problem, 'notwhite');
  // 노출 이득 제한
  assert.ok(C.whiteBalanceFromPaper([90, 90, 90]).exposureGain <= 2.2);
});

test('시즌 매핑 일관성', () => {
  for (const id of Object.keys(C.PROTOTYPES)) {
    const cls = C.classify(C.PROTOTYPES[id]);
    assert.equal(cls.top[0].id, id, 'prototype maps to itself');
    near(cls.ranked.reduce((a, r) => a + r.p, 0), 1, 1e-9, 'sum');
    assert.deepEqual(C.classify(C.PROTOTYPES[id]), cls, 'deterministic');
    // 작은 흔들림에는 결과 유지
    const p = C.PROTOTYPES[id]; assert.equal(C.classify({ w: p.w + 0.1, l: p.l - 0.1, c: p.c + 0.1 }).top[0].id, id, 'stable ' + id);
  }
  assert.equal(C.classify({ w: 1.5, l: 1.8, c: 0 }).top[0].id, 'spring_light');
  assert.equal(C.classify({ w: -1.5, l: -1.8, c: 0.3 }).top[0].id, 'winter_deep');
  assert.equal(C.classify({ w: -1.2, l: 0, c: -1.6 }).top[0].id, 'summer_mute');
  assert.equal(C.classify({ w: 1.2, l: -0.2, c: -1.6 }).top[0].id, 'autumn_mute');
  // 웜 점수 증가 → 웜 확률 단조 증가
  let prev = -1; for (let w = -2; w <= 2; w += 0.25) { const p = C.classify({ w, l: 0, c: 0 }).warmP; assert.ok(p >= prev - 1e-9); prev = p; }
  // top2 는 서로 다르고 신뢰도는 품질에 비례
  const cls = C.classify({ w: 0.1, l: 0.2, c: 0 }); assert.notEqual(cls.top[0].id, cls.top[1].id);
  assert.ok(C.confidence(cls, 1).score > C.confidence(cls, 0.5).score);
  assert.equal(C.confidence(C.classify(C.PROTOTYPES.autumn_deep), 1).level, 'high');
  assert.equal(C.confidence(C.classify({ w: 0, l: 0, c: 0 }), 0.6).level, 'low');
  // 모든 타입에 콘텐츠 존재
  for (const id of SEASON_ORDER) { const s = SEASONS[id]; assert.equal(s.best.length, 12); assert.equal(s.avoid.length, 6); for (const c of [...s.best, ...s.avoid]) assert.match(c.hex, /^#[0-9A-F]{6}$/i); assert.equal(new Set(s.best.map((c) => c.name)).size, 12); assert.ok(s.makeup && s.hair && s.acc && s.desc); }
});

test('드레이핑 선택 반영', () => {
  const base = { w: -0.2, l: 0, c: 0 };
  const warmVote = { chosen: { w: 1 }, other: { w: -1 } };
  const f = C.applyDrape(base, [warmVote, warmVote]); assert.ok(f.w > 1, 'moved warm');
  assert.ok(C.WARM.has(C.classify(f).top[0].id));
  const many = C.applyDrape(base, Array(20).fill(warmVote)); near(many.adj.w, 1.6, 1e-9, 'capped');
  assert.deepEqual(C.applyDrape(base, [{ chosen: {}, other: {} }]).adj, { w: 0, l: 0, c: 0 });
  const r = drapeRounds(1); assert.equal(r.length, 5); assert.equal(drapeRounds(-1)[3].A.name, '라벤더');
});

test('조명 경고', () => {
  assert.ok(C.lightCheck({ faceL: 28, castA: 0, castB: 0 }).issues.some((i) => i.code === 'dark'));
  assert.ok(C.lightCheck({ faceL: 90, castA: 0, castB: 0 }).issues.some((i) => i.code === 'bright'));
  assert.ok(C.lightCheck({ faceL: 60, castA: 0, castB: 0, clipFrac: 0.3 }).issues.some((i) => i.code === 'bright'));
  assert.ok(C.lightCheck({ faceL: 60, castA: 0, castB: 20 }).issues.some((i) => i.code === 'yellow'));
  assert.ok(C.lightCheck({ faceL: 60, castA: 0, castB: -15 }).issues.some((i) => i.code === 'blue'));
  assert.ok(C.lightCheck({ faceL: 60, castA: 0, castB: 20, calibrated: true }).ok);
  assert.ok(C.lightCheck({ faceL: 60, castA: 1, castB: 2 }).ok);
});

test('그림자·하이라이트 제외한 대표 피부색', () => {
  const px = []; for (let i = 0; i < 300; i++) px.push([64 + (i % 5) - 2, 10, 18]);
  for (let i = 0; i < 60; i++) px.push([92, 2, 6]); // 하이라이트
  for (let i = 0; i < 60; i++) px.push([35, 8, 14]); // 그림자
  for (let i = 0; i < 30; i++) px.push([45, 40, 15]); // 입술 등 비피부(색상각 20° 근처지만 채도 큼)
  const r = C.robustSkin(px); near(r.L, 64, 1.5, 'L'); near(r.b, 18, 1, 'b');
  assert.equal(C.robustSkin([[60, 10, 18]]), null);
});

test('합성 얼굴 이미지 분석 (타원 가이드)', () => {
  const warm = analyzeImage(synthFace({ skin: WARM_SKIN, hair: [20, 4, 9] }), { calibrated: true });
  const cool = analyzeImage(synthFace({ skin: COOL_SKIN, hair: [14, 0, -1] }), { calibrated: true });
  assert.ok(warm.ok && cool.ok);
  assert.ok(dE([warm.skin.L, warm.skin.a, warm.skin.b], WARM_SKIN) < 2.5, 'warm skin measured ' + JSON.stringify(warm.skin));
  assert.ok(warm.cls.warmP > 0.8, 'warm ' + warm.cls.warmP); assert.ok(cool.cls.warmP < 0.2, 'cool ' + cool.cls.warmP);
  assert.ok(warm.hair && warm.eye, 'hair/eye measured'); near(warm.hair.L, 20, 3, 'hair L'); assert.equal(warm.mode, 'oval');
  // 노란 조명 + 종이 보정
  const illum = YELLOW_LIGHT;
  const rawCool = analyzeImage(synthFace({ skin: COOL_SKIN, illum, bg: [75, 0, 0] }), { calibrated: false });
  assert.ok(rawCool.cls.warmP > 0.5, 'uncorrected cool under yellow light reads warm');
  assert.ok(rawCool.light.issues.some((i) => i.code === 'yellow'), 'yellow cast warning');
  const paper = paperRgb(paperFrame({ illum, paperLin: C.WB_TARGET_LIN }));
  const wb = C.whiteBalanceFromPaper(paper);
  const fixed = analyzeImage(synthFace({ skin: COOL_SKIN, illum }), { gains: wb.gains, calibrated: true });
  assert.ok(fixed.cls.warmP < 0.2, 'corrected cool ' + fixed.cls.warmP);
  assert.ok(fixed.conf.score > rawCool.conf.score);
  // 어두운 조명 경고
  // v1.7: 너무 어두우면 결과 대신 다시 찍기 안내(ok:false, reason 'dark')
  const dark = analyzeImage(synthFace({ skin: WARM_SKIN, illum: [0.12, 0.12, 0.12] }), {});
  assert.equal(dark.ok, false); assert.equal(dark.reason, 'dark');
});

test('흰 종이 판별: 균일한 종이만 허용', () => {
  assert.ok(paperRgb(paperFrame({ illum: YELLOW_LIGHT })).uniformity > 0.95);
  // 한쪽이 20% 어두운 그라데이션 종이도 허용
  const g = paperFrame({}); for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) { const i = (y * g.width + x) * 4, k = 1 - 0.2 * x / g.width; for (let c = 0; c < 3; c++) g.data[i + c] *= k; }
  assert.ok(paperRgb(g).uniformity >= 0.65, 'gradient ' + paperRgb(g).uniformity);
  assert.ok(paperRgb(synthFace({ skin: WARM_SKIN })).uniformity < 0.65, 'face is not paper');
});

test('한국인 피부 범위 전체에서 8타입 모두 나올 수 있음', () => {
  const cnt = {}; let n = 0;
  for (let L = 56; L <= 72; L += 2) for (let a = 7; a <= 15; a++) for (let b = 12; b <= 23; b++) for (const hl of [12, 18, 24, 30]) for (const hb of [0, 4, 8]) {
    const f = C.computeFeatures({ skin: { L, a, b }, hair: { L: hl, a: 2, b: hb }, eye: { L: hl + 3, a: 3, b: hb + 2 } });
    const id = C.classify(f).top[0].id; cnt[id] = (cnt[id] || 0) + 1; n++;
  }
  for (const id of SEASON_ORDER) assert.ok((cnt[id] || 0) / n > 0.04, `${id} ${(cnt[id] || 0) / n}`);
  const warmShare = Object.entries(cnt).filter(([k]) => C.WARM.has(k)).reduce((s, [, v]) => s + v, 0) / n;
  assert.ok(warmShare > 0.35 && warmShare < 0.65, 'warm share ' + warmShare);
});

// ---------- 얼굴형 분류 / 추천 데이터 ----------
import * as ST from '../js/style.js';
// 지정한 특징(길이/광대 폭 비율, 이마·턱 폭 비율, 턱 끝 각도)을 갖는 가짜 랜드마크 생성 (픽셀 좌표 → 정규화)
function fakeLandmarks({ ratio, fore, jaw, chin }, { W = 1280, H = 720, rot = 0, cx = 640, cy = 360, cheek = 300 } = {}) {
  const pts = new Array(478).fill(null).map(() => ({ x: cx, y: cy }));
  const len = ratio * cheek, top = -len / 2, bottom = len / 2;
  const half = (jaw * cheek) / 2, jy = bottom - half / Math.tan((chin / 2) * Math.PI / 180);
  const set = (i, x, y) => { const c = Math.cos(rot), s = Math.sin(rot); pts[i] = { x: cx + x * c - y * s, y: cy + x * s + y * c }; };
  set(10, 0, top); set(152, 0, bottom); set(234, -cheek / 2, 0); set(454, cheek / 2, 0);
  set(54, (-fore * cheek) / 2, top * 0.7); set(284, (fore * cheek) / 2, top * 0.7);
  set(172, -half, jy); set(397, half, jy); set(1, 0, 0);
  return pts.map((p) => ({ x: p.x / W, y: p.y / H }));
}
// v1.5: 실제 메시 측정값 분포(평균±표준편차) 기준의 뚜렷한 예시 (표준점수 방향 × 1.4)
const ZDIR = { oval: [0, 0, 0, 0], round: [-1.2, 0, 0.4, 0.9], long: [1.4, 0.2, -0.2, -0.8], square: [-0.6, 0.3, 1.3, 0.9], heart: [0.2, 1.2, -1.1, -0.6], diamond: [0.3, -1.2, -0.9, -0.5] };
const FK = ['ratio', 'fore', 'jaw', 'chin'];
const SHAPES = Object.fromEntries(Object.entries(ZDIR).map(([id, z]) => [id, Object.fromEntries(FK.map((k, i) => [k, ST.FACE_NORM.mean[k] + 1.4 * z[i] * ST.FACE_NORM.sd[k]]))]));
test('얼굴형 특징 계산: 화면 비율(W≠H) 복원과 회전 불변', () => {
  for (const [W, H] of [[1280, 720], [720, 1280], [1000, 1000]]) {
    const m = ST.faceMetrics(fakeLandmarks(SHAPES.oval, { W, H, cx: 360, cy: 360 }), W, H);
    const o = SHAPES.oval; near(m.ratio, o.ratio, 0.01, `ratio ${W}x${H}`); near(m.fore, o.fore, 0.01, 'fore'); near(m.jaw, o.jaw, 0.01, 'jaw'); near(m.chin, o.chin, 0.5, 'chin');
  }
  const r = ST.faceMetrics(fakeLandmarks(SHAPES.long, { rot: 0.25 }), 1280, 720);
  near(r.ratio, SHAPES.long.ratio, 0.01, 'rotated ratio'); near(r.chin, SHAPES.long.chin, 0.5, 'rotated chin');
  assert.equal(ST.faceMetrics(null), null); assert.equal(ST.faceMetrics(new Array(10).fill({ x: 0, y: 0 })), null);
});

test('얼굴형 6종 분류 (계란·둥근·긴·각진·하트·마름모)', () => {
  for (const [id, f] of Object.entries(SHAPES)) {
    const r = ST.classifyFaceShape(ST.faceMetrics(fakeLandmarks(f), 1280, 720));
    assert.equal(r.id, id, `${id} → ${r.id} ${JSON.stringify(r.probs.slice(0, 2))}`);
    assert.ok(r.p > 0.4, `${id} p=${r.p}`); assert.ok(['high', 'mid', 'low'].includes(r.level));
    near(r.probs.reduce((a, x) => a + x.p, 0), 1, 1e-9, 'prob sum');
  }
  // 길이 비율이 커지면 긴형, 작아지면 둥근형 쪽으로
  const at = (ratio) => ST.classifyFaceShape({ ...SHAPES.oval, ratio, yaw: 0 }).id;
  assert.equal(at(1.36), 'long'); assert.equal(at(1.06), 'round');
  // 두 후보 중간(계란형↔둥근형)은 '애매' + 두 후보 안내
  const N = ST.FACE_NORM, mid = ST.classifyFaceShape({ ratio: N.mean.ratio - 0.6 * N.sd.ratio, fore: N.mean.fore, jaw: N.mean.jaw + 0.2 * N.sd.jaw, chin: N.mean.chin + 0.45 * N.sd.chin, yaw: 0 });
  assert.ok(mid.close && mid.level === 'low' && /중간/.test(mid.note) && ['oval', 'round'].includes(mid.second), JSON.stringify(mid.probs.slice(0, 2)));
  // 고개를 크게 숙인 얼굴은 신뢰도 하향 + 안내
  const tilt = ST.classifyFaceShape({ ...SHAPES.long, yaw: 0, pitch: 40 }); assert.ok(/숙여/.test(tilt.note));
  // 옆으로 돌린 얼굴은 신뢰도 하향 + 안내
  const turned = ST.classifyFaceShape({ ...SHAPES.oval, yaw: 0.3 });
  assert.ok(turned.p < ST.classifyFaceShape({ ...SHAPES.oval, yaw: 0 }).p && /옆으로/.test(turned.note));
  assert.equal(ST.classifyFaceShape(null), null);
});

test('v1.5 얼굴형: 실제 얼굴 분포에서 계란형으로 몰리지 않음 (회귀 방지)', async () => {
  const fs = await import('node:fs');
  // ① 공개 정면 사진 59장에서 잰 실제 측정값
  const real = JSON.parse(fs.readFileSync(new URL('./face_metrics_frontal.json', import.meta.url))).faces;
  const cnt = (list) => { const c = {}; for (const m of list) { const id = ST.classifyFaceShape(m).id; c[id] = (c[id] || 0) + 1; } return c; };
  const cr = cnt(real); console.log('  실제 정면 사진', real.length, cr);
  assert.ok(Object.keys(cr).length >= 5, '5종 이상 나와야 함 ' + JSON.stringify(cr));
  assert.ok((cr.oval || 0) / real.length < 0.45, '계란형 비율 ' + JSON.stringify(cr));
  // ② 같은 평균·표준편차·상관을 갖는 모의 얼굴 3000개
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const gauss = () => Math.sqrt(-2 * Math.log(rnd() || 1e-9)) * Math.cos(2 * Math.PI * rnd());
  const C = [[1, .32, -.25, -.63], [.32, 1, -.27, -.39], [-.25, -.27, 1, .41], [-.63, -.39, .41, 1]];
  const Lc = C.map(() => [0, 0, 0, 0]); for (let i = 0; i < 4; i++) for (let j = 0; j <= i; j++) { let s = C[i][j]; for (let k = 0; k < j; k++) s -= Lc[i][k] * Lc[j][k]; Lc[i][j] = i === j ? Math.sqrt(s) : s / Lc[j][j]; }
  const sim = Array.from({ length: 3000 }, () => { const g = FK.map(gauss); const z = Lc.map((row) => row.reduce((a, v, k) => a + v * g[k], 0)); return { ...Object.fromEntries(FK.map((k, i) => [k, ST.FACE_NORM.mean[k] + z[i] * ST.FACE_NORM.sd[k]])), yaw: 0 }; });
  const cs = cnt(sim); console.log('  모의 얼굴 3000', cs);
  for (const id of ST.FACE_ORDER) assert.ok((cs[id] || 0) / 3000 >= 0.05, `${id} ${cs[id]}`);
  assert.ok(cs.oval / 3000 < 0.4, 'oval ' + cs.oval);
  // ③ 예전 방식이 몰리던 원인: 메시 폭 비율 차이가 작음 → 절대 기준값(턱 0.73/0.91 등)은 실제로 거의 안 나옴
  const jawSd = Math.sqrt(real.reduce((a, m) => a + (m.jaw - ST.FACE_NORM.mean.jaw) ** 2, 0) / real.length); assert.ok(jawSd < 0.04);
});

test('추천 데이터: 시즌별 립 3~5색·피할 색, 안경테 컬러, 얼굴형별 눈썹·안경 모양', () => {
  const hex = /^#[0-9A-F]{6}$/i;
  for (const id of SEASON_ORDER) {
    const L = ST.LIPS[id], G = ST.FRAMES[id];
    assert.ok(L.best.length >= 3 && L.best.length <= 5 && L.avoid.length >= 1, id);
    assert.ok([...L.best, ...L.avoid, ...G.best].every((c) => hex.test(c.hex) && /[가-힣]/.test(c.name)), id);
    assert.ok(G.best.length >= 3 && G.tip && G.avoid, id);
    // 웜 시즌 립은 붉은-노랑(색상각 낮음~중간), 쿨 시즌 립 평균 b*가 웜보다 낮음
  }
  const avgB = (ids) => { const v = ids.flatMap((id) => ST.LIPS[id].best.map((c) => C.rgbToLab(...C.hexToRgb(c.hex))[2])); return v.reduce((a, x) => a + x, 0) / v.length; };
  assert.ok(avgB([...C.WARM]) > avgB(SEASON_ORDER.filter((x) => !C.WARM.has(x))) + 10, '웜 립이 더 노란 쪽');
  const brow = { oval: 'natural', round: 'angled', long: 'straight', square: 'soft', heart: 'round' };
  for (const [f, b] of Object.entries(brow)) assert.equal(ST.FACE_SHAPES[f].brow, b, f);
  assert.ok(!ST.FACE_SHAPES.round.glasses.includes('round'), '둥근형에 원형 안경 비추천');
  assert.ok(!ST.FACE_SHAPES.square.glasses.includes('square'), '각진형에 사각 안경 비추천');
  for (const f of ST.FACE_ORDER) { const F = ST.FACE_SHAPES[f]; assert.ok(ST.BROW_PATHS[F.brow] && F.glasses.every((g) => ST.GLASS_SHAPES[g])); assert.ok(ST.glassesSvg(F.glasses[0]).startsWith('<svg') && ST.browSvg(F.brow).includes(ST.BROW_PATHS[F.brow])); }
});

// ---------- 진단권(QR) 서명·1회 사용·비밀번호·잠금 ----------
import * as TK from '../js/ticket.js';
import { readFileSync } from 'node:fs';
const memStore = () => { const m = new Map(); return TK.createStore({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }); };
const NOW = new Date(2026, 9, 2, 21, 0).getTime(), DAYMS = 86400000;

test('진단권 서명/검증: 형식·위조·정규화', async () => {
  const t = await TK.makeToken({ issuedMs: NOW, expDays: 30 });
  assert.match(t.token, /^PC1(-[0-9A-HJKMNP-TV-Z]{4}){6}$/);
  const v = await TK.verifyToken(t.token, NOW); assert.ok(v.ok && v.id === t.id && v.exp === t.issued + 30);
  assert.equal(TK.fmtDay(t.issued), '2026.10.02');
  // 사람 입력: 소문자·공백·하이픈 없음·PC1 생략·O/I/L 혼동 보정
  assert.ok((await TK.verifyToken(t.code.replace(/-/g, ' ').toLowerCase(), NOW)).ok);
  assert.ok((await TK.verifyToken(t.code.replace(/-/g, ''), NOW)).ok);
  const confusable = t.code.replace(/0/g, 'O').replace(/1/g, 'l');
  assert.ok((await TK.verifyToken(confusable, NOW)).ok, 'O/l 보정');
  // 한 글자만 바꿔도 서명 불일치
  const raw = TK.normalize(t.token);
  for (const pos of [0, 9, 12, 20, 23]) {
    const ch = raw[pos] === 'A' ? 'B' : 'A'; const bad = raw.slice(0, pos) + ch + raw.slice(pos + 1);
    assert.equal((await TK.verifyToken(bad, NOW)).reason, 'signature', 'pos ' + pos);
  }
  // 무작위·다른 QR 내용
  for (const junk of ['', 'HELLO', 'https://example.com', 'PC1-AAAA-AAAA-AAAA-AAAA-AAAA-AAAA', '가나다라']) {
    const r = await TK.verifyToken(junk, NOW); assert.ok(!r.ok && ['format', 'signature'].includes(r.reason), junk + ' ' + r.reason);
  }
  // 무작위 24자 1000개 중 통과 0
  let pass = 0; for (let i = 0; i < 1000; i++) { let s = ''; for (let j = 0; j < 24; j++) s += TK.ALPHA[Math.floor(Math.random() * 32)]; if ((await TK.verifyToken(s, NOW)).ok) pass++; }
  assert.equal(pass, 0);
});

test('진단권 유효기간: 만료·기한 없음·미래 발급', async () => {
  const t = await TK.makeToken({ issuedMs: NOW, expDays: 30 });
  assert.ok((await TK.verifyToken(t.token, NOW + 30 * DAYMS)).ok, '마지막 날까지 유효');
  assert.equal((await TK.verifyToken(t.token, NOW + 31 * DAYMS)).reason, 'expired');
  const forever = await TK.makeToken({ issuedMs: NOW, expDays: 0 });
  assert.ok((await TK.verifyToken(forever.token, NOW + 3000 * DAYMS)).ok && forever.exp === 0);
  const future = await TK.makeToken({ issuedMs: NOW + 10 * DAYMS });
  assert.equal((await TK.verifyToken(future.token, NOW)).reason, 'future');
  const d = await TK.makeToken({ issuedMs: NOW, expMs: new Date(2026, 11, 31).getTime() });
  assert.equal(TK.fmtDay(d.exp), '2026.12.31');
});

test('1회 사용: 시작 시 사용 처리 → 이어하기만 허용 → 완료 후 거부, 취소 코드 거부, 관리자 1회 허가', async () => {
  const s = memStore(); const t = await TK.makeToken({ issuedMs: NOW });
  const a = await TK.admit(s, t.token, NOW); assert.ok(a.ok && !a.resumed); assert.ok(s.isUsed(t.id)); assert.equal(s.active(NOW).id, t.id);
  const again = await TK.admit(s, t.token, NOW + 60000); assert.ok(again.ok && again.resumed, '같은 세션 이어하기');
  assert.equal(s.active(NOW + TK.SESSION_MS + 1), null, '이어하기 시간(10분) 지나면 세션 만료');
  const late = await TK.admit(s, t.token, NOW + TK.SESSION_MS + 1); assert.equal(late.reason, 'used');
  s.startSession(t.id, 'qr', NOW); s.finishSession();
  const done = await TK.admit(s, t.token, NOW + 1000); assert.equal(done.reason, 'used'); assert.equal(done.msg, '이미 사용된 QR 코드예요.');
  // 다른 코드는 정상, 처음 코드는 계속 거부
  const t2 = await TK.makeToken({ issuedMs: NOW }); assert.ok((await TK.admit(s, t2.token, NOW)).ok);
  assert.equal((await TK.admit(s, t.token, NOW)).reason, 'used');
  // 취소(revoke)
  const t3 = await TK.makeToken({ issuedMs: NOW }); s.addIssued([t3]); s.revoke(t3.id);
  const rv = await TK.admit(s, t3.token, NOW); assert.equal(rv.reason, 'revoked'); assert.ok(!s.isUsed(t3.id));
  assert.deepEqual(TK.statusOf(s, s.issued()[0], NOW), ['revoked', '취소됨']);
  // 관리자 허가는 횟수만큼만
  assert.equal(s.takePass(), false); s.grantPass(); assert.ok(s.passInfo()); assert.equal(s.takePass(), true); assert.equal(s.takePass(), false);
  // 저장 내용에 개인정보 없음 (ID·시각·출처만)
  assert.deepEqual(Object.keys(s.used()[t.id]).sort(), ['at', 'src']);
});

test('관리자 비밀번호: PBKDF2 해시·평문 없음·5회 오류 잠금·변경', async () => {
  const src = ['ticket.js', 'admin.js', 'app.js'].map((f) => readFileSync(new URL('../js/' + f, import.meta.url), 'utf8')).join('\n');
  assert.ok(!src.includes('7814'), '코드에 평문 비밀번호 없음');
  assert.equal(await TK.hashPw('7814', TK.DEFAULT_PW.salt), TK.DEFAULT_PW.hash, '기본 비밀번호 해시 일치');
  assert.notEqual(await TK.hashPw('7815', TK.DEFAULT_PW.salt), TK.DEFAULT_PW.hash);
  const s = memStore();
  assert.ok((await TK.tryLogin(s, '7814', NOW)).ok);
  for (let i = 1; i <= 4; i++) { const r = await TK.tryLogin(s, '0000', NOW + i); assert.ok(!r.ok && !r.locked && r.left === 5 - i, JSON.stringify(r)); }
  const lock = await TK.tryLogin(s, '1234', NOW + 5); assert.ok(lock.locked && lock.waitS === 60);
  const during = await TK.tryLogin(s, '7814', NOW + 30000); assert.ok(!during.ok && during.locked, '잠금 중 정답도 거부');
  assert.ok((await TK.tryLogin(s, '7814', NOW + 61000)).ok, '잠금 해제 후 로그인');
  // 성공하면 실패 횟수 초기화
  await TK.tryLogin(s, '0000', NOW + 62000); await TK.tryLogin(s, '7814', NOW + 63000); assert.equal(s.lock().fails, 0);
  // 비밀번호 변경: 새 솔트·해시만 저장
  const rec = await TK.makePwRecord('2468'); s.setPw(rec); assert.ok(!JSON.stringify(rec).includes('2468') && rec.salt !== TK.DEFAULT_PW.salt);
  assert.ok(!(await TK.tryLogin(s, '7814', NOW + 64000)).ok); assert.ok((await TK.tryLogin(s, '2468', NOW + 65000)).ok);
  // 잠금 순수 함수
  assert.deepEqual(TK.afterFail({ fails: 4, until: 0 }, 100), { fails: 0, until: 100 + TK.LOCK_MS });
  assert.deepEqual(TK.afterFail({ fails: 0, until: 50 }, 100), { fails: 1, until: 0 }, '잠금 끝난 뒤 다시 1회부터');
});

// ---------- v1.4 ----------
import * as SH from '../js/share.js';
test('v1.4 관리자 허가: 쌓이지 않음(최대 1개)·1시간 만료·취소, 이어하기 10분', async () => {
  const s = memStore();
  assert.equal(TK.SESSION_MS, 10 * 60 * 1000); assert.equal(TK.PASS_MS, 60 * 60 * 1000);
  assert.deepEqual(s.grantPass(NOW), { renewed: false }); assert.deepEqual(s.grantPass(NOW + 1000), { renewed: true }, '두 번 눌러도 1개');
  assert.equal(s.takePass(NOW + 2000), true); assert.equal(s.takePass(NOW + 3000), false, '1회만');
  s.grantPass(NOW); assert.equal(s.passInfo(NOW + TK.PASS_MS + 1), null, '1시간 뒤 만료'); assert.equal(s.takePass(NOW + TK.PASS_MS + 1), false);
  s.grantPass(NOW); s.cancelPass(); assert.equal(s.takePass(NOW + 1), false, '취소');
  s.grantPass(NOW); assert.equal(s.passInfo(NOW - 2 * TK.CLOCK_BACK_MS), null, '시계를 허가 이전으로 돌리면 무효');
  const t = await TK.makeToken({ issuedMs: NOW }); await TK.admit(s, t.token, NOW);
  assert.ok(s.active(NOW + 9 * 60000)); assert.equal(s.active(NOW + 11 * 60000), null);
  s.endSession(); assert.equal(s.active(NOW + 1000), null, '자동 초기화 시 이어하기 지움');
  const m = await TK.admit(s, (await TK.makeToken({ issuedMs: NOW })).token, NOW, 'manual'); assert.ok(m.ok);
  assert.equal(s.used()[m.id].src, 'manual');
});
test('v1.4 기기 시계: 뒤로 돌림 감지·만료 우회 방지·잠금 우회 방지·미래 발급 경고', async () => {
  const s = memStore();
  assert.equal(s.touchSeen(NOW), null); assert.equal(s.touchSeen(NOW + 60000), null);
  const w = s.touchSeen(NOW - 3600000); assert.ok(w && w.kind === 'back' && w.by > 3600000 - 1); assert.equal(s.clockWarn().kind, 'back'); s.clearClockWarn(); assert.equal(s.clockWarn(), null);
  // 만료된 코드: 시계를 만료 전으로 되돌려도 거부 (지금까지 본 가장 늦은 시각 기준)
  const t = await TK.makeToken({ issuedMs: NOW, expDays: 1 }); const s2 = memStore(); s2.touchSeen(NOW + 5 * DAYMS);
  assert.equal((await TK.admit(s2, t.token, NOW)).reason, 'expired');
  assert.deepEqual(TK.statusOf(s2, t, NOW), ['expired', '만료']);
  // 발급일이 기기 날짜보다 2일 이상 뒤 → 거부 + 관리자 경고, 하루 차이는 허용
  const s3 = memStore(); const fut = await TK.makeToken({ issuedMs: NOW + 3 * DAYMS });
  const r = await TK.admit(s3, fut.token, NOW); assert.equal(r.reason, 'future'); assert.match(r.msg, /기기 날짜/); assert.equal(s3.clockWarn().kind, 'behind');
  assert.ok((await TK.admit(s3, (await TK.makeToken({ issuedMs: NOW + DAYMS })).token, NOW)).ok, '1일 허용');
  // 잠금 중 시계를 뒤로 돌려도 60초 넘게 잠기지 않음
  assert.equal(TK.lockState({ fails: 0, until: NOW + TK.LOCK_MS }, NOW - 3600000).locked, false);
  assert.equal(TK.lockState({ fails: 0, until: NOW + TK.LOCK_MS }, NOW + 1000).locked, true);
});
test('v1.4 백업·복원: 서명 검증·변조 거부·합치기·비밀번호 선택', async () => {
  const a = memStore(); const t1 = await TK.makeToken({ issuedMs: NOW }), t2 = await TK.makeToken({ issuedMs: NOW });
  a.addIssued([{ ...t1, at: NOW, memo: '10월', batch: 'B1' }, { ...t2, at: NOW, memo: '10월', batch: 'B1' }]); await TK.admit(a, t1.token, NOW); a.revoke(t2.id); a.setCfg({ contact: '051-000-0000' }); a.setPw(await TK.makePwRecord('2468'));
  const bk = JSON.parse(JSON.stringify(await TK.makeBackup(a)));
  assert.equal(bk.kind, 'backup'); assert.ok(!JSON.stringify(bk).includes('2468'), '평문 비밀번호 없음');
  const rd = await TK.readBackup(bk); assert.ok(rd.ok);
  const b = memStore(); const n = TK.applyBackup(b, rd); assert.deepEqual([n.issued, n.used, n.revoked, n.pw], [2, 1, 1, false]);
  assert.ok(b.isUsed(t1.id) && b.isRevoked(t2.id) && b.issued().length === 2 && b.cfg().contact === '051-000-0000' && b.pw() === null);
  assert.equal(TK.applyBackup(b, rd).issued, 0, '두 번 불러와도 중복 없음');
  assert.ok(TK.applyBackup(b, rd, { withPw: true }).pw); assert.ok((await TK.tryLogin(b, '2468', NOW)).ok);
  const bad = JSON.parse(JSON.stringify(bk)); bad.data.used['ZZZZZZZZ'] = { at: 1, src: 'qr' }; assert.equal((await TK.readBackup(bad)).ok, false, '변조 거부');
  assert.equal((await TK.readBackup({ hello: 1 })).ok, false);
  const used = await TK.makeBackup(a, 'used'); assert.deepEqual(Object.keys(used.data).sort(), ['revoked', 'used']);
  const c = memStore(); TK.applyBackup(c, await TK.readBackup(used)); assert.ok(c.isUsed(t1.id) && c.isRevoked(t2.id) && c.issued().length === 0);
  // CSV
  const csv = TK.toCsv(a, NOW); assert.ok(csv.startsWith('\ufeff')); assert.equal(csv.split('\r\n').length, 3); assert.match(csv, /10월/); assert.match(csv, /사용됨/); assert.match(csv, /취소됨/);
});
test('v1.4 기기 간 사용 기록 QR: 여러 쪽·서명·가져오기', async () => {
  const a = memStore(); const ids = [];
  for (let i = 0; i < 130; i++) { const t = await TK.makeToken({ issuedMs: NOW }); await TK.admit(a, t.token, NOW); ids.push(t.id); }
  a.markUsed('PASSABC123', NOW, 'admin'); a.revoke(ids[0]);
  const qrs = await TK.makeSyncQrs(a); assert.equal(qrs.length, Math.ceil(131 / TK.SYNC_PER_QR));
  for (const q of qrs) assert.match(q, /^[0-9A-Z $%*+\-./:]+$/, 'QR 영숫자 모드');
  const b = memStore(); let total = 0;
  for (const q of qrs) { const r = await TK.readSyncQr(q); assert.ok(r.ok, q.slice(0, 20)); total += b.mergeUsed(r.used); b.mergeRevoked(r.revoked); }
  assert.equal(total, 130); assert.ok(ids.every((id) => b.isUsed(id)) && b.isRevoked(ids[0]) && !b.isUsed('PASSABC123'));
  const t = await TK.makeToken({ issuedMs: NOW }); const tt = ids[5]; const tok = (await TK.admit(b, 'x', NOW)); assert.equal(tok.ok, false);
  const bad = qrs[0].replace(/U[0-9A-Z]{8}/, 'U00000000'); assert.equal((await TK.readSyncQr(bad)).ok, false, '변조 거부');
  assert.equal((await TK.readSyncQr('HELLO')).ok, false);
  assert.equal(b.used()[tt].src, 'sync');
});
test('v1.4 통계: 오늘·7일·상태·묶음·시작 방법', async () => {
  const s = memStore(); const list = [];
  for (let i = 0; i < 5; i++) list.push({ ...(await TK.makeToken({ issuedMs: NOW, expDays: i === 4 ? 3 : 90 })), at: NOW, batch: 'B1', memo: '이벤트' });
  s.addIssued(list);
  await TK.admit(s, list[0].token, NOW); await TK.admit(s, list[1].token, NOW - DAYMS, 'manual'); s.markUsed('PASS1', NOW, 'admin'); s.mergeUsed({ AAAAAAAA: { at: NOW } }); s.revoke(list[2].id);
  const st = TK.stats(s, NOW);
  assert.equal(st.today, 2); assert.equal(st.week, 3); assert.equal(st.days.length, 7); assert.equal(st.days[6].n, 2); assert.equal(st.days[5].n, 1);
  assert.deepEqual(st.status, { new: 2, used: 2, revoked: 1, expired: 0 }); assert.equal(st.soon, 1);
  assert.deepEqual(st.src, { qr: 1, manual: 1, admin: 1, sync: 1 });
  assert.equal(st.batches.length, 1); assert.equal(st.batches[0].memo, '이벤트'); assert.equal(st.batches[0].used, 2);
});
test('v1.4 결과 공유 주소(#r=): 왕복·잘못된 코드·개인정보 없음', () => {
  // v1.7+: '2' + 결과 14자 + 만료(7자) + 서명(8자), 24시간 유효
  const NOW = Date.UTC(2026, 9, 2, 3), EXP = NOW + SH.RESULT_TTL_MS;
  for (const id of SEASON_ORDER) for (const lv of ['high', 'mid', 'low']) {
    const f = { id, second: SEASONS[SEASON_ORDER[(SEASON_ORDER.indexOf(id) + 3) % 8]], conf: { level: lv }, method: '자동 분석 + 드레이핑', date: '2026.10.02' };
    const code = SH.encodeResult(f, 'heart', 'f', EXP); assert.match(code, /^2[0-9a-z]{13}f[0-9a-z]{15}$/);
    const d = SH.decodeResult(code, NOW); assert.equal(d.id, id); assert.equal(d.second, f.second); assert.equal(d.conf.level, lv); assert.equal(d.method, f.method); assert.equal(d.date, '2026.10.02'); assert.equal(d.sharedFace, 'heart');
  }
  const nf = SH.decodeResult(SH.encodeResult({ id: 'winter_deep', second: SEASONS.summer_mute, conf: { level: 'mid' }, method: '드레이핑', date: '2026.01.05' }, null, 'f', EXP), NOW); assert.equal(nf.sharedFace, null);
  { const c = SH.encodeResult({ id: 'winter_deep', second: SEASONS.summer_mute, conf: { level: 'mid' }, method: '드레이핑', date: '2026.01.05' }, null, 'f', EXP, 'H.O.W');
    assert.equal(SH.decodeResult(c, NOW).brand, 'H.O.W'); assert.equal(SH.decodeResult(c, EXP).expired, true); // 24시간 지나면 만료
    assert.equal(SH.decodeResult(c.replace('H.O.W', 'X'), NOW), null); // 상호 변조
    assert.equal(SH.decodeResult('1' + c.slice(1, 15), NOW).expired, true); } // 예전 v1 주소는 만료로 처리
  for (const bad of ['', 'abc', '19' + '0h0x20261002', '100z0x20261002', '100h9x20261002', '100h0x2026100']) assert.equal(SH.decodeResult(bad), null, bad);
  assert.ok(SH.RESULT_RE.test('#r=100h0x20261002') && !SH.RESULT_RE.test('#r=<script>'));
});

test('v1.4.1 운영 주체 기본값 H.O.W · 예전 기본값 자동 변경 · 직접 입력값은 유지', () => {
  assert.equal(memStore().cfg().operator, 'H.O.W');
  const m = new Map([['pcqr.cfg', JSON.stringify({ operator: '롯데렌터카 김해공항', contact: '051' })]]);
  const s = TK.createStore({ getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) });
  assert.equal(s.cfg().operator, 'H.O.W'); assert.equal(s.cfg().contact, '051'); assert.equal(JSON.parse(m.get('pcqr.cfg')).operator, 'H.O.W', '저장값도 바뀜');
  s.setCfg({ operator: '우리 매장' }); assert.equal(s.cfg().operator, '우리 매장');
});
test('v1.4.2 시계가 미래로 갔다가 바로잡힌 기기: 정상 코드 만료 거부 → 관리자 기준 재설정 → 통과·기록', async () => {
  const s = memStore(); const YEAR = 365 * DAYMS;
  s.touchSeen(NOW + YEAR); s.touchSeen(NOW); // 미래 시각을 본 뒤 시계가 바로잡힘
  assert.ok(s.clockWarn()?.kind === 'back' && s.clockAhead(NOW) > 300 * DAYMS);
  const t = await TK.makeToken({ issuedMs: NOW, expDays: 90 });
  assert.equal((await TK.admit(s, t.token, NOW)).reason, 'expired', '재설정 전에는 만료로 보임');
  assert.equal(TK.statusOf(s, { id: t.id, exp: t.exp }, NOW)[0], 'expired');
  const r = s.resetSeen(NOW); assert.equal(r.from, NOW + YEAR); assert.equal(s.seen(), NOW); assert.equal(s.clockWarn(), null); assert.equal(s.clockAhead(NOW), 0);
  assert.equal(s.clockLog().length, 1); assert.equal(s.clockLog()[0].from, NOW + YEAR);
  assert.ok((await TK.admit(s, t.token, NOW)).ok, '재설정 후 통과');
  assert.equal(s.touchSeen(NOW + 60000), null, '재설정 후 경고 다시 안 뜸');
  for (let i = 0; i < 25; i++) s.resetSeen(NOW + i); assert.equal(s.clockLog().length, 20, '기록 최근 20건');
  // 시계를 뒤로만 돌린 경우(미래 기준 아님)에는 기준 재설정 대상이 아님 → 만료 우회는 여전히 막힘
  const s2 = memStore(); s2.touchSeen(NOW); assert.equal(s2.clockAhead(NOW - 2 * 60000), 0);
});
test('v1.4.2 사용 기록 QR: 한 장 20~25개 · 길이 제한', async () => {
  assert.ok(TK.SYNC_PER_QR >= 20 && TK.SYNC_PER_QR <= 25);
  const a = memStore(); for (let i = 0; i < 60; i++) a.markUsed(TK.randomId(), NOW);
  const qrs = await TK.makeSyncQrs(a); assert.equal(qrs.length, 3);
  for (const q of qrs) assert.ok(q.length <= 250, '길이 ' + q.length);
});

test('v1.5 헤어: 시즌별 헤어 컬러 4색·피할 색, 얼굴형×성별 3가지(짧은/중간/긴)·그림·피할 스타일·팁', () => {
  const hex = /^#[0-9A-F]{6}$/i;
  for (const id of SEASON_ORDER) { const H = ST.HAIR_COLORS[id]; assert.equal(H.best.length, 4, id); assert.ok(H.avoid.length >= 1 && H.tip.length > 5); for (const c of [...H.best, ...H.avoid]) assert.ok(hex.test(c.hex) && /[가-힣]/.test(c.name), id + c.name); }
  const warmNames = ST.HAIR_COLORS.autumn_mute.best.map((c) => c.name).join(), coolNames = ST.HAIR_COLORS.winter_bright.best.map((c) => c.name).join();
  assert.match(warmNames, /카키브라운|초코브라운/); assert.match(coolNames, /블루블랙/); assert.match(ST.HAIR_COLORS.summer_light.best.map((c) => c.name).join(), /애쉬브라운/);
  for (const f of ST.FACE_ORDER) for (const g of ['f', 'm']) {
    const R = ST.HAIR_REC[f][g]; assert.equal(R.styles.length, 3, f + g);
    assert.deepEqual(R.styles.map((i) => ST.HAIR_STYLES[i].len), ['짧은 머리', '중간 길이', '긴 머리'], f + g);
    assert.ok(R.avoid.length > 5 && R.tip.length > 10);
    for (const i of R.styles) { const svg = ST.hairSvg(i); assert.match(svg, /^<svg [^>]*viewBox="0 0 100 110"/); assert.ok(!/NaN|undefined/.test(svg), i); }
  }
  // 여성/남성 추천은 서로 다름
  for (const f of ST.FACE_ORDER) assert.ok(ST.HAIR_REC[f].f.styles.every((i) => !ST.HAIR_REC[f].m.styles.includes(i)), f);
  // 결과 주소: 성별 기준 왕복 + 예전 14자 주소 호환
  const f0 = { id: 'autumn_mute', second: SEASONS.spring_light, conf: { level: 'mid' }, method: '드레이핑', date: '2026.10.03' };
  // v1.7+: 서명·만료 포함 주소에서 성별 왕복, 예전 v1 주소(성별 없음)는 만료로 처리
  const NOW = Date.UTC(2026, 9, 3, 3), EXP = NOW + SH.RESULT_TTL_MS;
  const cm = SH.encodeResult(f0, 'round', 'm', EXP); assert.match(cm, /^2[0-9a-z]{13}m[0-9a-z]{15}$/);
  const dm = SH.decodeResult(cm, NOW); assert.equal(dm.sharedGender, 'm'); assert.equal(dm.sharedFace, 'round');
  const cf = SH.encodeResult(f0, 'round', 'f', EXP); assert.equal(SH.decodeResult(cf, NOW).sharedGender, 'f');
  assert.equal(SH.decodeResult('1' + cm.slice(1, 14), NOW).expired, true);
});
