# 테스트 (앱에서 쓰지 않음, 서비스 워커 캐시 대상 아님)

```bash
cd tests
node make_media.mjs          # media/*.y4m 가짜 카메라 영상 생성 (ffmpeg 필요, 최초 1회)
node --test unit.test.mjs    # 단위 테스트
python3 e2e.py               # E2E (localhost:8765 없으면 저장소 루트로 직접 띄움; Chrome + Playwright)
```

- `e2e.py`: 표지(cover) 화면을 먼저 검사한 뒤, 이후 흐름에서는 표지를 눌러 홈으로 넘어감.
- 예전 진단권/QR E2E(`qr_e2e.py`)는 v2.1.0 이전 화면 기준이라 아직 옮기지 않음 (/workspace/personal-color-tests).
