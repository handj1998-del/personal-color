// MediaPipe Face Landmarker (로컬 번들, 오프라인). 실패하면 null -> 타원 가이드 방식으로 대체
let landmarker = null, loading = null, failed = false, failedAt = 0;
export const FACE_RETRY_MS = 30000; // v1.7: 불러오기에 실패해도 30초 뒤(또는 다시 온라인이 되면) 다시 시도
export function faceStatus() { return landmarker ? 'ready' : failed ? 'failed' : loading ? 'loading' : 'idle'; }
export function loadFace() {
  if (failed && Date.now() - failedAt >= FACE_RETRY_MS) { failed = false; loading = null; }
  if (landmarker || failed) return Promise.resolve(landmarker);
  if (loading) return loading;
  loading = (async () => {
    try {
      const base = new URL('../', import.meta.url);
      const { FilesetResolver, FaceLandmarker } = await import('../vendor/mediapipe/vision_bundle.mjs');
      const fs = await FilesetResolver.forVisionTasks(new URL('vendor/mediapipe/wasm', base).href);
      landmarker = await FaceLandmarker.createFromOptions(fs, {
        baseOptions: { modelAssetPath: new URL('models/face_landmarker.task', base).href, delegate: 'CPU' },
        runningMode: 'IMAGE', numFaces: 1,
      });
      return landmarker;
    } catch (e) { console.info('얼굴 인식 모델을 불러오지 못해 타원 가이드 방식으로 진행합니다:', String(e)); failed = true; failedAt = Date.now(); loading = null; return null; }
  })();
  return loading;
}
export async function detectFace(canvas, timeoutMs = 10000) {
  const lm = await Promise.race([loadFace(), new Promise((r) => setTimeout(() => r(null), timeoutMs))]);
  if (!lm) return null;
  try { const res = lm.detect(canvas); return res?.faceLandmarks?.[0] || null; } catch (e) { console.info('face detect error', String(e)); return null; }
}
globalThis.addEventListener?.('online', () => { if (failed) { failed = false; loading = null; } });
