// 색 계산 모듈 (순수 함수, 브라우저/Node 공용)
// sRGB(D65) -> CIELAB, 화이트밸런스, 한국인 피부 기준 특징값, 시즌 매핑

export const srgbToLinear = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
export const linearToSrgb = (v) => { v = Math.max(0, Math.min(1, v)); return 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055); };

const WX = 0.95047, WY = 1.0, WZ = 1.08883;
const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);

export function linToLab(r, g, b) {
  const X = 0.4124564 * r + 0.3575761 * g + 0.1804375 * b;
  const Y = 0.2126729 * r + 0.7151522 * g + 0.0721750 * b;
  const Z = 0.0193339 * r + 0.1191920 * g + 0.9503041 * b;
  const fx = f(X / WX), fy = f(Y / WY), fz = f(Z / WZ);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}
export const rgbToLab = (r, g, b) => linToLab(srgbToLinear(r), srgbToLinear(g), srgbToLinear(b));

export function labToRgb(L, a, b) {
  const fy = (L + 16) / 116, fx = fy + a / 500, fz = fy - b / 200;
  const inv = (t) => (t ** 3 > 216 / 24389 ? t ** 3 : (116 * t - 16) / (24389 / 27));
  const X = inv(fx) * WX, Y = inv(fy) * WY, Z = inv(fz) * WZ;
  const r = 3.2404542 * X - 1.5371385 * Y - 0.4985314 * Z;
  const g = -0.9692660 * X + 1.8760108 * Y + 0.0415560 * Z;
  const bb = 0.0556434 * X - 0.2040259 * Y + 1.0572252 * Z;
  return [linearToSrgb(r), linearToSrgb(g), linearToSrgb(bb)].map(Math.round);
}
export const chroma = (a, b) => Math.hypot(a, b);
export const hueDeg = (a, b) => { let h = Math.atan2(b, a) * 180 / Math.PI; return h < 0 ? h + 360 : h; };
export const hexToRgb = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };

// ---------- 화이트밸런스 ----------
// 흰 종이의 평균 sRGB로 채널별 이득(linear) 계산. 종이가 L*≈93(약간 회색빛 흰색)이 되도록 노출도 함께 맞춤.
export const WB_TARGET_LIN = 0.83; // L* ≈ 93
export function whiteBalanceFromPaper(rgb, opts = {}) {
  const lin = rgb.map(srgbToLinear);
  const lab = linToLab(...lin);
  const maxExp = opts.maxExposureGain ?? 2.2, minExp = opts.minExposureGain ?? 0.6;
  const Y = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
  let gains = lin.map((c) => (c > 1e-4 ? WB_TARGET_LIN / c : 1));
  // 노출 보정량 제한 (종이와 얼굴의 조명이 다를 수 있으므로 과도한 증폭 방지)
  const exp = Math.min(maxExp, Math.max(minExp, WB_TARGET_LIN / Math.max(Y, 1e-4)));
  const balance = gains.map((g) => g / (WB_TARGET_LIN / Math.max(Y, 1e-4)));
  gains = balance.map((g) => g * exp);
  const castChroma = chroma(lab[1], lab[2]);
  const valid = lab[0] >= 35 && castChroma <= 35 && Math.min(...rgb) >= 40 && Math.max(...rgb) <= 254.5;
  return { gains, paperLab: lab, castChroma, exposureGain: exp, valid,
    problem: lab[0] < 35 ? 'dark' : Math.max(...rgb) > 254.5 ? 'clipped' : castChroma > 35 ? 'notwhite' : null };
}
export function applyGainsRgb(rgb, gains) {
  return rgb.map((v, i) => linearToSrgb(srgbToLinear(v) * gains[i]));
}

