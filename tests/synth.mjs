// 테스트용 합성 얼굴 이미지 (알려진 Lab 톤)
import { labToRgb, srgbToLinear, linearToSrgb } from '../js/color.js';
import { ovalGeom } from '../js/analyzer.js';
export function synthFace({ W = 640, H = 480, skin, hair = [18, 2, 3], eye = [22, 3, 5], bg = [72, 0, 0], illum = [1, 1, 1], noise = 2, seed = 1 }) {
  const data = new Uint8ClampedArray(W * H * 4);
  const o = ovalGeom(W, H);
  let s = seed; const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff - 0.5) * 2;
  const toRgb = (lab) => labToRgb(...lab);
  const cs = toRgb(skin), ch = toRgb(hair), ce = toRgb(eye), cb = toRgb(bg), cl = toRgb([48, 45, 22]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const u = (x - o.cx) / o.rx, v = (y - o.cy) / o.ry; const r2 = u * u + v * v;
    let c = cb, shade = 1;
    const hairZone = (v < -0.7 && Math.abs(u) < 1.15 && (u * u) / 1.3 + ((v + 0.15) ** 2) / 1.2 < 1.05 && r2 > 0.82) || (v < -0.92 && v > -1.4 && Math.abs(u) < 0.9);
    if (r2 <= 1) {
      c = cs; shade = 1 - 0.28 * Math.max(0, r2 - 0.55); // 가장자리 그림자
      if (((u + 0.38) / 0.12) ** 2 + ((v + 0.15) / 0.05) ** 2 < 1 || ((u - 0.38) / 0.12) ** 2 + ((v + 0.15) / 0.05) ** 2 < 1) { c = ce; shade = 1; }
      if ((u / 0.28) ** 2 + ((v - 0.55) / 0.07) ** 2 < 1) { c = cl; shade = 1; }
      if (((u - 0.08) / 0.1) ** 2 + ((v + 0.5) / 0.05) ** 2 < 1) shade = 1.35; // 하이라이트
      if (v < -0.82) { c = ch; shade = 1; }
    } else if (hairZone) c = ch;
    const i = (y * W + x) * 4;
    for (let k = 0; k < 3; k++) {
      const lin = srgbToLinear(c[k]) * shade * illum[k];
      data[i + k] = Math.round(linearToSrgb(lin) + noise * rnd());
    }
    data[i + 3] = 255;
  }
  return { data, width: W, height: H };
}
export function paperFrame({ W = 640, H = 480, illum = [1, 1, 1], paperLin = 0.8 }) {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) { for (let k = 0; k < 3; k++) data[i * 4 + k] = Math.round(linearToSrgb(paperLin * illum[k])); data[i * 4 + 3] = 255; }
  return { data, width: W, height: H };
}
