// 결과 카드 PNG 렌더러 (색과 글자만, 얼굴 사진 없음)
import { hexToRgb } from './color.js';
import { drawQr } from './qrcard.js';
import { FACE_SHAPES, GLASS_SHAPES, LIPS, FRAMES, BROW_PATHS, glassesPaths, HAIR_COLORS, HAIR_STYLES, HAIR_REC, HAIR_GENDERS } from './style.js';
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR','Nanum Gothic',sans-serif";
const textColor = (hex) => { const [r, g, b] = hexToRgb(hex); return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#2a2433' : '#ffffff'; };

function wrap(ctx, text, maxW) {
  // 단어(띄어쓰기) 단위 줄바꿈, 너무 긴 단어만 글자 단위로 자름
  const out = []; let line = '';
  for (const word of text.split(' ')) {
    const t = line ? line + ' ' + word : word;
    if (ctx.measureText(t).width <= maxW) { line = t; continue; }
    if (line) out.push(line);
    line = '';
    for (const ch of word) { if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch; } else line += ch; }
  }
  if (line) out.push(line); return out;
}
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

export function renderCardCanvas(canvas, r) {
  const S = r.season, W = 1080, P = 72;
  const ctx = canvas.getContext('2d');
  // 높이 계산을 위해 한 번 측정
  const draw = (measureOnly) => {
    let y = 0;
    const accent = S.best[4].hex;
    if (!measureOnly) {
      ctx.fillStyle = '#fbf8f4'; ctx.fillRect(0, 0, W, canvas.height);
      const g = ctx.createLinearGradient(0, 0, W, 0); S.best.slice(0, 6).forEach((c, i) => g.addColorStop(i / 5, c.hex));
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, 28);
    }
    y = 110;
    ctx.textBaseline = 'alphabetic';
    ctx.font = `600 34px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#7a6f86'; ctx.fillText('나의 퍼스널컬러', P, y); }
    y += 90; ctx.font = `800 84px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText(S.name, P, y); }
    y += 58; ctx.font = `500 34px ${FONT}`;
    if (!measureOnly) { ctx.fillStyle = '#7a6f86'; ctx.fillText(`${S.short} · ${S.keywords.join(' · ')}`, P, y); }
    y += 36; ctx.font = `400 34px ${FONT}`;
    for (const ln of wrap(ctx, S.desc, W - 2 * P)) { y += 50; if (!measureOnly) { ctx.fillStyle = '#3d3547'; ctx.fillText(ln, P, y); } }
    // 베스트 컬러 12
    y += 80; ctx.font = `700 40px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText('베스트 컬러', P, y); }
    y += 30; const cols = 4, gap = 20, sw = (W - 2 * P - gap * (cols - 1)) / cols, sh = 150;
    S.best.forEach((c, i) => {
      const x = P + (i % cols) * (sw + gap), yy = y + Math.floor(i / cols) * (sh + gap);
      if (!measureOnly) { ctx.fillStyle = c.hex; rr(ctx, x, yy, sw, sh, 18); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = textColor(c.hex); ctx.font = `600 26px ${FONT}`; ctx.fillText(c.name, x + 16, yy + sh - 46); ctx.font = `400 22px ${FONT}`; ctx.fillText(c.hex.toUpperCase(), x + 16, yy + sh - 16); }
    });
    y += 3 * (sh + gap) + 50;
    ctx.font = `700 40px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText('피하면 좋은 컬러', P, y); }
    y += 30; const aw = (W - 2 * P - 5 * 16) / 6, ah = 96;
    S.avoid.forEach((c, i) => { const x = P + i * (aw + 16); if (!measureOnly) { ctx.fillStyle = c.hex; rr(ctx, x, y, aw, ah, 14); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.stroke();
      ctx.fillStyle = '#5b5266'; ctx.font = `500 21px ${FONT}`; ctx.textAlign = 'center';
      wrap(ctx, c.name, aw).slice(0, 2).forEach((ln, k) => ctx.fillText(ln, x + aw / 2, y + ah + 32 + k * 26)); ctx.textAlign = 'left'; } });
    y += ah + 76;
    for (const [t, v] of [['메이크업', S.makeup], ['헤어', S.hair], ['액세서리', S.acc]]) {
      y += 70; ctx.font = `700 34px ${FONT}`; if (!measureOnly) { ctx.fillStyle = accent; rr(ctx, P, y - 30, 10, 36, 4); ctx.fill(); ctx.fillStyle = '#2a2433'; ctx.fillText(t, P + 26, y); }
      ctx.font = `400 31px ${FONT}`;
      for (const ln of wrap(ctx, v, W - 2 * P - 26)) { y += 46; if (!measureOnly) { ctx.fillStyle = '#3d3547'; ctx.fillText(ln, P + 26, y); } }
    }
    // v1.6: 코디 색 조합 · 자주 언급되는 예시
    if (r.outfits?.length) {
      y += 96; ctx.font = `700 40px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText('코디 색 조합', P, y); }
      y += 24; const ow = (W - 2 * P - 2 * 24) / 3;
      r.outfits.forEach((x, i) => { if (measureOnly) return; drawOutfit(ctx, x, P + i * (ow + 24), y, ow, 1); });
      y += 340;
    }
    if (r.celebs?.length) {
      y += 40; ctx.font = `600 30px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText(`같은 타입으로 자주 언급되는 예시(참고): ${r.celebs.join(', ')}`, P, y); }
      y += 36; ctx.font = `400 24px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#8a8094'; ctx.fillText('공식 진단이 아니며 출처마다 다르게 분류되기도 해요.', P, y); }
      y += 30;
    }
    // ---------- 립 · 안경 · 눈썹 추천 ----------
    const F = r.faceId ? FACE_SHAPES[r.faceId] : null, L = LIPS[r.id], G = FRAMES[r.id];
    const head = (t) => { y += 96; ctx.font = `700 40px ${FONT}`; if (!measureOnly) { ctx.fillStyle = '#2a2433'; ctx.fillText(t, P, y); } };
    const para = (t, size = 30, color = '#3d3547', indent = 0) => { ctx.font = `400 ${size}px ${FONT}`; for (const ln of wrap(ctx, t, W - 2 * P - indent)) { y += size + 14; if (!measureOnly) { ctx.fillStyle = color; ctx.fillText(ln, P + indent, y); } } };
    const chips = (list, d = 120) => { // 동그란 색 + 이름
      y += 26; const gap = (W - 2 * P - list.length * d) / Math.max(1, list.length - 1), step = Math.min(d + gap, d + 120);
      list.forEach((c, i) => { const x = P + i * step; if (!measureOnly) { ctx.fillStyle = c.hex; ctx.beginPath(); ctx.arc(x + d / 2, y + d / 2, d / 2, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = '#3d3547'; ctx.font = `600 25px ${FONT}`; ctx.textAlign = 'center'; wrap(ctx, c.name, step - 8).slice(0, 2).forEach((ln, k) => ctx.fillText(ln, x + d / 2, y + d + 36 + k * 30)); ctx.textAlign = 'left'; } });
      y += d + 70;
    };
    y += 10; ctx.font = `600 30px ${FONT}`;
    if (!measureOnly) { ctx.fillStyle = '#5b3f8f'; ctx.fillText(`얼굴형: ${F ? F.name : '선택 안 함'}${F ? (r.face && r.face.id === r.faceId ? ' (자동 추정)' : ' (직접 선택)') : ''}`, P, y + 40); }
    y += 40;
    head('립 컬러 추천'); chips(L.best); para(`피하면 좋은 립: ${L.avoid.map((c) => c.name).join(', ')}  ·  ${L.tip}`, 28, '#5b5266');
    head('안경테 컬러'); chips(G.best); para(`${G.tip} 피하면 좋은 테: ${G.avoid}`, 28, '#5b5266');
    if (F) {
      head(`안경테 모양 · ${F.name}`);
      y += 24; const bw = (W - 2 * P) / 3;
      F.glasses.forEach((g, i) => { if (measureOnly) return; const gp = glassesPaths(g), x = P + i * bw + (bw - 288) / 2, k = 3;
        ctx.save(); ctx.translate(x, y + 6); ctx.scale(k, k); ctx.strokeStyle = '#2a2433'; ctx.lineWidth = 3; ctx.lineJoin = 'round'; if (gp.dashed) ctx.setLineDash([4, 3]);
        ctx.stroke(new Path2D(gp.left)); ctx.save(); ctx.translate(gp.offsetR, 0); ctx.stroke(new Path2D(gp.left)); ctx.restore(); ctx.stroke(new Path2D(gp.bridge));
        if (gp.thickTop) { ctx.lineWidth = 6; ctx.stroke(new Path2D('M2 4 H42 M54 4 H94')); } ctx.restore();
        ctx.fillStyle = '#2a2433'; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(GLASS_SHAPES[g], P + i * bw + bw / 2, y + 140); ctx.textAlign = 'left'; });
      y += 150; para(F.glassesTip, 28, '#5b5266');
      head(`눈썹 모양 · ${F.browName}`);
      y += 20; if (!measureOnly) { ctx.save(); ctx.translate(P, y); ctx.scale(2.4, 2.4); ctx.strokeStyle = S.tone === '웜' ? '#6b4a32' : '#4d4646'; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.stroke(new Path2D(BROW_PATHS[F.brow])); ctx.restore(); }
      const by = y; y += 10; ctx.font = `400 28px ${FONT}`;
      for (const ln of wrap(ctx, F.browTip, W - 2 * P - 320)) { y += 42; if (!measureOnly) { ctx.fillStyle = '#3d3547'; ctx.fillText(ln, P + 320, y); } }
      y = Math.max(y, by + 100);
    } else { head('안경테 모양 · 눈썹 모양'); para('얼굴형을 선택하면 맞춤 추천을 함께 저장해요.', 28, '#5b5266'); }
    // ---------- v1.5 헤어 ----------
    const HC = HAIR_COLORS[r.id], g = r.hairGender === 'm' ? 'm' : 'f';
    head('헤어 컬러'); chips(HC.best); para(`${HC.tip} 피하면 좋은 색: ${HC.avoid.map((c) => c.name).join(', ')}`, 28, '#5b5266');
    if (F) {
      const H = HAIR_REC[r.faceId][g]; head(`헤어스타일 · ${F.name} · ${HAIR_GENDERS[g]}`);
      y += 20; const bw = (W - 2 * P) / 3, k = 2.2;
      H.styles.forEach((id, i) => { if (measureOnly) return; const hs = HAIR_STYLES[id], x = P + i * bw + (bw - 100 * k) / 2;
        ctx.save(); ctx.translate(x, y); ctx.scale(k, k);
        ctx.fillStyle = '#d9cfc6'; ctx.fill(new Path2D('M20 110 Q50 92 80 110 Z')); ctx.fillStyle = '#ecd2bf'; ctx.fillRect(43, 80, 14, 20);
        ctx.fillStyle = HC.best[1].hex; ctx.fill(new Path2D(hs.back));
        ctx.fillStyle = '#f3dccb'; ctx.beginPath(); ctx.ellipse(50, 58, 22, 28, 0, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#d8bba6'; ctx.lineWidth = 1; ctx.stroke();
        ctx.fillStyle = HC.best[1].hex; ctx.fill(new Path2D(hs.front)); ctx.restore();
        ctx.textAlign = 'center'; ctx.fillStyle = '#2a2433'; ctx.font = `700 28px ${FONT}`; ctx.fillText(hs.name, P + i * bw + bw / 2, y + 110 * k + 40);
        ctx.fillStyle = '#5b3f8f'; ctx.font = `600 24px ${FONT}`; ctx.fillText(hs.len, P + i * bw + bw / 2, y + 110 * k + 74); ctx.textAlign = 'left'; });
      y += 110 * k + 90; para(`${H.tip} 피하면 좋은 스타일: ${H.avoid}`, 28, '#5b5266');
    } else { head('헤어스타일'); para('얼굴형을 선택하면 맞춤 헤어스타일 추천을 함께 저장해요.', 28, '#5b5266'); }
    y += 70; ctx.font = `500 26px ${FONT}`;
    // v1.6: 결과 보기 QR(오른쪽) + 주소. QR에는 타입 코드만 담긴 주소(#r=…)가 들어감
    const qs = r.url ? 190 : 0, tw = W - 2 * P - (qs ? qs + 30 : 0), y0 = y - 30;
    const foot = [`두 번째 후보: ${r.second.name} · 신뢰도 ${r.conf.label} · ${r.method}`, ...wrap(ctx, `${r.date} · 카메라·조명에 따라 달라질 수 있는 추정이며, 추천은 스타일링 제안이에요.`, tw)];
    if (r.url) foot.push('QR을 찍으면 이 결과를 다시 볼 수 있어요.', shortUrl(r.appUrl || r.url));
    for (const ln of foot) { if (!measureOnly) { ctx.fillStyle = '#8a8094'; ctx.fillText(ln, P, y); } y += 40; }
    if (qs && !measureOnly) drawQr(ctx, r.url, W - P - qs, y0, qs, 2);
    return Math.max(y, y0 + qs + 20) + 40;
  };
  canvas.width = W; canvas.height = 10;
  const H = Math.ceil(draw(true));
  canvas.width = W; canvas.height = H;
  draw(false);
  return canvas;
}

const shortUrl = (u) => String(u || '').replace(/^https?:\/\//, '').replace(/#.*$/, '').replace(/\/$/, '');
// 코디 블록: 상의(위)·하의(아래) 실루엣 색 + 포인트 원 + 글자
function drawOutfit(ctx, o, x, y, w, scale = 1) {
  const k = scale;
  ctx.fillStyle = '#f6f1ec'; rr(ctx, x, y, w, 300 * k, 18 * k); ctx.fill();
  const cx = x + w / 2;
  // 상의 (티셔츠 실루엣)
  ctx.fillStyle = o.top.hex; ctx.beginPath();
  ctx.moveTo(cx - 60 * k, y + 28 * k); ctx.lineTo(cx - 100 * k, y + 52 * k); ctx.lineTo(cx - 84 * k, y + 88 * k); ctx.lineTo(cx - 60 * k, y + 78 * k);
  ctx.lineTo(cx - 60 * k, y + 150 * k); ctx.lineTo(cx + 60 * k, y + 150 * k); ctx.lineTo(cx + 60 * k, y + 78 * k); ctx.lineTo(cx + 84 * k, y + 88 * k);
  ctx.lineTo(cx + 100 * k, y + 52 * k); ctx.lineTo(cx + 60 * k, y + 28 * k); ctx.quadraticCurveTo(cx, y + 52 * k, cx - 60 * k, y + 28 * k); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,.12)'; ctx.lineWidth = 2; ctx.stroke();
  // 하의 (바지 실루엣)
  ctx.fillStyle = o.bottom.hex; ctx.beginPath();
  ctx.moveTo(cx - 56 * k, y + 156 * k); ctx.lineTo(cx + 56 * k, y + 156 * k); ctx.lineTo(cx + 64 * k, y + 232 * k); ctx.lineTo(cx + 12 * k, y + 232 * k);
  ctx.lineTo(cx, y + 186 * k); ctx.lineTo(cx - 12 * k, y + 232 * k); ctx.lineTo(cx - 64 * k, y + 232 * k); ctx.closePath(); ctx.fill(); ctx.stroke();
  // 포인트 (가방·액세서리 원)
  ctx.fillStyle = o.point.hex; ctx.beginPath(); ctx.arc(cx + 92 * k, y + 176 * k, 20 * k, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.textAlign = 'center'; ctx.fillStyle = '#2a2433'; ctx.font = `700 ${Math.round(26 * k)}px ${FONT}`; ctx.fillText(o.title, cx, y + 266 * k);
  ctx.fillStyle = '#6f6680'; ctx.font = `500 ${Math.round(19 * k)}px ${FONT}`;
  ctx.fillText(`${o.top.name} · ${o.bottom.name} · ${o.point.name}`.slice(0, 26), cx, y + 292 * k); ctx.textAlign = 'left';
}

// v1.6: 인스타그램 스토리 크기(1080×1920) 요약 카드
export function renderStoryCanvas(canvas, r) {
  const S = r.season, W = 1080, H = 1920, P = 80;
  canvas.width = W; canvas.height = H;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#fbf8f4'; ctx.fillRect(0, 0, W, H);
  const g = ctx.createLinearGradient(0, 0, W, 0); S.best.slice(0, 6).forEach((c, i) => g.addColorStop(i / 5, c.hex));
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, 40); ctx.fillRect(0, H - 24, W, 24);
  ctx.textBaseline = 'alphabetic';
  let y = 170;
  ctx.font = `600 38px ${FONT}`; ctx.fillStyle = '#7a6f86'; ctx.fillText('나의 퍼스널컬러', P, y);
  y += 110; ctx.font = `800 104px ${FONT}`; ctx.fillStyle = '#2a2433'; ctx.fillText(S.name, P, y);
  y += 70; ctx.font = `500 38px ${FONT}`; ctx.fillStyle = '#7a6f86'; ctx.fillText(`${S.short} · ${S.keywords.join(' · ')}`, P, y);
  // 베스트 12색 (4×3)
  y += 60; const cols = 4, gap = 18, sw = (W - 2 * P - gap * (cols - 1)) / cols, sh = 130;
  S.best.forEach((c, i) => {
    const x = P + (i % cols) * (sw + gap), yy = y + Math.floor(i / cols) * (sh + gap);
    ctx.fillStyle = c.hex; rr(ctx, x, yy, sw, sh, 18); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.08)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = textColor(c.hex); ctx.font = `600 24px ${FONT}`; ctx.fillText(c.name, x + 14, yy + sh - 18);
  });
  y += 3 * (sh + gap) + 40;
  // 립 4색
  const L = LIPS[r.id];
  ctx.font = `700 36px ${FONT}`; ctx.fillStyle = '#2a2433'; ctx.fillText('추천 립', P, y + 40);
  L.best.forEach((c, i) => { const x = P + 210 + i * 190; ctx.fillStyle = c.hex; ctx.beginPath(); ctx.arc(x + 40, y + 28, 40, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#3d3547'; ctx.font = `500 22px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText(c.name, x + 40, y + 100); ctx.textAlign = 'left'; });
  y += 175;
  // 코디 3개
  if (r.outfits?.length) {
    ctx.font = `700 36px ${FONT}`; ctx.fillStyle = '#2a2433'; ctx.fillText('코디 색 조합', P, y); y += 24;
    const ow = (W - 2 * P - 2 * 20) / 3; r.outfits.forEach((o, i) => drawOutfit(ctx, o, P + i * (ow + 20), y, ow, 0.9)); y += 300 * 0.9 + 30;
  }
  // 피할 색
  ctx.font = `700 32px ${FONT}`; ctx.fillStyle = '#2a2433'; ctx.fillText('피하면 좋은 색', P, y + 34);
  S.avoid.forEach((c, i) => { const x = P + 270 + i * 106; ctx.fillStyle = c.hex; rr(ctx, x, y, 86, 50, 12); ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.1)'; ctx.stroke(); });
  y += 100;
  if (r.celebs?.length) { ctx.font = `500 28px ${FONT}`; ctx.fillStyle = '#5b5266'; ctx.fillText(`자주 언급되는 예시(참고): ${r.celebs.join(', ')}`, P, y); y += 40; }
  // 아래: QR + 안내
  const qs = 220, qy = H - 60 - qs;
  if (r.url) drawQr(ctx, r.url, W - P - qs, qy, qs, 2);
  ctx.font = `600 30px ${FONT}`; ctx.fillStyle = '#2a2433'; ctx.fillText(`신뢰도 ${r.conf.label} · ${r.method}`, P, qy + 50);
  ctx.font = `400 26px ${FONT}`; ctx.fillStyle = '#8a8094';
  ctx.fillText(`${r.date} · 카메라·조명에 따라 달라지는 추정이에요.`, P, qy + 100);
  if (r.url) { ctx.fillText('QR로 결과 다시 보기', P, qy + 150); ctx.fillText(shortUrl(r.appUrl || r.url), P, qy + 192); }
  return canvas;
}
