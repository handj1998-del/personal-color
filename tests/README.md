# 테스트 (앱에서 쓰지 않음, 서비스 워커 캐시 대상 아님 · v2.3.1부터 Pages에 배포하지 않음)

```bash
cd tests
node make_media.mjs          # media/*.y4m 가짜 카메라 영상 생성 (ffmpeg 필요, 최초 1회 · portrait.y4m 포함)
node --test unit.test.mjs    # 단위 테스트
python3 e2e.py               # 진단 흐름 E2E (localhost:8765 없으면 저장소 루트로 직접 띄움; Chrome + Playwright)
python3 qr_e2e.py            # 진단권·관리자·결과 주소 E2E (같은 서버, QR 영상은 실행 중 생성)
python3 live.py              # 배포된 사이트 확인 (기본: GitHub Pages 주소, 캐시 이름은 배포된 sw.js에서 읽음)
```

- `media/`, `shots/`는 실행 결과물이라 git에 올리지 않음 (`.gitignore`).
- 배포: `.github/workflows/pages.yml`이 앱 파일만 모아 Pages에 올림 (`tests/`, `tools/`, 안내 txt 제외).
