// v2.3: 체형(골격) 3타입 × 데일리·포멀 코디 — 직접 그린 인라인 SVG 모델 (외부 파일 없음, 오프라인 OK)
// 같은 path 문자열로 화면(SVG)과 결과 카드(canvas Path2D)를 함께 그려요.
import { SEASONS } from './seasons.js';
export const BODY_ORDER = ['straight', 'wave', 'natural'];
export const BODY_TYPES = {
  straight: { name: '스트레이트', desc: '상체에 탄탄한 볼륨감이 있고 몸의 선이 곧은 편이에요.' },
  wave: { name: '웨이브', desc: '상체가 얇고 하체에 무게감이 있는, 부드러운 곡선형이에요.' },
  natural: { name: '내추럴', desc: '어깨·관절 같은 뼈대가 도드라지고 골격감이 있는 편이에요.' },
};
export const BODY_GENDERS = { f: '여성', m: '남성' };
const SKIN = '#f1d6c6', HAIR = '#3b3446', LINE = 'rgba(31,42,68,.18)';
const HEAD = [['M55 36 h10 v14 h-10z', SKIN], ['M47 26 a13 14 0 1 0 26 0 a13 14 0 1 0 -26 0z', SKIN]];
// viewBox 0 0 120 260 · 얼굴 없는 단순 실루엣
const BASE = {
  f: [['M46 25 C44 6 76 6 74 25 L76 46 L69 46 L70 27 L50 27 L51 46 L44 46Z', HAIR],
    ['M38 54 L30 58 L25 128 L31 129 L37 80Z', SKIN], ['M82 54 L90 58 L95 128 L89 129 L83 80Z', SKIN],
    ['M46 110 L58 110 L56 240 L49 240Z', SKIN], ['M62 110 L74 110 L71 240 L64 240Z', SKIN], ...HEAD,
    ['M46 25 C46 8 74 8 74 25 C70 17 52 16 46 25z', HAIR]],
  m: [['M34 54 L26 58 L22 130 L29 131 L36 82Z', SKIN], ['M86 54 L94 58 L98 130 L91 131 L84 82Z', SKIN],
    ['M45 114 L58 114 L57 240 L49 240Z', SKIN], ['M62 114 L75 114 L71 240 L63 240Z', SKIN], ...HEAD,
    ['M46 24 C45 9 75 9 74 24 C70 16 52 16 46 24z', HAIR]],
};
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
  // 남성
  mtop: 'M33 52 L52 50 L60 66 L68 50 L87 52 L83 118 L37 118Z',
  msl: 'M33 52 L25 57 L22 128 L30 129 L36 80Z M87 52 L95 57 L98 128 L90 129 L84 80Z',
  mslacks: 'M40 116 L80 116 L78 241 L63 241 L60 140 L57 241 L42 241Z',
  msuitL: 'M31 51 L50 50 L58 88 L55 152 L35 152Z', msuitR: 'M89 51 L70 50 L62 88 L65 152 L85 152Z',
  mshirt: 'M36 52 L52 50 L60 62 L68 50 L84 52 L82 118 L38 118Z',
  mtie: 'M58 62 h4 l2 40 l-4 6 l-4 -6z',
  mslim: 'M37 52 Q60 60 83 52 L80 106 L40 106Z',
  mtaper: 'M41 104 L79 104 L72 241 L62 241 L60 130 L58 241 L48 241Z',
  mshort: 'M34 51 L56 50 L58 106 L38 106Z M86 51 L64 50 L62 106 L82 106Z',
  mbelt: 'M41 102 h38 v5 h-38z',
  mover: 'M28 50 L92 50 L94 144 L26 144Z', mosl: 'M28 50 L17 58 L16 120 L27 122 L31 82Z M92 50 L103 58 L104 120 L93 122 L89 82Z',
  mwide: 'M37 124 L83 124 L90 241 L65 241 L60 152 L55 241 L30 241Z',
  mcoatL: 'M30 50 L52 50 L58 92 L56 222 L27 222Z', mcoatR: 'M90 50 L68 50 L62 92 L64 222 L93 222Z',
  mcsl: 'M30 50 L19 58 L17 134 L27 136 L33 82Z M90 50 L101 58 L103 134 L93 136 L87 82Z',
  mshoes: 'M42 240 h16 v6 h-18z M62 240 h16 l2 6 h-18z',
};
// 색 역할: t=상의 b=하의 p=포인트
export const LOOKS = {
  f: {
    straight: [
      { k: 'daily', title: '데일리', parts: [['spants', 'b'], ['vneck', 't'], ['vsleeve', 't'], ['shoes', 'p']], items: [['심플한 V넥 니트', 't'], ['스트레이트 팬츠', 'b'], ['로퍼', 'p']] },
      { k: 'formal', title: '포멀', parts: [['hskirt', 'b'], ['vneck', 't'], ['jacketL', 'b'], ['jacketR', 'b'], ['jsleeve', 'b'], ['shoes', 'p']], items: [['정장 재킷', 'b'], ['V넥 블라우스', 't'], ['H라인 스커트', 'b']] },
    ],
    wave: [
      { k: 'daily', title: '데일리', parts: [['flare', 'b'], ['crop', 't'], ['csleeve', 't'], ['belt', 'p'], ['shoes', 'p']], items: [['짧은 니트', 't'], ['하이웨이스트 벨트', 'p'], ['플레어 스커트', 'b']] },
      { k: 'formal', title: '포멀', parts: [['mermaid', 'b'], ['crop', 't'], ['cjacket', 'b'], ['belt', 'p'], ['shoes', 'p']], items: [['짧은 테일러드 재킷', 'b'], ['하이웨이스트 벨트', 'p'], ['머메이드 스커트', 'b']] },
    ],
    natural: [
      { k: 'daily', title: '데일리', parts: [['wide', 'b'], ['over', 't'], ['osleeve', 't'], ['shoes', 'p'], ['bag', 'p']], items: [['오버핏 셔츠', 't'], ['와이드 팬츠', 'b'], ['빅 숄더백', 'p']] },
      { k: 'formal', title: '포멀', parts: [['wide', 't'], ['shirt', 't'], ['coatL', 'b'], ['coatR', 'b'], ['csl', 'b'], ['shoes', 'p']], items: [['롱 코트', 'b'], ['셔츠·와이드 팬츠', 't'], ['구두', 'p']] },
    ],
  },
  m: {
    straight: [
      { k: 'daily', title: '데일리', parts: [['mslacks', 'b'], ['mtop', 't'], ['msl', 't'], ['mshoes', 'p']], items: [['심플한 V넥 니트', 't'], ['스트레이트 슬랙스', 'b'], ['로퍼', 'p']] },
      { k: 'formal', title: '포멀', parts: [['mslacks', 'b'], ['mshirt', 't'], ['mtie', 'p'], ['msuitL', 'b'], ['msuitR', 'b'], ['msl', 'b'], ['mshoes', 'p']], items: [['정장 수트', 'b'], ['셔츠', 't'], ['넥타이', 'p']] },
    ],
    wave: [
      { k: 'daily', title: '데일리', parts: [['mtaper', 'b'], ['mslim', 't'], ['msl', 't'], ['mshoes', 'p']], items: [['짧은 기장 니트', 't'], ['테이퍼드 팬츠', 'b'], ['스니커즈', 'p']] },
      { k: 'formal', title: '포멀', parts: [['mtaper', 'b'], ['mshirt', 't'], ['mbelt', 'p'], ['mshort', 'b'], ['msl', 'b'], ['mshoes', 'p']], items: [['짧은 재킷', 'b'], ['하이웨이스트 슬랙스', 'b'], ['셔츠', 't']] },
    ],
    natural: [
      { k: 'daily', title: '데일리', parts: [['mwide', 'b'], ['mover', 't'], ['mosl', 't'], ['mshoes', 'p'], ['bag', 'p']], items: [['오버핏 셔츠', 't'], ['와이드 팬츠', 'b'], ['숄더백', 'p']] },
      { k: 'formal', title: '포멀', parts: [['mwide', 't'], ['mshirt', 't'], ['mcoatL', 'b'], ['mcoatR', 'b'], ['mcsl', 'b'], ['mshoes', 'p']], items: [['롱 코트', 'b'], ['셔츠·와이드 슬랙스', 't'], ['구두', 'p']] },
    ],
  },
};
// 타입 베스트 컬러 안에서 고른 조합 [상의, 하의, 포인트] — 너무 어두운 원톤·너무 튀는 포인트를 피함
const LOOK_COLORS = {
  spring_light: { daily: ['피치', '크림 아이보리', '라이트 골드'], formal: ['크림 아이보리', '라이트 카멜', '라이트 골드'] },
  spring_bright: { daily: ['코랄 핑크', '아이보리', '브라이트 피치'], formal: ['아이보리', '웜 로열블루', '코랄 레드'] },
  summer_light: { daily: ['베이비 블루', '소프트 화이트', '로즈 핑크'], formal: ['소프트 화이트', '페리윙클', '라이트 그레이'] },
  summer_mute: { daily: ['로즈 베이지', '블루 그레이', '로즈우드'], formal: ['그레이시 블루', '소프트 네이비', '모브'] },
  autumn_mute: { daily: ['오트밀', '카키', '카멜'], formal: ['오트밀', '모카', '베이지 브라운'] },
  autumn_deep: { daily: ['테라코타', '초콜릿 브라운', '골드 머스터드'], formal: ['골드 머스터드', '초콜릿 브라운', '브릭 레드'] },
  winter_bright: { daily: ['퓨어 화이트', '로열 블루', '트루 레드'], formal: ['아이시 블루', '블랙', '트루 레드'] },
  winter_deep: { daily: ['실버 그레이', '네이비', '버건디'], formal: ['아이시 화이트', '차콜', '딥 로즈'] },
};
const pal = (id, k) => { const best = SEASONS[id]?.best || [], n = LOOK_COLORS[id]?.[k] || [], f = (x, i) => best.find((c) => c.name === x) || best[i];
  return { t: f(n[0], 0), b: f(n[1], 1), p: f(n[2], 2) }; };
export function bodyLooks(id, body, gender = 'f') {
  const g = gender === 'm' ? 'm' : 'f';
  return (LOOKS[g][body] || []).map((l) => { const c = pal(id, l.k); return { ...l, colors: c, layers: [...BASE[g], ...l.parts.map(([x, r]) => [G[x], c[r].hex])], labels: l.items.map(([n, r]) => ({ name: n, color: c[r] })) }; });
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
