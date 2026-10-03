// 이미지 픽셀에서 피부·눈·머리카락 색을 뽑아 특징값/시즌을 계산
import { linToLab, srgbToLinear, robustSkin, robustDark, computeFeatures, classify, confidence, lightCheck, chroma, hueDeg, median } from './color.js';

// 0..255 -> linear LUT
const LUT = new Float32Array(256); for (let i = 0; i < 256; i++) LUT[i] = srgbToLinear(i);

export function ovalGeom(W, H) {
  const ry = 0.34 * Math.min(H, 1.3 * W), rx = 0.76 * ry;
  return { cx: W / 2, cy: 0.46 * H, rx, ry };
}
export function paperGeom(W, H) { const s = 0.36 * Math.min(W, H); return { x: (W - s) / 2, y: (H - s) / 2, s }; }

function pixLab(d, i, gains) {
  let r = LUT[d[i]], g = LUT[d[i + 1]], b = LUT[d[i + 2]];
  if (gains) { r = Math.min(1, r * gains[0]); g = Math.min(1, g * gains[1]); b = Math.min(1, b * gains[2]); }
  return linToLab(r, g, b);
}
function circleLabs(img, cx, cy, r, gains, out = [], maxN = 500, clip = null) {
  const { data, width: W, height: H } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((Math.PI * r * r) / maxN)));
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(H - 1, cy + r); y += step)
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(W - 1, cx + r); x += step) {
      const dx = x - cx, dy = y - cy; if (dx * dx + dy * dy > r * r) continue;
      const i = (y * W + x) * 4;
      if (clip) { clip.n++; if (data[i] >= 250 || data[i + 1] >= 250 || data[i + 2] >= 250) clip.c++; }
      out.push(pixLab(data, i, gains));
    }
  return out;
}
function ringLabs(img, cx, cy, r0, r1, gains, out = []) {
  const { data, width: W, height: H } = img;
  for (let y = Math.max(0, Math.floor(cy - r1)); y <= Math.min(H - 1, cy + r1); y++)
    for (let x = Math.max(0, Math.floor(cx - r1)); x <= Math.min(W - 1, cx + r1); x++) {
      const d2 = (x - cx) ** 2 + (y - cy) ** 2; if (d2 < r0 * r0 || d2 > r1 * r1) continue;
      out.push(pixLab(data, (y * W + x) * 4, gains));
    }
  return out;
}
function boxLabs(img, x0, y0, w, h, gains, out = [], maxN = 600) {
  const { data, width: W, height: H } = img;
  const step = Math.max(1, Math.floor(Math.sqrt((w * h) / maxN)));
  for (let y = Math.max(0, Math.floor(y0)); y < Math.min(H, y0 + h); y += step)
    for (let x = Math.max(0, Math.floor(x0)); x < Math.min(W, x0 + w); x += step) out.push(pixLab(data, (y * W + x) * 4, gains));
  return out;
}

// 조명 색 치우침 추정: 얼굴 밖 무채색에 가까운 픽셀의 a*, b* 중앙값
export function estimateCast(img, gains, oval) {
  const { data, width: W, height: H } = img; const as = [], bs = [];
  const step = Math.max(1, Math.floor(Math.sqrt(W * H / 4000)));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    if (oval) { const dx = (x - oval.cx) / (oval.rx * 1.25), dy = (y - oval.cy) / (oval.ry * 1.25); if (dx * dx + dy * dy < 1) continue; }
    const [L, a, b] = pixLab(data, (y * W + x) * 4, gains);
    if (L > 25 && L < 97 && chroma(a, b) < 28) { as.push(a); bs.push(b); }
  }
  if (as.length < 30) return { a: 0, b: 0, n: as.length, reliable: false };
  return { a: median(as), b: median(bs), n: as.length, reliable: true };
}

// 흰 종이 사각형 평균 sRGB (반사광·그림자 제외)
export function paperRgb(img) {
  const g = paperGeom(img.width, img.height); const { data, width: W } = img; const px = [];
  const inset = g.s * 0.12;
  const step = Math.max(1, Math.floor((g.s - 2 * inset) / 40));
  for (let y = Math.floor(g.y + inset); y < g.y + g.s - inset; y += step) for (let x = Math.floor(g.x + inset); x < g.x + g.s - inset; x += step) {
    const i = (Math.floor(y) * W + Math.floor(x)) * 4; px.push([data[i], data[i + 1], data[i + 2], data[i] + data[i + 1] + data[i + 2]]);
  }
  px.sort((a, b) => a[3] - b[3]);
  const use = px.slice(Math.floor(px.length * 0.15), Math.ceil(px.length * 0.9));
  const rgb = [0, 1, 2].map((k) => median(use.map((p) => p[k])));
  // 균일도: 하위 3% / 상위 3% 밝기 비율 (종이는 균일, 얼굴·배경은 불균일)
  const lo = px[Math.floor(px.length * 0.03)][3], hi = px[Math.floor(px.length * 0.97)][3];
  rgb.uniformity = hi > 0 ? lo / hi : 0;
  return rgb;
}

