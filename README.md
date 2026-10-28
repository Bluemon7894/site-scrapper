# SiteScrap CLI (AI 1:1 복제용 사이트 디자인·구조·3D·소스 추출기)

대상 웹사이트의 **디자인 시스템(색상, 폰트, `@font-face`, CSS 토큰)**, **섹션별 1:1 복제 명세(하위 요소별 계산된 CSS 트리 + 섹션별 HTML)**, **작동 원리(스크롤 인터랙션, `:hover` 규칙, GSAP/Lenis/Framer/Three.js 등 번들 정적 분석)**, **3D 모델/WebGL/WebGPU/셰이더 에셋 출처**, **고유 SVG 로고·아이콘 원본 코드**, 그리고 **개인정보·민감 토큰·트래커가 제거되고 절대 경로로 변환된 HTML/CSS/JS 소스코드**를 추출하는 CMD 도구입니다.

추출된 폴더 안의 파일들을 AI(Claude, ChatGPT, Gemini, Cursor 등)에게 그대로 전달하면 원본 사이트와 동일한 디자인과 구조로 재현할 수 있습니다.

---

## 실행 방법

### 1. 패키지 설치
```bash
npm install
```

### 2. 실행
- **Windows 배치 파일 실행**: `앱_실행.bat` 더블 클릭 후 URL 입력
- **대화형 CMD 모드**:
```bash
npm start
```
- **명령줄에서 URL 직접 전달**:
```bash
node index.js https://linear.app
```
- **옵션 플래그**:
  - `--mobile`: 모바일 뷰포트(390×844) 및 모바일 User-Agent로 분석
  - `--no-scroll`: 자동 스크롤 생략
  - `--no-screenshots`: 스크린샷 촬영 생략
  - `--no-open`: 완료 후 탐색기 자동 열기 생략

---

## 생성되는 파일 (`output/<사이트명_일시>/`)

| 파일 / 폴더 | 내용 및 역할 |
| :--- | :--- |
| **`01_AI_MASTER_BLUEPRINT.md`** | AI 프롬프트용 통합 마스터 블루프린트 (기술 스택, 번들 정적 분석, 컬러/폰트/`@font-face`/CSS 변수, 3D·모션·`:hover` 작동 원리, 섹션 구조, 시각적 DOM 트리 통합) |
| **`02_sanitized_source.html`** | 렌더링 완료 후의 전체 HTML (상대 경로 → 절대 URL 자동 변환, 트래커·개인정보 제거 및 코드 정렬) |
| **`03_styles_and_tokens.css`** | 외부/인라인 CSS 전체 (CORS 외부 스타일시트 포함, `url()` 절대 경로 변환 및 정렬) |
| **`04_structured_data.json`** | 전체 분석 원본 구조화 데이터 (JSON) |
| **`05_scripts/`** | 페이지에서 로드된 자체/외부 JS 스크립트 소스 (민감 정보 마스킹 및 정렬 완료) |
| **`06_section_cloning_specs.md`** | **섹션별 1:1 복제 명세서** — 상단~하단 각 섹션의 박스 모델 수치, 모든 하위 요소의 실제 계산된 CSS 속성 트리(Computed Style Tree), 섹션별 정제 HTML 코드 |
| **`07_svg_icons_and_graphics.md`** | 페이지 내 고유 `<svg>` 로고 및 아이콘의 원본 벡터 코드 모음 |
| **`screenshots/`** | 첫 화면(`viewport_hero.png`), 스크롤 단계별(`scroll_*.png`), 전체 페이지(`fullpage.png`) 스크린샷 |
