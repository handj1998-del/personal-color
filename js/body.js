// v2.3: 체형(골격) 3타입 × 데일리·포멀 코디 — 직접 그린 인라인 SVG 모델 (외부 파일 없음, 오프라인 OK)
// 같은 path 문자열로 화면(SVG)과 결과 카드(canvas Path2D)를 함께 그려요.
import { OUTFITS } from './seasons.js';
export const BODY_ORDER = ['straight', 'wave', 'natural'];
export const BODY_TYPES = {
  straight: { name: '스트레이트', desc: '상체에 탄탄한 볼륨감이 있고 몸의 선이 곧은 편이에요.' },
  wave: { name: '웨이브', desc: '상체가 얇고 하체에 무게감이 있는, 부드러운 곡선형이에요.' },
  natural: { name: '내추럴', desc: '어깨·관절 같은 뼈대가 도드라지고 골격감이 있는 편이에요.' },
};
const SKIN = '#f1d6c6', HAIR = '#3b3446', LINE = 'rgba(31,42,68,.18)';
// viewBox 0 0 120 260 · 얼굴 없는 단순 실루엣
const BASE = [
  ['M38 54 L30 58 L25 128 L31 129 L37 80Z', SKIN], ['M82 54 L90 58 L95 128 L89 129 L83 80Z', SKIN], // 팔
  ['M46 110 L58 110 L56 240 L49 240Z', SKIN], ['M62 110 L74 110 L71 240 L64 240Z', SKIN], // 다리
  ['M55 36 h10 v14 h-10z', SKIN], ['M47 26 a13 14 0 1 0 26 0 a13 14 0 1 0 -26 0z', SKIN],
  ['M46 25 C46 8 74 8 74 25 C70 17 52 16 46 25z', HAIR],
];
const G = {
  vneck: 'M36 52 L52 50 L60 72 L68 50 L84 52 L81 112 L39 112Z',
  vsleeve: 'M36 52 L28 57 L25 96 L32 97 L37 74Z M84 52 L92 57 L95 96 L88 97 L83 74Z',
  spants: 'M40 110 L80 110 L77 241 L63 241 L60 136 L57 241 L43 241Z',
  hskirt: 'M40 110 L80 110 L78 182 L42 182Z',
  jacketL: 'M34 51 L50 50 L58 84 L54 146 L36 146Z', jacketR: 'M86 51 L70 50 L62 84 L66 146 L84 146Z',
  jsleeve: 'M34 51 L27 56 L24 126 L32 127 L37 76Z M86 51 L93 56 L96 126 L88 127 L83 76Z',
  crop: 'M38 52 Q60 62 82 52 L79 94 L41 94Z', csleeve: 'M38 52 L30 56 L28 72 L35 74Z M82 52 L90 56 L92 72 L85 74Z',
  belt: 'M43 94 h34 v6 h-34z',
  flare: 'M44 99 L76 99 L94 196 Q60 206 26 196Z',
  cjacket: 'M36 51 L56 50 L58 98 L39 98Z M84 51 L64 50 L62 98 L81 98Z M36 51 L28 56 L25 118 L32 119 L37 74Z M84 51 L92 56 L95 118 L88 119 L83 74Z',
  mermaid: 'M44 99 L76 99 L73 178 L86 222 Q60 230 34 222 L47 178Z',
  over: 'M31 50 L89 50 L92 140 L28 140Z', osleeve: 'M31 50 L20 58 L19 116 L29 118 L33 80Z M89 50 L100 58 L101 116 L91 118 L87 80Z',
  wide: 'M38 122 L82 122 L90 241 L64 241 L60 150 L56 241 L30 241Z',
  shirt: 'M38 52 L52 50 L60 64 L68 50 L82 52 L82 130 L38 130Z',
  coatL: 'M32 50 L52 50 L58 92 L56 226 L28 226Z', coatR: 'M88 50 L68 50 L62 92 L64 226 L92 226Z',
  csl: 'M32 50 L21 58 L19 132 L28 134 L34 82Z M88 50 L99 58 L101 132 L92 134 L86 82Z',
  shoes: 'M43 240 h15 v6 h-17z M62 240 h15 l2 6 h-17z',
  bag: 'M95 118 h14 v14 h-14z M98 118 q4 -8 8 0',
};
// 색 역할: t=상의 b=하의 p=포인트 (진단 타입의 코디 팔레트에서)
export const LOOKS = {
  straight: [
    { k: 'daily', title: '데일리', parts: [['spants', 'b'], ['vneck', 't'], ['vsleeve', 't'], ['shoes', 'p']], items: [['심플한 V넥 니트', 't'], ['스트레이트 팬츠', 'b'], ['로퍼', 'p']] },
    { k: 'formal', title: '포멀', parts: [['hskirt', 'b'], ['vneck', 't'], ['jacketL', 'b'], ['jacketR', 'b'], ['jsleeve', 'b'], ['shoes', 'p']], items: [['정장 재킷', 'b'], ['V넥 블라우스', 't'], ['H라인 스커트', 'b']] },
  ],
  wave: [
    { k: 'daily', title: '데일리', parts: [['flare', 'b'], ['crop', 't'], ['csleeve', 't'], ['belt', 'p'], ['shoes', 'p']], items: [['짧은 니트', 't'], ['하이웨이스트 벨트', 'p'], ['플레어 스커트', 'b']] },
    { k: 'formal', title: '포멀', parts: [['mermaid', 'b'], ['crop', 't'], ['cjacket', 'b'], ['belt', 'p'], ['shoes', 'p']], items: [['짧은 테일러드 재킷', 'b'], ['하이웨이스트', 'p'], ['머메이드 스커트', 'b']] },
  ],
  natural: [
    { k: 'daily', title: '데일리', parts: [['wide', 'b'], ['over', 't'], ['osleeve', 't'], ['shoes', 'p'], ['bag', 'p']], items: [['오버핏 셔츠', 't'], ['와이드 팬츠', 'b'], ['빅 숄더백', 'p']] },
    { k: 'formal', title: '포멀', parts: [['wide', 't'], ['shirt', 't'], ['coatL', 'b'], ['coatR', 'b'], ['csl', 'b'], ['shoes', 'p']], items: [['롱 코트', 'b'], ['셔츠', 't'], ['와이드 팬츠', 't']] },
  ],
};
// 데일리 = 코디 팔레트 1번, 포멀 = 3번(오피스 계열)
const pal = (id, k) => { const L = OUTFITS[id] || []; const o = (k === 'formal' ? L[2] : L[0]) || L[0]; return { t: o.top, b: o.bottom, p: o.point }; };
export function bodyLooks(id, body) {
  return (LOOKS[body] || []).map((l) => { const c = pal(id, l.k); return { ...l, colors: c, layers: [...BASE, ...l.parts.map(([g, r]) => [G[g], c[r].hex])], labels: l.items.map(([n, r]) => ({ name: n, color: c[r] })) }; });
}
export function bodySvg(look, label) {
  return `<svg class="bodysvg" viewBox="0 0 120 260" role="img" aria-label="${label}"><ellipse cx="60" cy="248" rx="40" ry="6" fill="rgba(31,42,68,.07)"/>${look.layers.map(([d, f]) => `<path d="${d}" fill="${f}" stroke="${LINE}" stroke-width="1" stroke-linejoin="round"/>`).join('')}</svg>`;
}
export function drawBody(ctx, look, x, y, h) {
  const k = h / 260; ctx.save(); ctx.translate(x, y); ctx.scale(k, k); ctx.lineWidth = 1; ctx.strokeStyle = LINE; ctx.lineJoin = 'round';
  ctx.fillStyle = 'rgba(31,42,68,.07)'; ctx.beginPath(); ctx.ellipse(60, 248, 40, 6, 0, 0, Math.PI * 2); ctx.fill();
  for (const [d, f] of look.layers) { const p = new Path2D(d); ctx.fillStyle = f; ctx.fill(p); ctx.stroke(p); }
  ctx.restore();
}
