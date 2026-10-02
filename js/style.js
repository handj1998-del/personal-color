// 얼굴형 추정 + 안경·립·눈썹 추천 (일반적인 퍼스널컬러·스타일링 가이드 기반의 '제안')
const c = (name, hex) => ({ name, hex });

// ---------- 얼굴형 ----------
export const FACE_ORDER = ['oval', 'round', 'long', 'square', 'heart', 'diamond'];
export const FACE_SHAPES = {
  oval: { name: '계란형', desc: '이마·광대·턱 폭이 고르고 턱선이 부드럽게 좁아지는 얼굴형',
    brow: 'natural', browName: '자연 아치', browTip: '타고난 눈썹 결을 살린 완만한 아치가 잘 어울려요. 눈썹산은 눈동자 바깥쪽~눈꼬리 사이에 두면 자연스러워요.',
    glasses: ['wellington', 'boston', 'square'], glassesTip: '대부분의 모양이 잘 어울려요. 얼굴 폭과 비슷하거나 살짝 넓은 웰링턴·보스턴이 무난해요.', glassesAvoid: '얼굴보다 지나치게 크거나 좁은 프레임' },
  round: { name: '둥근형', desc: '가로·세로 길이가 비슷하고 턱선이 둥근 얼굴형',
    brow: 'angled', browName: '각진 아치', browTip: '눈썹산을 살짝 높이고 각을 준 아치형이 얼굴을 갸름하게 보이게 도와요. 너무 둥근 눈썹은 피하는 편이 좋아요.',
    glasses: ['square', 'wellington', 'cateye'], glassesTip: '직선이 있는 사각·웰링턴 프레임이 얼굴선을 정돈해 줘요. 가로로 살짝 넓은 프레임을 추천해요.', glassesAvoid: '작고 동그란 원형 프레임' },
  long: { name: '긴형', desc: '세로 길이가 가로보다 확실히 긴 얼굴형',
    brow: 'straight', browName: '일자 눈썹', browTip: '각을 줄인 일자(평평한) 눈썹이 얼굴 길이를 짧아 보이게 해 줘요. 눈썹 꼬리를 살짝 길게 그려도 좋아요.',
    glasses: ['boston', 'round', 'browline'], glassesTip: '세로 폭이 넉넉한 보스턴·라운드, 상단이 두꺼운 프레임이 얼굴 길이를 분산해 줘요.', glassesAvoid: '세로가 얇고 좁은 프레임' },
  square: { name: '각진형', desc: '이마·광대·턱 폭이 비슷하고 턱 각이 뚜렷한 얼굴형',
    brow: 'soft', browName: '부드러운 아치', browTip: '곡선이 있는 부드러운 아치 눈썹이 각진 턱선을 부드럽게 보이게 해요. 너무 각진 눈썹산은 피하는 편이 좋아요.',
    glasses: ['round', 'oval', 'boston'], glassesTip: '라운드·오벌·보스턴처럼 곡선이 있는 프레임이 턱선의 각을 부드럽게 해 줘요.', glassesAvoid: '각이 강한 사각 프레임' },
  heart: { name: '하트형(역삼각)', desc: '이마가 넓고 턱이 좁고 뾰족한 얼굴형',
    brow: 'round', browName: '둥근 아치', browTip: '완만하고 둥근 아치 눈썹이 넓은 이마와 좁은 턱의 균형을 맞춰 줘요. 눈썹을 너무 진하게 각지게 그리지 않는 편이 좋아요.',
    glasses: ['oval', 'round', 'rimless'], glassesTip: '하단이 살짝 넓은 오벌·라운드, 가벼운 무테·반무테(하금테)가 균형을 잡아 줘요.', glassesAvoid: '상단이 두껍고 강조된 프레임' },
  diamond: { name: '마름모형', desc: '광대가 가장 넓고 이마와 턱이 좁은 얼굴형',
    brow: 'long', browName: '부드러운 긴 아치', browTip: '부드러운 아치에 눈썹 꼬리를 살짝 길게 빼면 이마 쪽이 넓어 보여 광대가 덜 도드라져요.',
    glasses: ['oval', 'cateye', 'browline'], glassesTip: '오벌·캣아이, 상단 라인이 있는 브로우라인 프레임이 광대 폭을 분산해 줘요.', glassesAvoid: '좁고 작은 프레임' },
};
export const GLASS_SHAPES = { square: '사각', wellington: '웰링턴', boston: '보스턴', round: '라운드', oval: '오벌', cateye: '캣아이', browline: '브로우라인', rimless: '무테·반무테' };

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
function angleAt(o, a, b) {
  const v1 = [a.x - o.x, a.y - o.y], v2 = [b.x - o.x, b.y - o.y];
  const cs = (v1[0] * v2[0] + v1[1] * v2[1]) / (Math.hypot(...v1) * Math.hypot(...v2));
  return (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI;
}
// MediaPipe Face Mesh 랜드마크(정규화 좌표) → 얼굴형 특징. W,H로 실제 비율을 복원
export function faceMetrics(lm, W = 1, H = 1) {
  if (!lm || lm.length < 468) return null;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H });
  const cheek = dist(P(234), P(454));
  if (!(cheek > 0)) return null;
  const len = dist(P(10), P(152));
  const fore = dist(P(54), P(284)), jaw = dist(P(172), P(397));
  const chin = angleAt(P(152), P(172), P(397));
  const nose = P(1); const yaw = Math.abs(dist(nose, P(234)) - dist(nose, P(454))) / cheek;
  return { ratio: len / cheek, fore: fore / cheek, jaw: jaw / cheek, chin, yaw };
}
// 대표값(일반적인 얼굴형 정의: 길이/폭 비율, 이마·턱 폭, 턱 끝 각도)
const PROTO = {
  oval: { ratio: 1.30, fore: 0.88, jaw: 0.80, chin: 107 },
  round: { ratio: 1.15, fore: 0.88, jaw: 0.85, chin: 118 },
  long: { ratio: 1.48, fore: 0.88, jaw: 0.80, chin: 100 },
  square: { ratio: 1.20, fore: 0.90, jaw: 0.91, chin: 122 },
  heart: { ratio: 1.30, fore: 0.95, jaw: 0.73, chin: 95 },
  diamond: { ratio: 1.34, fore: 0.79, jaw: 0.73, chin: 97 },
};
const SCALE = { ratio: 0.07, fore: 0.04, jaw: 0.04, chin: 8 };
export function classifyFaceShape(m) {
  if (!m) return null;
  const sc = FACE_ORDER.map((id) => { let s = 0; for (const k in SCALE) s += ((m[k] - PROTO[id][k]) / SCALE[k]) ** 2; return { id, s: -s / 2 }; });
  const mx = Math.max(...sc.map((x) => x.s)); const ex = sc.map((x) => ({ id: x.id, e: Math.exp(x.s - mx) })); const Z = ex.reduce((a, x) => a + x.e, 0);
  const probs = ex.map((x) => ({ id: x.id, p: x.e / Z })).sort((a, b) => b.p - a.p);
  let p = probs[0].p; const turned = m.yaw > 0.15; if (turned) p *= 0.7;
  const level = p >= 0.6 ? 'high' : p >= 0.4 ? 'mid' : 'low';
  const label = { high: '비교적 뚜렷', mid: '보통', low: '애매' }[level];
  const note = turned ? '얼굴이 옆으로 돌아가 있어 정확도가 낮아요. 정면 기준으로 직접 확인해 주세요.' : '사진 각도·머리카락에 따라 달라질 수 있는 추정이에요. 직접 보고 바꿔 주세요.';
  return { id: probs[0].id, second: probs[1].id, probs, p, level, label, note, metrics: m };
}

