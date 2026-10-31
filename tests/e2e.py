"""퍼스널컬러 PWA E2E 테스트 (Playwright + Chrome 가짜 카메라)"""
import json, time, pathlib, io, sys, subprocess
from playwright.sync_api import sync_playwright
from PIL import Image

import os
T = pathlib.Path(__file__).resolve().parent; ROOT = pathlib.Path(os.environ.get('PC_ROOT', T.parent)); SHOTS = T / 'shots'
SHOTS.mkdir(exist_ok=True)
BASE = 'http://localhost:8765/'
results, errors, net = [], [], []
WARM = {'spring_light', 'spring_bright', 'autumn_mute', 'autumn_deep'}

def check(name, cond, info=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' | ' + repr(info)[:500]), flush=True)
def wait_js(p, expr, timeout=15000):
    t = time.time()
    while time.time() - t < timeout / 1000:
        try:
            if p.evaluate(expr): return True
        except Exception: pass
        time.sleep(0.15)
    return False
def shot(p, name, full=False):
    p.evaluate("document.getElementById('toast').hidden=true"); p.wait_for_timeout(200)
    p.screenshot(path=str(SHOTS / f'{name}.png'), full_page=full)
def launch(pw, video=None, fake_ui=True):
    args = ['--no-sandbox']
    if video: args += ['--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={T}/media/{video}.y4m']
    if fake_ui: args += ['--use-fake-ui-for-media-stream']
    return pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
INIT = """(() => { try { if (!localStorage.getItem('pcqr.pass')) localStorage.setItem('pcqr.pass', JSON.stringify({at:0,until:4102444800000,n:999})); } catch (e) {} // 기존 진단 흐름 테스트용: 관리자 허가(QR 없이) 미리 부여
  window.__gum = 0; window.__streams = [];
  const md = navigator.mediaDevices; if (!md || !md.getUserMedia) return;
  const orig = md.getUserMedia.bind(md);
  md.getUserMedia = async (c) => { window.__gum++; const s = await orig(c); window.__streams.push(s); return s; }; })();"""
def ctx(b, w=1280, h=800, mobile=False, grant=True, sw=True, ua=None):
    kw = dict(viewport={'width': w, 'height': h}, locale='ko-KR', timezone_id='Asia/Seoul', accept_downloads=True, service_workers='allow' if sw else 'block')
    if mobile: kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
    if ua: kw['user_agent'] = ua
    c = b.new_context(**kw)
    if grant: c.grant_permissions(['camera'], origin=BASE.rstrip('/'))
    c.add_init_script(INIT)
    return c
def page(c, url=BASE):
    p = c.new_page()
    p.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    p.on('console', lambda m: m.type == 'error' and 'XNNPACK' not in m.text and errors.append('console: ' + m.text[:160]))
    p.on('request', lambda r: net.append(r.url))
    p.goto(url); p.wait_for_load_state('load'); skip_cover(p)
    return p
def skip_cover(p):  # v2.1.0+: 첫 화면은 표지(cover) → 탭하면 홈
    wait_js(p, '!!window.__pc && !!__pc.state.screen', 8000)
    if p.locator('#coverScreen').is_visible(): p.click('#coverScreen'); p.wait_for_timeout(300)
def start(p): skip_cover(p); p.click('#btnStart')
def visible(p, sel): return p.locator(sel).first.is_visible()
def to_capture(p, calib=False):
    start(p); p.check('#chkConsent'); p.click('#btnConsentCam')
    ok = wait_js(p, 'document.getElementById("video").videoWidth>0 && !!__pc.stream')
    if not calib: p.click('#btnCalibNext'); wait_js(p, '__pc.state.screen==="capture" && !!__pc.stream')
    wait_js(p, 'document.querySelectorAll("#meter .m").length>0', 5000)
    return ok
def capture(p):
    p.click('#btnCapture'); return wait_js(p, '__pc.state.screen==="auto"', 40000)
def st(p, expr): return p.evaluate(expr)
def tracks_ended(p): return st(p, 'window.__streams.length>0 && window.__streams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))')
def no_overflow(p): return st(p, 'document.documentElement.scrollWidth <= innerWidth + 1')
def small_buttons(p):
    return st(p, """[...document.querySelectorAll('.screen:not([hidden]) .btn, .topbar .btn')].filter(b=>b.offsetParent && !b.hidden).filter(b=>b.getBoundingClientRect().height<48).map(b=>b.id||b.textContent)""")

_srv = None
try:
    import urllib.request; urllib.request.urlopen(BASE, timeout=1)
