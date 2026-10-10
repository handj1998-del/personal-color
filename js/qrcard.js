// 진단권 카드(90×50mm 명함 크기) · A4 인쇄 시트(10장, 재단선) · PDF 만들기 — 모두 기기 안에서 처리
import qrcode from '../vendor/qr/qrcode.mjs';
import { fmtDay } from './ticket.js';
const FONT = "'Apple SD Gothic Neo','Malgun Gothic','Noto Sans KR','Noto Sans CJK KR','Nanum Gothic',sans-serif";
const MONO = "'DejaVu Sans Mono','Menlo','Consolas',monospace";
export const CARD_MM = { w: 90, h: 50 };
export const A4_MM = { w: 210, h: 297 };
export const SHEET = { cols: 2, rows: 5, gap: 6 }; // 10장/시트, 카드 사이 6mm (재단선 공간)

export function qrMatrix(text) {
  const q = qrcode(0, 'M'); q.addData(text, /^[0-9A-Z $%*+\-./:]+$/.test(text) ? 'Alphanumeric' : 'Byte'); q.make();
  const n = q.getModuleCount(); return { n, dark: (r, c) => q.isDark(r, c) };
}
export function drawQr(ctx, text, x, y, size, quiet = 2) {
  const m = qrMatrix(text), cell = size / (m.n + quiet * 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(x, y, size, size); ctx.fillStyle = '#111';
  for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) if (m.dark(r, c))
    ctx.fillRect(Math.floor(x + (c + quiet) * cell), Math.floor(y + (r + quiet) * cell), Math.ceil(cell), Math.ceil(cell));
  return m.n;
}
// H.O.W 콘셉트 1 마크 (흰 바탕 · 검정 H.O.W · 사계절 점 4개) — icons/icon.svg 와 같은 도형. size = 한 변(px)
export function drawMark(ctx, x, y, size, { bg = true } = {}) {
  const s = size / 512; ctx.save(); ctx.translate(x, y); ctx.scale(s, s);
  if (bg) { rr(ctx, 0, 0, 512, 512, 96); ctx.fillStyle = '#fff'; ctx.fill(); }
  ctx.save(); ctx.translate(60, 187); ctx.scale(0.98, 0.98); ctx.fillStyle = '#111'; ctx.strokeStyle = '#111';
  ctx.fillRect(0, 0, 22, 100); ctx.fillRect(58, 0, 22, 100); ctx.fillRect(0, 39, 80, 22);
  for (const cx of [105, 255]) { ctx.beginPath(); ctx.arc(cx, 87, 13, 0, Math.PI * 2); ctx.fill(); }
  ctx.lineWidth = 22; ctx.beginPath(); ctx.arc(180, 50, 39, 0, Math.PI * 2); ctx.stroke();
  ctx.save(); ctx.beginPath(); ctx.rect(280, 0, 120, 100); ctx.clip(); ctx.lineJoin = 'miter'; ctx.miterLimit = 10; ctx.beginPath();
  [[289.9, -30], [310, 100], [340, 28], [370, 100], [390.1, -30]].forEach(([a, b], i) => (i ? ctx.lineTo(a, b) : ctx.moveTo(a, b))); ctx.stroke(); ctx.restore();
  ctx.restore();
  SEASON_DOTS.forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(196 + i * 40, 330, 13, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}
export const SEASON_DOTS = ['#f7a58c', '#b9d7f0', '#c47a5a', '#6d1a36'];
export const brandName = (b) => String(b || '').trim().slice(0, 20) || 'H.O.W';
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

// 카드 하나를 (x,y)에 mm 단위 크기로 그림. px = mm * k
// v1.8: 앱과 같은 톤 — 흰 바탕 · 짙은 남보라 글자 · 보라 포인트, 왼쪽 위 H.O.W 마크 + 운영 주체 이름. QR은 흰 바탕 위에 로고 없이(가림 없음)
export function drawCard(ctx, t, x0, y0, k, brand) {
  const W = CARD_MM.w * k, H = CARD_MM.h * k, u = (mm) => mm * k, name = brandName(brand);
  ctx.save(); ctx.translate(x0, y0);
  rr(ctx, 0, 0, W, H, u(3.2)); ctx.fillStyle = '#fff'; ctx.fill(); ctx.clip();
  ctx.fillStyle = '#2b2340'; ctx.fillRect(0, H - u(3.2), W, u(3.2)); // 아래 띠 (앱 상단 바 색)
  SEASON_DOTS.forEach((c, i) => { ctx.fillStyle = c; ctx.fillRect(i * W / 4, H - u(3.2), W / 4, u(0.9)); });
  ctx.strokeStyle = '#e4dcee'; ctx.lineWidth = u(0.3); rr(ctx, u(0.15), u(0.15), W - u(0.3), H - u(0.3), u(3.1)); ctx.stroke();
  // 마크 + 상호
  drawMark(ctx, u(4.2), u(3.4), u(9), { bg: false });
  ctx.fillStyle = '#2b2340'; ctx.textBaseline = 'middle'; ctx.font = `800 ${u(3.4)}px ${FONT}`;
  let nm = name; while (ctx.measureText(nm).width > u(40) && nm.length > 1) nm = nm.slice(0, -1); if (nm !== name) nm += '…';
  ctx.fillText(nm, u(14.2), u(8));
  // 제목·일련번호·날짜
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#5b3f8f'; ctx.font = `800 ${u(4.6)}px ${FONT}`; ctx.fillText('퍼스널컬러 진단권', u(6), u(22));
  ctx.font = `600 ${u(2)}px ${FONT}`; ctx.fillStyle = '#6f6680'; ctx.fillText('PERSONAL COLOR PASS · 1회 사용', u(6), u(25.6));
  ctx.fillStyle = '#2b2340'; ctx.font = `700 ${u(3.3)}px ${MONO}`; ctx.fillText(`No. ${t.id.slice(0, 4)} ${t.id.slice(4)}`, u(6), u(33));
  ctx.font = `500 ${u(2.1)}px ${FONT}`; ctx.fillStyle = '#3d3547';
  ctx.fillText(`발급 ${fmtDay(t.issued)}   유효 ${t.exp ? '~' + fmtDay(t.exp) : '기한 없음'}`, u(6), u(37.6));
  ctx.font = `500 ${u(1.75)}px ${MONO}`; ctx.fillStyle = '#6f6680'; ctx.fillText(t.code, u(6), u(41));
  // QR: 흰 바탕 카드 위라 주변 여백(quiet zone)이 넉넉함. 얇은 보라 테두리만 바깥에
  const qs = u(27), qx = W - qs - u(5), qy = u(6.5);
  rr(ctx, qx - u(1.4), qy - u(1.4), qs + u(2.8), qs + u(2.8), u(2)); ctx.strokeStyle = '#5b3f8f'; ctx.lineWidth = u(0.35); ctx.stroke();
  drawQr(ctx, t.token, qx, qy, qs, 2);
  ctx.fillStyle = '#5b3f8f'; ctx.font = `700 ${u(1.9)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('매장 기기 카메라에 보여 주세요', qx + qs / 2, qy + qs + u(4.3)); ctx.textAlign = 'left';
  ctx.restore();
}
export function renderCard(canvas, t, dpi = 300, brand) {
  const k = dpi / 25.4; canvas.width = Math.round(CARD_MM.w * k); canvas.height = Math.round(CARD_MM.h * k);
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); drawCard(ctx, t, 0, 0, k, brand); return canvas;
}
// A4 한 장: 2×5 카드 + 재단선(crop marks)
export function renderSheet(canvas, tickets, dpi = 300, brand) {
  const k = dpi / 25.4; canvas.width = Math.round(A4_MM.w * k); canvas.height = Math.round(A4_MM.h * k);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const { cols, rows, gap } = SHEET, gw = cols * CARD_MM.w + (cols - 1) * gap, gh = rows * CARD_MM.h + (rows - 1) * gap;
  const mx = (A4_MM.w - gw) / 2, my = (A4_MM.h - gh) / 2;
  tickets.slice(0, cols * rows).forEach((t, i) => {
    const x = mx + (i % cols) * (CARD_MM.w + gap), y = my + Math.floor(i / cols) * (CARD_MM.h + gap);
    drawCard(ctx, t, x * k, y * k, k, brand);
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 0.15 * k);
    const L = 2.5, off = 0.8; // 재단선 길이·간격(mm)
    for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + CARD_MM.w, y, 1, -1], [x, y + CARD_MM.h, -1, 1], [x + CARD_MM.w, y + CARD_MM.h, 1, 1]]) {
      ctx.beginPath(); ctx.moveTo((cx + sx * off) * k, cy * k); ctx.lineTo((cx + sx * (off + L)) * k, cy * k);
      ctx.moveTo(cx * k, (cy + sy * off) * k); ctx.lineTo(cx * k, (cy + sy * (off + L)) * k); ctx.stroke();
    }
  });
  ctx.fillStyle = '#888'; ctx.font = `400 ${2.6 * k}px ${FONT}`;
  ctx.fillText(`${brandName(brand)} 퍼스널컬러 진단권 · ${tickets.length}장 · 90×50mm · 재단선에 맞춰 잘라 주세요 (인쇄 배율 100%)`, mx * k, (A4_MM.h - 6) * k);
  return canvas;
}
// JPEG 이미지(A4 시트)들로 PDF 만들기 (외부 라이브러리 없이)
export function makePdf(jpegs /* [{bytes:Uint8Array, w, h}] */) {
  const te = new TextEncoder(), parts = [], offs = []; let len = 0;
  const push = (x) => { const b = typeof x === 'string' ? te.encode(x) : x; parts.push(b); len += b.length; };
  const obj = (n, body) => { offs[n] = len; push(`${n} 0 obj\n`); body(); push('\nendobj\n'); };
  const PW = 595.28, PH = 841.89, n = jpegs.length;
  push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Count ${n} /Kids [${jpegs.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] >>`));
  jpegs.forEach((j, i) => {
    const p = 3 + i * 3, im = p + 1, ct = p + 2, cs = `q ${PW} 0 0 ${PH} 0 0 cm /Im${i} Do Q`;
    obj(p, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /XObject << /Im${i} ${im} 0 R >> >> /Contents ${ct} 0 R >>`));
    obj(im, () => { push(`<< /Type /XObject /Subtype /Image /Width ${j.w} /Height ${j.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${j.bytes.length} >>\nstream\n`); push(j.bytes); push('\nendstream'); });
    obj(ct, () => push(`<< /Length ${cs.length} >>\nstream\n${cs}\nendstream`));
  });
  const xref = len, total = 3 + n * 3;
  push(`xref\n0 ${total}\n0000000000 65535 f \n` + Array.from({ length: total - 1 }, (_, i) => String(offs[i + 1]).padStart(10, '0') + ' 00000 n \n').join(''));
  push(`trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts, { type: 'application/pdf' });
}
