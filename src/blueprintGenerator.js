const fs = require('fs');
const path = require('path');

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

/** Escape pipe characters so values don't break markdown tables */
function cell(v) {
  if (v === null || v === undefined || v === '') return '-';
  return String(v).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function code(v) {
  if (v === null || v === undefined || v === '') return '-';
  return '`' + String(v).replace(/`/g, "'").replace(/\|/g, '\\|').replace(/\n/g, ' ') + '`';
}

/**
 * Renders the DOM tree object into an ASCII tree diagram
 */
function renderAsciiDomTree(node, prefix = '', isLast = true, isRoot = true) {
  if (!node) return '';
  const lines = [];
  const branch = isRoot ? '' : isLast ? '└── ' : '├── ';
  const badgeStr = node.layout ? ` [${node.layout}]` : '';
  const dimStr = node.dimensions ? ` (${node.dimensions})` : '';
  const textStr = node.text ? ` — "${node.text}"` : '';
  lines.push(`${prefix}${branch}${node.selector}${badgeStr}${dimStr}${textStr}`);
  const children = node.children || [];
  const nextPrefix = isRoot ? '' : prefix + (isLast ? '    ' : '│   ');
  children.forEach((child, idx) => {
    lines.push(renderAsciiDomTree(child, nextPrefix, idx === children.length - 1, false));
  });
  return lines.join('\n');
}

function explainEvent(ev) {
  return (
    {
      wheel: '마우스 휠 입력을 직접 처리 → 커스텀 스무스 스크롤 / 3D 카메라 이동 / 스크롤 하이재킹',
      scroll: '스크롤 위치에 따라 요소 위치·투명도·헤더 상태·진행도 업데이트',
      mousemove: '커서 위치 추적 → 패럴랙스, 3D 시선/회전, 커스텀 커서, 마그네틱 버튼',
      pointermove: '포인터 위치 추적 → 3D 레이캐스팅/호버, 드래그, 커서 효과',
      pointerdown: '클릭/드래그 시작 처리 (3D 오브젝트 조작, 드래그 슬라이더 등)',
      resize: '뷰포트 변경 시 캔버스 크기·카메라 종횡비·레이아웃 재계산',
      keydown: '키보드 단축키 / 게임형 조작 / 접근성 내비게이션',
      touchstart: '모바일 터치 제스처 처리',
      touchmove: '모바일 스와이프/드래그 처리',
      deviceorientation: '기기 기울기(자이로) 기반 패럴랙스',
      visibilitychange: '탭 비활성화 시 렌더 루프 일시정지 등 최적화',
      click: '클릭 인터랙션',
      mouseenter: '호버 진입 효과',
      mouseleave: '호버 이탈 효과'
    }[ev] || ''
  );
}

/**
 * Generates the AI Master Blueprint markdown
 */
function generateMasterBlueprintMarkdown(data) {
  const { targetUrl, finalUrl, httpStatus, analyzedAt, viewport, mobile, metadata, techStack, codeLibraries, threeModules, designSystem: ds, howItWorks: hw, networkAssets: na, referencedAssets, structure, sections, domTree, sanitizedHtml, savedScripts, savedLocalAssets, privacyStats, screenshots } = data;

  const L = [];
  const push = (...xs) => L.push(...xs);

  push(`# AI 레퍼런스 블루프린트: ${metadata.title || targetUrl}`, '');
  push('> **[AI에게]** 이 문서는 아래 웹사이트를 자동 분석한 결과입니다. 디자인 시스템(색상·타이포·토큰), 페이지/섹션 구조, 작동 원리(스크롤·애니메이션·이벤트), 사용 기술과 3D 에셋의 출처, 그리고 민감정보가 제거된 소스코드 위치를 담고 있습니다.');
  push('> 사용자는 이 사이트를 **참고하여 비슷한 디자인/구조/인터랙션을 구현**하거나 작동 방식을 이해하고 싶어 합니다. 수치(px, HEX, 폰트 등)는 실제 브라우저에서 계산된 값입니다.', '');

  // 0. File index
  push('## 0. 함께 제공되는 파일 (1:1 완벽 클론 패키지)', '');
  push('| 파일 | 내용 |', '| :--- | :--- |');
  push('| `00_AI_COPY_PASTE_PROMPT.md` | **AI 복사-붙여넣기 전용 프롬프트** (ChatGPT/Claude/Cursor에 바로 전달) |');
  push('| `01_AI_MASTER_BLUEPRINT.md` | 이 문서 (전체 아키텍처 + 디자인 토큰 + 3D/모션 작동 원리 통합) |');
  push('| `02_sanitized_source.html` | 렌더링 완료 후의 전체 DOM HTML (로컬 스타일 시트 연동 완료, 트래커·개인정보 제거) |');
  push('| `03_styles_and_tokens.css` | 외부/인라인 CSS 전체 (출처별 구분, url() 절대경로 변환 완료) |');
  push('| `04_structured_data.json` | 전체 분석 원본 구조화 데이터 (JSON) |');
  if (savedScripts && savedScripts.length) push(`| \`05_scripts/\` | JS 소스 ${savedScripts.length}개 (정제·정렬됨, 목록은 7장) |`);
  push('| `06_section_cloning_specs.md` | **섹션별 1:1 복제 명세서** (각 섹션 내부 모든 하위 요소의 계산된 CSS 수치 트리 + 섹션별 정제 HTML 코드) |');
  if (structure && structure.svgCatalog && structure.svgCatalog.length) {
    push(`| \`07_svg_icons_and_graphics.md\` | 페이지 내 고유 SVG 로고·아이콘 ${structure.svgCatalog.length}개의 원본 \`<svg>\` 벡터 코드 모음 |`);
  }
  if (savedLocalAssets && savedLocalAssets.length) {
    push(`| \`assets/\` | **로컬 다운로드 에셋 ${savedLocalAssets.length}개** (3D 모델, 텍스처, 폰트, Lottie JSON 등 - CORS 에러 없이 로컬 로드 가능) |`);
  }
  if (screenshots && (screenshots.viewportPath || screenshots.fullPagePath)) {
    push(`| \`screenshots/\` | 첫 화면, 스크롤 단계별 ${screenshots.scrollShots ? screenshots.scrollShots.length : 0}장, 전체 페이지 스크린샷 |`);
  }
  push('');

  // 1. Overview
  push('## 1. 개요', '');
  push(`- **URL**: ${targetUrl}${finalUrl && finalUrl !== targetUrl ? ` → 최종: ${finalUrl}` : ''}${httpStatus ? ` (HTTP ${httpStatus})` : ''}`);
  push(`- **제목**: ${metadata.title || '-'}`);
  if (metadata.description) push(`- **설명**: ${metadata.description}`);
  if (metadata.lang) push(`- **언어**: ${metadata.lang}`);
  if (metadata.generator) push(`- **Generator 메타**: ${metadata.generator}`);
  push(`- **테마**: ${metadata.themeMode}, 기본 배경 \`${metadata.pageBackground}\`${metadata.themeColor ? `, theme-color \`${metadata.themeColor}\`` : ''}`);
  push(`- **분석 뷰포트**: ${viewport.width}x${viewport.height} (${mobile ? '모바일' : '데스크톱'}) / 전체 높이 ${metadata.scrollHeight}px (≈ ${(metadata.scrollHeight / metadata.viewportHeight).toFixed(1)} 화면)`);
  if (structure && structure.counts) {
    const c = structure.counts;
    push(`- **규모**: DOM 요소 ${c.elements}개, 이미지 ${c.images}, SVG ${c.svgs}, 비디오 ${c.videos}, 캔버스 ${c.canvases}, iframe ${c.iframes}, 버튼 ${c.buttons}, 링크 ${c.links}, 폼 ${c.forms}`);
  }
  push(`- **분석 시각**: ${analyzedAt}`, '');

  push('### 1.1 사용 기술 (런타임 감지)', '');
  if (techStack.length) {
    push('| 분류 | 기술 | 근거 |', '| :--- | :--- | :--- |');
    techStack.forEach((t) => push(`| ${cell(t.category)} | **${cell(t.name)}** | ${cell(t.reason)} |`));
  } else push('- 런타임에서 특정 프레임워크가 감지되지 않음 (순수 HTML/CSS/JS 또는 번들에 숨겨짐 → 1.2 참고)');
  push('');

  push('### 1.2 JS 번들 정적 분석으로 확인된 라이브러리', '');
  if (codeLibraries && codeLibraries.length) {
    push('| 분류 | 라이브러리 | 발견 위치 | 근거 문자열 |', '| :--- | :--- | :--- | :--- |');
    codeLibraries.forEach((l) => push(`| ${cell(l.category)} | **${cell(l.name)}** | ${cell(l.files.join(', '))} | ${code(l.evidence)} |`));
  } else push('- 특이 라이브러리 시그니처 없음');
  push('');
  if (threeModules && threeModules.length) {
    push(`- **Three.js 모듈/로더 사용 흔적**: ${threeModules.map((m) => `\`${m}\``).join(', ')}`, '');
  }

  // 2. Design system
  push('## 2. 디자인 시스템', '');
  push('### 2.1 컬러', '');
  if (ds.backgroundColors.length) {
    push('**배경/서피스** (화면 면적 가중치 순)', '', '| HEX | 사용 예 |', '| :--- | :--- |');
    ds.backgroundColors.forEach((c) => push(`| ${code(c.hex)} | ${c.examples.map(code).join(', ')} |`));
    push('');
  }
  if (ds.textColors.length) {
    push('**텍스트** (사용 빈도 순)', '', '| HEX | 빈도 | 사용 예 |', '| :--- | :--- | :--- |');
    ds.textColors.forEach((c) => push(`| ${code(c.hex)} | ${c.count} | ${c.examples.map(code).join(', ')} |`));
    push('');
  }
  if (ds.accentColors.length) {
    push('**포인트 / 버튼 배경**', '', '| HEX | 사용 예 |', '| :--- | :--- |');
    ds.accentColors.forEach((c) => push(`| ${code(c.hex)} | ${c.examples.map(code).join(', ')} |`));
    push('');
  }
  if (ds.borderColors && ds.borderColors.length) push(`- **테두리 색**: ${ds.borderColors.map((b) => `${code(b.value)}(${b.count})`).join(', ')}`, '');

  if (ds.gradients.length || ds.glassEffects.length) {
    push('### 2.2 그라디언트 / 글래스모피즘', '');
    ds.gradients.forEach((g) => push(`- ${code(g.selector)}: ${code(g.value)}`));
    ds.glassEffects.forEach((g) => push(`- **blur** ${code(g.selector)}: backdrop-filter ${code(g.backdropFilter)}, 배경 ${code(g.background)}, 테두리 ${code(g.border)}`));
    push('');
  }

  push('### 2.3 타이포그래피', '');
  if (ds.fonts.length) push(`- **폰트 패밀리** (텍스트 요소 수): ${ds.fonts.slice(0, 8).map((f) => `\`${f.name}\`(${f.usageCount})`).join(', ')}`);
  if (na.fonts.length) {
    push('- **웹폰트 파일/출처**:');
    na.fonts.slice(0, 12).forEach((f) => push(`  - ${f.url.split('?')[0]} — ${f.provider}`));
  }
  if (ds.fontFaces && ds.fontFaces.length) {
    push('- **`@font-face` 선언**:');
    ds.fontFaces.slice(0, 10).forEach((ff) => push(`  - \`${ff.family}\` (weight: \`${ff.weight}\`, style: \`${ff.style}\`)${ff.srcUrl ? ` → \`${ff.srcUrl}\`` : ''}`));
  }
  push('');
  if (ds.typographyScale.length) {
    push('| 역할 | 셀렉터 | 폰트 | 크기 | 굵기 | 행간 | 자간 | 변환 | 색 | 예시 |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    ds.typographyScale.forEach((t) => {
      const f = (t.fontFamily || '').split(',')[0].replace(/["']/g, '');
      push(`| ${cell(t.role)} | ${code(t.selector)} | ${cell(f)} | ${cell(t.fontSize)} | ${cell(t.fontWeight)} | ${cell(t.lineHeight)} | ${cell(t.letterSpacing)} | ${cell(t.textTransform)} | ${code(t.color)} | ${cell(t.sampleText)} |`);
    });
    push('');
  }

  push('### 2.4 컴포넌트 스타일 토큰', '');
  if (ds.buttonStyles && ds.buttonStyles.length) {
    push('**버튼 스타일**', '', '| 셀렉터 | 텍스트 | 배경 | 글자색 | radius | padding | 폰트 | transition |', '| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |');
    ds.buttonStyles.forEach((b) => push(`| ${code(b.selector)} | ${cell(b.text)} | ${code(b.background)} | ${code(b.color)} | ${cell(b.borderRadius)} | ${cell(b.padding)} | ${cell(b.fontSize + ' / ' + b.fontWeight)} | ${code(b.transition)} |`));
    push('');
  }
  if (ds.borderRadii && ds.borderRadii.length) push(`- **border-radius** (빈도순): ${ds.borderRadii.map((r) => `${code(r.value)}×${r.count}`).join(', ')}`);
  if (ds.gaps && ds.gaps.length) push(`- **gap 간격** (빈도순): ${ds.gaps.map((r) => `${code(r.value)}×${r.count}`).join(', ')}`);
  if (ds.shadows && ds.shadows.length) push(`- **box-shadow**: ${ds.shadows.slice(0, 4).map((r) => code(r.value)).join(' / ')}`);
  if (ds.mediaBreakpoints.length) push(`- **반응형 브레이크포인트**: ${ds.mediaBreakpoints.map(code).join(', ')}`);
  push('');

  if (ds.cssVariables.length) {
    push('### 2.5 CSS 변수 (디자인 토큰)', '', '```css');
    const bySel = new Map();
    ds.cssVariables.slice(0, 100).forEach((v) => {
      if (!bySel.has(v.selector)) bySel.set(v.selector, []);
      bySel.get(v.selector).push(v);
    });
    for (const [sel, vars] of bySel.entries()) {
      push(`${sel} {`);
      vars.forEach((v) => push(`  ${v.name}: ${v.value};`));
      push('}');
    }
    push('```', '');
  }

  // 3. How it works / 3D
  push('## 3. 작동 원리 · 3D · 모션', '');

  push('### 3.1 캔버스 / 3D 렌더링 레이어', '');
  const contexts = (hw.runtimeHooks && hw.runtimeHooks.webglContexts) || [];
  if (contexts.length) push(`- **생성된 렌더링 컨텍스트**: ${contexts.slice(0, 10).map((c) => `\`${c.type}\``).join(', ')}`);
  if (hw.canvases.length) {
    hw.canvases.forEach((c) => {
      push(`- **Canvas #${c.index}** ${code(c.selector)} (경로: ${code(c.ancestorPath || c.parentSelector)})`);
      push(`  - 컨텍스트 ${code(c.contextType)}, 크기 ${c.dimensions}, position ${code(c.position)}, z-index ${code(c.zIndex)}, pointer-events ${code(c.pointerEvents)}${c.webglRenderer ? `, GPU ${code(c.webglRenderer)}` : ''}`);
      push(`  - 해석: ${c.roleDescription}`);
    });
  } else push('- `<canvas>` 없음 (DOM/CSS/이미지 기반 페이지)');
  push('');

  if (hw.embeddedViewers.length) {
    push('### 3.2 임베드 / 뷰어 / 비디오', '');
    hw.embeddedViewers.forEach((v) => push(`- **${v.tag}** ${code(v.selector)} ${v.dimensions}${v.sourceUrl ? ` — src: ${v.sourceUrl}` : ''}${v.attributes ? ` — ${code(v.attributes)}` : ''}`));
    push('');
  }

  push('### 3.3 3D 모델 · 텍스처 · 디코더 (네트워크에서 실제 로드된 것)', '');
  const models = [...na.models3D, ...na.binaryBuffers];
  if (models.length) {
    push('| 유형 | 출처 (호스팅) | 크기 | 로컬 파일 / 원본 URL |', '| :--- | :--- | :--- | :--- |');
    models.slice(0, 80).forEach((m) => {
      const loc = m.localPath ? `**\`${m.localPath}\`**<br>` : '';
      push(`| ${cell(m.type)} | ${cell(m.provider)} | ${formatBytes(m.sizeBytes)} | ${loc}${cell(m.url.split('?')[0])} |`);
    });
    if (models.length > 80) push(`| … | | | 외 ${models.length - 80}개 (04_structured_data.json 참고) |`);
  } else push('- 로드된 3D 모델 파일 없음');
  push('');

  const refAssets = (referencedAssets || []).filter((r) => !models.some((m) => m.url.split('?')[0] === r.resolvedUrl.split('?')[0]));
  if (refAssets.length) {
    push('### 3.4 코드/HTML 안에서 참조된 3D·모션·미디어 경로', '');
    push('> 방문 중 로드되지 않았더라도 소스에 경로가 적혀 있는 에셋입니다 (인터랙션/다른 페이지에서 로드될 수 있음).', '');
    push('| 종류 | 경로 | 발견 위치 |', '| :--- | :--- | :--- |');
    refAssets.slice(0, 60).forEach((r) => push(`| ${r.kind} (${r.ext}) | ${cell(r.resolvedUrl)} | ${cell(r.foundIn)} |`));
    push('');
  }

  if (na.animations.length || na.videos.length) {
    push('### 3.5 모션 그래픽 / 비디오 에셋', '');
    na.animations.forEach((a) => {
      const loc = a.localPath ? `**\`${a.localPath}\`** ` : '';
      push(`- **${a.type}** — ${a.provider} (${formatBytes(a.sizeBytes)}) ${loc}${a.url.split('?')[0]}`);
    });
    na.videos.slice(0, 15).forEach((v) => push(`- **${v.type}** — ${v.provider} (${formatBytes(v.sizeBytes)}) ${v.url.split('?')[0]}`));
    push('');
  }

  const shaders = (hw.runtimeHooks && hw.runtimeHooks.shaders) || [];
  if (shaders.length || na.shaders.length) {
    push('### 3.6 런타임에 캡처된 셰이더', '');
    push(`> 총 ${shaders.length}개 캡처 (엔진 기본 셰이더 포함). 앞의 일부만 표시하며 전체는 04_structured_data.json에 있습니다.`, '');
    shaders.slice(0, 4).forEach((s, i) => {
      push(`**Shader #${i + 1} — ${s.type} (${s.length} chars)**`, '', '```' + (s.type.startsWith('WGSL') ? 'wgsl' : 'glsl'));
      push(s.source.slice(0, 1800) + (s.source.length > 1800 ? '\n// ... (생략)' : ''));
      push('```', '');
    });
    na.shaders.forEach((s) => push(`- 외부 셰이더 파일: ${s.url}`));
    push('');
  }

  push('### 3.7 인터랙션 / 스크롤 메커니즘', '');
  const ev = (hw.runtimeHooks && hw.runtimeHooks.eventListeners) || {};
  const evRows = [];
  for (const [scope, label] of [['windowEvents', 'window'], ['documentEvents', 'document'], ['elementEvents', '요소']]) {
    for (const [type, count] of Object.entries(ev[scope] || {})) evRows.push({ scope: label, type, count });
  }
  if (evRows.length) {
    push('| 대상 | 이벤트 | 리스너 수 | 의미 |', '| :--- | :--- | :--- | :--- |');
    evRows.sort((a, b) => b.count - a.count).forEach((r) => push(`| ${r.scope} | \`${r.type}\` | ${r.count} | ${explainEvent(r.type)} |`));
    push('');
  }
  if (hw.stickyAndFixedElements.length) {
    push('**고정(fixed) / 스티키(sticky) 요소**', '');
    hw.stickyAndFixedElements.forEach((s) => push(`- ${code(s.selector)} — ${s.position}, top ${s.top}, z ${s.zIndex}, ${s.dimensions}: ${s.mechanism}`));
    push('');
  }
  if (hw.scrollSnap && hw.scrollSnap.length) push(`- **scroll-snap**: ${hw.scrollSnap.map((s) => `${code(s.selector)} ${code(s.scrollSnapType)}`).join(', ')}`, '');
  if (hw.keyframes.length) {
    push('**CSS @keyframes**', '');
    hw.keyframes.slice(0, 15).forEach((k) => push(`- ${code(k.cssText)}`));
    if (hw.keyframes.length > 15) push(`- … 외 ${hw.keyframes.length - 15}개 (03_styles_and_tokens.css)`);
    push('');
  }
  if (hw.animatedElements.length) {
    push('**애니메이션 / 트랜지션 / 스크롤 속성이 걸린 요소**', '');
    hw.animatedElements.slice(0, 18).forEach((a) => {
      const parts = [];
      if (a.animationName) parts.push(`animation ${code(a.animationName)}`);
      if (a.transition) parts.push(`transition ${code(a.transition)}`);
      if (a.transform) parts.push(`transform ${code(a.transform)}`);
      if (a.willChange) parts.push(`will-change ${code(a.willChange)}`);
      if (a.dataAttributes) parts.push(`속성 ${code(a.dataAttributes)}`);
      push(`- ${code(a.selector)}: ${parts.join(' · ')}`);
    });
    push('');
  }
  if (hw.hoverRules && hw.hoverRules.length) {
    push('**CSS `:hover` 인터랙션 상태 규칙**', '');
    hw.hoverRules.slice(0, 20).forEach((hr) => push(`- ${code(hr.selector)} → ${code(hr.declarations)}`));
    push('');
  }

  // 4. Structure
  push('## 4. 사이트 / 페이지 구조', '');
  if (structure) {
    if (structure.navigation.length) {
      push('### 4.1 내비게이션', '');
      structure.navigation.slice(0, 30).forEach((n) => push(`- ${n.text} → \`${n.href || '-'}\`${n.inHeader ? '' : ' (nav)'}`));
      push('');
    }
    if (structure.internalPages.length) {
      push(`### 4.2 내부 페이지 링크 (${structure.internalPages.length}개)`, '');
      push(structure.internalPages.slice(0, 60).map((p) => `\`${p.path}\``).join(', '), '');
    }
    if (structure.headingOutline.length) {
      push('### 4.3 헤딩 아웃라인', '');
      structure.headingOutline.forEach((h) => push(`${'  '.repeat(h.level - 1)}- H${h.level}: ${h.text}`));
      push('');
    }
  }

  push('### 4.4 섹션별 구조 (위 → 아래)', '');
  if (sections.length) {
    sections.forEach((s, i) => {
      push(`#### [${i + 1}] ${code(s.selector)} — y=${s.topY}px, ${s.dimensions} (${s.viewportHeightRatio})`);
      push(`- 레이아웃: ${s.layoutPattern}${s.containerMaxWidth ? ` / 컨테이너 max-width ${code(s.containerMaxWidth)}` : ''}`);
      push(`- 배경 ${code(s.background)}${s.backgroundImage ? ` + ${code(s.backgroundImage)}` : ''}, padding ${code(s.padding)}, position ${code(s.position)}${s.hasStickyInside ? ' — **내부에 sticky 요소 (스크롤 고정 연출)**' : ''}`);
      if (s.headings.length) push(`- 헤딩: ${s.headings.map((h) => `${h.tag} "${h.text}"`).join(' / ')}`);
      if (s.buttons.length) push(`- 버튼: ${s.buttons.map((b) => `[${b}]`).join(' ')}`);
      const m = s.mediaSummary;
      if (m.images || m.svgs || m.videos || m.canvases) push(`- 미디어: 이미지 ${m.images}, SVG ${m.svgs}, 비디오 ${m.videos}, 캔버스/3D ${m.canvases}`);
      if (s.textPreview) push(`- 텍스트: "${s.textPreview}"`);
      if (screenshots && screenshots.scrollShots) {
        const vh = data.viewport.height;
        const idx = Math.floor(s.topY / vh);
        const shot = idx === 0 ? screenshots.viewportPath : screenshots.scrollShots[idx - 1];
        if (shot) push(`- 스크린샷: \`${shot}\``);
      }
      push('');
    });
  } else push('- 섹션 구분 불가 (단일 캔버스/앱 형태)', '');

  if (structure) {
    if (structure.images.length) {
      push('### 4.5 주요 이미지 (표시 크기 순)', '');
      push('| 표시 크기 | 원본 크기 | object-fit | alt | src |', '| :--- | :--- | :--- | :--- | :--- |');
      structure.images.forEach((im) => push(`| ${im.displayed} | ${im.natural} | ${cell(im.objectFit)} | ${cell(im.alt)} | ${cell(im.src)} |`));
      push('');
    }
    if (structure.forms.length) {
      push('### 4.6 폼', '');
      structure.forms.forEach((f) => push(`- ${code(f.selector)} ${f.method} ${f.action || ''}: ${f.fields.join(', ') || '(필드 없음)'}`));
      push('');
    }
  }

  // 5. DOM tree
  push('## 5. 시각적 DOM 트리', '');
  push('> 단일 자식 래퍼는 `a > b`로 합쳐 표시. [flex-row / grid(Ncol) / pos:fixed / 3D/Canvas / anim:*] 배지는 계산된 스타일 기준.', '');
  push('```text', renderAsciiDomTree(domTree), '```', '');

  // 6. External services
  push('## 6. 외부 리소스 / 통신', '');
  const hostCount = new Map();
  na.scripts.forEach((s) => hostCount.set(s.host, (hostCount.get(s.host) || 0) + 1));
  if (hostCount.size) {
    push('**스크립트 호스트별 개수**: ' + Array.from(hostCount.entries()).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([h, c]) => `${h} ×${c}`).join(', '), '');
  }
  if (na.apiEndpoints.length) {
    push('**런타임 API 호출 (fetch/XHR, 쿼리 제거)**', '');
    na.apiEndpoints.slice(0, 25).forEach((a) => push(`- ${a.method} ${a.endpoint}${a.firstParty ? '' : ' (외부)'}`));
    push('');
  }
  if (structure && structure.externalDomains.length) push(`**외부 링크 도메인**: ${structure.externalDomains.map((d) => `${d.value}(${d.count})`).join(', ')}`, '');

  // 7. Source code
  push('## 7. 소스코드 & 정제 리포트', '');
  if (savedScripts && savedScripts.length) {
    push('### 7.1 저장된 JS (`05_scripts/`)', '');
    push('| 파일 | 구분 | 원본 크기 | 출처 |', '| :--- | :--- | :--- | :--- |');
    savedScripts.forEach((s) => push(`| \`${s.fileName}\` | ${s.firstParty ? '자체' : '외부'} | ${formatBytes(s.rawBytes)} | ${cell(s.sourceUrl.split('?')[0])} |`));
    const skipped = na.scripts.filter((s) => s.saved && s.saved.startsWith('skipped'));
    if (skipped.length) {
      push('', `> 저장 생략 ${skipped.length}개 (크기 제한 등): ` + skipped.slice(0, 10).map((s) => `${s.url.split('?')[0].split('/').pop()} (${s.saved.replace('skipped: ', '')})`).join(', '));
    }
    push('');
  }

  push('### 7.2 정제(보안) 리포트', '');
  push(`- 제거된 광고/분석 트래커: ${privacyStats.removedTrackers}개`);
  push(`- SSR 상태 데이터/대형 인라인 스크립트 분리·제거: ${privacyStats.removedInlineScripts}개`);
  push(`- 히든 인풋 / CSRF·인증 메타 토큰 마스킹: ${privacyStats.redactedHiddenInputs + privacyStats.redactedMetaTokens}개`);
  push(`- Base64·대형 SVG path 축약: ${privacyStats.truncatedBase64 + privacyStats.simplifiedSvgPaths}개`);
  const red = Object.entries(privacyStats.redactedItems || {});
  push(`- 패턴 마스킹: ${red.length ? red.map(([k, v]) => `${k} ${v}건`).join(', ') : '없음'}`, '');

  push('### 7.3 HTML 미리보기 (앞부분)', '');
  push('> 전체는 `02_sanitized_source.html`.', '');
  const preview = sanitizedHtml.length > 6000 ? sanitizedHtml.slice(0, 6000) + '\n<!-- ... (이하 02_sanitized_source.html) ... -->' : sanitizedHtml;
  push('```html', preview, '```', '');

  return L.join('\n');
}

