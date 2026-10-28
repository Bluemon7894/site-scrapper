const fs = require('fs');
const path = require('path');

/**
 * Formats byte size into human-readable string
 */
function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '크기 미상 (동적 스트림)';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/**
 * Renders the DOM tree object into a clean ASCII tree diagram for AI comprehension
 */
function renderAsciiDomTree(node, prefix = '', isLast = true, isRoot = true) {
  if (!node) return '';
  let lines = [];

  const branch = isRoot ? '' : isLast ? '└── ' : '├── ';
  const badgeStr = node.layout ? ` [${node.layout}]` : '';
  const dimStr = node.dimensions ? ` (${node.dimensions})` : '';
  const textStr = node.text ? ` — "${node.text}"` : '';

  lines.push(`${prefix}${branch}${node.selector}${badgeStr}${dimStr}${textStr}`);

  const children = node.children || [];
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');

  children.forEach((child, idx) => {
    const last = idx === children.length - 1;
    lines.push(renderAsciiDomTree(child, nextPrefix, last, false));
  });

  return lines.join('\n');
}

/**
 * Generates the comprehensive AI Master Blueprint Markdown document
 */
function generateMasterBlueprintMarkdown(data) {
  const {
    targetUrl,
    analyzedAt,
    metadata,
    techStack,
    designSystem,
    howItWorks,
    networkAssets,
    sections,
    domTree,
    sanitizedHtml,
    privacyStats
  } = data;

  const lines = [];

  // Header & AI System Instruction
  lines.push(`# 🤖 AI 레퍼런스 마스터 블루프린트: ${metadata.title || targetUrl}`);
  lines.push('');
  lines.push('> **[AI에게 전달하는 가이드]**');
  lines.push('> 이 문서는 대상 웹사이트의 **디자인 시스템(색상, 타이포그래피, CSS 변수)**, **전체 레이아웃 및 섹션 구조**, **작동 원리(스크롤 인터랙션, 애니메이션, 이벤트 메커니즘)**, **3D 모델/WebGL/셰이더 에셋의 정확한 출처**, 그리고 **민감 정보가 제거된 소스코드**를 담고 있습니다.');
  lines.push('> 사용자는 이 사이트의 디자인 분위기, 레이아웃 설계, 인터랙션 작동 방식 또는 3D 연출을 참고하여 웹사이트를 구현하거나 분석하기를 원합니다.');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 1. Overview & Metadata
  lines.push('## 1. 사이트 기본 정보 및 전체 아키텍처 개요');
  lines.push('');
  lines.push(`- **분석 대상 URL**: \`${targetUrl}\``);
  lines.push(`- **사이트 제목**: ${metadata.title || '(제목 없음)'}`);
  if (metadata.description) {
    lines.push(`- **사이트 설명**: ${metadata.description}`);
  }
  lines.push(`- **비주얼 테마 모드**: **${metadata.themeMode}** (기본 배경색: \`${metadata.pageBackground}\`)`);
  lines.push(`- **뷰포트 및 전체 길이**: 기준 뷰포트 \`${metadata.viewportWidth}x${metadata.viewportHeight}px\` / 전체 스크롤 높이 \`${metadata.scrollHeight}px\` (약 **${(metadata.scrollHeight / metadata.viewportHeight).toFixed(1)}배 화면 길이**)`);
  lines.push(`- **분석 일시**: ${analyzedAt}`);
  lines.push('');

  // Tech Stack Table
  lines.push('### 🛠️ 감지된 핵심 기술 스택 (Tech Stack & Libraries)');
  lines.push('');
  if (techStack && techStack.length > 0) {
    lines.push('| 분류 (Category) | 기술 / 라이브러리명 | 감지 근거 및 역할 |');
    lines.push('| :--- | :--- | :--- |');
    techStack.forEach((t) => {
      lines.push(`| **${t.category}** | \`${t.name}\` | ${t.reason} |`);
    });
  } else {
    lines.push('- 별도의 무거운 프론트엔드 프레임워크 없이 표준 HTML5 / CSS3 / Vanilla JS 중심으로 작성된 사이트입니다.');
  }
  lines.push('');
  lines.push('---');
  lines.push('');

  // 2. Design System
  lines.push('## 2. 🎨 디자인 시스템 & 시각적 스타일 토큰 ("어떤 디자인인가")');
  lines.push('');

  // Colors
  lines.push('### 2.1 컬러 팔레트 (Color Palette)');
  lines.push('');
  if (designSystem.backgroundColors.length > 0) {
    lines.push('#### 배경 및 서피스 컬러 (Background & Surfaces)');
    lines.push('| HEX / 투명도 | RGB 원본 | 주요 적용 요소 (Selectors) |');
    lines.push('| :--- | :--- | :--- |');
    designSystem.backgroundColors.forEach((c) => {
      lines.push(`| \`${c.hex}\` | \`${c.rgb}\` | \`${c.examples.join('`, `')}\` |`);
    });
    lines.push('');
  }

  if (designSystem.textColors.length > 0) {
    lines.push('#### 타이포그래피 텍스트 컬러 (Text Colors)');
    lines.push('| HEX / 투명도 | RGB 원본 | 빈도 | 주요 적용 요소 |');
    lines.push('| :--- | :--- | :--- | :--- |');
    designSystem.textColors.forEach((c) => {
      lines.push(`| \`${c.hex}\` | \`${c.rgb}\` | ${c.count}회 | \`${c.examples.join('`, `')}\` |`);
    });
    lines.push('');
  }

  if (designSystem.accentColors.length > 0) {
    lines.push('#### 포인트 및 인터랙티브 컬러 (Accents, Buttons, Links)');
    lines.push('| HEX / 투명도 | 역할 (Role) | 주요 적용 요소 |');
    lines.push('| :--- | :--- | :--- |');
    designSystem.accentColors.forEach((c) => {
      lines.push(`| \`${c.hex}\` | ${c.role} | \`${c.examples.join('`, `')}\` |`);
    });
    lines.push('');
  }

  // Gradients & Glassmorphism
  if (designSystem.gradients.length > 0 || designSystem.glassEffects.length > 0) {
    lines.push('### 2.2 그라디언트 & 글래스모피즘(Glassmorphism) 시각 효과');
    lines.push('');
    designSystem.gradients.forEach((g) => {
      lines.push(`- **Gradient** (\`${g.selector}\`): \`${g.value}\``);
    });
    designSystem.glassEffects.forEach((gl) => {
      lines.push(`- **Glassmorphism / Blur** (\`${gl.selector}\`): \`backdrop-filter: ${gl.backdropFilter}\`, 배경 \`${gl.background}\`, 테두리 \`${gl.border}\``);
    });
    lines.push('');
  }

  // Typography
  lines.push('### 2.3 타이포그래피 시스템 (Typography Scale & Fonts)');
  lines.push('');
  if (designSystem.fonts.length > 0) {
    lines.push(`- **주요 사용 폰트 패밀리**: ${designSystem.fonts.map((f) => `\`${f.name}\` (${f.usageCount}개 요소)`).join(', ')}`);
  }
  if (networkAssets.fonts.length > 0) {
    lines.push(`- **네트워크 로드 웹폰트 출처**:`);
    networkAssets.fonts.slice(0, 10).forEach((f) => {
      lines.push(`  - \`${f.url}\` (${f.provider})`);
    });
  }
  lines.push('');

  if (designSystem.typographyScale.length > 0) {
    lines.push('| 위계 역할 (Role) | 셀렉터 | 폰트 패밀리 | 크기 (Size) | 굵기 (Weight) | 행간 (Line-Height) | 자간 | 색상 | 예시 텍스트 |');
    lines.push('| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    designSystem.typographyScale.forEach((t) => {
      const shortFont = (t.fontFamily || '').split(',')[0].replace(/["']/g, '');
      lines.push(`| **${t.role}** | \`${t.selector}\` | \`${shortFont}\` | \`${t.fontSize}\` | \`${t.fontWeight}\` | \`${t.lineHeight}\` | \`${t.letterSpacing}\` | \`${t.color}\` | "${t.sampleText}" |`);
    });
    lines.push('');
  }

  // CSS Variables
  if (designSystem.cssVariables.length > 0) {
    lines.push('### 2.4 CSS 커스텀 프로퍼티 (Design Tokens `:root`)');
    lines.push('```css');
    lines.push(':root {');
    designSystem.cssVariables.slice(0, 40).forEach((v) => {
      lines.push(`  ${v.name}: ${v.value};`);
    });
    lines.push('}');
    lines.push('```');
    lines.push('');
  }

  if (designSystem.mediaBreakpoints.length > 0) {
    lines.push(`- **반응형 미디어쿼리 브레이크포인트**: ${designSystem.mediaBreakpoints.map((b) => `\`${b}\``).join(', ')}`);
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 3. How It Works & 3D Models / Assets
  lines.push('## 3. ⚙️ 작동 원리 & 🧊 3D 모델 / 인터랙티브 에셋 정밀 분석');
  lines.push('');

  // 3.1 3D Models & WebGL Summary
  lines.push('### 3.1 3D 모델, WebGL 캔버스 및 미디어 에셋 출처 ("3D 모델은 어디꺼고 어떻게 렌더링되는가")');
  lines.push('');

  const hasCanvases = howItWorks.canvases && howItWorks.canvases.length > 0;
  const has3DModels = networkAssets.models3D && networkAssets.models3D.length > 0;
  const hasBinaryBuffers = networkAssets.binaryBuffers && networkAssets.binaryBuffers.length > 0;
  const hasEmbeddedViewers = howItWorks.embeddedViewers && howItWorks.embeddedViewers.length > 0;
  const hasShaders = howItWorks.runtimeHooks && howItWorks.runtimeHooks.shaders && howItWorks.runtimeHooks.shaders.length > 0;

  if (!hasCanvases && !has3DModels && !hasEmbeddedViewers) {
    lines.push('- 이 페이지는 별도의 WebGL `<canvas>`나 외부 3D 모델(`.glb`, `.gltf`, `.splinecode`)을 사용하지 않고 DOM/CSS/이미지 기반으로 구성되어 있습니다.');
    lines.push('');
  } else {
    if (hasCanvases) {
      lines.push('#### 🖥️ DOM 상의 3D / 그래픽 `<canvas>` 레이어 구조');
      howItWorks.canvases.forEach((c) => {
        lines.push(`- **Canvas #${c.index} (\`${c.selector}\`, 부모: \`${c.parentSelector}\`)**`);
        lines.push(`  - **렌더링 컨텍스트**: \`${c.contextType}\`${c.engineAttr ? ` (엔진 속성: \`${c.engineAttr}\`)` : ''}`);
        lines.push(`  - **크기 및 배치**: \`${c.dimensions}\`, \`position: ${c.position}\`, \`z-index: ${c.zIndex}\`, \`pointer-events: ${c.pointerEvents}\``);
        lines.push(`  - **작동 역할**: ${c.roleDescription}`);
      });
      lines.push('');
    }

    if (hasEmbeddedViewers) {
      lines.push('#### 🎬 인터랙티브 뷰어 / 비디오 / 임베드 컴포넌트 (`<spline-viewer>`, `<model-viewer>`, `<video>`, `<iframe>`)');
      howItWorks.embeddedViewers.forEach((v) => {
        lines.push(`- **${v.tag}** (\`${v.selector}\`, 크기: \`${v.dimensions}\`)`);
        if (v.sourceUrl) lines.push(`  - **에셋/소스 URL**: \`${v.sourceUrl}\``);
        if (v.attributes) lines.push(`  - **속성(Attributes)**: \`${v.attributes}\``);
      });
      lines.push('');
    }

    if (has3DModels || hasBinaryBuffers) {
      lines.push('#### 📦 네트워크에서 감지된 3D 모델 / 환경맵 / 텍스처 / 디코더 파일 출처');
      lines.push('| 에셋 유형 (Type) | 제공 플랫폼 / 호스팅 출처 (Provider) | 크기 | 상세 설명 | 원본 파일 URL |');
      lines.push('| :--- | :--- | :--- | :--- | :--- |');
      networkAssets.models3D.forEach((m) => {
        lines.push(`| **${m.type}** | **${m.provider}** | ${formatBytes(m.sizeBytes)} | ${m.description} | \`${m.url}\` |`);
      });
      networkAssets.binaryBuffers.forEach((b) => {
        lines.push(`| **${b.type}** | **${b.provider}** | ${formatBytes(b.sizeBytes)} | 3D 지오메트리/애니메이션 바이너리 버퍼 | \`${b.url}\` |`);
      });
      lines.push('');
    }

    if (hasShaders) {
      lines.push('#### ✨ 런타임에 캡처된 커스텀 GLSL 셰이더 (WebGL Vertex / Fragment Shaders)');
      lines.push('> 페이지 로딩 중 GPU에 컴파일된 커스텀 GLSL 셰이더 코드입니다 (물결, 왜곡, 파티클, 커스텀 라이팅 효과 등):');
      lines.push('');
      howItWorks.runtimeHooks.shaders.slice(0, 4).forEach((sh, i) => {
        lines.push(`##### Shader #${i + 1}: ${sh.type} (${sh.length} chars)`);
        lines.push('```glsl');
        lines.push(sh.source.slice(0, 1200));
        lines.push('```');
      });
      lines.push('');
    }
  }

  // Lottie / Rive / Video assets
  if (networkAssets.animations.length > 0 || networkAssets.videos.length > 0) {
    lines.push('### 3.2 모션 그래픽(Lottie/Rive) 및 배경 비디오 에셋');
    networkAssets.animations.forEach((a) => {
      lines.push(`- **[${a.type}]** 출처: **${a.provider}** (${formatBytes(a.sizeBytes)}) -> \`${a.url}\``);
    });
    networkAssets.videos.forEach((v) => {
      lines.push(`- **[${v.type}]** 출처: **${v.provider}** (${formatBytes(v.sizeBytes)}) -> \`${v.url}\``);
    });
    lines.push('');
  }

  // 3.3 Scroll, Event Listeners, Sticky Scrollytelling & CSS Animations
  lines.push('### 3.3 인터랙션 & 스크롤 작동 메커니즘 ("이게 어떻게 작동하는가")');
  lines.push('');

  const winEvents = (howItWorks.runtimeHooks && howItWorks.runtimeHooks.eventListeners && howItWorks.runtimeHooks.eventListeners.windowEvents) || {};
  const docEvents = (howItWorks.runtimeHooks && howItWorks.runtimeHooks.eventListeners && howItWorks.runtimeHooks.eventListeners.documentEvents) || {};
  const eventKeys = Array.from(new Set([...Object.keys(winEvents), ...Object.keys(docEvents)]));

  if (eventKeys.length > 0) {
    lines.push('#### 🎯 전역 이벤트 리스너 작동 감지');
    eventKeys.forEach((ev) => {
      const count = (winEvents[ev] || 0) + (docEvents[ev] || 0);
      let explanation = '';
      if (ev === 'wheel') explanation = '-> 마우스 휠 입력을 가로채어 커스텀 스무스 스크롤이나 3D 카메라 이동을 제어함';
      else if (ev === 'scroll') explanation = '-> 스크롤 진행도(Scroll Progress)에 따라 요소 위치/투명도/네비게이션 상태를 실시간 업데이트함';
      else if (ev === 'mousemove' || ev === 'pointermove') explanation = '-> 마우스 커서 위치를 추적하여 3D 모델 시선 회전, 패럴랙스 기울기(Tilt), 또는 커스텀 커서 효과를 연출함';
      else if (ev === 'resize') explanation = '-> 뷰포트 리사이즈 시 캔버스 종횡비(Aspect Ratio) 및 레이아웃 계산을 갱신함';
      lines.push(`- \`${ev}\` 리스너 (${count}개 등록됨) ${explanation}`);
    });
    lines.push('');
  }

  if (howItWorks.stickyAndFixedElements && howItWorks.stickyAndFixedElements.length > 0) {
    lines.push('#### 📌 고정 레이어(Fixed) 및 스크롤리텔링(Sticky Pinning) 작동 구조');
    howItWorks.stickyAndFixedElements.forEach((st) => {
      lines.push(`- **\`${st.selector}\`** (\`position: ${st.position}\`, \`top: ${st.top}\`, \`z-index: ${st.zIndex}\`, 크기: \`${st.dimensions}\`)`);
      lines.push(`  - **작동 방식**: ${st.mechanism} (부모 컨테이너: \`${st.parentSelector}\`, 트랙 높이: \`${st.parentTrackHeight}\`)`);
    });
    lines.push('');
  }

  if (howItWorks.keyframes && howItWorks.keyframes.length > 0) {
    lines.push('#### 🎞️ CSS `@keyframes` 애니메이션 규칙');
    howItWorks.keyframes.slice(0, 12).forEach((kf) => {
      lines.push(`- **\`@keyframes ${kf.name}\`**: \`${kf.cssText}\``);
    });
    lines.push('');
  }

  if (howItWorks.animatedElements && howItWorks.animatedElements.length > 0) {
    lines.push('#### ⚡ 주요 애니메이션 / 트랜지션 / 스크롤 속성 적용 요소');
    howItWorks.animatedElements.slice(0, 15).forEach((ae) => {
      const parts = [];
      if (ae.animationName) parts.push(`애니메이션: \`${ae.animationName}\``);
      if (ae.transition) parts.push(`트랜지션: \`${ae.transition}\``);
      if (ae.transform) parts.push(`변형(Transform): \`${ae.transform}\``);
      if (ae.dataAttributes) parts.push(`모션 데이터 속성: \`${ae.dataAttributes}\``);
      lines.push(`- **\`${ae.selector}\`**: ${parts.join(' | ')}`);
    });
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 4. Section-by-Section Anatomy
  lines.push('## 4. 📐 페이지 상단~하단 섹션별 구조 해부 (Section-by-Section Anatomy)');
  lines.push('');
  if (sections && sections.length > 0) {
    sections.forEach((sec, idx) => {
      lines.push(`### [섹션 ${idx + 1}] \`${sec.selector}\` (Y위치: \`${sec.topY}px\`, 크기: \`${sec.dimensions}\` / \`${sec.viewportHeightRatio}\`)`);
      lines.push(`- **레이아웃 방식**: ${sec.layoutPattern}`);
      lines.push(`- **배경 및 패딩**: 배경 \`${sec.background}\` | 패딩 \`${sec.padding}\` | 포지션 \`${sec.position}\``);
      if (sec.headings.length > 0) {
        lines.push(`- **주요 타이틀/헤딩**: ${sec.headings.map((h) => `\`<${h.tag}>\` "${h.text}"`).join(' / ')}`);
      }
      if (sec.buttons.length > 0) {
        lines.push(`- **버튼 / CTA 요소**: ${sec.buttons.map((b) => `"[${b}]"`).join(', ')}`);
      }
      const m = sec.mediaSummary;
      if (m.canvases > 0 || m.videos > 0 || m.images > 0 || m.svgs > 0) {
        lines.push(`- **포함된 미디어**: 3D/캔버스 ${m.canvases}개, 비디오 ${m.videos}개, 이미지 ${m.images}개, SVG 아이콘/그래픽 ${m.svgs}개`);
      }
      lines.push('');
    });
  } else {
    lines.push('- 단일 캔버스 또는 비정형 컨테이너로 구성된 페이지입니다.');
    lines.push('');
  }

  lines.push('---');
  lines.push('');

  // 5. Visual DOM Hierarchy Tree
  lines.push('## 5. 🌳 시각적 DOM 레이아웃 트리 (Visual DOM Hierarchy)');
  lines.push('');
  lines.push('```text');
  lines.push(renderAsciiDomTree(domTree));
  lines.push('```');
  lines.push('');
  lines.push('---');
  lines.push('');

  // 6. Sanitized HTML Core Preview & Privacy Summary
  lines.push('## 6. 🔒 개인정보·보안 정제 리포트 및 핵심 마크업 스니펫');
  lines.push('');
  lines.push('### 보안 및 개인정보 자동 마스킹 내역 (Sanitization Report)');
  lines.push(`- **제거된 광고/트래커/애널리틱스 스크립트**: ${privacyStats.removedTrackers}개`);
  lines.push(`- **생략된 대규모 SSR 상태/인라인 스크립트 블롭**: ${privacyStats.removedInlineScripts}개`);
  lines.push(`- **마스킹된 히든 인풋(\`<input type="hidden">\`) 및 CSRF 메타 토큰**: ${privacyStats.redactedHiddenInputs + privacyStats.redactedMetaTokens}개`);
  lines.push(`- **AI 토큰 절약을 위해 축약된 Base64 데이터 및 초대형 SVG 경로**: ${privacyStats.truncatedBase64 + privacyStats.simplifiedSvgPaths}개`);
  const redactedKeys = Object.entries(privacyStats.redactedItems || {});
  if (redactedKeys.length > 0) {
    lines.push(`- **민감 패턴 마스킹 상세**: ${redactedKeys.map(([k, v]) => `${k} (${v}건)`).join(', ')}`);
  } else {
    lines.push(`- **민감 패턴 마스킹 상세**: 노출된 API 키/이메일/세션 토큰 없음 (클린 상태)`);
  }
  lines.push('');
  lines.push('### 정제된 HTML 마크업 핵심 구조 (Sanitized HTML Preview)');
  lines.push('> 전체 정제된 HTML 소스는 `02_sanitized_source.html`, 전체 CSS는 `03_styles_and_tokens.css` 파일을 참고하세요.');
  lines.push('');
  lines.push('```html');
  // Include a clean preview (up to 9,000 chars) inside the Master Blueprint so even a single file copy gives the AI real markup!
  const htmlPreview = sanitizedHtml.length > 9000
    ? sanitizedHtml.slice(0, 9000) + '\n<!-- ... [전체 코드는 02_sanitized_source.html 파일에 저장되어 있습니다] ... -->'
    : sanitizedHtml;
  lines.push(htmlPreview);
  lines.push('```');
  lines.push('');

  return lines.join('\n');
}

/**
 * Saves all generated AI reference artifacts to the output directory
 */
function saveBlueprintFiles(analysisData, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });

  const masterMarkdown = generateMasterBlueprintMarkdown(analysisData);
  const masterPath = path.join(outputDir, '01_AI_MASTER_BLUEPRINT.md');
  fs.writeFileSync(masterPath, masterMarkdown, 'utf8');

  const htmlPath = path.join(outputDir, '02_sanitized_source.html');
  fs.writeFileSync(htmlPath, analysisData.sanitizedHtml || '', 'utf8');

  const cssHeader = [
    '/**',
    ` * Sanitized Styles & Design Tokens for: ${analysisData.targetUrl}`,
    ` * Generated at: ${analysisData.analyzedAt}`,
    ' */',
    ''
  ].join('\n');
  const cssPath = path.join(outputDir, '03_styles_and_tokens.css');
  fs.writeFileSync(cssPath, cssHeader + (analysisData.sanitizedCss || ''), 'utf8');

  // Create structured JSON without duplicating full HTML/CSS strings inside the JSON
  const jsonReport = {
    targetUrl: analysisData.targetUrl,
    analyzedAt: analysisData.analyzedAt,
    viewport: analysisData.viewport,
    screenshots: analysisData.screenshots,
    metadata: analysisData.metadata,
    techStack: analysisData.techStack,
    designSystem: analysisData.designSystem,
    howItWorks: analysisData.howItWorks,
    networkAssets: analysisData.networkAssets,
    sections: analysisData.sections,
    domTree: analysisData.domTree,
    privacyStats: analysisData.privacyStats
  };

  const jsonPath = path.join(outputDir, '04_3d_and_interactions_data.json');
  fs.writeFileSync(jsonPath, JSON.stringify(jsonReport, null, 2), 'utf8');

  return {
    masterMarkdown,
    files: [
      { name: '01_AI_MASTER_BLUEPRINT.md', description: 'AI 프롬프트 입력용 통합 마스터 블루프린트 (디자인+구조+작동원리+3D출처+코드요약)', size: fs.statSync(masterPath).size },
      { name: '02_sanitized_source.html', description: '민감 정보·트래커가 제거되고 정렬된 전체 HTML 소스코드', size: fs.statSync(htmlPath).size },
      { name: '03_styles_and_tokens.css', description: '추출된 CSS 디자인 토큰(:root 변수), 키프레임 및 스타일시트', size: fs.statSync(cssPath).size },
      { name: '04_3d_and_interactions_data.json', description: '3D 에셋, 셰이더, 레이아웃 트리, 테크스택 구조화 데이터 (JSON)', size: fs.statSync(jsonPath).size }
    ]
  };
}

module.exports = {
  generateMasterBlueprintMarkdown,
  saveBlueprintFiles,
  renderAsciiDomTree
};