// 흑백·세피아(단색) 사진 감지: 이미지 전체에서 채도 상위 1%도 낮으면 색 정보가 없는 사진
export function monoCheck(img) {
  const { data, width: W, height: H } = img; const Cs = [];
  const step = Math.max(1, Math.floor(Math.sqrt(W * H / 6000)));
  for (let y = 0; y < H; y += step) for (let x = 0; x < W; x += step) {
    const [L, a, b] = pixLab(data, (y * W + x) * 4, null); if (L > 15 && L < 95) Cs.push(chroma(a, b));
  }
  if (Cs.length < 50) return { mono: false, p99: NaN };
  Cs.sort((p, q) => p - q); const p99 = Cs[Math.floor(Cs.length * 0.99)];
  return { mono: p99 < 16, p99 };
}

// 영역 정의 (랜드마크 또는 타원 가이드)
function regionsFromLandmarks(lm, W, H) {
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
  const faceW = dist(P(234), P(454)), faceH = dist(P(10), P(152));
  const top = P(10), chin = P(152);
  const up = { x: (top.x - chin.x) / faceH, y: (top.y - chin.y) / faceH };
  // v1.6: 이마 3곳 + 볼 위쪽 2곳 + 턱 1곳. 예전의 볼 아래·팔자 근처(205·425)는 블러셔·홍조와 겹쳐 붉은기가 과하게 잡혀 뺌
  const skin = [P(151), P(108), P(337)].map((p) => ({ ...p, r: faceW * 0.055 }))
    .concat([P(50), P(280)].map((p) => ({ ...p, r: faceW * 0.06 })))
    .concat([{ ...P(199), r: faceW * 0.05 }]);
  const eyes = [];
  if (lm.length >= 478) for (const [c, e] of [[468, 469], [473, 474]]) { const cc = P(c); const r = dist(cc, P(e)); if (r > 1.5) eyes.push({ ...cc, r }); }
  const hairC = { x: top.x + up.x * faceH * 0.16, y: top.y + up.y * faceH * 0.16 };
  const hair = { x: hairC.x - faceW * 0.25, y: hairC.y - faceH * 0.05, w: faceW * 0.5, h: faceH * 0.1 };
  return { skin, eyes, eyeBoxes: null, hair, mode: 'landmark', faceBox: { cx: (P(234).x + P(454).x) / 2, cy: (top.y + chin.y) / 2, rx: faceW / 2, ry: faceH / 2 } };
}
function regionsFromOval(W, H) {
  const o = ovalGeom(W, H);
  const at = (u, v) => ({ x: o.cx + u * o.rx, y: o.cy + v * o.ry });
  const skin = [at(0, -0.55), at(-0.2, -0.5), at(0.2, -0.5)].map((p) => ({ ...p, r: o.rx * 0.13 }))
    .concat([at(-0.45, 0.12), at(0.45, 0.12)].map((p) => ({ ...p, r: o.rx * 0.17 })));
  const eyeBoxes = [-0.38, 0.38].map((u) => ({ x: o.cx + u * o.rx - o.rx * 0.13, y: o.cy - 0.2 * o.ry, w: o.rx * 0.26, h: o.ry * 0.1 }));
  const hair = { x: o.cx - o.rx * 0.4, y: o.cy - o.ry * 1.13, w: o.rx * 0.8, h: o.ry * 0.12 };
  return { skin, eyes: [], eyeBoxes, hair, mode: 'oval', faceBox: o };
}

