// QR 읽기: BarcodeDetector(있으면) → 없거나 실패하면 내장 jsQR 사용. 영상은 저장하지 않음
export const MAX_SIDE = 480;
let detector = null, jsqr = null, ready = null;
export function initDecoder() {
  if (ready) return ready;
  ready = (async () => {
    try { if ('BarcodeDetector' in globalThis) { const f = await globalThis.BarcodeDetector.getSupportedFormats(); if (f.includes('qr_code')) detector = new globalThis.BarcodeDetector({ formats: ['qr_code'] }); } } catch { detector = null; }
    try { jsqr = (await import('../vendor/qr/jsqr.mjs')).default; } catch { jsqr = null; }
    return decoderName();
  })();
  return ready;
}
export const decoderName = () => (detector ? 'BarcodeDetector+jsQR' : jsqr ? 'jsQR' : 'none');
export async function decodeVideo(video, canvas) {
  await initDecoder();
  if (!video.videoWidth) return null;
  if (detector) { try { const r = await detector.detect(video); if (r?.[0]?.rawValue) return r[0].rawValue; } catch {} }
  if (!jsqr) return null;
  const k = Math.min(1, MAX_SIDE / Math.max(video.videoWidth, video.videoHeight)); // 저사양 기기용 축소 (명함 QR은 480px로도 충분)
  const w = (canvas.width = Math.round(video.videoWidth * k)), h = (canvas.height = Math.round(video.videoHeight * k));
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.drawImage(video, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h); ctx.clearRect(0, 0, w, h);
  const res = jsqr(img.data, w, h, { inversionAttempts: 'dontInvert' });
  img.data.fill(0);
  return res?.data || null;
}
