// 결과 카드 PNG 렌더러 (색과 글자만, 얼굴 사진 없음)
import { hexToRgb } from './color.js';
import { FACE_SHAPES, GLASS_SHAPES, LIPS, FRAMES, BROW_PATHS, glassesPaths } from './style.js';
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
    y += 70; ctx.font = `500 26px ${FONT}`;
    const foot = [`두 번째 후보: ${r.second.name} · 신뢰도 ${r.conf.label} · ${r.method}`, `${r.date} · 카메라·조명에 따라 달라질 수 있는 추정이며, 추천은 스타일링 제안이에요.`];
    for (const ln of foot) { if (!measureOnly) { ctx.fillStyle = '#8a8094'; ctx.fillText(ln, P, y); } y += 40; }
    return y + 40;
  };
  canvas.width = W; canvas.height = 10;
  const H = Math.ceil(draw(true));
  canvas.width = W; canvas.height = H;
  draw(false);
  return canvas;
}
