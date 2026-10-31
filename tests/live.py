import time, json, sys
from playwright.sync_api import sync_playwright
BASE=sys.argv[1] if len(sys.argv)>1 else 'https://handj1998-del.github.io/personal-color/'
from urllib.parse import urlparse; ORIGIN='{0.scheme}://{0.netloc}'.format(urlparse(BASE))
import pathlib, re, urllib.request
T=str(pathlib.Path(__file__).resolve().parent); SH=T+'/shots'; pathlib.Path(SH).mkdir(exist_ok=True)
# 배포된 sw.js에서 현재 캐시 이름을 읽음 (버전을 올려도 테스트 수정 불필요)
CACHE='pc-'+re.search(r"VERSION = 'pc-(v[^']+)'", urllib.request.urlopen(BASE+'sw.js?nocache='+str(int(time.time()))).read().decode())[1]
WARM={'spring_light','spring_bright','autumn_mute','autumn_deep'}
res=[]
def check(n,c,i=''): res.append((n,bool(c))); print(('PASS ' if c else 'FAIL ')+n+('' if c else ' | '+repr(i)[:400]),flush=True)
def wait(p,e,t=20000):
    s=time.time()
    while time.time()-s<t/1000:
        try:
            if p.evaluate(e): return True
        except Exception: pass
        time.sleep(0.2)
    return False