/**
 * Renders a componentSpecTree node recursively into a concise CSS-annotated tree for 1:1 cloning
 */
function renderComponentSpecTree(node, indent = '') {
  if (!node) return '';
  const lines = [];
  const styleEntries = Object.entries(node.styles || {}).map(([k, v]) => `${k}: ${v}`).join('; ');
  const extra = [];
  if (node.text) extra.push(`text="${node.text}"`);
  if (node.href) extra.push(`href="${node.href}"`);
  if (node.imgSrc) extra.push(`src="${node.imgSrc}"`);

  lines.push(`${indent}- \`${node.selector}\` [${node.box}]${extra.length ? ' ' + extra.join(' ') : ''}`);
  if (styleEntries) {
    lines.push(`${indent}  - CSS: \`${styleEntries}\``);
  }
  for (const ch of node.children || []) {
    lines.push(renderComponentSpecTree(ch, indent + '  '));
  }
  return lines.join('\n');
}

/**
 * Generates 06_section_cloning_specs.md: Section-by-Section 1:1 Pixel-Perfect Cloning Guide
 */
function generateSectionCloningSpecsMarkdown(data) {
  const { targetUrl, metadata, sections = [], screenshots } = data;
  const L = [];
  L.push(`# 섹션별 1:1 완벽 복제 명세서 (Section-by-Section Cloning Specs)`);
  L.push('');
  L.push(`> **대상 사이트**: ${metadata.title || targetUrl} (\`${targetUrl}\`)`);
  L.push(`> **[AI에게]** 이 파일은 페이지의 상단부터 하단까지 각 섹션을 **1:1로 동일하게 구현**할 수 있도록, 각 섹션의 레이아웃 수치, 내부 하위 컴포넌트들의 실제 계산된 CSS 스타일(Computed Styles), 그리고 정제된 섹션별 HTML 마크업을 순서대로 담고 있습니다.`);
  L.push(`> CSS Modules나 난독화된 클래스명 때문에 스타일 매칭이 어렵더라도 아래 **하위 요소별 계산된 CSS 트리**의 정확한 수치(px, HEX, flex/grid, font-size, gap, padding, border-radius 등)를 그대로 적용하면 원본과 100% 동일한 화면이 만들어집니다.`);
  L.push('');
  L.push('---');
  L.push('');

  if (!sections.length) {
    L.push('분리된 섹션이 없는 단일 캔버스 페이지입니다. `02_sanitized_source.html`과 `01_AI_MASTER_BLUEPRINT.md`를 참고하세요.');
    return L.join('\n');
  }

  sections.forEach((s, idx) => {
    L.push(`## [섹션 ${idx + 1}] \`${s.selector}\``);
    L.push('');
    L.push(`### 1) 섹션 박스 모델 & 레이아웃 요약`);
    L.push(`- **위치 및 크기**: Y=${s.topY}px, 크기 \`${s.dimensions}\` (뷰포트 높이 대비 \`${s.viewportHeightRatio}\`)`);
    L.push(`- **레이아웃 구조**: ${s.layoutPattern}${s.containerMaxWidth ? ` (내부 컨테이너 \`max-width: ${s.containerMaxWidth}\`)` : ''}`);
    L.push(`- **배경 / 테두리 / 여백**: background \`${s.background}\`${s.backgroundImage ? `, background-image \`${s.backgroundImage}\`` : ''}, padding \`${s.padding}\`${s.borderRadius ? `, border-radius \`${s.borderRadius}\`` : ''}${s.border ? `, border \`${s.border}\`` : ''}${s.boxShadow ? `, box-shadow \`${s.boxShadow}\`` : ''}`);
    if (screenshots && screenshots.scrollShots) {
      const vh = data.viewport.height || 900;
      const shotIdx = Math.floor(s.topY / vh);
      const shot = shotIdx === 0 ? screenshots.viewportPath : screenshots.scrollShots[shotIdx - 1];
      if (shot) L.push(`- **대응 스크린샷 레퍼런스**: \`${shot}\``);
    }
    L.push('');

    if (s.componentSpecTree) {
      L.push(`### 2) 하위 요소별 계산된 CSS 수치 트리 (Computed Style Spec)`);
      L.push(renderComponentSpecTree(s.componentSpecTree));
      L.push('');
    }

    if (s.sectionHtmlSnippet) {
      L.push(`### 3) 섹션 정제 HTML 마크업`);
      L.push('```html');
      L.push(s.sectionHtmlSnippet);
      L.push('```');
      L.push('');
    }
    L.push('---');
    L.push('');
  });

  return L.join('\n');
}