// ---------- 통계 ----------
export function median(arr) { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
export function percentile(arr, p) { if (!arr.length) return NaN; const s = Float64Array.from(arr).sort(); const i = Math.min(s.length - 1, Math.max(0, Math.round((s.length - 1) * p))); return s[i]; }

// 피부 픽셀 Lab 목록 -> 그림자/하이라이트/비피부 제외 후 대표값
export function robustSkin(labs) {
  const cand = labs.filter(([L, a, b]) => {
    const C = chroma(a, b), h = hueDeg(a, b);
    return L > 20 && L < 97 && C > 4 && C < 60 && h > 10 && h < 105; // 피부색 범위 대략 (입술·눈썹·배경 제외)
  });
  if (cand.length < 12) return null;
  const Ls = cand.map((x) => x[0]);
  const lo = percentile(Ls, 0.2), hi = percentile(Ls, 0.85); // 그림자(하위 20%)·하이라이트(상위 15%) 제외
  const kept = cand.filter(([L]) => L >= lo && L <= hi);
  const use = kept.length >= 8 ? kept : cand;
  return { L: median(use.map((x) => x[0])), a: median(use.map((x) => x[1])), b: median(use.map((x) => x[2])), n: use.length, total: labs.length };
}
export function robustDark(labs, frac = 0.35) {
  if (labs.length < 6) return null;
  const Ls = labs.map((x) => x[0]); const cut = percentile(Ls, frac);
  const use = labs.filter((x) => x[0] <= cut);
  return { L: median(use.map((x) => x[0])), a: median(use.map((x) => x[1])), b: median(use.map((x) => x[2])), n: use.length };
}

// ---------- 한국인 기준값 (카메라 sRGB, 흰 종이 보정 기준) ----------
// 한국인 볼·이마 피부: L* 약 58–70, a* 약 7–15, b* 약 13–22, 색상각 약 50–68°
export const KR = {
  skinL: 63, skinLsd: 5, skinLsdUncal: 9,
  hue: 58.5, huesd: 5,
  b: 17, bsd: 4,
  C: 19.5, Csd: 3.5,
  hairL: 20, hairLsd: 7, hairB: 4, hairBsd: 4,
  eyeB: 6, eyeBsd: 5,
  contrast: 43, contrastSd: 8,
};
const clamp = (x, m = 2.5) => Math.max(-m, Math.min(m, x));

// 특징값: w(웜+/쿨-), l(밝음+/깊음-), c(선명+/부드러움-)
// calibrated=false(흰 종이 보정 없음)이면 피부 밝기(L*)가 카메라 자동 노출·사진 밝기에 크게 좌우되므로 명도 축을 약하게 씀
export function computeFeatures({ skin, hair, eye }, { calibrated = true } = {}) {
  const h = hueDeg(skin.a, skin.b), C = chroma(skin.a, skin.b);
  const zh = clamp((h - KR.hue) / KR.huesd), zb = clamp((skin.b - KR.b) / KR.bsd);
  // v1.6: 색상각(hue)은 볼의 붉은기(홍조·블러셔)가 늘면 작아져 쿨로 읽힘 → 노란기(b*) 비중을 높임 (예전 0.65·hue + 0.35·b*)
  let w = 0.4 * zh + 0.6 * zb, wWeight = 1;
  if (hair) { w += 0.12 * clamp((hair.b - KR.hairB) / KR.hairBsd); wWeight += 0.12; }
  if (eye) { w += 0.08 * clamp((eye.b - KR.eyeB) / KR.eyeBsd); wWeight += 0.08; }
  w /= wWeight;
  // v1.6: 보정 없으면 피부 L* 기준 폭을 넓히고(5→9) 머리카락 비중을 높이며 ±1.5로 제한 (예전엔 밝은 사진이 거의 모두 '라이트'로 쏠림)
  const zL = clamp((skin.L - KR.skinL) / (calibrated ? KR.skinLsd : KR.skinLsdUncal));
  let l = zL;
  if (hair) { const k = calibrated ? 0.7 : 0.5; l = k * zL + (1 - k) * clamp((hair.L - KR.hairL) / KR.hairLsd); }
  if (!calibrated) l = clamp(l, 1.5);
  const darkL = Math.min(hair ? hair.L : 99, eye ? eye.L : 99);
  const contrast = darkL < 99 ? skin.L - darkL : KR.contrast;
  const zC = clamp((C - KR.C) / KR.Csd), zCt = clamp((contrast - KR.contrast) / KR.contrastSd);
  const c = darkL < 99 ? 0.55 * zC + 0.45 * zCt : zC;
  return { w, l, c, hue: h, chroma: C, contrast, skinL: skin.L };
}

// ---------- 시즌 매핑 ----------
export const PROTOTYPES = {
  spring_light:  { w: 1, l: 1.1, c: 0.1 },
  spring_bright: { w: 1, l: 0.2, c: 1.2 },
  summer_light:  { w: -1, l: 1.1, c: 0.0 },
  summer_mute:   { w: -1, l: 0.1, c: -0.9 },
  autumn_mute:   { w: 1, l: 0, c: -0.9 },
  autumn_deep:   { w: 1, l: -1.1, c: 0.1 },
  winter_bright: { w: -1, l: -0.1, c: 1.2 },
  winter_deep:   { w: -1, l: -1.1, c: 0.3 },
};
export const WARM = new Set(['spring_light', 'spring_bright', 'autumn_mute', 'autumn_deep']);
const W_WEIGHT = 1.6, TEMP = 0.55;

export function classify(feat) {
  const ids = Object.keys(PROTOTYPES);
  const d2 = ids.map((id) => { const p = PROTOTYPES[id]; return W_WEIGHT * (clamp(feat.w, 2) - p.w) ** 2 + (clamp(feat.l, 2) - p.l) ** 2 + (clamp(feat.c, 2) - p.c) ** 2; });
  const m = Math.min(...d2);
  const ex = d2.map((d) => Math.exp(-(d - m) / (2 * TEMP)));
  const sum = ex.reduce((a, b) => a + b, 0);
  const ranked = ids.map((id, i) => ({ id, p: ex[i] / sum })).sort((a, b) => b.p - a.p);
  const warmP = ranked.filter((r) => WARM.has(r.id)).reduce((a, r) => a + r.p, 0);
  return { ranked, top: ranked.slice(0, 2), warmP };
}

// 신뢰도: 언더톤 확실성 + 같은 계절(2개 하위 타입 합) 확률 + 1순위 확률, 측정 품질 곱
export const SEASON_OF = (id) => id.split('_')[0];
export function confidence(cls, quality = 1) {
  const [a] = cls.top;
  const undertone = Math.abs(cls.warmP - 0.5) * 2; // 0~1
  const seasonP = cls.ranked.filter((r) => SEASON_OF(r.id) === SEASON_OF(a.id)).reduce((s, r) => s + r.p, 0);
  const score = (0.4 * undertone + 0.3 * seasonP + 0.3 * a.p) * quality;
  // '높음'은 언더톤·계절 모두 뚜렷하고 측정 품질이 좋을 때만
  const level = score >= 0.55 && undertone >= 0.7 && seasonP >= 0.6 && quality >= 0.7 ? 'high' : score >= 0.38 ? 'mid' : 'low';
  const hint = undertone >= 0.7 && seasonP < 0.6 ? '웜/쿨은 뚜렷하지만 계절(밝기·선명도) 구분은 애매해요. 드레이핑으로 확인해 주세요.'
    : undertone < 0.4 ? '웜/쿨 구분이 애매해요(뉴트럴에 가까움). 드레이핑 비교가 특히 중요해요.' : '';
  return { score, level, label: { high: '높음', mid: '보통', low: '낮음' }[level], undertone, seasonP, hint };
}

// 드레이핑 선택 반영: 선택한 쪽 벡터 - 다른 쪽 벡터 만큼 이동
export const DRAPE_STEP = 0.35;
export function applyDrape(feat, votes) {
  const adj = { w: 0, l: 0, c: 0 };
  for (const v of votes) for (const k of ['w', 'l', 'c']) adj[k] += DRAPE_STEP * ((v.chosen[k] || 0) - (v.other[k] || 0));
  for (const k of ['w', 'l', 'c']) adj[k] = clamp(adj[k], 1.6);
  return { ...feat, w: feat.w + adj.w, l: feat.l + adj.l, c: feat.c + adj.c, adj };
}

// 조명 판정 (얼굴 영역 평균 L, 화면 전체 평균 a/b, 클리핑 비율)
export function lightCheck({ faceL, castA, castB, clipFrac = 0, calibrated = false }) {
  const issues = [];
  if (faceL < 35) issues.push({ code: 'dark', msg: '조명이 너무 어두워요. 창가나 밝은 곳으로 옮겨 주세요.' });
  else if (faceL > 85 || clipFrac > 0.12) issues.push({ code: 'bright', msg: '너무 밝거나 빛이 반사돼요. 직사광선을 피하고 조금 물러나 주세요.' });
  if (!calibrated) {
    if (castB > 14) issues.push({ code: 'yellow', msg: '조명이 노랗게 치우쳐 있어요. 흰 종이 보정을 권장해요.' });
    else if (castB < -10) issues.push({ code: 'blue', msg: '조명이 푸르게 치우쳐 있어요. 흰 종이 보정을 권장해요.' });
    if (castA > 10) issues.push({ code: 'red', msg: '조명이 붉게 치우쳐 있어요. 흰 종이 보정을 권장해요.' });
    else if (castA < -10) issues.push({ code: 'green', msg: '조명이 초록빛으로 치우쳐 있어요. 흰 종이 보정을 권장해요.' });
  }
  return { ok: issues.length === 0, issues };
}
