# 🧊 SiteBlueprint AI (AI 참고용 웹사이트 디자인·구조·3D·소스 추출기)

원하는 웹사이트의 **디자인 시스템(색상, 폰트, CSS 토큰)**, **레이아웃 구조(섹션별 해부 및 시각적 DOM 트리)**, **작동 원리(스크롤 인터랙션, GSAP/Lenis/Framer 등 애니메이션 메커니즘)**, **3D 모델/WebGL/셰이더 에셋의 정확한 출처**, 그리고 **개인정보·민감 토큰·트래커가 제거된 정제 소스코드**를 추출하여 AI(ChatGPT, Claude, Gemini 등)에게 바로 전달할 수 있는 파일로 만들어주는 데스크톱 애플리케이션입니다.

---

## ✨ 주요 기능

1. **🎨 디자인 시스템 & 시각적 스타일 토큰 추출**
   - 화면 면적 가중치 기반 배경/서피스 컬러, 타이포그래피 컬러, 포인트/인터랙티브 컬러(HEX/RGB) 추출
   - 그라디언트(`linear-gradient`, `radial-gradient`) 및 글래스모피즘(`backdrop-filter`) 효과 감지
   - 웹폰트 파일 출처 및 `H1`~`H4`, 본문(`p`), 버튼(`button`), 네비게이션의 실제 계산된 폰트 크기·굵기·행간·자간 스케일 표 생성
   - `:root` CSS 커스텀 프로퍼티(`--*`) 및 반응형 미디어쿼리 브레이크포인트 수집

2. **⚙️ 사이트 작동 원리 & 인터랙션 해부**
   - 프레임워크 및 애니메이션 엔진 자동 감지 (`Next.js`, `React`, `Vue`, `Astro`, `Webflow`, `Framer`, `GSAP`, `ScrollTrigger`, `Lenis`, `Locomotive Scroll`, `AOS`, `Swiper`, `Lottie` 등)
   - 고정 레이어(`fixed`) 및 **스크롤리텔링(Sticky Scrollytelling)** 부모 스크롤 트랙 길이(`vh`) 분석
   - 런타임 전역 이벤트 리스너(`wheel`, `mousemove`, `scroll`) 및 `@keyframes` 애니메이션 규칙 캡처

3. **🧊 3D 모델 · WebGL 캔버스 · 커스텀 GLSL 셰이더 출처 추적**
   - 네트워크 트래픽을 감청하여 `.glb`, `.gltf`, `.bin`, `.splinecode`, `.obj`, `.fbx`, `.hdr`/`.exr`(환경맵), `.ktx2`/`.basis`(압축 텍스처), `Draco` 디코더, Three.js JSON, Rive(`.riv`), Lottie 파일의 **호스팅 출처(Spline CDN, Sketchfab, AWS CloudFront, 자체 호스팅 등)**와 원본 URL 추출
   - DOM 상의 `<canvas>`, `<spline-viewer>`, `<model-viewer>` 레이어 배치 분석 및 WebGL 런타임에 컴파일된 **커스텀 Vertex / Fragment Shader(GLSL) 코드** 캡처

4. **🔒 개인정보·보안 토큰 자동 마스킹 및 소스코드 정제**
   - JWT 토큰, API 키(`AIza...`, `sk-...`, AWS 키 등), 인증 쿼리 파라미터(`?token=`, `?key=`), 이메일, 전화번호, `<input type="hidden">` 값, CSRF 메타 태그를 `[REDACTED]`로 안전하게 마스킹
   - Google Analytics, GTM, Meta Pixel, Hotjar 등 광고/트래커 스크립트 제거 및 초대형 Base64/SVG 경로 경량화

---

## 🚀 설치 및 실행 방법

### 1. 패키지 설치
```bash
npm install
```

### 2. 앱 실행
- **Windows 원클릭 실행**: `앱_실행.bat` 더블 클릭
- **명령어 실행**:
```bash
npm start
```
실행 시 로컬 서버(`http://127.0.0.1:3847`)와 함께 독립된 데스크톱 앱 창이 자동으로 열립니다.

---

## 📂 생성되는 결과물 (`output/<사이트명_일시>/`)

- **`01_AI_MASTER_BLUEPRINT.md`**: AI 프롬프트에 바로 붙여넣거나 첨부할 수 있는 통합 마스터 블루프린트 문서
- **`02_sanitized_source.html`**: 민감 정보·트래커가 제거되고 정렬된 전체 HTML 소스코드
- **`03_styles_and_tokens.css`**: 추출된 `:root` 디자인 토큰 및 스타일시트
- **`04_3d_and_interactions_data.json`**: 3D 에셋, 셰이더, 레이아웃 트리, 테크스택 구조화 JSON 데이터
- **`screenshots/`**: 첫 화면(`viewport_hero.png`) 및 전체 페이지(`fullpage.png`) 스크린샷