/**
 * Generates 07_svg_icons_and_graphics.md: Extracted SVG Logos & Vector Icons
 */
function generateSvgCatalogMarkdown(data) {
  const svgs = (data.structure && data.structure.svgCatalog) || [];
  const L = [];
  L.push(`# 페이지 내 고유 SVG 로고 & 아이콘 벡터 코드 모음`);
  L.push('');
  L.push(`> **[AI에게]** 원본 사이트에서 추출한 고유 \`<svg>\` 요소 ${svgs.length}개입니다. 로고, 네비게이션 아이콘, 버튼 화살표, 장식 그래픽을 재현할 때 임의의 아이콘으로 대체하지 말고 아래 원본 \`<svg>\` 코드를 그대로 복사해 사용하세요.`);
  L.push('');

  svgs.forEach((item, idx) => {
    L.push(`## SVG #${idx + 1}: \`${item.selector}\` (${item.dimensions})`);
    L.push(`- **배치된 부모 컨텍스트**: ${item.parentContext}`);
    if (item.viewBox) L.push(`- **viewBox**: \`${item.viewBox}\``);
    L.push('```html');
    L.push(item.svgCode);
    L.push('```');
    L.push('');
  });

  return L.join('\n');
}

/**
 * Generates 00_AI_COPY_PASTE_PROMPT.md
 * Turnkey prompt ready to be pasted directly into Claude / ChatGPT / Cursor / v0
 */
