# Selectly 웹 인쇄 (Web Print) — 개인용

페이스북 라이브 댓글창 텍스트를 수동으로 복사·붙여넣어 XP-P326B 감열 라벨 프린터로 인쇄하는
크롬 전용 웹앱. / A Chrome-only web app that prints shipping labels on an XP-P326B thermal
printer from manually pasted Facebook Live comment text.

## 기본 사용법 (맥 켜둘 필요 없음) / Primary usage (no laptop needs to stay on)

**접속 주소 / URL**: GitHub Pages로 배포됨 — `https://jihoonkiim-alt.github.io/selectly-web-printer/`
(Settings → Pages 활성화 후 첫 배포 완료 시 유효).

백엔드는 Google Apps Script + Google Sheet — 맥/서버가 꺼져있어도 동작함. 처음 한 번만
`settings.html`에서 Web App URL + 토큰을 설정해야 함 (아래 "GAS 백엔드 설정" 참고).

- `index.html` — 댓글 붙여넣기/파싱/인쇄 화면 (Paste/parse/print)
- `customers.html` — 고객별 누적 주문/영수증 화면 (Customer list/receipts)
- `settings.html` — GAS 연동 설정 (GAS connection settings)

**인쇄는 안드로이드+크롬에서만 가능**, 아이폰은 Web Bluetooth 미지원이라 조회만 가능.
인쇄하는 기기는 프린터와 블루투스 거리 내에 있어야 함(물리적 제약, 인터넷과 무관).

## GAS 백엔드 설정 (최초 1회) / GAS backend setup (one-time)

1. 새 Google Sheet 생성, `gas/Code.gs` 내용을 Extensions → Apps Script 편집기에 붙여넣기.
2. Apps Script 편집기에서 `initSheet` 실행 → "Orders" 탭 자동 생성.
3. `setToken` 실행 → 실행 로그(Logger)에서 토큰 값 복사.
4. 배포(Deploy) → 새 배포 → 웹 앱 → 실행 사용자: 나, 액세스 권한: 모든 사용자 → 배포 →
   `.../exec` URL 복사.
5. 앱의 `settings.html`에서 그 URL + 토큰 입력 후 저장, "연결 테스트"로 확인.

## GitHub Pages 배포 / Deployment

`main`에 푸시하면 `.github/workflows/pages.yml`이 `public/`를 자동 배포함. 저장소 Settings →
Pages → Source를 "GitHub Actions"로 설정해야 함(최초 1회).

## 로컬/오프라인 대체 수단 (선택) / Local fallback (optional)

`python3 server.py` + `selectly live printer.command`로 맥에서 로컬 서버+Cloudflare Tunnel을
띄우는 방식도 그대로 남아있음 — GAS 없이 로컬 JSON 파일(`data/orders.json`)로도 동작 가능.
평소엔 필요 없고, GAS/인터넷 문제로 급할 때 대체 수단으로만 사용.

## 데이터 보관 / Data retention

- 주문 내역(영수증용)은 Google Sheet에 무기한 보관됨.
- 화면에 붙여넣은 파싱 작업 내역(날짜별)은 브라우저 localStorage에 **최근 30일**만 보관되고
  이후 자동 삭제됨 — `index.html` 상단 "지난 기록" 드롭다운에서 확인 가능.