// 메인 분석 함수
export const DARK_BLOCK_L = 28, OVER_L = 76;
export function analyzeImage(img, { landmarks = null, gains = null, calibrated = false, source = 'camera' } = {}) {
  const W = img.width, H = img.height;
  // v1.6: 사진 파일에는 카메라 흰 종이 보정값을 쓰지 않음 (다른 조명에서 찍은 사진이라 보정이 오히려 틀어짐)
  if (source === 'photo') { gains = null; calibrated = false; }
  const R = landmarks ? regionsFromLandmarks(landmarks, W, H) : regionsFromOval(W, H);
  const mono = source === 'photo' ? monoCheck(img) : { mono: false };
  const clip = { n: 0, c: 0 };
  const skinLabs = []; for (const s of R.skin) circleLabs(img, s.x, s.y, s.r, gains, skinLabs, 500, clip);
  const skin = robustSkin(skinLabs);
  if (!skin) return { ok: false, reason: mono.mono ? 'mono' : 'noskin', mode: R.mode };
  // v1.7: 너무 어두우면 색을 읽을 수 없어 결과 대신 다시 찍기를 안내
  if (skin.L < DARK_BLOCK_L) return { ok: false, reason: 'dark', mode: R.mode, skinL: skin.L };
  // 눈동자
  let eye = null; const eyeLabs = [];
  if (R.eyes.length) for (const e of R.eyes) ringLabs(img, e.x, e.y, e.r * 0.4, e.r * 0.85, gains, eyeLabs);
  else if (R.eyeBoxes) for (const b of R.eyeBoxes) boxLabs(img, b.x, b.y, b.w, b.h, gains, eyeLabs, 400);
  if (eyeLabs.length) { const d = robustDark(eyeLabs, R.eyes.length ? 0.6 : 0.2); if (d && d.L < skin.L - 18) eye = d; }
  // 머리카락: 피부보다 확실히 어두운 픽셀만
  let hair = null; const hairLabs = boxLabs(img, R.hair.x, R.hair.y, R.hair.w, R.hair.h, gains, [], 600).filter((p) => p[0] < skin.L - 22);
  if (hairLabs.length > 40) { const d = robustDark(hairLabs, 0.7); if (d) hair = d; }

  const feat = computeFeatures({ skin, hair, eye }, { calibrated });
  const cls = classify(feat);
  const cast = estimateCast(img, gains, R.faceBox);
  const light = lightCheck({ faceL: skin.L, castA: cast.reliable ? cast.a : 0, castB: cast.reliable ? cast.b : 0, clipFrac: clip.n ? clip.c / clip.n : 0, calibrated });
  // 품질 계수
  let q = 1; const notes = [];
  if (!calibrated) { q *= 0.8; notes.push('흰 종이 보정을 하지 않아 조명 색의 영향을 받을 수 있어요.'); }
  for (let i = 0; i < light.issues.length; i++) q *= 0.75;
  if (R.mode === 'oval') { q *= 0.88; notes.push('얼굴 자동 인식 없이 타원 가이드 위치로 측정했어요.'); }
  if (!hair) { q *= 0.92; notes.push('머리카락 색을 측정하지 못해 피부 위주로 판단했어요.'); }
  if (!eye) q *= 0.95;
  const h = hueDeg(skin.a, skin.b);
  if (h < 38 || h > 80 || skin.L < 42 || skin.L > 82 || skin.b < 6 || skin.b > 32) { q *= 0.75; notes.push('측정된 피부색이 일반적인 한국인 범위를 벗어나요. 조명이나 메이크업 영향일 수 있어요.'); }
  // v1.7: 보정 없이 아주 밝게 찍히면(노출 과다) 명도가 실제보다 밝게 나옴
  if (!calibrated && skin.L > OVER_L && !light.issues.some((i) => i.code === 'bright')) { q *= 0.85; notes.push('사진이 밝게(노출 과다) 찍혀 명도가 실제보다 밝게 나왔을 수 있어요. 직사광선·플래시·밝기 보정 없는 사진이 좋아요.'); }
  if (source === 'photo') { q *= 0.85; notes.push('사진 파일은 찍을 때의 조명·카메라 보정·필터를 알 수 없어 참고용으로 봐 주세요. 보정·필터 없는 자연광 정면 사진이 좋아요.'); }
  if (mono.mono) { q *= 0.5; notes.unshift('흑백·세피아처럼 색이 거의 없는 사진 같아요. 색 정보가 부족해 결과를 믿기 어려워요. 컬러 사진으로 다시 진단해 주세요.'); }
  q = Math.max(0.3, q);
  const conf = confidence(cls, q);
  if (mono.mono) { conf.level = 'low'; conf.label = '낮음'; }
  // 드레이핑 오버레이 위치용 얼굴 틀 (숫자만, 이미지 아님)
  const fb = R.faceBox, faceBox = { cx: fb.cx, cy: fb.cy, rx: fb.rx, ry: fb.ry, W, H };
  return { ok: true, mode: R.mode, source, skin, eye, hair, feat, cls, conf, quality: q, light, cast, notes, calibrated, mono: !!mono.mono, faceBox };
}