def run(pw, video, tag):
    errs=[]; net=[]
    b=pw.chromium.launch(executable_path='/usr/bin/google-chrome',args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-video-capture={T}/media/{video}.y4m'])
    c=b.new_context(viewport={'width':1280,'height':800},locale='ko-KR',timezone_id='Asia/Seoul',accept_downloads=True); c.add_init_script('window.__PC_NOCOVER=1')  # v2.0 커버 화면 건너뜀
    c.grant_permissions(['camera'],origin=ORIGIN)
    c.add_init_script("try{if(!localStorage.getItem('pcqr.pass'))localStorage.setItem('pcqr.pass',JSON.stringify({at:0,until:4102444800000,n:999}));localStorage.setItem('pcqr.cfg',JSON.stringify({faceDebug:true}))}catch(e){}")
    p=c.new_page()
    p.on('pageerror',lambda e: errs.append('pageerror: '+str(e)))
    p.on('console',lambda m: m.type=='error' and 'XNNPACK' not in m.text and errs.append('console: '+m.text[:200]))
    p.on('request',lambda r: net.append(r.url))
    p.on('requestfailed',lambda r: errs.append('reqfail: '+r.url))
    r=p.goto(BASE+'?nocache='+str(int(time.time()))); p.wait_for_load_state('load')
    check(f'[{tag}] 페이지 로드 200 + 홈 화면', r.status==200 and wait(p,'window.__pc && __pc.state.screen==="home"'), r.status)
    check(f'[{tag}] HTTPS secure context', p.evaluate('isSecureContext'))
    p.click('#btnStart'); p.check('#chkConsent'); p.click('#btnConsentCam')
    check(f'[{tag}] 카메라 시작', wait(p,'document.getElementById("video").videoWidth>0 && !!__pc.stream'))
    check(f'[{tag}] MediaPipe 모델 로드(ready)', wait(p,'__pc.faceStatus()==="ready"',60000), p.evaluate('__pc.faceStatus()'))
    p.click('#btnCalibNext'); wait(p,'__pc.state.screen==="capture" && !!__pc.stream'); p.wait_for_timeout(800)
    p.click('#btnCapture')
    check(f'[{tag}] 촬영→자동 분석 화면', wait(p,'__pc.state.screen==="auto"',60000), p.evaluate('__pc.state.screen'))
    a=p.evaluate('__pc.state.auto && ({top:__pc.state.auto.cls.top.map(t=>t.id),mode:__pc.state.auto.mode,eye:!!__pc.state.auto.eye,hair:!!__pc.state.auto.hair,conf:__pc.state.auto.conf.label})')
    print('  auto:',a)
    p.evaluate("document.getElementById('toast').hidden=true"); p.screenshot(path=f'{SH}/live-{tag}-auto.png',full_page=True)
    p.click('#btnToResult'); ok=wait(p,'__pc.state.screen==="result" && !!document.getElementById("resName")')
    check(f'[{tag}] 결과 카드 표시', ok, p.evaluate('__pc.state.screen'))
    p.wait_for_timeout(400); p.evaluate("document.getElementById('toast').hidden=true"); p.screenshot(path=f'{SH}/live-{tag}-result.png',full_page=True)
    fa=p.evaluate('__pc.state.final.face && __pc.state.final.face.id')
    check(f'[{tag}] 얼굴형 자동 추정 표시', bool(fa) and p.input_value('#selFace')==fa and '자동 추정' in p.inner_text('#faceNote'), fa)
    dbg=p.inner_text('#faceDbg') if p.locator('#faceDbg').count() else ''
    print('  얼굴형 측정값:', dbg.replace(chr(10),' | '))
    check(f'[{tag}] 관리자 설정 "얼굴형 측정값 보기" → 비율·후보 표시', '길이/광대' in dbg and '후보' in dbg, dbg)
    p.click('[data-rtab="hair"]'); p.wait_for_timeout(150)
    check(f'[{tag}] 헤어 탭(자동 얼굴형 기준 3개 스타일·헤어 컬러 4색)', p.locator('#rpane .hitem').count()==3 and p.locator('#rpane .palette.hairc .swatch').count()==4)
    p.click('[data-rtab="lip"]'); p.wait_for_timeout(150)
    check(f'[{tag}] 립 추천 탭', p.locator('#rpane .palette.lips:not(.avoid) .swatch').count()==4 and p.locator('#rpane .palette.lips.avoid .swatch').count()>=1)
    p.screenshot(path=f'{SH}/rec-live-{tag}-lip.png')
    p.click('[data-rtab="glasses"]'); p.wait_for_timeout(150)
    check(f'[{tag}] 안경 추천 탭(컬러4·모양3)', p.locator('#rpane .palette.frames .swatch').count()==4 and p.locator('#rpane .gitem svg').count()==3)
    p.screenshot(path=f'{SH}/rec-live-{tag}-glasses.png')
    p.click('[data-rtab="brow"]'); p.wait_for_timeout(150)
    b0=p.inner_text('#browName'); p.select_option('#selFace','long' if fa!='long' else 'round'); p.wait_for_timeout(150)
    check(f'[{tag}] 눈썹 추천 + 얼굴형 수동 변경', len(b0)>1 and p.inner_text('#browName')!=b0 and '직접 선택' in p.inner_text('#faceNote'), (b0,p.inner_text('#browName')))
    p.screenshot(path=f'{SH}/rec-live-{tag}-brow.png')
    with p.expect_download() as dl: p.click('#btnSavePng')
    from PIL import Image; im=Image.open(dl.value.path()); im.save(f'{SH}/rec-live-{tag}-card.png')
    check(f'[{tag}] PNG 저장(추천 포함 긴 카드)', im.width==1080 and im.height>2800, im.size)
    check(f'[{tag}] 서비스 워커 캐시 {CACHE}', p.evaluate(f"caches.keys().then(k=>k.includes('{CACHE}'))") or wait(p,f"caches.keys().then(k=>k.includes('{CACHE}'))",15000))
    sw=wait(p,'navigator.serviceWorker.controller!==null || navigator.serviceWorker.getRegistration().then(r=>!!r&&!!r.active)',15000)
    check(f'[{tag}] 서비스 워커 등록', p.evaluate('navigator.serviceWorker.getRegistration().then(r=>!!r && (r.active||r.installing||r.waiting) && r.scope)'))
    ext=[u for u in net if not u.startswith(ORIGIN) and not u.startswith('data:') and not u.startswith('blob:')]
    check(f'[{tag}] 외부 요청 없음', not ext, ext[:5])
    check(f'[{tag}] 콘솔/페이지 오류 없음', not errs, errs[:6])
    out={'auto':a,'result':p.inner_text('#resName')}
    b.close(); return out
with sync_playwright() as pw:
    o=run(pw,'portrait','portrait')
    check('[portrait] 얼굴 랜드마크 모드(오벌 폴백 아님)', o['auto'] and o['auto']['mode']=='landmark', o)
    o2=run(pw,'warm','warm')
    check('[warm] 웜 합성 얼굴 → 웜 1순위', o2['auto'] and o2['auto']['top'][0] in WARM, o2)
    print(json.dumps([o,o2],ensure_ascii=False))
print(f"{sum(x[1] for x in res)}/{len(res)} passed")