// ---------- 시즌별 립 / 안경테 컬러 ----------
export const LIPS = {
  spring_light: { best: [c('피치', '#F4A582'), c('코랄 핑크', '#F28B82'), c('살몬 핑크', '#F59E8B'), c('라이트 코랄', '#F7A58C')], avoid: [c('버건디', '#6D1A36'), c('플럼', '#6E2A4F')], tip: '맑고 가벼운 피치·코랄 계열을 촉촉하게 바르면 생기 있어 보여요.' },
  spring_bright: { best: [c('코랄 레드', '#FF5A4E'), c('오렌지 레드', '#F0532A'), c('비비드 코랄', '#FF6F61'), c('토마토 레드', '#E8402A')], avoid: [c('모브', '#A98BA6'), c('브라운 누드', '#9C6B5A')], tip: '선명한 코랄·오렌지 레드가 잘 어울려요. 탁한 색은 입술이 칙칙해 보일 수 있어요.' },
  summer_light: { best: [c('베이비 핑크', '#F4A7B9'), c('로즈 핑크', '#E8879E'), c('라벤더 핑크', '#D99BC4'), c('딸기우유 핑크', '#F3B0C3')], avoid: [c('오렌지', '#F07F22'), c('브릭', '#A23E2A')], tip: '푸른기 도는 맑은 핑크 계열이 화사해 보여요.' },
  summer_mute: { best: [c('말린 장미', '#B76E79'), c('로즈 MLBB', '#C08081'), c('모브 핑크', '#B784A7'), c('더스티 로즈', '#C4919A')], avoid: [c('오렌지 코랄', '#FF7F50'), c('비비드 레드', '#E10600')], tip: '회색빛이 살짝 섞인 로즈·모브 계열이 차분하고 우아해 보여요.' },
  autumn_mute: { best: [c('누드 베이지', '#C68E73'), c('말린 코랄', '#C9765F'), c('브릭 베이지', '#B5654F'), c('테라코타', '#B8613F')], avoid: [c('핫핑크', '#FF3EA5'), c('푸시아', '#C21E78')], tip: '베이지·브릭이 섞인 차분한 웜 컬러가 자연스러워요.' },
  autumn_deep: { best: [c('브릭', '#A23E2A'), c('칠리 레드', '#9E2B25'), c('딥 브라운 레드', '#7B3226'), c('버건디 브라운', '#6B2E2E')], avoid: [c('베이비 핑크', '#F4A7B9'), c('라벤더', '#C9B8E6')], tip: '깊이 있는 브릭·칠리 계열이 고급스러워 보여요.' },
  winter_bright: { best: [c('체리 레드', '#C8102E'), c('푸시아', '#D6247A'), c('비비드 핑크', '#FF3E9A'), c('트루 레드', '#D7132E')], avoid: [c('오렌지', '#F28C28'), c('누드 베이지', '#C9A48A')], tip: '쨍한 체리 레드·푸시아처럼 선명한 쿨 컬러가 또렷해 보여요.' },
  winter_deep: { best: [c('버건디', '#6D1A36'), c('플럼', '#6E2A4F'), c('딥 레드', '#9B1B30'), c('와인', '#722F37')], avoid: [c('코랄', '#F7836B'), c('피치', '#FFC8A2')], tip: '버건디·플럼 같은 진한 쿨 컬러가 카리스마 있어 보여요.' },
};
export const FRAMES = {
  spring_light: { best: [c('라이트 골드 메탈', '#E3C87A'), c('샴페인 투명', '#EBDCC0'), c('밀크 브라운', '#B08A64'), c('코랄 핑크 투명', '#F2B8A8')], avoid: '진한 블랙 뿔테', tip: '가볍고 밝은 골드·투명 계열이 얼굴을 화사하게 해 줘요.' },
  spring_bright: { best: [c('샤이니 골드', '#D4AF37'), c('라이트 호피', '#C08A4D'), c('코랄 레드', '#FF5A4E'), c('클리어 브라운', '#C99B6D')], avoid: '무광 그레이·실버', tip: '광택 있는 골드와 생기 있는 컬러 포인트 테가 잘 어울려요.' },
  summer_light: { best: [c('실버', '#C0C4CC'), c('핑크 클리어', '#F1D3DC'), c('라벤더', '#C9B8E6'), c('그레이시 블루', '#9FB3C8')], avoid: '진한 갈색 뿔테·굵은 골드', tip: '실버·투명·파스텔 쿨톤 테가 맑은 인상을 살려 줘요.' },
  summer_mute: { best: [c('로즈 골드', '#C99A8B'), c('무광 실버', '#A7ADB6'), c('그레이 투명', '#B7B9BE'), c('모브 브라운', '#8E6F7A')], avoid: '비비드 컬러 테·새까만 블랙', tip: '로즈골드·무광 실버처럼 은은한 색이 부드러운 인상을 줘요.' },
  autumn_mute: { best: [c('무광 골드', '#B8995A'), c('카멜 뿔테', '#C19A6B'), c('카키 올리브', '#8A8550'), c('베이지 브라운', '#A8835F')], avoid: '광택 실버·블랙', tip: '무광 골드와 카멜·카키 뿔테가 자연스럽게 어울려요.' },
  autumn_deep: { best: [c('앤틱 골드', '#A88B4A'), c('다크 호피', '#5A3825'), c('다크 브라운', '#4E3426'), c('딥 올리브', '#5F6B2C')], avoid: '파스텔 투명·실버', tip: '앤틱 골드와 짙은 호피·브라운 뿔테가 깊이를 더해 줘요.' },
  winter_bright: { best: [c('블랙', '#111111'), c('유광 실버', '#D9DDE3'), c('클리어 투명', '#EEF2F6'), c('로열 블루', '#1F4FD8')], avoid: '베이지·카멜 뿔테', tip: '블랙·실버처럼 대비가 강한 테, 선명한 컬러 포인트가 잘 어울려요.' },
  winter_deep: { best: [c('블랙', '#111111'), c('건메탈', '#4A4D52'), c('다크 네이비', '#1C2541'), c('버건디', '#6D1A36')], avoid: '연한 골드·베이지 투명', tip: '블랙·건메탈·네이비처럼 진하고 차가운 색이 세련돼 보여요.' },
};

