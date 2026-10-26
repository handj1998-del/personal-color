import sys, time
def wait_js(p, expr, timeout=10000):
    t=time.time()
    while time.time()-t<timeout/1000:
        if p.evaluate(expr): return True
        time.sleep(0.2)
    raise TimeoutError(expr)
from playwright.sync_api import sync_playwright
vid = sys.argv[1]
with sync_playwright() as pw:
    b = pw.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--no-sandbox','--use-fake-ui-for-media-stream','--use-fake-device-for-media-stream',f'--use-file-for-fake-video-capture={__import__('pathlib').Path(__file__).resolve().parent}/media/{vid}.y4m'])
    c = b.new_context(viewport={'width':1280,'height':800}, locale='ko-KR'); c.grant_permissions(['camera'], origin='http://localhost:8765')
    p = c.new_page(); logs=[]
    p.on('console', lambda m: logs.append(m.type+': '+m.text[:200])); p.on('pageerror', lambda e: logs.append('ERR '+str(e)))
    p.on('request', lambda r: logs.append('REQ '+r.url) if not r.url.startswith('http://localhost:8765') else None)
    p.goto('http://localhost:8765/'); p.click('#btnStart'); p.check('#chkConsent'); p.click('#btnConsentCam')
    wait_js(p,'document.getElementById("video").videoWidth>0'); time.sleep(1.5)
    p.screenshot(path='/tmp/s1.png'); p.click('#btnCalibNext'); time.sleep(1.5); p.screenshot(path='/tmp/s2.png')
    p.click('#btnCapture'); p.wait_for_selector('[data-for="auto"]:not([hidden])', timeout=30000); time.sleep(0.5)
    p.screenshot(path='/tmp/s3.png'); print(p.evaluate('JSON.stringify({top:__pc.state.auto.cls.top,mode:__pc.state.auto.mode,skin:__pc.state.auto.skin,fs:__pc.faceStatus(),stream:!!__pc.stream})'))
    print('\n'.join(logs))
    b.close()
