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

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, (a.z || 0) - (b.z || 0));
function angleAt(o, a, b) {
  const v1 = [a.x - o.x, a.y - o.y, (a.z || 0) - (o.z || 0)], v2 = [b.x - o.x, b.y - o.y, (b.z || 0) - (o.z || 0)];
  const cs = (v1[0] * v2[0] + v1[1] * v2[1] + v1[2] * v2[2]) / (Math.hypot(...v1) * Math.hypot(...v2));
  return (Math.acos(Math.max(-1, Math.min(1, cs))) * 180) / Math.PI;
}
// MediaPipe Face Mesh 랜드마크(정규화 좌표) → 얼굴형 특징.
// v1.5: 3차원 좌표(z 포함)로 재서 고개 돌림·숙임 영향을 줄임. W,H로 실제 비율 복원 (z는 x와 같은 축척)
export function faceMetrics(lm, W = 1, H = 1) {
  if (!lm || lm.length < 468) return null;
  const P = (i) => ({ x: lm[i].x * W, y: lm[i].y * H, z: (lm[i].z || 0) * W });
  const cheek = dist(P(234), P(454));
  if (!(cheek > 0)) return null;
  const len = dist(P(10), P(152));
  const fore = dist(P(54), P(284)), jaw = dist(P(172), P(397));
  const chin = angleAt(P(152), P(172), P(397));
  const nose = P(1), flat = (q) => ({ x: q.x, y: q.y });
  const yaw = Math.abs(dist(flat(nose), flat(P(234))) - dist(flat(nose), flat(P(454)))) / Math.hypot(P(234).x - P(454).x, P(234).y - P(454).y);
  const pitch = (Math.atan2(P(152).z - P(10).z, P(152).y - P(10).y) * 180) / Math.PI; // 고개 숙임/듦 (정면 사진 평균 약 +5°)
  return { ratio: len / cheek, fore: fore / cheek, jaw: jaw / cheek, chin, yaw, pitch };
}
// v1.5 얼굴형 판정: '상대 점수' 방식.
// 얼굴 메시 모델은 사람마다 폭 비율 차이가 작게 나와서(표준편차 약 0.02), 교과서식 절대 기준값으로 비교하면
// 거의 모두 가운데(계란형/둥근형)로 몰렸음. → 정면 인물 사진 59장(공개 사진, 한국인 포함)에서 잰 평균·표준편차로
// 각 값을 표준점수(z)로 바꾼 뒤, 얼굴형별 '특징 방향'에 가장 가까운 것을 고름. 계란형 = 모든 값이 평균 근처일 때만.
export const FACE_NORM = { mean: { ratio: 1.195, fore: 0.849, jaw: 0.808, chin: 92.7 }, sd: { ratio: 0.067, fore: 0.022, jaw: 0.022, chin: 2.9 } };
const FEATS = ['ratio', 'fore', 'jaw', 'chin'];
// 표준점수 기준 특징 (길이/광대폭, 이마폭, 턱폭, 턱끝 각도: +는 크다/뭉툭하다)
const PROTO_Z = {
  oval: { ratio: 0, fore: 0, jaw: 0, chin: 0 },
  round: { ratio: -1.2, fore: 0, jaw: 0.4, chin: 0.9 },
  long: { ratio: 1.4, fore: 0.2, jaw: -0.2, chin: -0.8 },
  square: { ratio: -0.6, fore: 0.3, jaw: 1.3, chin: 0.9 },
  heart: { ratio: 0.2, fore: 1.2, jaw: -1.1, chin: -0.6 },
  diamond: { ratio: 0.3, fore: -1.2, jaw: -0.9, chin: -0.5 },
};
export function faceZ(m) { const z = {}; for (const k of FEATS) z[k] = Math.max(-3, Math.min(3, (m[k] - FACE_NORM.mean[k]) / FACE_NORM.sd[k])); return z; }
export function classifyFaceShape(m) {
  if (!m || !FEATS.every((k) => Number.isFinite(m[k]))) return null;
  const z = faceZ(m);
  const sc = FACE_ORDER.map((id) => { let s = 0; for (const k of FEATS) s += (z[k] - PROTO_Z[id][k]) ** 2; return { id, s: -s / 2 }; });
  const mx = Math.max(...sc.map((x) => x.s)); const ex = sc.map((x) => ({ id: x.id, e: Math.exp(x.s - mx) })); const Z = ex.reduce((a, x) => a + x.e, 0);
  const probs = ex.map((x) => ({ id: x.id, p: x.e / Z })).sort((a, b) => b.p - a.p);
  let p = probs[0].p; const turned = m.yaw > 0.15, tilted = Number.isFinite(m.pitch) && Math.abs(m.pitch - 5) > 22; if (turned || tilted) p *= 0.7;
  const close = probs[1].p >= probs[0].p * 0.6; // 두 후보가 비슷하면 함께 보여 줌
  const level = close ? 'low' : p >= 0.55 ? 'high' : p >= 0.4 ? 'mid' : 'low';
  const label = { high: '비교적 뚜렷', mid: '보통', low: '애매' }[level];
  const note = turned ? '얼굴이 옆으로 돌아가 있어 정확도가 낮아요. 정면 기준으로 직접 확인해 주세요.'
    : tilted ? '고개가 숙여지거나 들려 있어 정확도가 낮아요. 정면 기준으로 직접 확인해 주세요.'
    : close ? `${FACE_SHAPES[probs[0].id].name}과 ${FACE_SHAPES[probs[1].id].name}의 중간에 가까워요. 직접 보고 골라 주세요.`
    : '사진 각도·머리카락에 따라 달라질 수 있는 추정이에요. 직접 보고 바꿔 주세요.';
  return { id: probs[0].id, second: probs[1].id, close, probs, p, level, label, note, metrics: m, z };
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

// ---------- v1.5 헤어: 시즌별 헤어 컬러 · 얼굴형별 헤어스타일 (일반적인 스타일링 가이드 기반 '제안') ----------
export const HAIR_COLORS = {
  spring_light: { best: [c('밀크브라운', '#A07850'), c('허니브라운', '#A86B32'), c('골드브라운', '#9A6A2F'), c('라이트 카멜', '#B88A5A')], avoid: [c('블루블랙', '#16182A'), c('애쉬그레이', '#8A8A8E')], tip: '노란기 있는 밝은 브라운이 피부를 화사하게 해 줘요.' },
  spring_bright: { best: [c('오렌지브라운', '#9A4F22'), c('골드브라운', '#8F5E2A'), c('코퍼브라운', '#8C4A2F'), c('카라멜브라운', '#8A5A35')], avoid: [c('애쉬그레이', '#7F8084'), c('매트 카키', '#5F5A45')], tip: '윤기 있고 따뜻한 브라운이 생기를 살려 줘요.' },
  summer_light: { best: [c('애쉬브라운', '#7E6F66'), c('밀크애쉬', '#9C8E86'), c('라벤더애쉬', '#8D7F8E'), c('로즈브라운', '#7F5E5A')], avoid: [c('오렌지브라운', '#9A4F22'), c('골드브라운', '#8F5E2A')], tip: '붉은기·노란기를 줄인 부드러운 애쉬 계열이 맑아 보여요.' },
  summer_mute: { best: [c('애쉬브라운', '#6E625C'), c('모카브라운', '#6B5446'), c('그레이지', '#857B73'), c('로즈브라운', '#74524E')], avoid: [c('오렌지브라운', '#9A4F22'), c('블루블랙', '#16182A')], tip: '회색빛이 살짝 도는 차분한 브라운이 부드러운 인상을 줘요.' },
  autumn_mute: { best: [c('카키브라운', '#5E5236'), c('초코브라운', '#4E3427'), c('모카브라운', '#6B5446'), c('올리브브라운', '#5A5038')], avoid: [c('애쉬그레이', '#7F8084'), c('핑크브라운', '#8A5A5E')], tip: '카키·초코처럼 차분하고 따뜻한 브라운이 자연스러워요.' },
  autumn_deep: { best: [c('다크초코', '#3B2A20'), c('마호가니브라운', '#4E2A22'), c('카키브라운', '#4F4530'), c('다크브라운', '#33251C')], avoid: [c('밀크애쉬', '#9C8E86'), c('핑크브라운', '#8A5A5E')], tip: '깊고 진한 웜 브라운이 고급스러워 보여요.' },
  winter_bright: { best: [c('블루블랙', '#14161F'), c('내추럴블랙', '#1C1C1C'), c('버건디브라운', '#4A1E26'), c('다크애쉬브라운', '#3A3533')], avoid: [c('골드브라운', '#8F5E2A'), c('오렌지브라운', '#9A4F22')], tip: '선명한 블랙·버건디처럼 대비가 강한 색이 또렷해 보여요.' },
  winter_deep: { best: [c('블루블랙', '#14161F'), c('다크버건디', '#3E1720'), c('다크애쉬브라운', '#33302E'), c('쿨 다크브라운', '#2E2624')], avoid: [c('허니브라운', '#A86B32'), c('카라멜브라운', '#8A5A35')], tip: '진하고 차가운 블랙·다크 컬러가 세련돼 보여요.' },
};
// 그림: 100x110 상자. back = 얼굴 뒤 머리, front = 앞머리 (얼굴 위)
export const HAIR_STYLES = {
  // 여성
  pixie: { name: '숏컷(픽시)', len: '짧은 머리', desc: '귀가 보이는 짧은 길이에 윗머리 볼륨', back: 'M26 58 Q20 26 50 20 Q80 26 74 58 L70 46 L30 46 Z', front: 'M27 52 Q25 24 52 22 Q76 25 73 50 Q68 36 56 34 Q44 40 27 52 Z' },
  bob_layer: { name: '레이어드 단발', len: '짧은 머리', desc: '턱선 아래 길이에 층을 넣어 가볍게', back: 'M23 82 Q16 28 50 22 Q84 28 77 82 Q71 86 67 80 L66 52 L34 52 L33 80 Q29 86 23 82 Z', front: 'M28 54 Q28 27 50 26 Q72 27 72 54 Q64 39 50 37 Q38 39 28 54 Z' },
  bob_c: { name: '볼륨 C컬 단발', len: '짧은 머리', desc: '끝을 안쪽으로 말아 턱 주변에 볼륨', back: 'M21 78 Q14 27 50 22 Q86 27 79 78 Q78 90 66 86 Q73 78 70 60 L30 60 Q27 78 34 86 Q22 90 21 78 Z', front: 'M28 54 Q29 26 54 25 Q74 27 72 52 Q62 36 46 37 Q34 41 28 54 Z' },
  bob_bang: { name: '앞머리 단발', len: '짧은 머리', desc: '눈썹 근처 앞머리로 세로 길이를 줄여요', back: 'M23 82 Q16 28 50 22 Q84 28 77 82 L67 82 L66 52 L34 52 L33 82 Z', front: 'M27 49 Q27 25 50 24 Q73 25 73 49 Q50 45 27 49 Z' },
  hush: { name: '허쉬컷', len: '중간 길이', desc: '어깨 길이 레이어드 + 커튼 앞머리', back: 'M21 96 Q12 28 50 22 Q88 28 79 96 Q75 90 71 96 Q69 70 66 52 L34 52 Q31 70 29 96 Q25 90 21 96 Z', front: 'M28 58 Q29 27 50 26 Q71 27 72 58 Q63 36 50 35 Q37 36 28 58 Z' },
  lob_layer: { name: '레이어드 중단발', len: '중간 길이', desc: '쇄골 길이, 옆 볼륨을 살린 층', back: 'M20 92 Q12 28 50 22 Q88 28 80 92 Q74 96 70 90 Q70 66 66 52 L34 52 Q30 66 30 90 Q26 96 20 92 Z', front: 'M28 54 Q30 26 52 25 Q72 27 72 50 Q60 34 40 40 Q32 44 28 54 Z' },
  lob_side: { name: '사이드뱅 중단발', len: '중간 길이', desc: '옆으로 넘긴 긴 앞머리로 얼굴선 보완', back: 'M22 94 Q13 28 50 22 Q87 28 78 94 L69 94 Q68 68 66 52 L34 52 Q32 68 31 94 Z', front: 'M27 62 Q26 26 54 24 Q75 27 73 50 Q58 32 42 44 Q32 52 27 62 Z' },
  long_layer: { name: '레이어드 롱', len: '긴 머리', desc: '긴 머리에 얼굴 주변 층으로 세로 라인', back: 'M22 108 Q12 30 50 22 Q88 30 78 108 L68 108 Q68 70 66 52 L34 52 Q32 70 32 108 Z', front: 'M28 56 Q30 26 50 25 Q70 26 72 56 Q66 33 50 30 Q34 33 28 56 Z' },
  long_wave: { name: '굵은 웨이브 롱(빌드펌)', len: '긴 머리', desc: '굵은 웨이브로 옆 볼륨을 더해요', back: 'M21 108 Q13 92 19 78 Q11 62 19 46 Q23 22 50 22 Q77 22 81 46 Q89 62 81 78 Q87 92 79 108 L68 108 Q72 92 67 80 Q71 66 66 52 L34 52 Q29 66 33 80 Q28 92 32 108 Z', front: 'M28 54 Q30 26 50 25 Q70 26 72 54 Q64 34 50 32 Q36 34 28 54 Z' },
  long_seethrough: { name: '시스루뱅 롱', len: '긴 머리', desc: '가벼운 시스루 앞머리로 이마·광대 균형', back: 'M22 108 Q12 30 50 22 Q88 30 78 108 L68 108 Q68 70 66 52 L34 52 Q32 70 32 108 Z', front: 'M28 50 Q29 25 50 24 Q71 25 72 50 Q66 42 60 44 L58 40 L54 45 L50 40 L46 45 L42 40 L40 44 Q34 42 28 50 Z' },
  hippie: { name: '히피펌', len: '긴 머리', desc: '아래쪽에 볼륨이 큰 잔웨이브', back: 'M22 104 Q12 100 16 90 Q8 82 15 72 Q10 60 18 50 Q20 22 50 22 Q80 22 82 50 Q90 60 85 72 Q92 82 84 90 Q88 100 78 104 Q72 108 68 102 Q70 74 66 52 L34 52 Q30 74 32 102 Q28 108 22 104 Z', front: 'M28 54 Q30 26 50 25 Q70 26 72 54 Q64 34 50 32 Q36 34 28 54 Z' },
  // 남성
  crop: { name: '크롭컷', len: '짧은 머리', desc: '짧은 일자 앞머리, 이마를 살짝 덮어 세로 길이 감소', back: 'M27 50 Q25 24 50 22 Q75 24 73 50 L71 42 L29 42 Z', front: 'M28 44 Q28 25 50 24 Q72 25 72 44 L72 41 Q50 39 28 41 Z' },
  dandy: { name: '댄디컷', len: '짧은 머리', desc: '앞머리를 자연스럽게 내린 단정한 컷', back: 'M26 54 Q24 23 50 21 Q76 23 74 54 L72 44 L28 44 Z', front: 'M27 49 Q27 25 50 24 Q73 25 73 49 Q62 42 50 44 Q38 42 27 49 Z' },
  ivy: { name: '아이비리그컷', len: '짧은 머리', desc: '짧은 옆머리, 살짝 올린 앞머리로 이마 노출', back: 'M28 48 Q27 23 50 22 Q73 23 72 48 L70 40 L30 40 Z', front: 'M28 42 Q28 22 52 21 Q72 23 72 40 Q64 30 54 31 Q40 33 28 42 Z' },
  pomade: { name: '포마드(사이드 파트)', len: '짧은 머리', desc: '옆 가르마로 넘겨 윗볼륨을 세운 스타일', back: 'M27 48 Q26 20 50 18 Q74 20 73 48 L71 40 L29 40 Z', front: 'M27 44 Q25 18 52 16 Q76 18 73 44 Q70 30 58 26 L42 27 Q31 32 27 44 Z' },
  regent: { name: '리젠트', len: '짧은 머리', desc: '앞머리를 높게 세워 세로 라인 강조', back: 'M27 48 Q24 18 50 15 Q76 18 73 48 L71 40 L29 40 Z', front: 'M27 44 Q22 14 50 11 Q80 14 73 44 Q68 25 50 24 Q33 26 27 44 Z' },
  part: { name: '가르마펌', len: '중간 길이', desc: '이마를 일부 드러내는 가르마 + 부드러운 컬', back: 'M25 60 Q22 22 48 20 Q78 21 75 60 L72 46 L28 46 Z', front: 'M27 54 Q25 23 46 21 Q75 21 73 52 Q67 36 54 31 Q47 38 40 40 Q32 44 27 54 Z' },
  as: { name: '애즈펌', len: '중간 길이', desc: '앞머리를 C컬로 내려 이마를 자연스럽게 가림', back: 'M25 60 Q22 22 50 20 Q78 22 75 60 L72 46 L28 46 Z', front: 'M27 54 Q26 23 50 21 Q74 23 73 54 Q67 43 57 41 Q51 48 45 41 Q34 43 27 54 Z' },
  shadow: { name: '쉐도우펌', len: '중간 길이', desc: '자연스러운 웨이브로 부드러운 볼륨', back: 'M24 62 Q19 22 50 19 Q81 22 76 62 L72 46 L28 46 Z', front: 'M27 52 Q22 22 50 19 Q78 22 73 52 Q70 40 64 42 Q62 34 54 38 Q50 30 44 37 Q36 34 34 42 Q30 40 27 52 Z' },
  leaf: { name: '리프컷', len: '긴 머리', desc: '귀를 덮는 옆머리와 넘긴 앞머리', back: 'M23 72 Q17 23 50 20 Q83 23 77 72 L72 72 L70 50 L30 50 L28 72 Z', front: 'M27 58 Q26 23 52 21 Q75 24 73 54 Q62 34 44 40 Q33 46 27 58 Z' },
  wolf: { name: '울프컷', len: '긴 머리', desc: '목선까지 내려오는 가벼운 층', back: 'M22 88 Q14 22 50 19 Q86 22 78 88 L74 80 L71 88 L69 52 L31 52 L29 88 L26 80 Z', front: 'M27 54 Q25 22 50 21 Q75 22 73 54 L68 44 L62 48 L56 42 L50 48 L44 42 L38 48 L32 44 Z' },
};
export const HAIR_REC = {
  oval: {
    f: { styles: ['pixie', 'hush', 'long_layer'], avoid: '얼굴을 지나치게 가리는 무거운 일자 앞머리', tip: '대부분의 스타일이 잘 어울려요. 얼굴선을 살짝 드러내면 균형이 돋보여요.' },
    m: { styles: ['pomade', 'part', 'wolf'], avoid: '지나치게 높은 윗볼륨으로 얼굴이 길어 보이는 스타일', tip: '대부분의 스타일이 잘 어울려요. 이마를 조금 드러내면 깔끔해 보여요.' },
  },
  round: {
    f: { styles: ['bob_layer', 'lob_side', 'long_layer'], avoid: '턱선 길이의 둥근 일자 단발, 옆으로 부풀린 볼륨', tip: '정수리에 볼륨, 얼굴 옆은 가볍게 하고 턱선보다 긴 길이로 세로 라인을 만들어요.' },
    m: { styles: ['regent', 'shadow', 'wolf'], avoid: '옆머리를 부풀린 스타일, 이마를 다 덮는 둥근 앞머리', tip: '윗머리를 세우고 옆머리는 짧게 정리하면 얼굴이 갸름해 보여요.' },
  },
  long: {
    f: { styles: ['bob_bang', 'lob_layer', 'long_wave'], avoid: '정수리 볼륨이 높은 스타일, 앞머리 없는 긴 생머리', tip: '앞머리로 세로 길이를 줄이고, 옆 볼륨을 더하면 얼굴이 짧아 보여요.' },
    m: { styles: ['crop', 'as', 'leaf'], avoid: '앞머리를 높게 세운 리젠트·포마드', tip: '앞머리를 내려 이마를 가리고 옆머리에 볼륨을 주면 균형이 맞아요.' },
  },
  square: {
    f: { styles: ['bob_layer', 'hush', 'long_wave'], avoid: '턱선에서 딱 끊기는 일자 단발, 각진 블런트컷', tip: '턱선 아래 길이에 부드러운 웨이브·층을 넣으면 턱 각이 부드러워 보여요.' },
    m: { styles: ['dandy', 'shadow', 'leaf'], avoid: '옆을 짧게 각지게 친 스타일 + 각진 윗머리', tip: '웨이브·컬처럼 곡선이 있는 스타일이 각진 턱선을 부드럽게 해 줘요.' },
  },
  heart: {
    f: { styles: ['bob_c', 'lob_side', 'hippie'], avoid: '정수리 볼륨이 큰 업스타일, 이마를 다 드러낸 묶음', tip: '턱 주변에 볼륨을 주고 앞머리로 이마를 살짝 가리면 균형이 맞아요.' },
    m: { styles: ['dandy', 'part', 'leaf'], avoid: '넓은 이마를 모두 드러낸 올백', tip: '앞머리로 이마를 일부 가리고 아래쪽은 가볍게 하면 자연스러워요.' },
  },
  diamond: {
    f: { styles: ['bob_bang', 'hush', 'long_seethrough'], avoid: '광대 옆으로 볼륨이 큰 스타일, 이마를 다 드러낸 올림머리', tip: '앞머리로 이마를 채우고 광대 옆은 차분하게, 턱 주변엔 볼륨을 주면 좋아요.' },
    m: { styles: ['crop', 'as', 'leaf'], avoid: '옆을 아주 짧게 친 투블럭 + 높은 윗볼륨', tip: '앞머리를 내리고 옆머리를 너무 짧지 않게 두면 광대가 덜 도드라져요.' },
  },
};
export const HAIR_GENDERS = { f: '여성', m: '남성' };
export function hairSvg(id, color = '#3b2b25') {
  const h = HAIR_STYLES[id];
  return `<svg viewBox="0 0 100 110" class="hairsvg" aria-hidden="true"><path d="M20 110 Q50 92 80 110 Z" fill="#d9cfc6"/><rect x="43" y="80" width="14" height="20" fill="#ecd2bf"/><path d="${h.back}" fill="${color}"/><ellipse cx="50" cy="58" rx="22" ry="28" fill="#f3dccb" stroke="#d8bba6" stroke-width="1"/><path d="${h.front}" fill="${color}"/></svg>`;
}