function generatePromptForAi(data) {
  const { targetUrl, metadata, techStack, sections, savedScripts, savedLocalAssets, structure } = data;
  const siteTitle = metadata.title || targetUrl;
  const techNames = (techStack || []).map((t) => t.name).join(', ') || 'HTML5/CSS3/JavaScript';
  const sectionCount = (sections || []).length;
  const svgCount = (structure && structure.svgCatalog) ? structure.svgCatalog.length : 0;
  const localAssetCount = (savedLocalAssets || []).length;

  const L = [];
  L.push('# 🤖 AI 웹사이트 1:1 완벽 클론 프롬프트 (Copy & Paste Prompt)');
  L.push('');
  L.push('> **[사용자 안내]** 아래 내용을 복사하여 **Claude 3.5 Sonnet**, **GPT-4o**, **Cursor**, 또는 **v0** 등 개발용 AI에게 그대로 붙여넣으세요.');
  L.push('> 함께 생성된 파일 폴더 전체를 첨부하거나 프롬프트와 함께 컨텍스트로 제공하면 최고의 결과물을 얻을 수 있습니다.');
  L.push('');
  L.push('---');
  L.push('');
  L.push('```markdown');
  L.push(`당신은 세계 최고의 수석 프론트엔드 엔지니어이자 UI/UX 퍼블리셔입니다.`);
  L.push(`함께 제공된 스크래핑 분석 결과 파일들을 정밀 분석하여, 원본 웹사이트("${siteTitle}" - ${targetUrl})와 외관, 반응형 레이아웃, 세부 수치(px, color, typography), 그리고 인터랙션/모션이 1:1로 완벽하게 동일한 완성형 웹 애플리케이션 코드를 구현해주세요.`);
  L.push('');
  L.push('### 1. 제공된 파일 패키지 및 우선순위 가이드');
  L.push('1. `01_AI_MASTER_BLUEPRINT.md`: 사이트 전체 아키텍처, 디자인 토큰(색상 HEX, 폰트 패밀리), 애니메이션 메커니즘, 감지된 라이브러리 및 런타임 이벤트 분석이 담긴 핵심 명세서입니다. 가장 먼저 정독하세요.');
  L.push(`2. \`06_section_cloning_specs.md\`: 추출된 총 ${sectionCount}개 섹션의 하위 요소별 브라우저 실측 CSS 수치 트리(Computed Style Tree)와 정제된 섹션 HTML 마크업이 기록되어 있습니다. 레이아웃과 폰트 크기, 마진, 패딩 작성 시 이 파일의 수치를 최우선 기준으로 삼으세요.`);
  if (svgCount > 0) {
    L.push(`3. \`07_svg_icons_and_graphics.md\`: 사이트에 사용된 고유 벡터 로고 및 아이콘 ${svgCount}개의 원본 <svg> 코드가 수록되어 있습니다. 아이콘 라이브러리로 대체하지 말고 여기에 있는 순수 벡터 코드를 인라인으로 사용하세요.`);
  }
  L.push('4. `03_styles_and_tokens.css`: 원본 사이트의 CSS 변수(--var), 글로벌 스타일, 키프레임 애니메이션 및 호버 규칙입니다.');
  L.push('5. `02_sanitized_source.html`: 실제 브라우저에서 렌더링된 전체 DOM 구조입니다 (로컬 오프라인 브라우저 열람 시 03_styles_and_tokens.css가 자동 연동되어 바로 확인 가능).');
  if (localAssetCount > 0) {
    L.push(`6. \`assets/\`: 3D 모델(.glb/.gltf), 환경맵(.hdr/.exr), 웹폰트(.woff2), Lottie 애니메이션(.json) 등 총 ${localAssetCount}개의 파일이 로컬로 영구 다운로드되어 있습니다. 외부 URL 호출 대신 로컬 상대경로(예: assets/파일명)로 즉시 로드하세요.`);
  }
  if (savedScripts && savedScripts.length > 0) {
    L.push(`7. \`05_scripts/\`: 1차 사이트 스크립트 ${savedScripts.length}개가 정제·포맷팅되어 저장되어 있습니다. 인터랙션 및 3D 로직의 세부 동작 파악에 활용하세요.`);
  }
  L.push('');
  L.push('### 2. 기술 스택 및 감지된 환경');
  L.push(`- **감지된 기술**: ${techNames}`);
  L.push(`- **테마 모드**: ${metadata.themeMode} (기본 배경: ${metadata.pageBackground})`);
  L.push('');
  L.push('### 3. 단계별 1:1 재현 지침');
  L.push('1. **프로젝트 환경 설정**: Modern HTML5 + CSS3 (또는 Vite/React/Next.js/Tailwind CSS 중 가장 최적화된 프레임워크 선택)으로 시작하세요.');
  L.push('2. **디자인 토큰 정의**: `01_AI_MASTER_BLUEPRINT.md`의 디자인 시스템 섹션과 `03_styles_and_tokens.css`의 CSS 변수를 :root에 완벽히 매핑하세요.');
  L.push('3. **섹션별 정밀 조립**: `06_section_cloning_specs.md`의 섹션 1(헤더/히어로)부터 마지막 섹션(푸터)까지, 하위 요소의 font-size, line-height, letter-spacing, color, background, padding, margin, display(flex/grid), gap 수치를 오차 없이 그대로 코드로 구현하세요.');
  L.push('4. **벡터 그래픽 삽입**: 로고와 아이콘은 `07_svg_icons_and_graphics.md`의 코드를 그대로 배치하여 렌더링 깨짐을 방지하세요.');
  L.push('5. **인터랙션 & 모션**: `01_AI_MASTER_BLUEPRINT.md`의 "3. 작동 원리 · 3D · 모션"을 참조하여 스크롤 애니메이션, 호버 트랜지션, 휠 리스너 및 3D 캔버스를 생생하게 구현하세요.');
  L.push('');
  L.push('지금 즉시 섹션 1부터 바로 구동 가능한 완전한 소스 코드를 순차적으로 작성해주세요.');
  L.push('```');

  return L.join('\n');
}