// ---------- 그림(SVG 경로: 화면과 PNG 모두 사용) ----------
// 눈썹: 120x40 영역의 중심선
export const BROW_PATHS = {
  natural: 'M8 30 Q58 8 112 24',
  angled: 'M8 31 L76 10 L112 24',
  straight: 'M8 25 Q60 17 112 23',
  soft: 'M8 31 C38 12 80 10 112 27',
  round: 'M10 33 Q60 -2 110 33',
  long: 'M4 30 C40 12 78 10 118 30',
};
// 안경 렌즈 하나(가로 0~44, 세로 0~30 상자) 경로
const LENS = {
  square: 'M2 4 H42 V27 H2 Z',
  wellington: 'M1 3 H43 L40 27 H4 Z',
  boston: 'M2 4 H42 Q44 28 22 28 Q0 28 2 4 Z',
  round: 'M22 1 A14 14 0 1 1 21.9 1 Z',
  oval: 'M22 4 A21 12 0 1 1 21.9 4 Z',
  cateye: 'M1 2 Q22 6 43 2 Q42 26 22 27 Q4 26 1 2 Z',
  browline: 'M2 4 H42 Q42 27 22 27 Q2 27 2 4 Z',
  rimless: 'M3 6 Q22 3 41 6 Q42 26 22 26 Q2 26 3 6 Z',
};
export function glassesPaths(shape) {
  const l = LENS[shape] || LENS.square;
  return { left: l, offsetR: 52, bridge: 'M44 12 Q48 8 52 12', thickTop: shape === 'browline', dashed: shape === 'rimless' };
}
export function glassesSvg(shape, color = '#2a2433') {
  const g = glassesPaths(shape), dash = g.dashed ? ' stroke-dasharray="4 3"' : '';
  const top = g.thickTop ? `<path d="M2 4 H42" stroke-width="6"/><path d="M54 4 H94" stroke-width="6"/>` : '';
  return `<svg viewBox="-2 -2 100 34" class="gl" aria-hidden="true"><g fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round"${dash}><path d="${g.left}"/><path d="${g.left}" transform="translate(${g.offsetR} 0)"/><path d="${g.bridge}"/>${top}</g></svg>`;
}
export function browSvg(kind, color = '#4a3a30') {
  return `<svg viewBox="0 0 120 40" class="brow" aria-hidden="true"><path d="${BROW_PATHS[kind]}" fill="none" stroke="${color}" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}
