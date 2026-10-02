// 결과 카드 PNG 렌더러 (색과 글자만, 얼굴 사진 없음)
import { hexToRgb } from './color.js';
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
    y += 70; ctx.font = `500 26px ${FONT}`;
    const foot = [`두 번째 후보: ${r.second.name} · 신뢰도 ${r.conf.label} · ${r.method}`, `${r.date} · 카메라와 조명에 따라 달라질 수 있는 추정 결과예요.`];
    for (const ln of foot) { if (!measureOnly) { ctx.fillStyle = '#8a8094'; ctx.fillText(ln, P, y); } y += 40; }
    return y + 40;
  };
  canvas.width = W; canvas.height = 10;
  const H = Math.ceil(draw(true));
  canvas.width = W; canvas.height = H;
  draw(false);
  return canvas;
}