/**
 * Saves all AI reference artifacts to outputDir
 */
function saveBlueprintFiles(analysisData, outputDir) {
  fs.mkdirSync(outputDir, { recursive: true });
  const files = [];
  const write = (rel, content, description) => {
    const p = path.join(outputDir, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, content, 'utf8');
    files.push({ name: rel, description, size: fs.statSync(p).size });
  };

  const promptMd = generatePromptForAi(analysisData);
  write('00_AI_COPY_PASTE_PROMPT.md', promptMd, 'AI 복사-붙여넣기 전용 1:1 클론 프롬프트');

  const masterMarkdown = generateMasterBlueprintMarkdown(analysisData);
  write('01_AI_MASTER_BLUEPRINT.md', masterMarkdown, 'AI 전달용 통합 마스터 블루프린트');

  let htmlToSave = analysisData.sanitizedHtml || '';
  if (htmlToSave && !htmlToSave.includes('03_styles_and_tokens.css')) {
    if (htmlToSave.includes('</head>')) {
      htmlToSave = htmlToSave.replace('</head>', '  <link rel="stylesheet" href="03_styles_and_tokens.css">\n</head>');
    } else {
      htmlToSave = '<link rel="stylesheet" href="03_styles_and_tokens.css">\n' + htmlToSave;
    }
  }
  write('02_sanitized_source.html', htmlToSave, '정제된 전체 HTML (로컬 스타일 시트 연동 완료)');

  write('03_styles_and_tokens.css', `/* Sanitized styles for: ${analysisData.targetUrl}\n * Generated: ${analysisData.analyzedAt} */\n\n` + (analysisData.sanitizedCss || ''), '외부/인라인 CSS 전체');

  const sectionSpecsMd = generateSectionCloningSpecsMarkdown(analysisData);
  write('06_section_cloning_specs.md', sectionSpecsMd, '섹션별 1:1 복제 명세서 (하위 요소별 계산된 CSS 트리 + 섹션 HTML)');

  const svgs = (analysisData.structure && analysisData.structure.svgCatalog) || [];
  if (svgs.length > 0) {
    const svgMd = generateSvgCatalogMarkdown(analysisData);
    write('07_svg_icons_and_graphics.md', svgMd, `원본 SVG 로고·아이콘 ${svgs.length}개 벡터 코드 모음`);
  }

  // Strip bulky sectionHtmlSnippet from JSON to avoid duplication
  const cleanSections = (analysisData.sections || []).map(({ sectionHtmlSnippet, ...s }) => s);
  const { sanitizedHtml, sanitizedCss, savedScripts, ...rest } = analysisData;
  const json = { ...rest, sections: cleanSections, savedScripts: (savedScripts || []).map(({ code, ...meta }) => meta) };
  write('04_structured_data.json', JSON.stringify(json, null, 2), '구조화 분석 데이터 (JSON)');

  let scriptBytes = 0;
  (savedScripts || []).forEach((s) => {
    const p = path.join(outputDir, '05_scripts', s.fileName);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, s.code, 'utf8');
    scriptBytes += fs.statSync(p).size;
  });
  if (savedScripts && savedScripts.length) {
    files.push({ name: `05_scripts/ (${savedScripts.length}개)`, description: '정제된 JS 소스', size: scriptBytes });
  }

  if (analysisData.savedLocalAssets && analysisData.savedLocalAssets.length) {
    let assetBytes = 0;
    analysisData.savedLocalAssets.forEach((a) => { assetBytes += (a.sizeBytes || 0); });
    files.push({ name: `assets/ (${analysisData.savedLocalAssets.length}개)`, description: '로컬 다운로드 3D/폰트/모션 에셋 (CORS 프리)', size: assetBytes });
  }

  return { masterMarkdown, files };
}

module.exports = {
  generateMasterBlueprintMarkdown,
  generatePromptForAi,
  saveBlueprintFiles,
  renderAsciiDomTree
};
