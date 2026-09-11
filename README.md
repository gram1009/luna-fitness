# 루나의 운동일지

모바일 웹에서 매일 체크하는 운동/스트레칭 체크리스트 + 체중 기록 앱입니다.

## 구성

```
luna-fitness/
├── index.html       ← 프론트엔드 (GitHub Pages로 배포)
├── Code.gs           ← 백엔드 (구글 Apps Script)
├── images/
│   ├── luna-face.png       ← 실제 사용 중인 캐릭터 이미지 (배경 투명)
│   ├── luna-icon.svg       ← 이전 시안 (현재 미사용)
│   ├── luna-character.svg  ← 이전 시안 (현재 미사용)
│   ├── luna-hero.jpg       ← 실사진 원본 (현재 미사용, 보관용)
│   └── luna-face.jpg       ← 실사진 원본 (현재 미사용, 보관용)
└── README.md
```

## 1단계 — 구글시트 준비

아래 4개 탭이 있는 구글시트가 이미 있다는 전제입니다. (없으면 먼저 만드세요)

- `Item`
- `Weekly_Plan`
- `Log` (헤더만 있어도 됨: 날짜 / 요일 / 항목ID / 체크여부 / 체크시각)
- `Weight_Log` (헤더만 있어도 됨: 날짜 / 시간대 / 체중 / 메모)
- `Profile_Data` (선택, Key/Value 2열)

## 2단계 — Apps Script 배포

1. 구글시트에서 **확장 프로그램 → Apps Script**
2. 기본 생성된 코드를 지우고 `Code.gs` 내용을 그대로 붙여넣기
3. 저장 (Ctrl/Cmd + S)
4. 우측 상단 **배포 → 새 배포**
5. 유형 선택에서 **웹 앱** 선택
   - 설명: 아무거나
   - 실행 계정: **나**
   - 액세스 권한: **모든 사용자** (Anyone) — 이게 중요합니다. 로그인 없이도 앱에서 접근할 수 있어야 해요.
6. 배포 후 나오는 **웹 앱 URL**을 복사해두기 (`https://script.google.com/macros/s/xxxxx/exec` 형태)

> 코드를 나중에 수정하면 **배포 → 배포 관리 → 수정(연필 아이콘) → 새 버전**으로 다시 배포해야 반영됩니다.

## 3단계 — 프론트엔드에 URL 연결

`index.html` 파일을 열어 이 줄을 찾으세요.

```js
const SCRIPT_URL = '';
```

따옴표 안에 2단계에서 복사한 웹 앱 URL을 붙여넣습니다.

```js
const SCRIPT_URL = 'https://script.google.com/macros/s/여기에_배포URL/exec';
```

이 값을 비워두면 브라우저의 localStorage에만 저장되는 **데모 모드**로 동작합니다 (구글시트 연동 없이도 디자인/기능 확인 가능).

## 4단계 — GitHub Pages 배포

1. 깃허브에 새 저장소 생성 (예: `luna-fitness`)
2. 이 폴더(`index.html`, `Code.gs`, `images/`) 전체를 저장소에 push
   - `Code.gs`는 참고용으로만 저장소에 두는 것이고, 실제 실행은 Apps Script 쪽에서 됩니다
3. 저장소 **Settings → Pages**
4. Source를 `main` 브랜치, `/ (root)`로 설정 후 저장
5. 몇 분 뒤 `https://[사용자명].github.io/luna-fitness/` 로 접속 가능

## 5단계 — 모바일에서 쓰기

1. 아이폰 사파리(또는 안드로이드 크롬)에서 위 GitHub Pages 주소로 접속
2. 공유 버튼 → **홈 화면에 추가**
3. 아이콘을 누르면 앱처럼 바로 열립니다

## 참고 — CORS 관련

Apps Script 웹앱은 브라우저의 preflight(OPTIONS) 요청을 처리하지 못해서, 보통의 JSON POST 요청이 실패합니다. 이를 피하려고 `index.html`에서는 POST를 보낼 때 `Content-Type: text/plain`으로 보내서 preflight 자체가 발생하지 않게 처리해뒀습니다. `Code.gs`에서는 `e.postData.contents`를 그냥 JSON.parse 하기 때문에 정상 동작합니다. 이 부분은 건드리지 않으셔도 됩니다.

## 항목/요일 구성을 나중에 바꾸고 싶다면

두 가지 방법이 있습니다.

- **정석**: 구글시트의 `Item`, `Weekly_Plan`을 수정 → `SCRIPT_URL`이 연결되어 있으면 앱이 자동으로 최신 내용을 불러옵니다.
- **오프라인 폴백도 맞추고 싶다면**: `index.html` 안의 `ITEMS`, `PLAN` 자바스크립트 객체도 같이 수정하세요. (서버 연동이 실패했을 때만 쓰이는 예비 데이터라, 안 맞춰도 서버 연동만 잘 되면 문제없습니다)
