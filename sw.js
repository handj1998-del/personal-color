// 오프라인 캐시 (외부 요청 없음). 버전을 올리면 새 파일로 교체됨
// 버전 정보는 여기 한 곳에만 둠 (첫 화면 아래 표시도 이 값을 읽음)
const VERSION = 'pc-v1.6.1', BUILD_DATE = '2026-10-03';
const CORE = [
  './', 'index.html', 'app.css', 'manifest.webmanifest', 'icons/icon.svg',
  'js/app.js', 'js/color.js', 'js/analyzer.js', 'js/seasons.js', 'js/face.js', 'js/card.js', 'js/style.js', 'js/ticket.js', 'js/qr.js', 'js/admin.js', 'js/qrcard.js', 'js/share.js', 'vendor/qr/jsqr.mjs', 'vendor/qr/qrcode.mjs',
];
// 없어도 앱은 동작(얼굴 자동 인식 대신 타원 가이드 사용). 있으면 오프라인용으로 함께 저장
const OPTIONAL = [
  'icons/icon-192.png', 'icons/icon-512.png', 'icons/icon-maskable-512.png', 'icons/apple-touch-icon.png',
  'vendor/mediapipe/vision_bundle.mjs', 'vendor/mediapipe/wasm/vision_wasm_internal.js', 'vendor/mediapipe/wasm/vision_wasm_internal.wasm',
  'vendor/mediapipe/wasm/vision_wasm_nosimd_internal.js',
  'vendor/mediapipe/wasm/vision_wasm_nosimd_internal.wasm', // v1.6: SIMD 미지원 기기에서도 오프라인 얼굴 인식
  'models/face_landmarker.task',
];
self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(VERSION).then(async (c) => {
    // cache:'reload' → 브라우저 HTTP 캐시(최대 10분)를 건너뛰고 서버에서 새로 받아 버전이 섞이지 않게 함
    const fresh = (u) => new Request(u, { cache: 'reload' });
    await c.addAll(CORE.map(fresh));
    await Promise.allSettled(OPTIONAL.map((u) => c.add(fresh(u))));
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== VERSION).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
// 첫 화면의 버전 표시: 지금 실행 중인 서비스 워커(=앱 파일 캐시)의 버전을 알려 줌
self.addEventListener('message', (e) => { if (e.data?.type === 'version') e.ports?.[0]?.postMessage({ version: VERSION, date: BUILD_DATE }); });
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.endsWith('/sw.js')) return;
  e.respondWith(caches.open(VERSION).then(async (c) => {
    const hit = await c.match(e.request, { ignoreSearch: true });
    if (hit) return hit;
    try {
      const res = await fetch(e.request);
      if (res.ok && res.type === 'basic') c.put(e.request, res.clone());
      return res;
    } catch (err) {
      if (e.request.mode === 'navigate') { const idx = await c.match('index.html'); if (idx) return idx; }
      throw err;
    }
  }));
});
