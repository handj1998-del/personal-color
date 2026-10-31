"""진단권(QR) · 관리자 모드 E2E (Playwright + 가짜 카메라에 QR 카드 영상)"""
import json, time, pathlib, sys, subprocess, io, re, os, socket
from playwright.sync_api import sync_playwright
from PIL import Image
T = pathlib.Path(__file__).resolve().parent; ROOT = pathlib.Path(os.environ.get('PC_ROOT', T.parent)); SHOTS = T / 'shots'; MEDIA = T / 'media'
SHOTS.mkdir(exist_ok=True); MEDIA.mkdir(exist_ok=True)
BASE = sys.argv[1] if len(sys.argv) > 1 else 'http://localhost:8765/'
ORIGIN = BASE.rstrip('/').rsplit('/', 1)[0] if BASE.count('/') > 3 else BASE.rstrip('/')
from urllib.parse import urlparse; ORIGIN = '{0.scheme}://{0.netloc}'.format(urlparse(BASE))
PFX = sys.argv[2] if len(sys.argv) > 2 else 'qr'
results, errors, net = [], [], []
def check(name, cond, info=''):
    results.append((name, bool(cond))); print(('PASS ' if cond else 'FAIL ') + name + ('' if cond else ' | ' + repr(info)[:400]), flush=True)
def wait_js(p, expr, timeout=15000):
    t = time.time()
    while time.time() - t < timeout / 1000:
        try:
            if p.evaluate(expr): return True
        except Exception: pass
        time.sleep(0.15)
    return False
def shot(p, name): p.wait_for_timeout(250); p.screenshot(path=str(SHOTS / f'{PFX}-{name}.png'))
def launch(pw, video=None):
    args = ['--no-sandbox', '--use-fake-ui-for-media-stream']
    if video: args += ['--use-fake-device-for-media-stream', f'--use-file-for-fake-video-capture={video}']
    return pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=args)
def ctx(b, w=1280, h=800, state=None, mobile=False):
    kw = dict(viewport={'width': w, 'height': h}, locale='ko-KR', timezone_id='Asia/Seoul', accept_downloads=True)
    if mobile: kw.update(is_mobile=True, has_touch=True, device_scale_factor=2)
    if state: kw['storage_state'] = state
    c = b.new_context(**kw); c.grant_permissions(['camera'], origin=ORIGIN)
    return c
def page(c):
    if not getattr(c, '_nocover', False): c.add_init_script('window.__PC_NOCOVER = 1'); c._nocover = True  # v2.0 커버 화면 건너뜀
    p = c.new_page()
    p.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    p.on('console', lambda m: m.type == 'error' and 'XNNPACK' not in m.text and errors.append('console: ' + m.text[:160]))
    p.on('request', lambda r: net.append(r.url))
    p.goto(BASE); p.wait_for_load_state('load'); wait_js(p, 'window.__pc && __pc.state.screen==="home"'); return p
def st(p, e, arg=None): return p.evaluate(e, arg) if arg is not None else p.evaluate(e)
def toast(p): return p.inner_text('#toast') if p.is_visible('#toast') else ''
def frame_video(png_bytes, name, scale=0.82):
    W, H = 640, 480; bg = Image.new('RGB', (W, H), (205, 200, 196)); im = Image.open(io.BytesIO(png_bytes)).convert('RGB')
    w = int(W * scale); h = int(im.height * w / im.width); bg.paste(im.resize((w, h), Image.LANCZOS), ((W - w) // 2, (H - h) // 2))
    raw = MEDIA / f'{name}.rgb'; raw.write_bytes(bg.tobytes()); out = MEDIA / f'{name}.y4m'
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '10', '-i', str(raw), '-vf', 'loop=20:1:0,scale=out_color_matrix=bt601:out_range=tv', '-pix_fmt', 'yuv420p', str(out)], check=True)
    raw.unlink(); bg.save(MEDIA / f'{name}.png'); return str(out)
def login(p, pw='7814'):
    p.fill('#adminPw', pw); p.click('#btnAdminLogin')
