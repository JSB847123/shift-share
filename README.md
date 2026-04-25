# 날짜별 근무표 앱

카카오톡은 공유 버튼으로만 사용하고, 근무표 조회와 변경은 웹앱에서 처리합니다.

## 실행

1. `.env.example`을 참고해 `.env`를 만듭니다.
2. 카카오톡 공유를 사용할 경우 `KAKAO_JS_KEY`를 설정합니다.
3. 실행합니다.

```powershell
npm start
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 환경변수

- `PORT`: 서버 포트입니다. 기본값은 `3000`입니다.
- `KAKAO_JS_KEY`: 카카오 JavaScript SDK 초기화에 사용하는 JavaScript 키입니다.
- `NEXT_PUBLIC_KAKAO_JS_KEY`: Next.js식 이름을 쓰고 싶을 때의 대체 키입니다.
- `APP_BASE_URL`: 카카오톡 공유 링크에 사용할 외부 접속 URL입니다.

## 데이터 저장

- 근무표와 변경 이력은 `data/shifts.json`에 저장됩니다.
- 근무표는 xlsx 양식을 내려받아 작성한 뒤 업로드해서 등록합니다.
- 같은 날짜의 세무서 2칸, 구청 신고창구 2칸 구조로 저장됩니다.
- 근무자 칸은 비워서 저장할 수 있습니다.
- 같은 날짜 중복 배정은 저장되지 않습니다.
- 저장과 되돌리기는 `revision`으로 동시 수정 충돌을 검사합니다.

## 카카오 디벨로퍼스 설정

1. Kakao Developers에서 앱을 생성합니다.
2. 앱 키 중 JavaScript 키를 `KAKAO_JS_KEY`에 넣습니다.
3. 플랫폼의 Web 사이트 도메인에 실제 서비스 도메인을 등록합니다.
4. 제품 링크의 Web domain에도 공유 링크 도메인을 등록합니다.
5. 로컬 테스트와 실제 배포 URL이 다르면 `APP_BASE_URL`은 실제 접속 가능한 URL로 설정합니다.

## API

- `GET /api/shifts?month=YYYY-MM`: 월별 근무표 목록
- `GET /api/shifts-template.xlsx`: xlsx 등록 양식 다운로드
- `POST /api/shifts/import-xlsx`: xlsx 파일 근무표 등록
- `GET /api/shifts/YYYY-MM-DD`: 날짜별 근무표와 변경 이력
- `POST /api/shifts/YYYY-MM-DD`: 최초 등록 또는 수정
- `PATCH /api/shifts/YYYY-MM-DD/replace`: 근무자 1명 교체
- `PATCH /api/shifts/YYYY-MM-DD/swap`: 근무자 2명 맞바꾸기
- `PATCH /api/shifts/YYYY-MM-DD/undo`: 직전 변경 되돌리기
