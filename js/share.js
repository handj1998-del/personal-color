// 결과 → 짧은 코드 (고객 휴대폰용 주소 #r=… 에 담음). 얼굴 사진·측정값 없이 타입·신뢰도·방법·날짜·얼굴형만
import { SEASONS, SEASON_ORDER } from './seasons.js';
import { FACE_ORDER } from './style.js';
export const CONF_C = { high: 'h', mid: 'm', low: 'l' }, METHODS = ['자동 분석', '드레이핑', '자동 분석 + 드레이핑'];
export function encodeResult(f, faceSel, gender = 'f') {
  const fi = FACE_ORDER.indexOf(faceSel || ''), d = f.date.replaceAll('.', '');
  return '1' + SEASON_ORDER.indexOf(f.id) + SEASON_ORDER.findIndex((k) => SEASONS[k] === f.second || k === f.second?.id) + CONF_C[f.conf.level] + Math.max(0, METHODS.indexOf(f.method)) + (fi < 0 ? 'x' : fi) + d + (gender === 'm' ? 'm' : 'f'); // v1.5: 끝에 헤어 스타일 기준(f/m)
}
export function decodeResult(code) {
  const m = /^1([0-7])([0-7])([hml])([0-2])([0-5x])(\d{8})([fm])?$/.exec(String(code || '')); if (!m) return null; // 예전(14자) 주소도 열림
  const id = SEASON_ORDER[+m[1]], level = { h: 'high', m: 'mid', l: 'low' }[m[3]], face = m[5] === 'x' ? null : FACE_ORDER[+m[5]];
  // v1.7: 없는 날짜(13월·32일 등)는 잘못된 주소로 봄
  const y = +m[6].slice(0, 4), mo = +m[6].slice(4, 6), dd = +m[6].slice(6), dt = new Date(Date.UTC(y, mo - 1, dd));
  if (y < 2020 || y > 2100 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== dd) return null;
  const date = `${m[6].slice(0, 4)}.${m[6].slice(4, 6)}.${m[6].slice(6)}`;
  return { id, season: SEASONS[id], second: SEASONS[SEASON_ORDER[+m[2]]], conf: { level, label: { high: '높음', mid: '보통', low: '낮음' }[level] }, method: METHODS[+m[4]], date, face: null, sharedFace: face, sharedGender: m[7] || 'f', changed: false };
}
export const RESULT_RE = /^#r=([0-9a-z]+)$/;