# 로컬 주소면 저장소 루트로 테스트 서버(8765)를 띄움
if BASE.startswith('http://localhost:8765'):
    with socket.socket() as _s:
        if _s.connect_ex(('127.0.0.1', 8765)) != 0:
            _srv = subprocess.Popen(['python3', '-m', 'http.server', '8765', '--bind', '127.0.0.1'], cwd=str(ROOT), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(1)
V14 = 'v14' if PFX == 'qr' else PFX + '-v14'
def shot14(p, name): p.wait_for_timeout(250); p.screenshot(path=str(SHOTS / f'{V14}-{name}.png'))
def agree(p, photo=False):
    p.check('#chkConsent'); p.click('#btnConsentPhoto' if photo else '#btnConsentCam')
def drape_finish(p, already=False, keep=False):
    """드레이핑만 하기 흐름: (동의) → 드레이핑 → 결과 → 다음 고객"""
    if not already: agree(p)
    wait_js(p, '__pc.state.screen==="drape" && !!__pc.state.rounds && !!__pc.stream')
    p.click('#btnPickL'); p.click('#btnDrapeDone'); ok = wait_js(p, '__pc.state.screen==="result"')
    if keep: return ok
    p.click('#btnNextCustomer'); wait_js(p, '__pc.state.screen==="home"'); return ok
def fits(p, sel):
    return st(p, "(s)=>[...document.querySelectorAll(s)].filter(e=>e.offsetParent).every(e=>{const r=e.getBoundingClientRect();if(!(r.top>=0&&r.bottom<=innerHeight+0.5&&r.left>=0&&r.right<=innerWidth+0.5))return false;const t=document.elementFromPoint(r.left+r.width/2,r.top+Math.min(r.height/2,12));return !!t&&(t===e||e.contains(t)||t.contains(e))})", sel)
def qr_of_canvas(p, cid):
    return st(p, "(async(id)=>{const j=(await import('./vendor/qr/jsqr.mjs')).default;const c=document.getElementById(id);const x=c.getContext('2d');const d=x.getImageData(0,0,c.width,c.height);return j(d.data,c.width,c.height)?.data||null})", cid)

with sync_playwright() as pw:
    # ================= A. 관리자: 로그인·잠금·발급·카드·인쇄·PDF·목록·취소 =================
    b = launch(pw); c = ctx(b); p = page(c)
    check('홈: 진단권 안내 + 관리자 링크', p.is_visible('#btnAdmin') and '진단권 QR' in p.inner_text('[data-for="home"]'))
    p.click('#btnStart'); wait_js(p, '__pc.state.screen==="consent"')
    check('A1: 진단 시작 → 동의 화면 먼저 (카메라 꺼짐)', st(p, '__pc.state.screen') == 'consent' and st(p, '__pc.stream') is None and not st(p, "document.body.classList.contains('has-stage')"))
    check('동의 체크 전에는 시작 불가', p.is_disabled('#btnConsentCam') and p.query_selector('#chkAge') is None); p.check('#chkConsent')
    check('A2: 동의 문구 (목적·처리 방식·거부 권리·운영 주체)', all(k in p.inner_text('[data-for="consent"]') for k in ['이용 목적', '저장하거나 서버로 보내지 않아요', '동의하지 않을 수 있어요', 'H.O.W']))
    p.click('#btnConsentCam'); wait_js(p, '__pc.state.screen==="ticket"')
    check('동의 후 진단권 확인 화면 + "QR 확인에만" 안내', st(p, '__pc.state.screen') == 'ticket' and p.is_visible('#ticketCode') and 'QR 확인에만 쓰고 저장하지 않아요' in p.inner_text('[data-for="ticket"]'))
    p.click('#btnTicketCancel'); wait_js(p, '__pc.state.screen==="home"')
    # 소스·저장소에 비밀번호 평문 없음
    srcs = st(p, "Promise.all(['js/app.js','js/ticket.js','js/admin.js','js/qrcard.js','js/qr.js','index.html'].map(u=>fetch(u).then(r=>r.text())))")
    check('코드에 비밀번호 평문(7814) 없음 (솔트 해시만)', all('7814' not in s for s in srcs) and 'PBKDF2' in srcs[1], [('7814' in s) for s in srcs])
    # 길게 누르기 진입
    box = p.locator('#brand').bounding_box(); p.mouse.move(box['x'] + 20, box['y'] + 10); p.mouse.down(); p.wait_for_timeout(1100); p.mouse.up()
    check('로고 길게 누르기 → 관리자 로그인', wait_js(p, '__pc.state.screen==="adminLogin"', 3000))
    login(p, '1111'); wait_js(p, '!document.getElementById("adminLoginMsg").hidden')
    check('틀린 비밀번호 거부 + 남은 횟수', '남은 시도 4번' in p.inner_text('#adminLoginMsg') and st(p, '__pc.state.screen') == 'adminLogin', p.inner_text('#adminLoginMsg'))
    for i in range(4): login(p, '0000'); p.wait_for_timeout(250)
    shot(p, 'admin-locked')
    check('5번 틀리면 잠금 (버튼 비활성·안내)', '잠겼어요' in p.inner_text('#adminLoginMsg') and p.is_disabled('#btnAdminLogin'), p.inner_text('#adminLoginMsg'))
    p.evaluate("document.getElementById('btnAdminLogin').disabled=false"); login(p, '7814'); p.wait_for_timeout(600)
    check('잠금 중에는 맞는 비밀번호도 거부', st(p, '__pc.state.screen') == 'adminLogin')
    p.reload(); wait_js(p, 'window.__pc'); check('새로고침해도 잠금 유지', st(p, "__pc.store.lock().until") > time.time() * 1000)
    p.evaluate("__pc.store.setLock({fails:0, until:Date.now()-1})")  # 잠금 시간 경과 흉내
    p.click('#btnAdmin'); login(p, '7814')
    check('맞는 비밀번호 → 관리자 모드', wait_js(p, '__pc.state.screen==="admin"', 8000))
    p.fill('#issueQty', '80'); p.select_option('#issueExp', '90'); p.click('#btnIssue'); wait_js(p, '!document.getElementById("issueResult").hidden')
    check('수량은 최대 50장으로 제한', p.input_value('#issueQty') == '50' and len(st(p, '__pc.store.issued()')) == 50)
    p.fill('#issueQty', '12'); p.click('#btnIssue'); p.wait_for_timeout(500)
    iss = st(p, '__pc.store.issued()'); batch = iss[:12]
    check('진단권 12장 발급 (서명 코드·만료 90일)', len(iss) == 62 and all(re.fullmatch(r'PC1(-[0-9A-HJKMNP-TV-Z]{4}){6}', t['token']) for t in batch) and batch[0]['exp'] - batch[0]['issued'] == 90, batch[0])
    check('카드 미리보기 (90×50mm 비율)', wait_js(p, "document.getElementById('cardPreview').naturalWidth>0") and abs(st(p, "document.getElementById('cardPreview').naturalWidth/document.getElementById('cardPreview').naturalHeight") - 1.8) < 0.01 and p.inner_text('#cardIdx').startswith('1 / 12'))
    shot(p, 'admin-issue')
    with p.expect_download() as dl: p.click('#btnCardPng')
    im = Image.open(dl.value.path()); im.save(SHOTS / f'{PFX}-card-sample.png')
    card0 = open(dl.value.path(), 'rb').read()
    check('카드 PNG 300dpi (1063×591)', im.size == (1063, 591), im.size)
    # 카드 QR이 실제로 읽히는지 (jsQR로 디코드)
    dec = st(p, """(async(u)=>{const j=(await import('./vendor/qr/jsqr.mjs')).default;const i=new Image();i.src=u;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);const d=x.getImageData(0,0,c.width,c.height);return j(d.data,c.width,c.height)?.data})""", 'data:image/png;base64,' + __import__('base64').b64encode(card0).decode())
    check('카드의 QR이 읽힘 = 발급 코드', dec == batch[0]['token'], (dec, batch[0]['token']))
    p.click('#btnCardNext'); p.click('#btnCardNext'); p.wait_for_timeout(200)
    with p.expect_download() as dl: p.click('#btnCardPng')
    card2 = open(dl.value.path(), 'rb').read()
    # 인쇄 미리보기 / A4 시트 / PDF
    p.evaluate('() => { window.__printed = 0; window.print = () => { window.__printed++; }; }')
    p.click('#btnPrintView'); wait_js(p, "!document.getElementById('printView').hidden && document.getElementById('pvProgress').hidden && [...document.querySelectorAll('#pvPages img')].every(i=>i.complete&&i.naturalWidth>0)", 20000)
    check('A4 인쇄 미리보기: 12장 → 2쪽', st(p, "document.querySelectorAll('#pvPages img').length") == 2 and '12장' in p.inner_text('#pvTitle'))
    shot(p, 'print-preview')
    with p.expect_download() as dl: p.click('#btnSheetPng')
    sh = Image.open(dl.value.path()); sh.save(SHOTS / f'{PFX}-print-sheet-a4.png')
    check('A4 시트 PNG 300dpi (2480×3508)', sh.size == (2480, 3508), sh.size)
    # 시트 재단선: 첫 카드 왼쪽 위 모서리 바깥에 검은 선
    k = 300 / 25.4; mx = (210 - 186) / 2; my = (297 - (5 * 50 + 4 * 6)) / 2
    px = sh.convert('L').getpixel((int((mx - 2) * k), int(my * k)))
    check('A4 시트 재단선 표시', px < 80, px)
    p.click('#btnDoPrint'); check('인쇄하기 → window.print 호출', st(p, 'window.__printed') == 1)
    with p.expect_download() as dl: p.click('#btnPvPdf')
    pdf = open(dl.value.path(), 'rb').read()
    check('PDF 저장 (A4 2쪽)', pdf.startswith(b'%PDF-1.4') and pdf.count(b'/Type /Page ') == 2 and b'/MediaBox [0 0 595.28 841.89]' in pdf and pdf.rstrip().endswith(b'%%EOF'), len(pdf))
    (SHOTS / f'{PFX}-print-sample.pdf').write_bytes(pdf) if PFX == 'qr' else None
    p.click('#btnPvClose')
    # 목록 / 취소
    p.click('#tabList'); p.wait_for_timeout(200)
    check('발급 목록: 62장 미사용', p.locator('#qList .qrow').count() == 62 and '미사용 62' in p.inner_text('#listSummary'), p.inner_text('#listSummary'))
    p.click(f'#qList [data-revoke="{batch[2]["id"]}"]'); p.click('#modalYes'); p.wait_for_timeout(200)
    check('코드 취소 → 취소됨', '취소됨' in p.inner_text(f'#qList .qrow[data-id="{batch[2]["id"]}"]') and '취소 1' in p.inner_text('#listSummary'))
    shot(p, 'admin-list')
    p.click('#tabSettings'); shot(p, 'admin-settings'); p.click('#tabIssue')
    # 자동 로그아웃
    p.evaluate('__pc.admin.setIdleMs(1500)'); p.wait_for_timeout(2800)
    check('관리자 무동작 시 자동 로그아웃', st(p, '__pc.state.screen') == 'home' and not st(p, '__pc.admin.authed') and '자동' in toast(p), toast(p))
    p.evaluate(f'__pc.admin.setIdleMs({3*60*1000})')
    state = c.storage_state()
    # 위조 카드(서명 틀림)와 일반 QR 이미지 만들기
    t0, t1 = batch[0], batch[1]
    forged_tok = t0['token'][:-1] + ('0' if t0['token'][-1] != '0' else '1')
    forged = st(p, """(async(f)=>{const m=await import('./js/qrcard.js');const c=m.renderCard(document.createElement('canvas'),f,300);return c.toDataURL('image/png')})""", {**t0, 'token': forged_tok})
    rnd = st(p, """(async()=>{const m=await import('./js/qrcard.js');const c=document.createElement('canvas');c.width=c.height=600;m.drawQr(c.getContext('2d'),'HELLO-WORLD-1234',0,0,600,4);return c.toDataURL('image/png')})()""")
    c.close(); b.close()
    import base64
    v_t0 = frame_video(card0, 'qr_t0'); v_t2 = frame_video(card2, 'qr_t2_revoked')
    v_forged = frame_video(base64.b64decode(forged.split(',')[1]), 'qr_forged'); v_rnd = frame_video(base64.b64decode(rnd.split(',')[1]), 'qr_random', 0.6)
    from PIL import ImageFilter
    _bl = io.BytesIO(); Image.open(io.BytesIO(card0)).convert('RGB').filter(ImageFilter.GaussianBlur(14)).save(_bl, 'PNG')
    v_far = frame_video(_bl.getvalue(), 'qr_blur', 0.82)  # 초점이 안 맞아 아직 못 읽는 카드
    b = launch(pw, v_far); c = ctx(b, state=state); p = page(c)
    p.click('#btnStart'); agree(p); wait_js(p, '!!__pc.stream && document.getElementById("video").videoWidth>0', 8000); p.wait_for_timeout(1500)
    check('스캔 중: 카메라 + QR 가이드 + 찾는 중 안내', st(p, '__pc.state.screen') == 'ticket' and '찾는 중' in p.inner_text('#ticketMsg') and st(p, "getComputedStyle(document.getElementById('layerQr')).display") != 'none')
    check('A1: QR 화면은 뒤 카메라 우선(거울 모드 아님)', not st(p, "document.getElementById('stage').classList.contains('mirror')"))
    shot(p, 'scan'); shot14(p, 'qr-screen'); c.close(); b.close()

    # ================= B. 진단권 스캔: 동의 → QR → 진단 → 이어하기 → 재스캔 거부 → 수동 입력 → 관리자 1회 허가 =================
    b = launch(pw, v_t0); c = ctx(b, state=state); p = page(c)
    p.click('#btnDrapeOnly'); agree(p); wait_js(p, '__pc.state.screen==="ticket" && !!__pc.stream && document.getElementById("video").videoWidth>0', 8000)
    shot(p, 'scan-ok')
    check('카메라로 QR 스캔 → 진단 시작(드레이핑)', wait_js(p, '__pc.state.screen==="drape"', 15000), st(p, '__pc.state.screen'))
    check('스캔 확인 안내 + 사용 처리', '확인 완료' in toast(p) and st(p, f"__pc.store.isUsed('{t0['id']}')") and st(p, '__pc.store.active().id') == t0['id'], toast(p))
    check('드레이핑은 앞 카메라(거울 모드)로 다시 켬', wait_js(p, "document.getElementById('stage').classList.contains('mirror') && !!__pc.stream", 5000))
    # 실수로 처음으로 → 이 기기의 [이어하기] 버튼으로만 이어서
    p.click('#btnReset'); p.click('#modalYes'); wait_js(p, '__pc.state.screen==="home"')
    check('A4: 처음으로 → [이어하기] 버튼 표시', p.is_visible('#btnResume'))
    p.click('#btnResume'); agree(p)
    check('A4: 이어하기 → 동의 후 QR 없이 드레이핑', wait_js(p, '__pc.state.screen==="drape"', 6000) and '이어서' in toast(p))
    check('진단 완료(결과)까지 진행', drape_finish(p, already=True))
    check('완료 후 세션 종료 · 이어하기 숨김', st(p, '__pc.store.active()') is None and not p.is_visible('#btnResume'))
    # 같은 QR 다시 → 거부
    p.click('#btnStart'); agree(p); wait_js(p, '__pc.state.screen==="ticket"')
    check('사용한 QR 재스캔 → "이미 사용된 QR 코드예요"', wait_js(p, "document.getElementById('ticketMsg').innerText.includes('이미 사용된 QR 코드예요')", 15000) and st(p, '__pc.state.screen') == 'ticket', p.inner_text('#ticketMsg'))
    p.evaluate("document.getElementById('toast').hidden=true"); shot(p, 'rejected-used')
    # 수동 입력
    p.fill('#ticketCode', 'abcd'); p.click('#btnTicketCode'); p.wait_for_timeout(300)
    check('수동 입력: 형식 오류 거부', '진단권 QR 코드가 아니에요' in p.inner_text('#ticketMsg'), p.inner_text('#ticketMsg'))
    bad = t1['code'][:-1] + ('0' if t1['code'][-1] != '0' else '1')
    p.fill('#ticketCode', bad); p.click('#btnTicketCode'); p.wait_for_timeout(300)
    check('수동 입력: 위조(서명 불일치) 거부', '유효하지 않은 QR 코드예요' in p.inner_text('#ticketMsg'), p.inner_text('#ticketMsg'))
    p.fill('#ticketCode', t1['code'].replace('-', '').lower()); p.click('#btnTicketCode')
    check('수동 입력: 소문자·하이픈 없이도 확인 → 진단 시작(보정)', wait_js(p, '__pc.state.screen==="calib"', 6000) and st(p, f"__pc.store.used()['{t1['id']}'].src") == 'manual')
    # A4: 진행 중이어도 [진단 시작]은 새 진단권 필요 (이어하기 버튼으로만 이어짐)
    p.click('#btnReset'); p.click('#modalYes'); wait_js(p, '__pc.state.screen==="home"')
    p.click('#btnStart'); agree(p); check('A4: 진행 중 진단이 있어도 [진단 시작]은 QR 필요', wait_js(p, '__pc.state.screen==="ticket"', 5000))
    p.fill('#ticketCode', t1['token']); p.click('#btnTicketCode'); check('같은 카드를 다시 보여 주면 이어하기', wait_js(p, '__pc.state.screen==="calib"', 6000) and '이어서' in toast(p))
    # A5/B1: 고객 무동작 자동 초기화 (계속하기 → 유지, 응답 없음 → 카메라 끄고 처음으로 + 이어하기 지움)
    p.evaluate('__pc.setIdle(1200, 2500)'); check('무동작 → "계속하시겠어요?" 안내', wait_js(p, "!document.getElementById('idlePrompt').hidden", 4000))
    p.click('#btnIdleContinue'); p.wait_for_timeout(300)
    check('계속하기 → 화면 유지', p.is_hidden('#idlePrompt') and st(p, '__pc.state.screen') == 'calib')
    wait_js(p, "!document.getElementById('idlePrompt').hidden && +document.getElementById('idleCount').innerText<=2", 5000); shot14(p, 'idle')
    check('응답 없으면 카메라 끄고 처음으로 + 이어하기 지움', wait_js(p, '__pc.state.screen==="home"', 6000) and st(p, '__pc.stream') is None and st(p, '__pc.store.active()') is None and not p.is_visible('#btnResume') and '처음 화면' in toast(p), toast(p))
    p.evaluate('__pc.setIdle(150000, 20000)')
    p.click('#btnStart'); agree(p); wait_js(p, '__pc.state.screen==="ticket"'); p.fill('#ticketCode', t1['token']); p.click('#btnTicketCode'); p.wait_for_timeout(400)
    check('수동 입력 코드도 1회만', '이미 사용된' in p.inner_text('#ticketMsg'), p.inner_text('#ticketMsg'))
    p.click('#btnTicketCancel'); wait_js(p, '__pc.state.screen==="home"')
    # A6/B5: 관리자 1회 허가 (쌓이지 않음·1시간·취소·고객 화면엔 작은 점만)
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000)
    p.click('#btnGrantPass'); wait_js(p, '__pc.state.screen==="home"')
    check('A6: 허가 → 홈엔 작은 점만 (횟수 문구 없음)', p.is_visible('#passDot') and '허가' not in p.inner_text('[data-for="home"]') and not st(p, '__pc.admin.authed'))
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#btnGrantPass'); wait_js(p, '__pc.state.screen==="home"')
    check('A6: 두 번 눌러도 1회만 (연장 안내)', '연장' in toast(p) and st(p, "__pc.store.passInfo().n") == 1 and st(p, "__pc.store.passInfo().until - Date.now()") > 59 * 60000, toast(p))
    p.click('#btnDrapeOnly'); agree(p); check('허가로 QR 없이 진단 시작', wait_js(p, '__pc.state.screen==="drape"', 6000) and '관리자 허가' in toast(p))
    check('허가 진단 완료', drape_finish(p, already=True))
    p.click('#btnStart'); agree(p); check('허가는 1회만 → 다시 진단권 확인', wait_js(p, '__pc.state.screen==="ticket"', 5000) and st(p, '__pc.store.passInfo()') is None and not st(p, "!document.getElementById('passDot').hidden"))
    p.click('#btnTicketCancel'); wait_js(p, '__pc.state.screen==="home"')
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#btnGrantPass'); wait_js(p, '__pc.state.screen==="home"')
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000)
    check('관리자 화면에 허가 대기·시간 표시', p.is_visible('#adminPassChip') and '대기 중' in p.inner_text('#adminPassChip'))
    p.click('#btnPassCancel'); p.click('#modalYes'); p.wait_for_timeout(200)
    check('A6: 허가 취소', st(p, '__pc.store.passInfo()') is None and p.is_hidden('#adminPassChip'))
    st(p, "__pc.store.grantPass(Date.now() - 61*60000)"); check('A6: 1시간 지난 허가는 무효', st(p, '__pc.store.passInfo()') is None)
    # B3 통계
    p.click('#tabStats'); p.wait_for_timeout(200)
    check('B3: 통계 (오늘 이용·7일 그래프·현황·시작 방법·묶음)', int(p.inner_text('#stToday')) >= 3 and st(p, "document.querySelectorAll('#admStats .barcol').length") == 7 and 'QR 1' in p.inner_text('#stSrc') and '코드 입력 1' in p.inner_text('#stSrc') and '관리자 허가 1' in p.inner_text('#stSrc'), p.inner_text('#admStats')[:300])
    shot14(p, 'stats')
    # B11 묶음 메모 · 목록 필터
    p.click('#tabIssue'); p.fill('#issueQty', '4'); p.fill('#issueMemo', '10월 이벤트'); p.click('#btnIssue'); p.wait_for_timeout(500)
    p.click('#tabList'); opts = st(p, "[...document.getElementById('listBatch').options].map(o=>[o.value,o.text])")
    ev = [o for o in opts if '10월 이벤트' in o[1]]
    check('B11: 묶음 메모로 발급 → 목록 묶음 선택에 표시', len(ev) == 1 and '4장' in ev[0][1], opts)
    p.select_option('#listBatch', ev[0][0]); check('B11: 묶음 필터 → 4장만', st(p, "document.querySelectorAll('#qList .qrow').length") == 4 and '10월 이벤트' in p.inner_text('#qList'))
    p.select_option('#listBatch', ''); p.select_option('#listStatus', 'used'); check('목록 상태 필터(사용됨)', st(p, "[...document.querySelectorAll('#qList .st')].every(e=>e.innerText==='사용됨')") and st(p, "document.querySelectorAll('#qList .qrow').length") >= 2)
    p.select_option('#listStatus', '')
    # B2 백업 · CSV · 운영 정보(A2)
    p.click('#tabSettings'); p.fill('#cfgCt', '051-123-4567'); p.click('#btnCfgSave')
    with p.expect_download() as dl: p.click('#btnBackup')
    bk = json.loads(open(dl.value.path(), encoding='utf-8').read())
    check('B2: 백업 파일 (서명·발급·사용·취소 포함, 평문 비밀번호 없음)', bk['kind'] == 'backup' and len(bk['sig']) == 64 and len(bk['data']['issued']) == len(st(p, '__pc.store.issued()')) and '7814' not in json.dumps(bk), list(bk))
    bk_path = str(MEDIA / 'backup_test.json'); open(bk_path, 'w', encoding='utf-8').write(json.dumps(bk))
    bad = json.loads(json.dumps(bk)); bad['data']['used']['ZZZZZZZZ'] = {'at': 1, 'src': 'qr'}; bad_path = str(MEDIA / 'backup_bad.json'); open(bad_path, 'w').write(json.dumps(bad))
    with p.expect_download() as dl: p.click('#btnCsv')
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    check('B2: 발급 목록 CSV (엑셀용 BOM·묶음 메모·상태)', csv.startswith('"일련번호"') and '10월 이벤트' in csv and '사용됨' in csv and '취소됨' in csv)
    with p.expect_download() as dl: p.click('#btnUsedExport')
    used_path = dl.value.path(); usedf = json.loads(open(used_path, encoding='utf-8').read())
    check('B7: 사용 기록 파일 (사용·취소만)', usedf['kind'] == 'used' and t0['id'] in usedf['data']['used'] and sorted(usedf['data']) == ['revoked', 'used'])
    used_copy = str(MEDIA / 'used_test.json'); open(used_copy, 'w', encoding='utf-8').write(open(used_path, encoding='utf-8').read())
    check('A8: 저장소 보호 상태 표시', '저장소 보호' in p.inner_text('#persistStatus'))
    shot14(p, 'backup')
    # B7 사용 기록 QR 보기
    p.click('#btnSyncQr'); wait_js(p, "!document.getElementById('syncView').hidden")
    sync_txt = st(p, "document.getElementById('syncCanvas').dataset.text"); dec = qr_of_canvas(p, 'syncCanvas')
    check('B7: 사용 기록 QR (서명·읽힘)', sync_txt.startswith('PCU1:1/1:') and dec == sync_txt and t0['id'] in sync_txt, (sync_txt[:40], dec and dec[:40]))
    sync_png = st(p, "document.getElementById('syncCanvas').toDataURL('image/png')"); shot14(p, 'sync-qr'); p.click('#btnSyncClose')
    # 동의 화면에 운영 정보 반영
    p.click('#btnAdminLogout'); wait_js(p, '__pc.state.screen==="home"')
    p.click('#btnStart'); wait_js(p, '__pc.state.screen==="consent"')
    check('A2: 동의 화면에 관리자가 입력한 문의처 표시', '051-123-4567' in p.inner_text('[data-for="consent"]'))
    p.click('#btnConsentNo'); wait_js(p, '__pc.state.screen==="home"')
    # A9 시계 되돌림 경고
    p.evaluate('localStorage.setItem("pcqr.seen", String(Date.now() + 2*3600*1000))'); p.reload(); wait_js(p, 'window.__pc')
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000)
    check('A9: 기기 시계가 뒤로 바뀌면 관리자 경고', p.is_visible('#clockWarn') and '뒤로 바뀌었어요' in p.inner_text('#clockWarn'), p.inner_text('#clockWarn') if p.is_visible('#clockWarn') else '')
    p.click('#btnClockOk'); check('경고 확인 → 숨김', p.is_hidden('#clockWarn'))
    p.evaluate('localStorage.setItem("pcqr.seen", String(Date.now()))')
    # v1.4.2 A1: 시계가 미래(1년 뒤)로 갔다가 바로잡힌 기기 → 정상 코드 만료 거부 → [지금 시각으로 기준 재설정]
    p.evaluate('localStorage.setItem("pcqr.seen", String(Date.now() + 365*86400000))'); p.reload(); wait_js(p, 'window.__pc')
    tok90 = st(p, "(async()=>{const m=await import('./js/ticket.js');return (await m.makeToken({expDays:90})).token})()")
    check('v1.4.2 A1: 재설정 전에는 정상 90일 코드가 만료로 거부(문제 재현)', st(p, "(async(t)=>{const m=await import('./js/ticket.js');const s=m.createStore();const r=await m.verifyToken(t,Math.max(Date.now(),s.seen()));return r.reason})", tok90) == 'expired')
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000)
    check('v1.4.2 A1: 경고에 [지금 시각으로 기준 재설정] 버튼', p.is_visible('#btnClockReset') and '기준 재설정' in p.inner_text('#clockWarnTxt') and '만료로 보일 수' in p.inner_text('#clockWarnTxt'), p.inner_text('#clockWarn'))
    shot(p, 'clock-reset') if PFX != 'qr' else p.screenshot(path=str(SHOTS / 'v142-clock-reset.png'))
    p.click('#btnClockReset'); wait_js(p, "!document.getElementById('modal').hidden", 3000); p.click('#modalYes'); p.wait_for_timeout(300)
    check('v1.4.2 A1: 재설정 → 경고 사라짐·기준=지금·기록 남음', p.is_hidden('#clockWarn') and abs(st(p, '__pc.store.seen()-Date.now()')) < 60000 and len(st(p, '__pc.store.clockLog()')) == 1)
    p.click('#tabSettings'); wait_js(p, "!document.getElementById('clockLogTxt').hidden", 3000); check('v1.4.2 A1: 설정 탭에 재설정 기록 표시', p.is_visible('#clockLogTxt') and '재설정 기록 1건' in p.inner_text('#clockLogTxt'), p.inner_text('#clockLogTxt') if p.is_visible('#clockLogTxt') else '')
    check('v1.4.2 A1: 재설정 후 같은 코드 통과', st(p, "(async(t)=>{const m=await import('./js/ticket.js');return (await m.verifyToken(t,Math.max(Date.now(),__pc.store.seen()))).ok})", tok90))
    p.reload(); wait_js(p, 'window.__pc'); check('v1.4.2 A1: 새로고침해도 경고 다시 안 생김', st(p, '__pc.store.clockWarn()') is None)
    ls = st(p, 'Object.keys(localStorage)')
    check('저장소에는 진단권 기록(pcqr.*)만', all(k.startswith('pcqr.') for k in ls) and '7814' not in json.dumps(st(p, 'Object.fromEntries(Object.entries(localStorage))')), ls)
    c.close(); b.close()

    # ================= B2/B7 다른 기기: 백업 불러오기 · 사용 기록 파일 · QR로 가져오기 =================
    sync_vid = frame_video(__import__('base64').b64decode(sync_png.split(',')[1]), 'qr_sync', 0.62)
    b = launch(pw, sync_vid); c = ctx(b); p = page(c)
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#tabSettings')
    p.set_input_files('#restoreFile', bad_path); p.wait_for_timeout(500)
    check('B2: 변조된 백업 파일 거부', '손상' in toast(p) and len(st(p, '__pc.store.issued()')) == 0, toast(p))
    p.click('#btnSyncScan'); wait_js(p, '__pc.state.screen==="adminScan"')
    check('B7: QR로 사용 기록 가져오기 (카메라)', wait_js(p, "document.getElementById('syncMsg').innerText.includes('가져옴')", 15000) and st(p, f"__pc.store.isUsed('{t0['id']}')") and st(p, f"__pc.store.used()['{t0['id']}'].src") == 'sync', p.inner_text('#syncMsg'))
    p.click('#btnSyncDone'); wait_js(p, '__pc.state.screen==="admin"')
    p.click('#tabSettings'); p.set_input_files('#restoreFile', bk_path); wait_js(p, "!document.getElementById('modal').hidden", 3000); p.click('#modalYes')
    if wait_js(p, "!document.getElementById('modal').hidden && document.getElementById('modalMsg').innerText.includes('비밀번호')", 1500): p.click('#modalNo')
    p.wait_for_timeout(400)
    check('B2: 백업 불러오기 → 발급 목록·사용·취소·운영 정보 복원', len(st(p, '__pc.store.issued()')) == len(bk['data']['issued']) and st(p, f"__pc.store.isUsed('{t1['id']}')") and st(p, f"__pc.store.isRevoked('{batch[2]['id']}')") and st(p, '__pc.store.cfg().contact') == '051-123-4567', toast(p))
    c.close(); b.close()
    b = launch(pw, v_t0); c = ctx(b); p = page(c)
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#tabSettings')
    p.set_input_files('#restoreFile', used_copy); wait_js(p, "!document.getElementById('modal').hidden", 3000); p.click('#modalYes'); p.wait_for_timeout(400)
    check('B7: 사용 기록 파일 가져오기', st(p, f"__pc.store.isUsed('{t0['id']}')"))
    p.click('#btnAdminLogout'); wait_js(p, '__pc.state.screen==="home"')
    p.click('#btnStart'); agree(p)
    check('B7: 가져온 기기에서도 같은 카드 거부', wait_js(p, "document.getElementById('ticketMsg').innerText.includes('이미 사용된')", 15000))
    c.close(); b.close()

    # ================= C/D/E. 취소된 코드 · 위조 QR · 일반 QR =================
    for vid, label, expect, name in [(v_t2, '취소된 코드 스캔 거부', '사용이 취소된', 'rejected-revoked'), (v_forged, '위조(서명 틀림) QR 거부', '유효하지 않은 QR 코드예요', 'rejected-forged'), (v_rnd, '진단권이 아닌 QR 거부', '진단권 QR 코드가 아니에요', 'rejected-random')]:
        b = launch(pw, vid); c = ctx(b, 390, 844, state=state, mobile=True); p = page(c)
        p.click('#btnStart'); wait_js(p, '__pc.state.screen==="consent"')
        if name == 'rejected-forged':
            check('동의 화면: 운영 주체 H.O.W · 만 14세 체크 없음', 'H.O.W' in p.inner_text('[data-for="consent"]') and '14세' not in p.inner_text('[data-for="consent"]') and p.query_selector('#chkAge') is None)
            shot14(p, 'consent') if PFX != 'qr' else p.screenshot(path=str(SHOTS / 'v141-consent.png'))
            check('휴대폰: 동의 화면 체크·버튼 한 화면', fits(p, '.screen:not([hidden]) .bigbtns .btn, .screen:not([hidden]) .bigbtns .check')); shot14(p, 'consent')
        agree(p)
        ok = wait_js(p, f"document.getElementById('ticketMsg').innerText.includes('{expect}')", 15000)
        check(label, ok and st(p, '__pc.state.screen') == 'ticket', p.inner_text('#ticketMsg'))
        if name == 'rejected-forged': check('휴대폰: 진단권 화면 버튼·입력 한 화면', fits(p, '.screen:not([hidden]) .bigbtns .btn, #ticketCode'))
        p.evaluate("document.getElementById('toast').hidden=true"); shot(p, name)
        c.close(); b.close()
    # A3: 카메라 권한 거부 → 코드 입력 안내
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox', '--use-fake-device-for-media-stream', '--deny-permission-prompts'])
    c = b.new_context(viewport={'width': 800, 'height': 1280}, locale='ko-KR'); p = page(c)
    p.click('#btnStart'); agree(p); wait_js(p, "document.getElementById('ticketMsg').innerText.includes('코드를 입력')", 8000)
    check('A3: 카메라 거부 → "코드를 입력해 주세요" (사진 안내 아님)', '코드를 입력' in p.inner_text('#ticketMsg') and '사진 파일' not in p.inner_text('#stageMsg'), (p.inner_text('#ticketMsg'), p.inner_text('#stageMsg')))
    c.close(); b.close()

    # v1.4.1: 예전 기본 운영 주체를 그대로 둔 기기 → H.O.W로 자동 변경
    b = launch(pw); c = ctx(b); c.add_init_script("try{if(!sessionStorage.getItem('x')){sessionStorage.setItem('x',1);localStorage.setItem('pcqr.cfg',JSON.stringify({operator:'롯데렌터카 김해공항',contact:'',wake:true}))}}catch(e){}"); p = page(c)
    p.click('#btnStart'); wait_js(p, '__pc.state.screen==="consent"')
    check('예전 기본값(롯데렌터카 김해공항) 저장 기기 → H.O.W 표시·저장값 변경', 'H.O.W' in p.inner_text('#cfgOperatorTxt') and '롯데' not in p.inner_text('[data-for="consent"]') and json.loads(st(p, "localStorage.getItem('pcqr.cfg')"))['operator'] == 'H.O.W')
    c.close(); b.close()

    # ================= B6 결과 → 고객 휴대폰 (QR 주소 #r=…, 서버 없음) =================
    b = launch(pw, v_t0); c = ctx(b, 1280, 800); c.add_init_script("try{localStorage.setItem('pcqr.pass',JSON.stringify({at:0,until:4102444800000,n:5}))}catch(e){}"); p = page(c)
    p.click('#btnDrapeOnly'); drape_finish(p, keep=True)
    p.click('[data-rtab="glasses"]'); p.select_option('#selFace', 'heart')
    check('결과 화면 버튼 4개 한 화면(2×2)', fits(p, '[data-for="result"] .bigbtns .btn'))
    # v1.5 헤어 탭
    p.click('[data-rtab="hair"]'); p.wait_for_timeout(150)
    fem = st(p, "[...document.querySelectorAll('#rpane .hitem')].map(e=>e.dataset.h)")
    check('v1.5 헤어: 헤어 컬러 4색 + 하트형 여성 스타일 3개(그림·짧은/중간/긴)', p.locator('#rpane .palette.hairc .swatch').count() == 4 and len(fem) == 3 and p.locator('#rpane .hitem svg').count() == 3 and st(p, "[...document.querySelectorAll('#rpane .hlen')].map(e=>e.textContent).join('/')") == '짧은 머리/중간 길이/긴 머리' and '피하면 좋은 스타일' in p.inner_text('#rpane'), fem)
    check('v1.5 헤어: 기본 여성', st(p, "document.querySelector('[data-hg=f]').classList.contains('on')"))
    p.screenshot(path=str(SHOTS / ('v150-hair-tablet.png' if PFX == 'qr' else f'{PFX}-v150-hair-tablet.png')))
    p.click('[data-hg="m"]'); p.wait_for_timeout(150); mal = st(p, "[...document.querySelectorAll('#rpane .hitem')].map(e=>e.dataset.h)")
    check('v1.5 헤어: 남성 전환 → 다른 3개 스타일', len(mal) == 3 and not set(mal) & set(fem), mal)
    p.click('[data-rtab="lip"]'); p.click('[data-rtab="hair"]'); check('v1.5 헤어: 탭을 바꿔도 남성 선택 유지', st(p, "document.querySelector('[data-hg=m]').classList.contains('on')"))
    p.select_option('#selFace', 'long'); p.wait_for_timeout(150); check('v1.5 헤어: 얼굴형 바꾸면 추천도 바뀜', st(p, "[...document.querySelectorAll('#rpane .hitem')].map(e=>e.dataset.h)") != mal)
    p.select_option('#selFace', 'heart'); p.wait_for_timeout(150)
    with p.expect_download() as dl: p.click('#btnSavePng')
    card = Image.open(dl.value.path()); card.save(SHOTS / ('v150-hair-card.png' if PFX == 'qr' else f'{PFX}-v150-hair-card.png'))
    check('v1.5 헤어: PNG 카드에 헤어 포함(길어짐)', card.width == 1080 and card.height > 3600, card.size)
    p.click('#btnResultQr'); wait_js(p, "!document.getElementById('rqView').hidden")
    url = st(p, "document.getElementById('rqCanvas').dataset.url"); dec = qr_of_canvas(p, 'rqCanvas'); resname = p.inner_text('#resName')
    check('B6: 결과 QR = 결과 주소(#r=…), 얼굴 데이터 없음', dec == url and re.search(r'#r=2[0-9a-z]{13}[fm][0-9a-z]{15}(&t=[0-9][fm])?(&b=[^&#]+)?$', url or '') and len(url) < 160, (url, dec))
    shot14(p, 'result-qr'); p.click('#btnRqClose'); c.close(); b.close()
    b = launch(pw); c = ctx(b, 390, 844, mobile=True); p = c.new_page(); p.on('pageerror', lambda e: errors.append('pageerror: ' + str(e))); p.on('request', lambda r: net.append(r.url))
    shared_net = []; p.on('request', lambda r: shared_net.append(r.url))
    p.goto(url); wait_js(p, 'window.__pc && __pc.state.screen==="shared"', 8000); p.wait_for_timeout(3000)
    heavy = [u for u in shared_net if re.search(r'mediapipe|\.wasm|\.task|sw\.js', u)]
    check('v1.4.2 A2: 고객 결과 보기 — 서비스 워커·분석 엔진·모델 안 받음', not heavy and st(p, 'navigator.serviceWorker.getRegistrations().then(r=>r.length)') == 0 and st(p, 'caches.keys().then(k=>k.length)') == 0, heavy[:4])
    check('v1.4.2 A2: 고객 결과 보기 — 화면 꺼짐 방지 안 씀·시계 기록 안 남김', st(p, '__pc.wakeLock') is None and 'pcqr.seen' not in st(p, 'Object.keys(localStorage)'), st(p, 'Object.keys(localStorage)'))
    p.click('[data-rtab="hair"]'); p.wait_for_timeout(150)
    check('v1.5 헤어: 고객 휴대폰에서도 헤어 탭·남성 기준 그대로', st(p, "[...document.querySelectorAll('#rpane .hitem')].map(e=>e.dataset.h)") == mal and st(p, "document.querySelector('[data-hg=m]').classList.contains('on')"))
    check('v1.5 헤어: 휴대폰 헤어 탭 넘침 없음', st(p, "[...document.querySelectorAll('#rpane .hitem, .rtab')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth+0.5})"))
    p.screenshot(path=str(SHOTS / ('v150-hair-phone.png' if PFX == 'qr' else f'{PFX}-v150-hair-phone.png')))
    check('B6: 고객 휴대폰 결과 보기 (읽기 전용·같은 결과·얼굴형 반영)', st(p, '__pc.state.screen') == 'shared' and p.inner_text('#resName') == resname and st(p, "document.getElementById('selFace').value") == 'heart' and p.is_hidden('#btnReset') and st(p, '__pc.stream') is None)
    p.click('[data-rtab="lip"]'); check('고객 보기: 탭 전환', '추천 립' in p.inner_text('#sharedCard'))
    check('고객 보기: 기기에 진단권 기록 안 남김', not [k for k in st(p, 'Object.keys(localStorage)') if k in ('pcqr.used', 'pcqr.active')])
    p.click('[data-rtab="color"]'); shot14(p, 'customer-view')
    with p.expect_download() as dl: p.click('#btnSharedPng')
    check('고객 보기: 결과 이미지 저장', Image.open(dl.value.path()).size[0] == 1080)
    # 결과 전용 화면은 주소 바꾸기를 막으므로(holdLock) 새 탭에서 확인
    p = c.new_page(); p.goto(BASE + '#r=zzz'); check('잘못된 결과 주소 → 결과 전용 오류 화면(v1.8)', wait_js(p, '__pc.state.screen=="sharedErr"', 8000))
    c.close(); b.close()

    # ================= B4 화면 꺼짐 방지 · 전체 화면 =================
    b = launch(pw); c = ctx(b); p = page(c); p.click('#brand', force=True); p.wait_for_timeout(300)
    wl = st(p, "'wakeLock' in navigator ? navigator.wakeLock.request('screen').then(l=>{l.release();return 'ok'}).catch(e=>e.name) : 'none'")
    if wl == 'ok': p.click('#brand', force=True)
    check('B4: 화면 꺼짐 방지 (지원·허용되면 켜짐, 아니면 조용히 넘어감)', wait_js(p, '!!__pc.wakeLock && !__pc.wakeLock.released', 3000) if wl == 'ok' else not errors, wl)
    check('B4: 전체 화면 버튼', p.is_visible('#btnFull') == st(p, 'document.fullscreenEnabled'))
    if p.is_visible('#btnFull'): p.click('#btnFull'); p.wait_for_timeout(300); check('전체 화면 켜기', st(p, '!!document.fullscreenElement')); p.click('#btnFull'); p.wait_for_timeout(300)
    c.close(); b.close()

    # ================= v1.4.2 A3 밝은 화면 고정 (강제 다크 모드에서도) =================
    for dark in (False, True):
        args = ['--no-sandbox'] + (['--enable-features=WebContentsForceDark', '--blink-settings=forceDarkModeEnabled=true'] if dark else [])
        b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=args); c = b.new_context(viewport={'width': 390, 'height': 844}, is_mobile=True, has_touch=True, color_scheme='dark' if dark else 'light'); p = page(c)
        p.goto(BASE + '#r=153m2320261003'); wait_js(p, '__pc.state.screen==="shared"'); p.wait_for_timeout(500)
        png = p.screenshot(); im = Image.open(io.BytesIO(png)).convert('RGB'); px = im.getpixel((8, 300))
        if dark: im.save(SHOTS / (f'{PFX}-force-dark.png' if PFX != 'qr' else 'v142-force-dark.png'))
        check(f'v1.4.2 A3: {"강제 다크 모드" if dark else "기본"}에서도 밝은 배경·color-scheme only light', min(px) > 200 and st(p, "getComputedStyle(document.documentElement).colorScheme") in ('only light', 'light only') and st(p, "document.querySelector('meta[name=color-scheme]')?.content") == 'light only', px)
        c.close(); b.close()

    # ================= v1.4.2 A4 사용 기록 QR: 한 장 24개 · 크게 그림 · 960px로 읽기 =================
    b = launch(pw); c = ctx(b); p = page(c)
    st(p, "(async()=>{const m=await import('./js/ticket.js');const u={};for(let i=0;i<60;i++)u[m.randomId()]={at:Date.now(),src:'qr'};localStorage.setItem('pcqr.used',JSON.stringify(u))})()")
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#tabSettings'); p.click('#btnSyncQr'); wait_js(p, "!document.getElementById('syncView').hidden")
    dense = st(p, "document.getElementById('syncCanvas').dataset.text"); cw = st(p, "document.getElementById('syncCanvas').getBoundingClientRect().width")
    check('v1.4.2 A4: 사용 기록 60개 → 3쪽·쪽당 24개·QR 크게(≥420px)', dense.startswith('PCU1:1/3:') and dense.split(':')[2].count('U') == 24 and cw >= 420 and qr_of_canvas(p, 'syncCanvas') == dense, (dense[:12], cw))
    shot(p, 'sync-qr-24') if PFX != 'qr' else p.screenshot(path=str(SHOTS / 'v142-sync-qr.png'))
    dense_png = __import__('base64').b64decode(st(p, "document.getElementById('syncCanvas').toDataURL('image/png')").split(',')[1]); c.close(); b.close()
    # 1280x720 카메라, QR이 화면 높이의 45% (480px로 줄이면 못 읽는 크기)
    W, H = 1280, 720; bg = Image.new('RGB', (W, H), (150, 150, 150)); q = Image.open(io.BytesIO(dense_png)).convert('RGB'); sz = int(H * 0.33); bg.paste(q.resize((sz, sz), Image.LANCZOS), ((W - sz) // 2, (H - sz) // 2))
    raw = MEDIA / 'qr_dense.rgb'; raw.write_bytes(bg.tobytes()); dvid = str(MEDIA / 'qr_dense.y4m')
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', '10', '-i', str(raw), '-vf', 'loop=20:1:0,scale=out_color_matrix=bt601:out_range=tv', '-pix_fmt', 'yuv420p', dvid], check=True); raw.unlink()
    b = launch(pw, dvid); c = ctx(b); p = page(c)
    p.add_init_script("delete window.BarcodeDetector")  # iPad 사파리처럼 jsQR만
    p.evaluate("delete window.BarcodeDetector"); p.reload(); wait_js(p, 'window.__pc && __pc.state.screen==="home"')
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.click('#tabSettings'); p.click('#btnSyncScan'); wait_js(p, '__pc.state.screen==="adminScan"')
    ok = wait_js(p, "document.getElementById('syncMsg').innerText.includes('가져옴')", 15000)
    small = st(p, "(async()=>{const q=await import('./js/qr.js');const v=document.getElementById('video');const c=document.createElement('canvas');return await q.decodeVideo(v,c,480)})()")
    check('v1.4.2 A4: 촘촘한 사용 기록 QR(1280x720·화면 33%)을 jsQR 960px로 읽음', ok and st(p, "Object.keys(__pc.store.used()).length") == 24, (p.inner_text('#syncMsg'), small and small[:12]))
    print('  (참고) 같은 화면을 480px로 줄여 읽기:', '읽힘' if small else '못 읽음')
    c.close(); b.close()

    # ================= v1.4.2 B 인쇄 중 관리자 자동 로그아웃 멈춤·연장 =================
    b = launch(pw); c = ctx(b, state=state); p = page(c)
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.fill('#issueQty', '2'); p.click('#btnIssue'); wait_js(p, "!document.getElementById('issueResult').hidden")
    st(p, '__pc.admin.setIdleMs(1500)'); st(p, "window.dispatchEvent(new Event('beforeprint'))"); p.wait_for_timeout(3000)
    check('v1.4.2 B: 인쇄 창이 떠 있는 동안 자동 로그아웃 안 함', st(p, '__pc.admin.authed'))
    st(p, "window.dispatchEvent(new Event('afterprint'))"); p.wait_for_timeout(3000)
    check('v1.4.2 B: 인쇄 창 닫힌 뒤에는 다시 자동 로그아웃', not st(p, '__pc.admin.authed'))
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.fill('#issueQty', '2'); p.click('#btnIssue'); wait_js(p, "!document.getElementById('issueResult').hidden")
    p.click('#btnPrintView'); wait_js(p, "document.getElementById('pvProgress').hidden && document.querySelectorAll('#pvPages img').length>=1", 20000)
    st(p, '__pc.admin.setIdleMs(1500)'); p.wait_for_timeout(3000)
    check('v1.4.2 B: 인쇄 미리보기 화면에서는 기다림(15분까지)', st(p, '__pc.admin.authed') and p.is_visible('#printView'))
    check('v1.4.2 B: 동의 문구 "결과 QR에는 타입·얼굴형 글자만 담겨요"', '결과 QR에는 타입·얼굴형 글자만 담겨요' in st(p, "document.querySelector('[data-for=consent]').innerText || document.querySelector('[data-for=consent]').textContent"))
    c.close(); b.close()

    # ================= 휴대폰 관리자 화면 크기 =================
    b = launch(pw); c = ctx(b, 360, 640, state=state, mobile=True); p = page(c)
    import re as _re; swv = _re.search(r"VERSION = 'pc-(v[^']+)', BUILD_DATE = '([^']+)'", (ROOT / 'sw.js').read_text()) if BASE.startswith('http://localhost') else None
    if not swv: swv = _re.search(r"VERSION = 'pc-(v[^']+)', BUILD_DATE = '([^']+)'", st(p, "fetch('sw.js',{cache:'no-store'}).then(r=>r.text())"))
    wait_js(p, "!!document.getElementById('appVer').textContent", 5000)
    check('v1.4.3: 첫 화면 아래 버전 표시 = sw.js 값', p.inner_text('#appVer') == f'버전 {swv[1]} · {swv[2]}', (p.inner_text('#appVer'), swv and swv.groups()))
    check('v1.4.3: 360x640 첫 화면 버튼·관리자 링크 한 화면', fits(p, '[data-for="home"] .bigbtns .btn, #btnAdmin'))
    p.screenshot(path=str(SHOTS / ('v143-home.png' if PFX == 'qr' else f'{PFX}-v143-home.png')))
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000); p.fill('#issueQty', '3'); p.click('#btnIssue'); wait_js(p, "document.getElementById('cardPreview').naturalWidth>0")
    check('휴대폰 360x640: 관리자 하단 버튼 한 화면·줄바꿈 없음', fits(p, '.screen:not([hidden]) > .bigbtns .btn') and st(p, "[...document.querySelectorAll('[data-for=admin] > .bigbtns .btn')].every(b=>b.getBoundingClientRect().height<60)"))
    shot(p, 'admin-issue-360x640')
    p.click('#tabList'); check('휴대폰 목록: 발급일·유효기간 보임', st(p, "[...document.querySelectorAll('#qList .qd')].slice(0,3).every(e=>e.offsetParent&&e.getBoundingClientRect().width>40)"))
    shot14(p, 'admin-list-phone')
    p.click('#tabIssue'); p.click('#btnPrintView'); wait_js(p, "document.getElementById('pvProgress').hidden && document.querySelectorAll('#pvPages img').length>=1", 20000)
    check('B10: 인쇄 미리보기 진행 표시 후 완료', '미리보기' in p.inner_text('#pvTitle') and not p.is_disabled('#btnDoPrint'))
    c.close(); b.close()

    # ================= A7 새 버전 안내 (로컬에서만: 복사본 서버의 sw.js 버전을 바꿔 업데이트) =================
    if BASE.startswith('http://localhost'):
        import shutil, tempfile
        tmp = pathlib.Path(tempfile.mkdtemp()) / 'app'; shutil.copytree(ROOT, tmp, ignore=shutil.ignore_patterns('shots'))
        srv = subprocess.Popen(['python3', '-m', 'http.server', '8767', '--bind', '127.0.0.1'], cwd=tmp, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL); time.sleep(0.8)
        CUR = 'pc-' + _re.search(r"VERSION = 'pc-(v[^']+)'", (ROOT / 'sw.js').read_text())[1]
        try:
            b = launch(pw); c = b.new_context(viewport={'width': 1024, 'height': 768}); c.add_init_script('window.__PC_NOCOVER = 1'); p = c.new_page(); p.goto('http://localhost:8767/')
            wait_js(p, 'navigator.serviceWorker.controller !== null || false', 3000); p.evaluate('navigator.serviceWorker.ready.then(()=>true)'); p.reload(); wait_js(p, '!!navigator.serviceWorker.controller', 8000)
            check('A7: 서비스 워커가 캐시를 새로 받기(cache: reload)', "cache: 'reload'" in (tmp / 'sw.js').read_text() and wait_js(p, "caches.keys().then(k=>k.includes('" + CUR + "'))", 5000))
            sw = (tmp / 'sw.js').read_text().replace(CUR, CUR + '-next'); (tmp / 'sw.js').write_text(sw)
            p.evaluate('navigator.serviceWorker.getRegistration().then(r=>r.update())')
            check('A7: 새 버전 설치 → "새 버전이 있어요 — 새로고침" 안내 (자동 새로고침 안 함)', wait_js(p, "!document.getElementById('updBar').hidden", 15000))
            shot14(p, 'update'); p.click('#btnUpdReload'); wait_js(p, 'window.__pc', 8000)
            check('v1.4.3: 새 버전 적용 후 첫 화면 버전도 새 값(실행 중인 버전)', wait_js(p, "document.getElementById('appVer').textContent.includes('" + CUR[3:] + "-next')", 8000), p.inner_text('#appVer'))
            check('A7: 새로고침 → 새 캐시만 남음', wait_js(p, "caches.keys().then(k=>JSON.stringify(k)==='[\"" + CUR + "-next\"]')", 8000), st(p, 'caches.keys()'))
            c.close(); b.close()
        finally: srv.terminate()

    # ================= v2.3.1 점검 수정: 백업 ID 검사(XSS)·CSV 수식·결과 주소 체형 =================
    b = launch(pw); c = ctx(b); p = page(c)
    p.click('#btnAdmin'); login(p); wait_js(p, '__pc.state.screen==="admin"', 8000)
    evil = st(p, """(async()=>{const m=await import('./js/ticket.js');const mem=new Map();const s=m.createStore({getItem:k=>mem.has(k)?mem.get(k):null,setItem:(k,v)=>mem.set(k,String(v)),removeItem:k=>mem.delete(k)});
      const t=await m.makeToken({issuedMs:Date.now()});s.addIssued([{...t,at:Date.now(),memo:'=HYPERLINK("http://x")'},{id:'<img src=x id=pwn>',at:1,issued:Date.now()}]);
      return {bk:await m.makeBackup(s),good:t.id}})()""")
    ev_path = str(MEDIA / 'backup_evil.json'); open(ev_path, 'w', encoding='utf-8').write(json.dumps(evil['bk']))
    p.click('#tabSettings'); p.set_input_files('#restoreFile', ev_path); wait_js(p, "!document.getElementById('modal').hidden", 3000); p.click('#modalYes')
    if wait_js(p, "!document.getElementById('modal').hidden && document.getElementById('modalMsg').innerText.includes('비밀번호')", 1500): p.click('#modalNo')
    p.wait_for_timeout(400); p.click('#tabList'); p.wait_for_timeout(300)
    ids = st(p, '__pc.store.issued().map(x=>x.id)')
    check('v2.3.1 A3: 서명된 백업이라도 형식에 맞지 않는 ID(HTML)는 버림·목록에 HTML 안 생김', evil['good'] in ids and not any('<' in i for i in ids) and st(p, "!document.getElementById('pwn') && !document.querySelector('#qList img')"), ids)
    p.click('#tabSettings')
    with p.expect_download() as dl: p.click('#btnCsv')
    csv = open(dl.value.path(), encoding='utf-8-sig').read()
    check('v2.3.1 A4: CSV 수식 주입 방지 (=로 시작하는 메모 앞에 \')', '"\'=HYPERLINK(""http://x"")"' in csv and ',"=' not in csv, csv[-200:])
    code = st(p, """(async()=>{const m=await import('./js/share.js');const se=await import('./js/seasons.js');
      return m.encodeResult({id:'autumn_deep',second:se.SEASONS.winter_deep,conf:{level:'high'},method:'드레이핑',date:'2026.10.31'},'oval','f',Date.now()+3600e3,'H.O.W',{type:'natural',gender:'m'})})()""")
    c.close(); b.close()
    # A1: 카메라가 켜지는 도중 처음으로 → 다시 시작해도 카메라가 켜짐 (예전엔 '카메라를 켜는 중…'에서 멈춤)
    b = launch(pw, str(MEDIA / 'warm.y4m')); c = ctx(b)
    c.add_init_script("localStorage.setItem('pcqr.pass',JSON.stringify({at:0,until:4102444800000,n:999}));const op=HTMLMediaElement.prototype.play;HTMLMediaElement.prototype.play=function(){if(window.__slow){return new Promise(r=>setTimeout(()=>r(op.call(this)),2500))}return op.call(this)}")
    p = page(c); p.evaluate('window.__slow=1'); p.click('#btnStart'); agree(p); p.wait_for_timeout(800)
    p.click('#btnReset'); p.wait_for_timeout(200)
    if p.is_visible('#modalYes'): p.click('#modalYes')
    p.wait_for_timeout(3500); p.evaluate('window.__slow=0'); p.click('#btnStart'); agree(p)
    check('v2.3.1 A1: 켜는 도중 중단 후 다시 시작 → 카메라 켜짐', wait_js(p, "!!__pc.stream && document.getElementById('video').videoWidth>0", 10000), p.inner_text('#stageMsg'))
    c.close(); b.close()
    b = launch(pw); c = ctx(b, 390, 844, mobile=True); c.add_init_script('window.__PC_NOCOVER = 1'); p = c.new_page(); p.on('pageerror', lambda e: errors.append('pageerror: ' + str(e)))
    p.goto(BASE + '#r=' + code); wait_js(p, 'window.__pc && __pc.state.screen==="shared"', 15000)
    check('v2.3.1 B: 결과 주소에 체형 포함(&t=) → 휴대폰에서 같은 체형·성별', '&t=2m' in code and st(p, '[__pc.state.bodyType, __pc.state.bodyGender]') == ['natural', 'm'], (code, st(p, '[__pc.state.screen, __pc.state.bodyType, __pc.state.bodyGender]')))
    p = c.new_page(); p.goto(BASE + '#r=' + code.replace('&t=2m', '&t=1m'))
    check('v2.3.1 B: 체형을 바꾼 주소는 거부', wait_js(p, 'window.__pc && __pc.state.screen==="sharedErr"', 15000), st(p, '__pc.state.screen'))
    c.close(); b.close()


ext = [u for u in net if not u.startswith((ORIGIN + '/', 'blob:', 'data:'))]
check('외부 네트워크 요청 0건', not ext, ext[:5])
check('페이지 오류 없음', not errors, errors[:6])
passed = sum(1 for _, ok in results if ok); print(f'\n결과: {passed}/{len(results)} 통과'); sys.exit(0 if passed == len(results) else 1)
