#!/usr/bin/env python3
"""data/cosmetics.json 검사 (주간 갱신 루틴용).

사용법:
  python3 tools/check-cosmetics.py                 # 형식 검사 + 올리브영 URL 확인
  python3 tools/check-cosmetics.py --no-net        # 형식 검사만 (네트워크 없이)
  python3 tools/check-cosmetics.py --max-age 14    # verifiedAt이 14일보다 오래되면 실패
종료 코드: 0 통과 · 1 형식 오류/URL 없음(404 등) · 2 URL 확인 불가(봇 차단 등, 사람이 직접 확인 필요)
"""
import json, re, sys, datetime, urllib.request, urllib.error, argparse
ap = argparse.ArgumentParser(); ap.add_argument('--file', default='data/cosmetics.json'); ap.add_argument('--no-net', action='store_true'); ap.add_argument('--max-age', type=int, default=0)
a = ap.parse_args()
err, warn = [], []
d = json.load(open(a.file, encoding='utf-8'))
TYPES = ['spring_light', 'spring_bright', 'summer_light', 'summer_mute', 'autumn_mute', 'autumn_deep', 'winter_bright', 'winter_deep']
OY = re.compile(r'^https://www\.oliveyoung\.co\.kr/store/goods/getGoodsDetail\.do\?goodsNo=(A\d{12})$')
if not isinstance(d.get('version'), int): err.append('version(정수) 없음')
try: va = datetime.date.fromisoformat(d.get('verifiedAt', ''))
except ValueError: err.append('verifiedAt(YYYY-MM-DD) 형식 오류'); va = None
if va and a.max_age and (datetime.date.today() - va).days > a.max_age: err.append(f'verifiedAt {va}이 {a.max_age}일보다 오래됨')
for k in ['label', 'notice']:
  if not d.get(k): err.append(f'{k} 없음')
P = d.get('products', {})
for k, p in P.items():
  for f in ['brand', 'product', 'cat', 'goodsNo', 'url']:
    if not p.get(f): err.append(f'products.{k}.{f} 없음')
  if p.get('cat') not in ('lip', 'blush', 'eye', 'base'): err.append(f'products.{k}.cat 값 오류')
  m = OY.match(p.get('url', ''))
  if not m or m.group(1) != p.get('goodsNo'): err.append(f'products.{k}.url이 올리브영 상품 주소(goodsNo)와 맞지 않음')
  if any(w in json.dumps(p, ensure_ascii=False) for w in ['원', 'price']): warn.append(f'products.{k}: 가격으로 보이는 값이 있어요 (가격은 넣지 않기)')
T = d.get('types', {})
for t in TYPES:
  L = T.get(t)
  if not L: err.append(f'types.{t} 없음'); continue
  cats = [P.get(i.get('p'), {}).get('cat') for i in L]
  if cats.count('lip') < 2: warn.append(f'{t}: 립 2개 미만')
  if 'blush' not in cats: warn.append(f'{t}: 블러셔 없음')
  if 'eye' not in cats: warn.append(f'{t}: 아이섀도우 없음')
  for i in L:
    if i.get('p') not in P: err.append(f'{t}: 없는 제품 {i.get("p")}')
    if not i.get('shade'): err.append(f'{t}: shade 없음')
    if not re.match(r'^#[0-9a-fA-F]{6}$', i.get('hex', '')): err.append(f'{t} {i.get("shade")}: hex 형식 오류')
    if i.get('hexApprox') is not True: warn.append(f'{t} {i.get("shade")}: hexApprox 표시 없음')
unknown = []
if not a.no_net:
  UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36'
  for k, p in P.items():
    try:
      r = urllib.request.urlopen(urllib.request.Request(p['url'], headers={'User-Agent': UA, 'Accept-Language': 'ko-KR'}), timeout=20)
      body = r.read(200000).decode('utf-8', 'ignore')
      if '잠시만 기다려' in body: unknown.append(f'{k}: 봇 확인 페이지 (직접 확인 필요)')
      elif p['goodsNo'] in body or p['product'].replace(' ', '') in body.replace(' ', ''): print(f'OK   {k} {p["url"]}')
      else: unknown.append(f'{k}: 200이지만 상품명/번호가 안 보임')
    except urllib.error.HTTPError as e:
      (err if e.code in (404, 410) else unknown).append(f'{k}: HTTP {e.code} {p["url"]}')
    except Exception as e:
      unknown.append(f'{k}: 연결 실패 {type(e).__name__}')
for w in warn: print('WARN', w)
for u in unknown: print('CHECK', u)
for e in err: print('ERROR', e)
print(f'제품 {len(P)}개 · 타입 {len(T)}개 · 항목 {sum(len(v) for v in T.values())}개 · 기준일 {d.get("verifiedAt")}')
sys.exit(1 if err else 2 if unknown else 0)
