# SiteScrap CLI (AI 참고용 사이트 디자인·구조·3D·소스 추출기)

웹사이트의 **디자인 시스템(색상, 폰트, CSS 토큰)**, **레이아웃 구조(섹션별 해부 및 시각적 DOM 트리)**, **작동 원리(스크롤 인터랙션, GSAP/Lenis/Framer 등 애니메이션 메커니즘)**, **3D 모델/WebGL/셰이더 에셋의 정확한 출처**, 그리고 **개인정보·민감 토큰·트래커가 제거된 정제 소스코드**를 CMD에서 바로 추출하여 AI에게 전달할 수 있는 파일로 저장해 주는 도구입니다.

---

## 실행 방법

### 1. 패키지 설치
```bash
npm install
```

### 2. 실행 (대화형 CMD 모드 또는 단일 명령)
- **Windows 배치 파일 실행**: `앱_실행.bat` 더블 클릭 후 URL 입력
- **대화형 실행**:
```bash
npm start
```
- **URL 직접 전달 실행**:
```bash
node index.js https://threejs.org
```

추출이 완료되면 `output/<사이트명_일시>/` 폴더에 결과 파일들이 생성되며 자동으로 탐색기 폴더가 열립니다.

---

## 생성되는 파일 (`output/<사이트명_일시>/`)

- **`01_AI_MASTER_BLUEPRINT.md`**: AI 프롬프트에 바로 붙여넣거나 첨부할 수 있는 통합 마스터 블루프린트 문서 (디자인 토큰 + 작동 원리 + 3D 출처 + 섹션 구조 + DOM 트리 + 핵심 마크업 포함)
- **`02_sanitized_source.html`**: 민감 정보·트래커가 제거되고 정렬된 전체 HTML 소스코드
- **`03_styles_and_tokens.css`**: 추출된 `:root` 디자인 토큰 및 스타일시트
- **`04_3d_and_interactions_data.json`**: 3D 에셋, 셰이더, 레이아웃 트리, 테크스택 구조화 JSON 데이터
- **`screenshots/`**: 첫 화면(`viewport_hero.png`) 및 전체 페이지(`fullpage.png`) 스크린샷
