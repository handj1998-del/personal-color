// 올리브영 판매 제품 예시 (data/cosmetics.json). 앱 버전과 따로 갱신됨 → SW가 이 파일만 네트워크 우선으로 받음
// 외부 이미지·외부 요청 없음 (같은 출처 JSON만). 링크는 고객 휴대폰 결과 화면에서만, 새 탭으로
let DATA = null, P = null;
const HEX = /^#[0-9a-f]{6}$/i, OY = /^https:\/\/www\.oliveyoung\.co\.kr\/store\/goods\/getGoodsDetail\.do\?goodsNo=A\d{12}$/;
export function validCosmetics(d) {
  if (!d || typeof d !== 'object' || !d.types || !d.products || !/^\d{4}-\d{2}-\d{2}$/.test(d.verifiedAt || '')) return false;
  for (const p of Object.values(d.products)) if (!p.brand || !p.product || !['lip', 'blush', 'eye', 'base'].includes(p.cat) || !OY.test(p.url || '')) return false;
  for (const list of Object.values(d.types)) for (const it of list) if (!d.products[it.p] || !it.shade || !HEX.test(it.hex || '')) return false;
  return true;
}
export function cosmeticsReady() {
  P ||= fetch('data/cosmetics.json', { cache: 'no-cache' }).then((r) => (r.ok ? r.json() : null)).then((d) => { DATA = validCosmetics(d) ? d : null; return DATA; }).catch(() => null);
  return P;
}
export const cosmeticsData = () => DATA;
const CAT = { lip: '립', blush: '블러셔', eye: '아이섀도우', base: '베이스' };
// 타입별 제품 목록 (분류 순서: 립 → 블러셔 → 아이섀도우)
export function cosmeticsFor(id) {
  if (!DATA || !DATA.types[id]) return [];
  const order = ['lip', 'blush', 'eye', 'base'];
  return DATA.types[id].map((it) => ({ ...DATA.products[it.p], shade: it.shade, hex: it.hex, catName: CAT[DATA.products[it.p].cat] }))
    .sort((a, b) => order.indexOf(a.cat) - order.indexOf(b.cat));
}
export const cosmeticsLabel = () => (DATA ? DATA.label || `제품 정보 ${DATA.verifiedAt.replaceAll('-', '.')} 기준` : '');
export const cosmeticsNotice = () => (DATA ? DATA.notice : '');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
// 결과 화면 칩. link=true(고객 휴대폰)일 때만 올리브영 새 탭 링크
export function cosmeticsHtml(id, link) {
  const list = cosmeticsFor(id); if (!list.length) return '';
  const chip = (c) => {
    const inner = `<i style="background:${c.hex}" aria-hidden="true"></i><span><small>${esc(c.catName)} · ${esc(c.brand)}</small><b>${esc(c.shade)}</b><em>${esc(c.product)}</em></span>`;
    return link ? `<a class="pchip" href="${esc(c.url)}" target="_blank" rel="noopener noreferrer" aria-label="${esc(`${c.brand} ${c.product} ${c.shade} — 올리브영 상품 페이지 (새 탭)`)}">${inner}<span class="ext" aria-hidden="true">↗</span></a>`
      : `<div class="pchip">${inner}</div>`;
  };
  return `<h2 class="sec">🛍 올리브영에서 찾을 수 있는 제품 예시</h2><div class="pchips">${list.map(chip).join('')}</div>
    <p class="note pnote">${esc(cosmeticsLabel())} · ${esc(cosmeticsNotice())} 색 견본은 근사값이에요.${link ? '' : ' 고객 휴대폰 결과 화면에서 상품 페이지로 갈 수 있어요.'}</p>`;
}
