# WordQuest — 나의 영어 단어장

영어 단어 암기 웹 앱. 설치가 필요 없습니다 — 브라우저만 있으면 실행됩니다.

**단어장 구성** (홈 화면 상단 탭에서 선택):
- 📕 **내 단어장** (3,167개): `영어단어장.csv` — 말해보카에서 외우지 못한 단어 모음
- 📗 **TOEIC** (451개): 주제별 TOEIC 빈출 어휘 (`build_toeic.py`로 생성, 내 단어장과 중복 제외)
- **전체**: 두 단어장 합산

## 실행 방법

**방법 1 (가장 간단)**: `index.html` 파일을 더블클릭해 브라우저(Chrome/Edge)로 엽니다.

**방법 2 (로컬 서버)**:

```bash
python -m http.server 8765
```

실행 후 브라우저에서 `http://localhost:8765` 접속.

학습 기록은 브라우저(localStorage)에 자동 저장됩니다. 같은 브라우저로 열면 이어서 학습됩니다.

## 단어장 수정하기

1. `영어단어장.csv`를 수정합니다. (컬럼: 단어, 발음기호, 뜻, 예문)
2. 아래 명령으로 앱 데이터를 재생성합니다:

```bash
python convert_csv.py
```

## AI 기능 설정

홈 화면의 **🤖 AI 설정** 버튼에서 Claude API 키를 입력하면 다음 기능이 활성화됩니다:

- **🧠 AI 연상법**: 학습 카드에서 단어의 니모닉(발음 연상/어원/스토리)을 생성
- **✍️ AI 예문**: 설정한 관심 분야(일상/비즈니스/여행 등)에 맞는 예문 + 번역 생성
- **🤖 AI 변형 문제**: 퀴즈에서 자주 틀린 단어를 새로운 문장으로 재출제
- **🗣️ AI 회화**: 최근 배운 단어를 활용하도록 유도하는 영어 대화 + 종료 시 문장 교정 리포트 (+20XP)
- **✏️ 영작 연습**: 배운 단어를 쓰는 한국어 문장을 AI가 출제, 내 영작을 채점·교정 (틀리면 복습 큐로)

키는 브라우저 localStorage에만 저장되며, 생성된 콘텐츠는 캐싱되어 같은 단어에 대해 다시 호출하지 않습니다.
API 키 발급: https://platform.claude.com → API Keys

## 기기 간 동기화

홈 화면의 **☁️ 동기화** 버튼에서 GitHub 토큰(gist 권한)을 입력하면:

- 학습/퀴즈를 마칠 때마다 기록이 내 GitHub 계정의 **비공개 Gist**에 자동 백업됩니다.
- 다른 노트북에서 앱을 열고 같은 토큰을 입력하면 기존 백업을 자동으로 찾아 연결합니다.
- 앱을 열 때 다른 기기의 더 최신 기록이 있으면 자동으로 불러옵니다.
- 토큰과 Claude API 키는 백업 파일에 포함되지 않습니다 (기기마다 localStorage에만 저장).

토큰 만들기: https://github.com/settings/tokens/new?scopes=gist&description=WordQuest%20Sync (gist 권한만 체크)

## 배포 (GitHub Pages)

이 폴더를 GitHub 저장소에 푸시하고, 저장소 **Settings → Pages → Deploy from a branch → main / (root)** 를 선택하면
`https://<계정명>.github.io/<저장소명>/` 주소로 어디서든 접속할 수 있습니다.

## 개발 단계 (PRD 기준)

| 단계 | 내용 | 상태 |
|---|---|---|
| M1 | 학습 코어: 단어 카드 + SRS 복습 엔진 + 퀴즈 4종 + 로컬 저장 | ✅ 완료 |
| M2 | 게임화: XP/레벨/스트릭/퀘스트/잔디 캘린더 | ✅ 완료 |
| M3 | AI: 맞춤 예문 생성, 니모닉, 변형 출제 (Claude API) | ✅ 완료 |
| M4 | GitHub Gist 동기화 + GitHub Pages 배포 | ✅ 완료 |

## 파일 구조

```
index.html        앱 진입점 (더블클릭으로 실행)
style.css         디자인
convert_csv.py    CSV -> 앱 데이터 변환 스크립트 (내 단어장)
build_toeic.py    TOEIC 어휘 목록 + 데이터 생성 스크립트
data/words.js     내 단어장 데이터 (자동 생성)
data/words_toeic.js  TOEIC 단어 데이터 (자동 생성)
js/srs.js         간격 반복(SRS) 엔진
js/store.js       학습 기록 저장 (localStorage)
js/game.js        게임화 (XP/레벨/스트릭/퀘스트)
js/ai.js          Claude API 연동 (연상법/예문/변형 문제)
js/quiz.js        퀴즈 문제 생성기
js/app.js         화면/흐름 제어
PRD.md            제품 요구사항 문서
```