except Exception:  # 서버가 없으면 직접 띄움
    _srv = subprocess.Popen(['python3', '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
with sync_playwright() as pw:
    # ---------- 0. 표지 화면 ----------
    b = launch(pw, 'warm'); c = ctx(b); p = c.new_page(); p.goto(BASE); p.wait_for_load_state('load')
    check('표지 화면 먼저 표시', wait_js(p, '!!window.__pc && __pc.state.screen==="cover"', 8000) and visible(p, '#coverScreen'))
    p.click('#coverScreen'); check('표지 탭 → 홈', wait_js(p, '__pc.state.screen==="home"', 5000) and visible(p, '#btnStart'))
    c.close(); b.close()
    # ---------- 1. 태블릿 가로 + 웜 톤 합성 얼굴: 전체 흐름 ----------
    b = launch(pw, 'warm'); c = ctx(b); p = page(c)
    shot(p, '01_home')
    check('홈 화면 표시', visible(p, '#btnStart') and st(p, '__pc.state.screen') == 'home')
    start(p); shot(p, '02_consent')
    check('동의 전에는 버튼 비활성', p.is_disabled('#btnConsentCam') and p.is_disabled('#btnConsentPhoto'))
    check('동의 전 카메라 요청 없음', st(p, 'window.__gum') == 0)
    p.check('#chkConsent'); check('동의 체크 후 활성', p.is_enabled('#btnConsentCam'))
    p.click('#btnConsentCam')
    check('보정 화면에서 카메라 켜짐', wait_js(p, 'document.getElementById("video").videoWidth>0 && !!__pc.stream'))
    wait_js(p, 'document.querySelectorAll("#meter .m").length>0', 5000); shot(p, '03_calib')
    lay = st(p, "(()=>{const s=document.getElementById('stage').getBoundingClientRect(),q=document.getElementById('panel').getBoundingClientRect();return {s:[s.left,s.right,s.top,s.width],q:[q.left,q.width]}})()")
    check('태블릿 가로: 카메라 왼쪽·조작 오른쪽', lay['s'][1] <= lay['q'][0] + 1 and lay['s'][3] > lay['q'][1], lay)
    check('전면 카메라 거울 모드', st(p, "document.getElementById('stage').classList.contains('mirror')"))
    p.click('#btnCalibNext'); wait_js(p, '__pc.state.screen==="capture" && !!__pc.stream'); wait_js(p, 'document.querySelectorAll("#meter .m").length>0', 5000)
    check('밝기 측정 표시(적당)', '밝기 적당' in p.inner_text('#meter'), p.inner_text('#meter')); shot(p, '04_capture')
    check('카메라 전환 버튼', visible(p, '#btnSwitch'))
    check('촬영 → 자동 분석', capture(p))
    check('촬영 후 카메라 트랙 해제', tracks_ended(p) and st(p, '__pc.stream') is None and st(p, 'document.getElementById("video").srcObject') is None)
    check('분석 후 작업 캔버스 비움', st(p, 'document.getElementById("work").width') == 1)
    a = st(p, '({top:__pc.state.auto.cls.top.map(t=>t.id), mode:__pc.state.auto.mode, skin:__pc.state.auto.skin, conf:__pc.state.auto.conf.label})')
    check('웜 합성 얼굴 → 웜 타입 1순위', a['top'][0] in WARM, a)
    check('피부 Lab 측정 정확도 (L64 a9 b22 ±3)', abs(a['skin']['L'] - 64) < 3 and abs(a['skin']['a'] - 9) < 3 and abs(a['skin']['b'] - 22) < 3, a)
    check('후보 2개와 신뢰도 표시', p.locator('.cand').count() == 2 and '신뢰도' in p.inner_text('#autoConf'))
    check('추정 결과라는 안내', '추정 결과' in p.inner_text('#autoBody'))
    print('  auto:', a)
    shot(p, '05_auto_result', full=True)
    # 드레이핑
    p.click('#btnToDrape'); check('드레이핑 화면 카메라 다시 켜짐', wait_js(p, '__pc.state.screen==="drape" && !!__pc.stream && document.getElementById("video").videoWidth>0'))
    p.wait_for_timeout(500)
    check('드레이프 좌우 색 표시', st(p, "document.getElementById('drapeL').getAttribute('fill')") != st(p, "document.getElementById('drapeR').getAttribute('fill')"))
    shot(p, '06_drape_warm_vs_cool')
    picks = []
    for i in range(5):
        dl = json.loads(p.get_attribute('#btnPickL', 'data-dim')); dr = json.loads(p.get_attribute('#btnPickR', 'data-dim'))
        title = p.inner_text('#roundTitle')
        if i == 1: shot(p, '07_drape_gold_vs_silver')
        if i == 4: shot(p, '08_drape_bright_vs_mute')
        # 고객이 웜 쪽, 밝은 쪽, 선명한 쪽을 고른다고 가정
        key = 'w' if 'w' in dl else ('l' if 'l' in dl else 'c')
        side = '#btnPickL' if dl.get(key, 0) > dr.get(key, 0) else '#btnPickR'
        if i == 2: side = '#btnPickSame'
        picks.append((title, side)); p.click(side); p.wait_for_timeout(150)
    check('비교 라운드 5개 완료', visible(p, '#roundDone') and len(st(p, '__pc.state.votes')) == 5, picks)
    check('좌우 위치 번갈아 배치(편향 감소)', st(p, '__pc.state.rounds[1].A.name') == '골드')
    p.click('#tabBrowse'); p.wait_for_timeout(200)
    n0 = p.inner_text('#browseName'); p.click('#btnNext'); n1 = p.inner_text('#browseName')
    box = p.locator('#stage').bounding_box(); y = box['y'] + box['height'] * 0.5
    p.mouse.move(box['x'] + box['width'] * 0.7, y); p.mouse.down(); p.mouse.move(box['x'] + box['width'] * 0.3, y, steps=5); p.mouse.up(); p.wait_for_timeout(150)
    n2 = p.inner_text('#browseName')
    check('팔레트 넘기기 (버튼·스와이프)', n0.startswith('1/12') and n1.startswith('2/12') and n2.startswith('3/12'), (n0, n1, n2))
    p.select_option('#selL', 'spring_light'); p.select_option('#selR', 'winter_deep'); p.wait_for_timeout(150)
    shot(p, '09_drape_palette_compare')
    p.click('#btnBrowseL'); check('팔레트 비교 선택 반영', len(st(p, '__pc.state.votes')) == 6)
    p.click('#btnDrapeDone'); check('최종 결과 화면', wait_js(p, '__pc.state.screen==="result"'))
    check('결과 화면에서 카메라 해제', st(p, '__pc.stream') is None)
    f = st(p, '({id:__pc.state.final.id, method:__pc.state.final.method, conf:__pc.state.final.conf.label})')
    check('자동+드레이핑 결합 결과(웜)', f['id'] in WARM and f['method'] == '자동 분석 + 드레이핑', f)
    check('결과 카드: 베스트 12색·피할 색 6색·팁', p.locator('#resultCard .palette:not(.avoid) .swatch').count() == 12 and p.locator('#resultCard .palette.avoid .swatch').count() == 6 and all(k in p.inner_text('#resultCard') for k in ['메이크업', '헤어', '액세서리']))
    # v2.3.0+: 체형 코디 일러스트 등 앱 그림(svg/정적 이미지)은 허용, 고객 사진(blob:/data: 이미지·video·canvas)은 없어야 함
    media = st(p, "[...document.querySelectorAll('#resultCard img, #resultCard video, #resultCard canvas:not(#resQr)')].map(e=>e.tagName+' '+(e.currentSrc||e.src||''))")
    check('결과 카드에 사진 요소 없음', not [m for m in media if not m.startswith('IMG ') or m.split(' ',1)[1].startswith(('blob:', 'data:image/jpeg', 'data:image/png'))], media)
    print('  final:', f)
    shot(p, '10_result_card', full=True)
    # ---- 립·안경·눈썹 추천 + 얼굴형 ----
    fa = st(p, '__pc.state.final.face && {id:__pc.state.final.face.id, label:__pc.state.final.face.label, m:__pc.state.final.face.metrics}')
    print('  face:', fa)
    check('얼굴형 자동 추정(랜드마크) 표시', fa and p.input_value('#selFace') == fa['id'] and '자동 추정' in p.inner_text('#faceNote'), fa)
    check('결과 탭 5개(컬러/메이크업/안경/눈썹/헤어)', p.locator('.rtab').all_inner_texts() == ['컬러', '메이크업', '안경', '눈썹', '헤어'], p.locator('.rtab').all_inner_texts())
    p.click('[data-rtab="lip"]'); p.wait_for_timeout(150)
    lips = st(p, "[...document.querySelectorAll('#rpane .palette.lips:not(.avoid) .swatch span')].map(e=>e.textContent)")
    check('립 추천 3~5색 + 이름 + 피할 립', 3 <= len(lips) <= 5 and p.locator('#rpane .palette.lips.avoid .swatch').count() >= 1 and '추천 립 컬러' in p.inner_text('#rpane'), lips)
    shot(p, 'rec-lip-1280x800')
    p.click('[data-rtab="glasses"]'); p.wait_for_timeout(150)
    check('안경테 컬러 4색 + 얼굴형별 모양 3종(SVG)', p.locator('#rpane .palette.frames .swatch').count() == 4 and p.locator('#rpane .gitem svg').count() == 3, p.inner_text('#rpane')[:200])
    shot(p, 'rec-glasses-1280x800')
    p.click('[data-rtab="brow"]'); p.wait_for_timeout(150)
    check('눈썹 모양 추천 + 그림', p.locator('#rpane .browrec svg path').count() == 1 and len(p.inner_text('#browName')) > 1)
    alt = 'square' if fa and fa['id'] != 'square' else 'round'
    p.select_option('#selFace', alt); p.wait_for_timeout(150)
    exp = {'square': '부드러운 아치', 'round': '각진 아치'}[alt]
    check('직원이 얼굴형 변경 → 눈썹 추천 바뀜 + "직접 선택" 표시', p.inner_text('#browName') == exp and '직접 선택' in p.inner_text('#faceNote') and st(p, '__pc.state.faceShape') == alt, (alt, p.inner_text('#browName'), p.inner_text('#faceNote')))
    p.click('[data-rtab="glasses"]')
    gl = p.inner_text('.glist')
    check('얼굴형별 안경 모양 (각진형: 라운드 추천·사각 제외 / 둥근형: 사각 추천·라운드 제외)', ('라운드' in gl and '사각' not in gl) if alt == 'square' else ('사각' in gl and '라운드' not in gl), gl)
    p.select_option('#selFace', 'long'); p.click('[data-rtab="brow"]'); p.wait_for_timeout(100)
    check('긴형 → 일자 눈썹', p.inner_text('#browName') == '일자 눈썹')
    shot(p, 'rec-brow-1280x800')
    fit = st(p, "[...document.querySelectorAll('.rtab, #selFace, .screen:not([hidden]) .bigbtns .btn')].every(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})")
    check('결과: 탭·얼굴형 선택·버튼이 한 화면에', fit)
    p.select_option('#selFace', fa['id'] if fa else 'oval'); p.click('[data-rtab="color"]')
    with p.expect_download() as dl:
        p.click('#btnSavePng')
    path = dl.value.path(); im = Image.open(path).convert('RGB')
    best0 = st(p, '__pc.state.final.season.best.map(c=>c.hex)')
    def has_color(hx):
        r, g, bb = int(hx[1:3], 16), int(hx[3:5], 16), int(hx[5:7], 16)
        px = im.getdata(); return sum(1 for q in px if abs(q[0]-r) < 3 and abs(q[1]-g) < 3 and abs(q[2]-bb) < 3) > 500
    check('PNG 저장: 1080px 폭, 팔레트 색 포함', im.width == 1080 and im.height > 1500 and has_color(best0[0]) and has_color(best0[11]), (im.size, dl.value.suggested_filename))
    im.save(SHOTS / '11_saved_card.png')
    lipHex = st(p, "import('./js/style.js').then(m=>({lip:m.LIPS[__pc.state.final.id].best.map(c=>c.hex), fr:m.FRAMES[__pc.state.final.id].best.map(c=>c.hex)}))")
    check('PNG에 립·안경테 컬러 포함', has_color(lipHex['lip'][0]) and has_color(lipHex['lip'][3]) and has_color(lipHex['fr'][2]), lipHex)
    im.save(SHOTS / 'rec-saved-card.png')
    check('PNG 파일 이름', dl.value.suggested_filename.startswith('퍼스널컬러_') and dl.value.suggested_filename.endswith('.png'), dl.value.suggested_filename)
    # 초기화
    p.click('#btnNextCustomer'); wait_js(p, '__pc.state.screen==="home"')
    s = st(p, """(async()=>({auto:__pc.state.auto, votes:__pc.state.votes.length, final:__pc.state.final, wb:__pc.state.wb, rounds:__pc.state.rounds,
      stream:__pc.stream, chk:document.getElementById('chkConsent').checked, card:document.getElementById('resultCard').innerHTML, autoBody:document.getElementById('autoBody').innerHTML,
      votesDom:document.getElementById('voteSummary').innerHTML, work:document.getElementById('work').width, ls:localStorage.length, ss:sessionStorage.length,
      lsKeys:Object.keys(localStorage), idb:(indexedDB.databases? (await indexedDB.databases()).length : 0), cookies:document.cookie,
      cacheUrls:(await Promise.all((await caches.keys()).map(async k=>(await (await caches.open(k)).keys()).map(r=>r.url)))).flat(),
      tracks:window.__streams.every(s=>s.getTracks().every(t=>t.readyState==='ended'))}))()""")
    check('초기화: 상태 모두 비움', s['auto'] is None and s['votes'] == 0 and s['final'] is None and s['wb'] is None and s['rounds'] is None, s)
    check('초기화: 화면 내용 비움', s['card'] == '' and s['autoBody'] == '' and s['votesDom'] == '' and not s['chk'] and s['work'] == 1)
    check('초기화: 카메라 꺼짐', s['stream'] is None and s['tracks'])
    check('저장소에 진단 데이터 없음 (진단권 기록 pcqr.* 만 / sessionStorage·IndexedDB·쿠키 없음)', all(k.startswith('pcqr.') for k in s['lsKeys']) and s['ss'] == 0 and s['idb'] == 0 and s['cookies'] == '', s)
    check('캐시에는 앱 파일만 (이미지·결과 없음)', all(u.startswith(BASE) and not u.endswith(('.jpg', '.jpeg')) for u in s['cacheUrls']) and len(s['cacheUrls']) >= 10, s['cacheUrls'])
    # 진행 중 상단 초기화 버튼 (확인창)
    to_capture(p); p.click('#btnReset'); check('진행 중 초기화 확인창', visible(p, '#modal')); shot(p, '12_reset_confirm')
    p.click('#modalNo'); check('취소하면 그대로', st(p, '__pc.state.screen') == 'capture' and not st(p, "!document.getElementById('modal').hidden"))
    p.click('#btnReset'); p.click('#modalYes'); wait_js(p, '["home","cover"].includes(__pc.state.screen)')
    check('확인하면 처음으로(표지/홈) + 카메라 해제', st(p, '__pc.state.screen') in ('home', 'cover') and st(p, '__pc.stream') is None and tracks_ended(p))
    # 서비스 워커 + 오프라인
    check('서비스 워커 등록', wait_js(p, '!!navigator.serviceWorker.controller || navigator.serviceWorker.getRegistrations().then(r=>r.length>0)', 10000))
    wait_js(p, "caches.keys().then(async k=>k.length && (await (await caches.open(k[0])).keys()).length>=19)", 20000)
    c.set_offline(True); p.reload(); p.wait_for_load_state('load'); skip_cover(p)
    check('오프라인에서 앱 열림', visible(p, '#btnStart') and p.title().startswith('퍼스널컬러 진단'), p.title())
    start(p); p.check('#chkConsent')
    with p.expect_file_chooser() as fc: p.click('#btnConsentPhoto')
    fc.value.set_files(str(T / 'portrait.jpg'))
    check('오프라인 사진 진단 + 얼굴 자동 인식', wait_js(p, '__pc.state.screen==="auto"', 40000) and st(p, '__pc.state.auto.mode') == 'landmark', st(p, '__pc.state.auto && __pc.state.auto.mode'))
    print('  portrait(offline):', st(p, '({top:__pc.state.auto.cls.top, skin:__pc.state.auto.skin, notes:__pc.state.auto.notes})'))
    check('사진 진단 시 카메라 요청 안 함', st(p, 'window.__gum') == 0)
    check('파일 입력 비움', st(p, "document.getElementById('fileInput').value") == '')
    shot(p, '13_photo_landmark_result', full=True)
    c.set_offline(False); c.close(); b.close()

    # ---------- 2. 쿨 톤 ----------
    b = launch(pw, 'cool'); c = ctx(b); p = page(c)
    to_capture(p); capture(p)
    a = st(p, '({top:__pc.state.auto.cls.top.map(t=>t.id), skin:__pc.state.auto.skin, w:__pc.state.auto.feat.w})')
    check('쿨 합성 얼굴 → 쿨 타입 1순위', a['top'][0] not in WARM, a); print('  cool:', a)
    p.click('#btnToDrape'); wait_js(p, '__pc.state.screen==="drape" && !!__pc.stream')
    for i in range(5): p.click('#btnPickSame')
    check('쿨 경향일 때 명도 비교는 라벤더/버건디', st(p, '__pc.state.rounds[3].A.name') == '라벤더')
    p.click('#btnDrapeDone'); wait_js(p, '__pc.state.screen==="result"')
    check('"비슷해요"만 고르면 자동 분석 결과 유지', st(p, '__pc.state.final.id') == a['top'][0] and st(p, '__pc.state.final.method') == '자동 분석')
    shot(p, '14_result_cool', full=True)
    c.close(); b.close()

    # ---------- 3. 노란 조명 + 흰 종이 보정 ----------
    b = launch(pw, 'yellow_face'); c = ctx(b); p = page(c)
    to_capture(p); wait_js(p, '"색 치우침" in {} ? 0 : document.getElementById("meter").innerText.includes("노란빛")', 4000)
    check('노란 조명 실시간 경고', '노란빛' in p.inner_text('#meter'), p.inner_text('#meter')); shot(p, '15_capture_yellow_warning')
    capture(p)
    a = st(p, '({top:__pc.state.auto.cls.top.map(t=>t.id), issues:__pc.state.auto.light.issues.map(i=>i.code)})')
    check('보정 없이 노란 조명: 경고 표시', 'yellow' in a['issues'] and '노랗게' in p.inner_text('#autoBody'), a)
    print('  yellow uncalibrated:', a)
    c.close(); b.close()
    b = launch(pw, 'yellow_calib'); c = ctx(b); p = page(c)
    to_capture(p, calib=True)
    center = """(()=>{const v=document.getElementById('video');const c=document.createElement('canvas');c.width=64;c.height=48;const x=c.getContext('2d');x.drawImage(v,0,0,64,48);const d=x.getImageData(32,10,1,1).data;return d[0]+d[1]+d[2];})()"""
    wait_js(p, center + ' > 600', 12000); shot(p, '16_calib_paper')
    p.click('#btnCalib')
    check('흰 종이 보정 완료 + 조명 색 표시', st(p, '!!__pc.state.wb') and '노란빛' in p.inner_text('#calibStatus'), p.inner_text('#calibStatus'))
    shot(p, '17_calib_done')
    p.click('#btnCalibNext'); wait_js(p, '__pc.state.screen==="capture" && !!__pc.stream')
    wait_js(p, center + ' < 450', 12000); p.wait_for_timeout(300)
    capture(p)
    a = st(p, '({top:__pc.state.auto.cls.top.map(t=>t.id), skin:__pc.state.auto.skin, cal:__pc.state.auto.calibrated, issues:__pc.state.auto.light.issues.map(i=>i.code)})')
    check('보정 후 노란 조명 아래 쿨 얼굴 → 쿨 판정', a['cal'] and a['top'][0] not in WARM and abs(a['skin']['b'] - 11.5) < 4, a)
    print('  yellow calibrated:', a)
    shot(p, '18_auto_after_calibration', full=True)
    # 종이 아닌 것으로 보정 시도 → 거부
    c.close(); b.close()
    b = launch(pw, 'warm'); c = ctx(b); p = page(c); to_capture(p, calib=True); p.wait_for_timeout(300)
    p.click('#btnCalib'); check('흰 종이가 아니면 보정 거부', st(p, '__pc.state.wb') is None and not p.locator('#toast').is_hidden(), p.inner_text('#toast'))
    c.close(); b.close()

    # ---------- 4. 어두운 조명 ----------
    b = launch(pw, 'dark'); c = ctx(b); p = page(c)
    to_capture(p); p.wait_for_timeout(800)
    m = p.inner_text('#meter')
    # v2.3.1: 너무 어두워 analyzeImage가 ok:false('dark')여도 실시간 표시는 '어두움' (예전엔 얼굴 위치 안내로 나옴)
    check('어두운 조명 실시간 안내 = 어두움', '어두움' in m and '타원' not in m, m)
    p.click('#btnCapture'); p.wait_for_timeout(2500)
    # v1.7+: 너무 어두우면 결과 대신 다시 찍기 안내
    check('어두운 조명: 결과 대신 다시 찍기 안내', '너무 어두워서' in p.inner_text('#toast') and st(p, '__pc.state.screen') != 'auto', p.inner_text('#toast'))
    c.close(); b.close()

    # ---------- 5. 실제 인물 사진 카메라 (얼굴 랜드마크) ----------
    b = launch(pw, 'portrait'); c = ctx(b); p = page(c)
    to_capture(p); capture(p)
    check('카메라 영상에서 얼굴 자동 인식(랜드마크)', st(p, '__pc.state.auto.mode') == 'landmark' and st(p, '!!__pc.state.auto.eye'))
    c.close(); b.close()

    # ---------- 5b. 드레이핑만 (자동 인식 없음) → 얼굴형 직접 선택 ----------
    b = launch(pw, 'warm'); c = ctx(b, 360, 640, mobile=True); p = page(c)
    p.click('#btnDrapeOnly'); p.check('#chkConsent'); p.click('#btnConsentCam'); wait_js(p, '__pc.state.screen==="drape" && !!__pc.stream')
    p.click('#btnPickL'); p.click('#btnPickL'); p.click('#btnDrapeDone'); wait_js(p, '__pc.state.screen==="result"')
    check('자동 인식 없을 때 얼굴형 "선택해 주세요"', p.input_value('#selFace') == '' and '직접 골라' in p.inner_text('#faceNote'))
    p.click('[data-rtab="glasses"]'); check('얼굴형 미선택 시 안경 모양 대신 선택 안내', '선택하면' in p.inner_text('#rpane') and p.locator('#rpane .palette.frames .swatch').count() == 4)
    p.select_option('#selFace', 'heart'); p.click('[data-rtab="brow"]'); p.wait_for_timeout(100)
    check('하트형 선택 → 둥근 아치', p.inner_text('#browName') == '둥근 아치')
    fit = st(p, "[...document.querySelectorAll('.rtab, #selFace, .screen:not([hidden]) .bigbtns .btn')].map(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight})")
    check('360x640: 탭·얼굴형 선택·버튼 한 화면', all(fit), fit)
    shot(p, 'rec-brow-360x640'); p.click('[data-rtab="lip"]'); p.wait_for_timeout(100); shot(p, 'rec-lip-360x640')
    p.click('[data-rtab="glasses"]'); p.wait_for_timeout(100); shot(p, 'rec-glasses-360x640')
    c.close(); b.close()

    # ---------- 6. 휴대폰 세로 (iPhone 크기) ----------
    IOS = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'
    b = launch(pw, 'warm'); c = ctx(b, 390, 844, mobile=True, ua=IOS); p = page(c)
    shot(p, 'm01_home'); check('휴대폰: 홈 가로 넘침 없음', no_overflow(p))
    start(p); shot(p, 'm02_consent', full=True); check('휴대폰: 동의 화면 넘침 없음', no_overflow(p))
    p.check('#chkConsent'); p.click('#btnConsentCam'); wait_js(p, 'document.getElementById("video").videoWidth>0'); p.wait_for_timeout(800)
    shot(p, 'm03_calib')
    p.click('#btnCalibNext'); wait_js(p, '__pc.state.screen==="capture" && !!__pc.stream'); p.wait_for_timeout(800)
    lay = st(p, "(()=>{const s=document.getElementById('stage').getBoundingClientRect(),q=document.getElementById('panel').getBoundingClientRect();return [s.bottom,q.top,s.width]})()")
    check('휴대폰: 카메라 위·조작 아래', lay[0] <= lay[1] + 1 and lay[2] >= 389, lay)
    check('휴대폰: 버튼 높이 48px 이상', not small_buttons(p), small_buttons(p))
    shot(p, 'm04_capture')
    capture(p); shot(p, 'm05_auto', full=True); check('휴대폰: 분석 결과 넘침 없음', no_overflow(p))
    p.click('#btnToDrape'); wait_js(p, '__pc.state.screen==="drape" && !!__pc.stream'); p.wait_for_timeout(600)
    shot(p, 'm06_drape'); check('휴대폰: 드레이핑 넘침 없음', no_overflow(p))
    p.click('#btnPickL'); p.click('#btnDrapeDone'); wait_js(p, '__pc.state.screen==="result"')
    shot(p, 'm07_result', full=True); check('휴대폰: 결과 카드 넘침 없음', no_overflow(p))
    check('휴대폰: 결과 버튼 높이', not small_buttons(p), small_buttons(p))
    c.close()
    # 태블릿 세로 / 안드로이드 폰
    c = ctx(b, 820, 1180, mobile=True); p = page(c); to_capture(p); p.wait_for_timeout(600); shot(p, 't01_tablet_portrait_capture')
    check('태블릿 세로 넘침 없음', no_overflow(p)); capture(p); p.click('#btnToResult'); wait_js(p, '__pc.state.screen==="result"'); shot(p, 't02_tablet_portrait_result', full=True)
    c.close()
    c = ctx(b, 1180, 820, mobile=True); p = page(c); to_capture(p); p.click('#btnCapture'); wait_js(p, '__pc.state.screen==="auto"', 40000)
    p.click('#btnToDrape'); wait_js(p, '__pc.state.screen==="drape" && !!__pc.stream'); p.wait_for_timeout(600); shot(p, 't03_tablet_landscape_drape')
    p.click('#btnToResult') if visible(p, '#btnToResult') else None
    p.click('#btnDrapeDone'); wait_js(p, '__pc.state.screen==="result"'); shot(p, 't04_tablet_landscape_result', full=True)
    check('태블릿 가로 결과 넘침 없음', no_overflow(p))
    c.close()
    c = ctx(b, 412, 915, mobile=True, ua='Mozilla/5.0 (Linux; Android 14; SM-S921N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Mobile Safari/537.36'); p = page(c)
    to_capture(p); p.wait_for_timeout(600); shot(p, 'a01_android_capture'); check('안드로이드 폰 넘침 없음', no_overflow(p))
    c.close(); b.close()

    # ---------- 7. 카메라 권한 거부 / 사진 오류 ----------
    b = launch(pw, 'warm', fake_ui=False); c = ctx(b, grant=False); p = page(c)
    start(p); p.check('#chkConsent'); p.click('#btnConsentCam'); wait_js(p, 'document.getElementById("stageMsg").innerText.length>5 && !document.getElementById("stageMsg").innerText.includes("켜는 중")', 10000)
    check('권한 거부 시 안내', '권한' in p.inner_text('#stageMsg') or '카메라를 켤 수 없어요' in p.inner_text('#stageMsg'), p.inner_text('#stageMsg'))
    shot(p, '19_camera_denied')
    gray = T / 'media' / 'gray.png'; Image.new('RGB', (800, 600), (128, 128, 128)).save(gray)
    p.click('#btnUpload')  if visible(p, '#btnUpload') else None
    p.click('#btnReset'); p.click('#modalYes'); start(p); p.check('#chkConsent')
    with p.expect_file_chooser() as fc: p.click('#btnConsentPhoto')
    fc.value.set_files(str(gray)); p.wait_for_timeout(2500)
    # v1.7+: 회색(무채색) 사진은 흑백 사진 안내
    check('무채색 사진은 흑백 안내', '흑백' in p.inner_text('#toast') and st(p, '__pc.state.auto') is None, p.inner_text('#toast'))
    blue = T / 'media' / 'blue.png'; Image.new('RGB', (800, 600), (40, 90, 200)).save(blue)
    p.evaluate("document.getElementById('toast').hidden=true")
    if not visible(p, '#btnConsentPhoto'): p.click('#btnReset'); p.click('#modalYes') if visible(p, '#modal') else None; start(p); p.check('#chkConsent')
    with p.expect_file_chooser() as fc: p.click('#btnConsentPhoto')
    fc.value.set_files(str(blue)); p.wait_for_timeout(2500)
    check('얼굴 없는 사진은 거부 안내', '찾지 못했어요' in p.inner_text('#toast') and st(p, '__pc.state.auto') is None, p.inner_text('#toast'))
    c.close(); b.close()

    # ---------- 8. HTTPS 아닌 주소 ----------
    srv = subprocess.Popen(['python3', '-m', 'http.server', '8766', '--bind', '172.30.0.2'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
    b = launch(pw, 'warm'); c = b.new_context(viewport={'width': 1280, 'height': 800}); p = c.new_page()
    p.on('pageerror', lambda e: errors.append('pageerror(insecure): ' + str(e))); p.goto('http://172.30.0.2:8766/'); skip_cover(p)
    start(p); p.check('#chkConsent'); p.click('#btnConsentCam'); p.wait_for_timeout(800)  # 진단권 화면(카메라) → 비보안 주소 안내
    check('HTTP(비보안) 주소에서는 HTTPS 안내', 'HTTPS' in p.inner_text('#stageMsg'), p.inner_text('#stageMsg')); shot(p, '20_insecure_http_notice')
    c.close(); b.close(); srv.terminate()

ext = [u for u in net if not u.startswith(('http://localhost:8765/', 'blob:', 'data:'))]
check('외부 네트워크 요청 0건 (전체 테스트 %d건 요청 모두 localhost)' % len(net), not ext, ext[:10])
check('google 텔레메트리 요청 없음', not any('googleapis' in u for u in net))
check('페이지 오류 없음', not errors, errors[:10])
passed = sum(1 for _, ok in results if ok)
print(f'\n결과: {passed}/{len(results)} 통과')
if _srv: _srv.terminate()
sys.exit(0 if passed == len(results) else 1)
