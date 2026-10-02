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
function rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.roundRect ? ctx.roundRect(x, y, w, h, r) : ctx.rect(x, y, w, h); }

// 카드 하나를 (x,y)에 mm 단위 크기로 그림. px = mm * k
export function drawCard(ctx, t, x0, y0, k) {
  const W = CARD_MM.w * k, H = CARD_MM.h * k, u = (mm) => mm * k;
  ctx.save(); ctx.translate(x0, y0);
  rr(ctx, 0, 0, W, H, u(3.2)); ctx.clip();
  // 카드 배경: 딥 퍼플 → 플럼 → 로즈골드 그라데이션 + 은은한 물결
  const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#2b2340'); g.addColorStop(0.5, '#5b3f8f'); g.addColorStop(1, '#c47a8a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.globalAlpha = 0.12; ctx.strokeStyle = '#fff'; ctx.lineWidth = u(0.35);
  for (let i = 0; i < 9; i++) { ctx.beginPath(); for (let px = 0; px <= W; px += u(2)) { const py = H * 0.25 + i * u(4.2) + Math.sin(px / u(11) + i * 0.7) * u(2.2); px ? ctx.lineTo(px, py) : ctx.moveTo(px, py); } ctx.stroke(); }
  ctx.globalAlpha = 1;
  // 사계절 컬러 점
  ['#f7a58c', '#b9d7f0', '#c47a5a', '#6d1a36'].forEach((c, i) => { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(u(7 + i * 3.6), u(7), u(1.5), 0, Math.PI * 2); ctx.fill(); });
  ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.font = `700 ${u(2.3)}px ${FONT}`; ctx.textBaseline = 'middle'; ctx.fillText('COLOR STUDIO', u(21.5), u(7.1));
  // IC 칩
  const cx = u(6), cy = u(15), cw = u(10), ch = u(7.6);
  const cg = ctx.createLinearGradient(cx, cy, cx + cw, cy + ch); cg.addColorStop(0, '#f6dc8a'); cg.addColorStop(0.5, '#c79a35'); cg.addColorStop(1, '#ffe9a8');
  rr(ctx, cx, cy, cw, ch, u(1.3)); ctx.fillStyle = cg; ctx.fill(); ctx.strokeStyle = 'rgba(90,60,10,.55)'; ctx.lineWidth = u(0.25); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx + cw * 0.33, cy); ctx.lineTo(cx + cw * 0.33, cy + ch); ctx.moveTo(cx + cw * 0.67, cy); ctx.lineTo(cx + cw * 0.67, cy + ch);
  ctx.moveTo(cx, cy + ch / 2); ctx.lineTo(cx + cw * 0.33, cy + ch / 2); ctx.moveTo(cx + cw * 0.67, cy + ch / 2); ctx.lineTo(cx + cw, cy + ch / 2); ctx.stroke();
  // 비접촉 표시
  ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.lineWidth = u(0.45);
  for (let i = 0; i < 3; i++) { ctx.beginPath(); ctx.arc(u(18.5), cy + ch / 2, u(1.3 + i * 1.1), -0.8, 0.8); ctx.stroke(); }
  // 제목·일련번호·날짜
  ctx.fillStyle = '#fff'; ctx.textBaseline = 'alphabetic';
  ctx.font = `800 ${u(4.6)}px ${FONT}`; ctx.fillText('퍼스널컬러 진단권', u(6), u(30));
  ctx.font = `600 ${u(2)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fillText('PERSONAL COLOR PASS · 1회 사용', u(6), u(33.6));
  ctx.fillStyle = '#fff'; ctx.font = `700 ${u(3.3)}px ${MONO}`; ctx.fillText(`No. ${t.id.slice(0, 4)} ${t.id.slice(4)}`, u(6), u(40));
  ctx.font = `500 ${u(2.1)}px ${FONT}`; ctx.fillStyle = 'rgba(255,255,255,.88)';
  ctx.fillText(`발급 ${fmtDay(t.issued)}   유효 ${t.exp ? '~' + fmtDay(t.exp) : '기한 없음'}`, u(6), u(44.3));
  ctx.font = `500 ${u(1.75)}px ${MONO}`; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText(t.code, u(6), u(47.4));
  // QR (흰 바탕)
  const qs = u(27), qx = W - qs - u(5), qy = u(10.5);
  rr(ctx, qx - u(1.2), qy - u(1.2), qs + u(2.4), qs + u(2.4), u(2)); ctx.fillStyle = '#fff'; ctx.fill();
  drawQr(ctx, t.token, qx, qy, qs, 1);
  ctx.fillStyle = 'rgba(255,255,255,.9)'; ctx.font = `600 ${u(1.9)}px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('매장 기기 카메라에 보여 주세요', qx + qs / 2, qy + qs + u(4.6)); ctx.textAlign = 'left';
  ctx.restore();
}
export function renderCard(canvas, t, dpi = 300) {
  const k = dpi / 25.4; canvas.width = Math.round(CARD_MM.w * k); canvas.height = Math.round(CARD_MM.h * k);
  const ctx = canvas.getContext('2d'); ctx.clearRect(0, 0, canvas.width, canvas.height); drawCard(ctx, t, 0, 0, k); return canvas;
}
// A4 한 장: 2×5 카드 + 재단선(crop marks)
export function renderSheet(canvas, tickets, dpi = 300) {
  const k = dpi / 25.4; canvas.width = Math.round(A4_MM.w * k); canvas.height = Math.round(A4_MM.h * k);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  const { cols, rows, gap } = SHEET, gw = cols * CARD_MM.w + (cols - 1) * gap, gh = rows * CARD_MM.h + (rows - 1) * gap;
  const mx = (A4_MM.w - gw) / 2, my = (A4_MM.h - gh) / 2;
  tickets.slice(0, cols * rows).forEach((t, i) => {
    const x = mx + (i % cols) * (CARD_MM.w + gap), y = my + Math.floor(i / cols) * (CARD_MM.h + gap);
    drawCard(ctx, t, x * k, y * k, k);
    ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(1, 0.15 * k);
    const L = 2.5, off = 0.8; // 재단선 길이·간격(mm)
    for (const [cx, cy, sx, sy] of [[x, y, -1, -1], [x + CARD_MM.w, y, 1, -1], [x, y + CARD_MM.h, -1, 1], [x + CARD_MM.w, y + CARD_MM.h, 1, 1]]) {
      ctx.beginPath(); ctx.moveTo((cx + sx * off) * k, cy * k); ctx.lineTo((cx + sx * (off + L)) * k, cy * k);
      ctx.moveTo(cx * k, (cy + sy * off) * k); ctx.lineTo(cx * k, (cy + sy * (off + L)) * k); ctx.stroke();
    }
  });
  ctx.fillStyle = '#888'; ctx.font = `400 ${2.6 * k}px ${FONT}`;
  ctx.fillText(`퍼스널컬러 진단권 · ${tickets.length}장 · 90×50mm · 재단선에 맞춰 잘라 주세요 (인쇄 배율 100%)`, mx * k, (A4_MM.h - 6) * k);
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
