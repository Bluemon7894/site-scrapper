let currentResult = null;
let currentCodeMode = 'html';

const analyzeForm = document.getElementById('analyzeForm');
const urlInput = document.getElementById('urlInput');
const btnSubmit = document.getElementById('btnSubmit');
const viewportSelect = document.getElementById('viewportSelect');
const chkAutoScroll = document.getElementById('chkAutoScroll');
const chkScreenshots = document.getElementById('chkScreenshots');

const progressBox = document.getElementById('progressBox');
const progressStatus = document.getElementById('progressStatus');
const progressPercent = document.getElementById('progressPercent');
const progressBar = document.getElementById('progressBar');
const errorBox = document.getElementById('errorBox');

const welcomeState = document.getElementById('welcomeState');
const resultWorkspace = document.getElementById('resultWorkspace');
const historyList = document.getElementById('historyList');
const toast = document.getElementById('toast');

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 2400);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatBytes(bytes) {
  if (!bytes || isNaN(bytes) || bytes <= 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

async function copyText(text, label = '클립보드에 복사되었습니다!') {
  try {
    await navigator.clipboard.writeText(text);
    showToast(label);
  } catch (e) {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    showToast(label);
  }
}

// Preset chips
document.querySelectorAll('.chip-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    urlInput.value = btn.getAttribute('data-url');
    urlInput.focus();
  });
});

// Tabs navigation
document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((p) => p.classList.remove('active'));
    btn.classList.add('active');
    const target = document.getElementById(btn.getAttribute('data-tab'));
    if (target) target.classList.add('active');
  });
});

// Code Subtabs (HTML vs CSS)
document.querySelectorAll('.code-subtab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.code-subtab').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentCodeMode = btn.getAttribute('data-code');
    updateCodeViewer();
  });
});

function updateCodeViewer() {
  if (!currentResult) return;
  const pre = document.getElementById('sanitizedCodePre');
  if (currentCodeMode === 'html') {
    pre.textContent = currentResult.sanitizedHtmlPreview || '추출된 HTML 없음';
  } else {
    pre.textContent = currentResult.sanitizedCssPreview || '추출된 CSS 없음';
  }
}

// Open folder buttons
document.getElementById('btnOpenRootFolder').addEventListener('click', () => {
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({})
  });
});

document.getElementById('btnOpenFolder').addEventListener('click', () => {
  if (!currentResult) return;
  fetch('/api/open-folder', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ folderName: currentResult.folderName })
  });
});

// Copy buttons
document.getElementById('btnCopyMaster').addEventListener('click', () => {
  if (!currentResult) return;
  copyText(currentResult.masterMarkdown, '🤖 AI 마스터 블루프린트 전체가 복사되었습니다! 바로 AI에게 붙여넣으세요.');
});

document.getElementById('btnCopyMasterInline').addEventListener('click', () => {
  if (!currentResult) return;
  copyText(currentResult.masterMarkdown, '📋 01_AI_MASTER_BLUEPRINT.md 내용이 복사되었습니다!');
});

document.getElementById('btnCopyDomTree').addEventListener('click', () => {
  if (!currentResult) return;
  copyText(currentResult.asciiTree || '', '🌳 DOM 레이아웃 트리가 복사되었습니다!');
});

document.getElementById('btnCopyCode').addEventListener('click', () => {
  if (!currentResult) return;
  const txt = currentCodeMode === 'html' ? currentResult.sanitizedHtmlPreview : currentResult.sanitizedCssPreview;
  copyText(txt || '', `💻 정제된 ${currentCodeMode.toUpperCase()} 코드가 복사되었습니다!`);
});

// Form submit -> Start analysis
analyzeForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const [w, h] = viewportSelect.value.split('x').map((n) => parseInt(n, 10));
  const payload = {
    url,
    viewport: { width: w || 1440, height: h || 900 },
    autoScroll: chkAutoScroll.checked,
    captureScreenshots: chkScreenshots.checked
  };

  btnSubmit.disabled = true;
  errorBox.classList.add('hidden');
  progressBox.classList.remove('hidden');
  progressStatus.textContent = '작업을 요청하는 중...';
  progressPercent.textContent = '5%';
  progressBar.style.width = '5%';

  try {
    const res = await fetch('/api/analyze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || '분석 요청 실패');
    }

    const evtSource = new EventSource(`/api/jobs/${data.jobId}/stream`);
    evtSource.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'progress') {
        progressStatus.textContent = msg.message;
        progressPercent.textContent = `${msg.percent}%`;
        progressBar.style.width = `${msg.percent}%`;
      } else if (msg.type === 'completed') {
        evtSource.close();
        progressBox.classList.add('hidden');
        btnSubmit.disabled = false;
        renderResult(msg.result);
        loadHistory();
      } else if (msg.type === 'error') {
        evtSource.close();
        progressBox.classList.add('hidden');
        btnSubmit.disabled = false;
        errorBox.textContent = `❌ 오류 발생: ${msg.error}`;
        errorBox.classList.remove('hidden');
      }
    };
    evtSource.onerror = () => {
      evtSource.close();
      btnSubmit.disabled = false;
    };
  } catch (err) {
    progressBox.classList.add('hidden');
    btnSubmit.disabled = false;
    errorBox.textContent = `❌ 오류 발생: ${err.message}`;
    errorBox.classList.remove('hidden');
  }
});

// Render full analysis result into all 5 tabs
function renderResult(res) {
  currentResult = res;
  welcomeState.classList.add('hidden');
  resultWorkspace.classList.remove('hidden');

  const meta = res.metadata || {};
  document.getElementById('resTitle').textContent = meta.title || res.targetUrl;
  document.getElementById('resUrl').textContent = res.targetUrl;
  document.getElementById('btnDownloadZip').href = `/api/download-zip/${encodeURIComponent(res.folderName)}`;

  // KPIs
  const bgHex = (meta.pageBackground || '#ffffff').split(' ')[0];
  document.getElementById('kpiColorDot').style.background = bgHex;
  document.getElementById('kpiTheme').textContent = `${meta.themeMode || '-'} (${bgHex})`;

  const techCount = (res.techStack || []).length;
  document.getElementById('kpiTechCount').textContent = techCount > 0 ? `${techCount}개 프레임워크/엔진 감지` : '표준 HTML/CSS/JS';

  const modelsCount = (res.networkAssets && res.networkAssets.models3D ? res.networkAssets.models3D.length : 0) +
    (res.networkAssets && res.networkAssets.binaryBuffers ? res.networkAssets.binaryBuffers.length : 0);
  const canvasCount = res.howItWorks && res.howItWorks.canvases ? res.howItWorks.canvases.length : 0;
  document.getElementById('kpi3DCount').textContent = `캔버스 ${canvasCount}개 / 3D·특수에셋 ${modelsCount}개`;

  const secCount = (res.sections || []).length;
  const vhRatio = meta.viewportHeight ? (meta.scrollHeight / meta.viewportHeight).toFixed(1) : '1.0';
  document.getElementById('kpiLayoutInfo').textContent = `${secCount}개 주요 섹션 (길이 ${vhRatio}vh)`;

  const pStats = res.privacyStats || {};
  const totalScrubbed =
    (pStats.removedTrackers || 0) +
    (pStats.redactedHiddenInputs || 0) +
    (pStats.redactedMetaTokens || 0) +
    Object.values(pStats.redactedItems || {}).reduce((a, b) => a + b, 0);
  document.getElementById('kpiPrivacyCount').textContent = `트래커·민감정보 ${totalScrubbed}건 안전 제거`;

  // TAB 1: Files & Master Markdown
  const filesListEl = document.getElementById('filesList');
  filesListEl.innerHTML = (res.files || [])
    .map(
      (f) => `
    <div class="file-row">
      <div>
        <div class="file-name">${escapeHtml(f.name)}</div>
        <div class="file-desc">${escapeHtml(f.description)}</div>
      </div>
      <div class="file-size">${formatBytes(f.size)}</div>
    </div>
  `
    )
    .join('');

  document.getElementById('masterMarkdownPre').textContent = res.masterMarkdown || '';

  // TAB 2: 3D Models & How It Works
  const techEl = document.getElementById('techStackContainer');
  if (res.techStack && res.techStack.length > 0) {
    techEl.innerHTML = res.techStack
      .map(
        (t) => `
      <div class="tech-item">
        <div class="tech-cat">${escapeHtml(t.category)}</div>
        <div class="tech-name">${escapeHtml(t.name)}</div>
        <div class="tech-reason">${escapeHtml(t.reason)}</div>
      </div>
    `
      )
      .join('');
  } else {
    techEl.innerHTML = `<div class="sub-desc">외부 무거운 프레임워크 없이 순수 웹 표준(HTML5/CSS3/JS)으로 구동됩니다.</div>`;
  }

  // 3D Models & Network Assets Table
  const modelsWrap = document.getElementById('models3DTableWrap');
  const all3DAndMotion = [
    ...((res.networkAssets && res.networkAssets.models3D) || []),
    ...((res.networkAssets && res.networkAssets.binaryBuffers) || []),
    ...((res.networkAssets && res.networkAssets.animations) || []),
    ...((res.networkAssets && res.networkAssets.videos) || [])
  ];

  if (all3DAndMotion.length > 0) {
    modelsWrap.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>에셋 분류 / 포맷</th>
            <th>제공 플랫폼 / 호스팅 출처 (어디꺼인가)</th>
            <th>용량</th>
            <th>원본 리소스 URL</th>
          </tr>
        </thead>
        <tbody>
          ${all3DAndMotion
            .map(
              (m) => `
            <tr>
              <td><strong>${escapeHtml(m.type)}</strong><br/><span style="font-size:11px;color:#94a3b8">${escapeHtml(m.description || '')}</span></td>
              <td><span style="color:#34d399;font-weight:700">${escapeHtml(m.provider)}</span></td>
              <td>${formatBytes(m.sizeBytes)}</td>
              <td class="url-cell">${escapeHtml(m.url)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  } else {
    modelsWrap.innerHTML = `<div class="sub-desc">외부에서 로드된 3D 모델(.glb, .gltf, .splinecode)이나 별도 비디오/모션 에셋이 감지되지 않았습니다.</div>`;
  }

  // Canvas & Embedded Viewers
  const canvasWrap = document.getElementById('canvasListWrap');
  const canvases = (res.howItWorks && res.howItWorks.canvases) || [];
  const viewers = (res.howItWorks && res.howItWorks.embeddedViewers) || [];

  if (canvases.length === 0 && viewers.length === 0) {
    canvasWrap.innerHTML = `<div class="sub-desc">DOM 상에 <code>&lt;canvas&gt;</code> 또는 3D 뷰어 요소가 없습니다.</div>`;
  } else {
    let html = '<div class="sections-grid">';
    canvases.forEach((c) => {
      html += `
        <div class="section-card">
          <div class="section-card-head">
            <span class="section-selector">Canvas #${c.index}: ${escapeHtml(c.selector)}</span>
            <span class="section-dim">${escapeHtml(c.contextType)} | ${escapeHtml(c.dimensions)}</span>
          </div>
          <div class="section-detail"><strong>배치 방식:</strong> position: ${escapeHtml(c.position)}, z-index: ${escapeHtml(c.zIndex)}, 부모: <code>${escapeHtml(c.parentSelector)}</code></div>
          <div class="section-detail"><strong>역할 분석:</strong> ${escapeHtml(c.roleDescription)}</div>
        </div>
      `;
    });
    viewers.forEach((v) => {
      html += `
        <div class="section-card">
          <div class="section-card-head">
            <span class="section-selector">${escapeHtml(v.tag)} ${escapeHtml(v.selector)}</span>
            <span class="section-dim">${escapeHtml(v.dimensions)}</span>
          </div>
          ${v.sourceUrl ? `<div class="section-detail"><strong>소스 URL:</strong> <code>${escapeHtml(v.sourceUrl)}</code></div>` : ''}
          ${v.attributes ? `<div class="section-detail"><strong>속성:</strong> <code>${escapeHtml(v.attributes)}</code></div>` : ''}
        </div>
      `;
    });
    html += '</div>';
    canvasWrap.innerHTML = html;
  }

  // Interaction & Scroll Mechanics
  const mechWrap = document.getElementById('interactionMechanicsWrap');
  const stickyList = (res.howItWorks && res.howItWorks.stickyAndFixedElements) || [];
  const keyframesList = (res.howItWorks && res.howItWorks.keyframes) || [];
  const winEv = (res.howItWorks && res.howItWorks.runtimeHooks && res.howItWorks.runtimeHooks.eventListeners && res.howItWorks.runtimeHooks.eventListeners.windowEvents) || {};
  const docEv = (res.howItWorks && res.howItWorks.runtimeHooks && res.howItWorks.runtimeHooks.eventListeners && res.howItWorks.runtimeHooks.eventListeners.documentEvents) || {};
  const evNames = Array.from(new Set([...Object.keys(winEv), ...Object.keys(docEv)]));

  let mechHtml = '<div class="sections-grid">';
  if (evNames.length > 0) {
    mechHtml += `
      <div class="section-card">
        <div class="section-selector">전역 이벤트 리스너 감지</div>
        <div class="section-detail">등록된 인터랙션 이벤트: <code>${escapeHtml(evNames.join(', '))}</code></div>
      </div>
    `;
  }
  stickyList.slice(0, 8).forEach((st) => {
    mechHtml += `
      <div class="section-card">
        <div class="section-card-head">
          <span class="section-selector">${escapeHtml(st.selector)} (${escapeHtml(st.position)})</span>
          <span class="section-dim">트랙: ${escapeHtml(st.parentTrackHeight)}</span>
        </div>
        <div class="section-detail">${escapeHtml(st.mechanism)}</div>
      </div>
    `;
  });
  if (keyframesList.length > 0) {
    mechHtml += `
      <div class="section-card">
        <div class="section-selector">CSS @keyframes 애니메이션 (${keyframesList.length}개)</div>
        <div class="section-detail">${keyframesList.map((k) => `<code>@${escapeHtml(k.name)}</code>`).join(', ')}</div>
      </div>
    `;
  }
  mechHtml += '</div>';
  mechWrap.innerHTML = mechHtml;

  // Shaders
  const shadersCard = document.getElementById('shadersCard');
  const shadersWrap = document.getElementById('shadersWrap');
  const shaders = (res.howItWorks && res.howItWorks.runtimeHooks && res.howItWorks.runtimeHooks.shaders) || [];
  if (shaders.length > 0) {
    shadersCard.classList.remove('hidden');
    shadersWrap.innerHTML = shaders
      .slice(0, 4)
      .map(
        (sh, idx) => `
      <div class="mt-16">
        <div class="section-selector">Shader #${idx + 1}: ${escapeHtml(sh.type)} (${sh.length} chars)</div>
        <pre class="code-viewer" style="max-height:220px;margin-top:6px">${escapeHtml(sh.source)}</pre>
      </div>
    `
      )
      .join('');
  } else {
    shadersCard.classList.add('hidden');
  }

  // TAB 3: Design System
  const ds = res.designSystem || {};
  const renderSwatchGroup = (title, items) => {
    if (!items || items.length === 0) return '';
    return `
      <h4 style="font-size:13px;color:#94a3b8;margin-top:8px">${escapeHtml(title)}</h4>
      <div class="swatch-grid">
        ${items
          .map((c) => {
            const rawHex = c.hex.split(' ')[0];
            return `
            <div class="swatch-card" onclick="copyText('${escapeHtml(rawHex)}', '${escapeHtml(rawHex)} 색상이 복사되었습니다!')">
              <div class="swatch-box" style="background:${escapeHtml(rawHex)}"></div>
              <div>
                <div class="swatch-hex">${escapeHtml(c.hex)}</div>
                <div class="swatch-meta" title="${escapeHtml((c.examples || []).join(', '))}">${escapeHtml((c.examples || [])[0] || c.role || '')}</div>
              </div>
            </div>
          `;
          })
          .join('')}
      </div>
    `;
  };

  document.getElementById('colorPaletteWrap').innerHTML =
    renderSwatchGroup('배경 및 서피스 컬러 (Background & Surfaces)', ds.backgroundColors) +
    renderSwatchGroup('타이포그래피 텍스트 컬러 (Text Colors)', ds.textColors) +
    renderSwatchGroup('포인트 & 인터랙티브 컬러 (Accents & CTAs)', ds.accentColors);

  // Typography
  const typoWrap = document.getElementById('typographyWrap');
  let typoHtml = '';
  if (ds.fonts && ds.fonts.length > 0) {
    typoHtml += `<div class="sub-desc"><strong>사용된 폰트 패밀리:</strong> ${ds.fonts.map((f) => `<code>${escapeHtml(f.name)}</code> (${f.usageCount})`).join(', ')}</div>`;
  }
  if (ds.typographyScale && ds.typographyScale.length > 0) {
    typoHtml += `
      <table class="data-table">
        <thead>
          <tr>
            <th>역할 (Role)</th>
            <th>셀렉터</th>
            <th>폰트 패밀리</th>
            <th>크기 / 굵기 / 행간 / 자간</th>
            <th>색상</th>
            <th>샘플 텍스트</th>
          </tr>
        </thead>
        <tbody>
          ${ds.typographyScale
            .map(
              (t) => `
            <tr>
              <td><strong>${escapeHtml(t.role)}</strong></td>
              <td><code>${escapeHtml(t.selector)}</code></td>
              <td>${escapeHtml((t.fontFamily || '').split(',')[0])}</td>
              <td><code>${escapeHtml(t.fontSize)}</code> / <code>${escapeHtml(t.fontWeight)}</code> / <code>${escapeHtml(t.lineHeight)}</code> / <code>${escapeHtml(t.letterSpacing)}</code></td>
              <td><code>${escapeHtml(t.color)}</code></td>
              <td>${escapeHtml(t.sampleText)}</td>
            </tr>
          `
            )
            .join('')}
        </tbody>
      </table>
    `;
  }
  typoWrap.innerHTML = typoHtml;

  // CSS Tokens & Effects
  const tokensWrap = document.getElementById('cssTokensWrap');
  let tokenHtml = '';
  if (ds.gradients && ds.gradients.length > 0) {
    tokenHtml += `<div class="sub-desc"><strong>감지된 그라디언트:</strong><br/>${ds.gradients.map((g) => `<code>${escapeHtml(g.selector)}</code>: <code>${escapeHtml(g.value)}</code>`).join('<br/>')}</div>`;
  }
  if (ds.glassEffects && ds.glassEffects.length > 0) {
    tokenHtml += `<div class="sub-desc"><strong>글래스모피즘(Blur) 효과:</strong><br/>${ds.glassEffects.map((g) => `<code>${escapeHtml(g.selector)}</code>: backdrop-filter <code>${escapeHtml(g.backdropFilter)}</code>`).join('<br/>')}</div>`;
  }
  if (ds.cssVariables && ds.cssVariables.length > 0) {
    const varsText = `:root {\n${ds.cssVariables.map((v) => `  ${v.name}: ${v.value};`).join('\n')}\n}`;
    tokenHtml += `<pre class="code-viewer" style="max-height:280px">${escapeHtml(varsText)}</pre>`;
  } else {
    tokenHtml += `<div class="sub-desc">별도의 <code>:root</code> CSS 커스텀 프로퍼티가 정의되어 있지 않습니다.</div>`;
  }
  tokensWrap.innerHTML = tokenHtml;

  // TAB 4: Structure & DOM Tree
  const secWrap = document.getElementById('sectionsAnatomyWrap');
  if (res.sections && res.sections.length > 0) {
    secWrap.innerHTML = res.sections
      .map(
        (sec, i) => `
      <div class="section-card">
        <div class="section-card-head">
          <span class="section-selector">[섹션 ${i + 1}] ${escapeHtml(sec.selector)}</span>
          <span class="section-dim">Y: ${sec.topY}px | 크기: ${escapeHtml(sec.dimensions)} (${escapeHtml(sec.viewportHeightRatio)})</span>
        </div>
        <div class="section-detail"><strong>레이아웃:</strong> ${escapeHtml(sec.layoutPattern)}</div>
        <div class="section-detail"><strong>스타일:</strong> 배경 <code>${escapeHtml(sec.background)}</code> | 패딩 <code>${escapeHtml(sec.padding)}</code></div>
        ${sec.headings && sec.headings.length > 0 ? `<div class="section-detail"><strong>헤딩 텍스트:</strong> ${sec.headings.map((h) => `<code>&lt;${escapeHtml(h.tag)}&gt;</code> "${escapeHtml(h.text)}"`).join(' / ')}</div>` : ''}
        ${sec.buttons && sec.buttons.length > 0 ? `<div class="section-detail"><strong>버튼/CTA:</strong> ${sec.buttons.map((b) => `[${escapeHtml(b)}]`).join(', ')}</div>` : ''}
      </div>
    `
      )
      .join('');
  } else {
    secWrap.innerHTML = `<div class="sub-desc">분리된 섹션 블록이 감지되지 않았습니다.</div>`;
  }

  document.getElementById('asciiTreePre').textContent = res.asciiTree || '';

  // TAB 5: Source & Privacy + Screenshots
  const privWrap = document.getElementById('privacyReportWrap');
  const redactedEntries = Object.entries(pStats.redactedItems || {});
  privWrap.innerHTML = `
    <div class="tech-badges-grid">
      <div class="tech-item">
        <div class="tech-cat">Tracker &amp; Analytics Blocker</div>
        <div class="tech-name">광고·트래커 스크립트 ${pStats.removedTrackers || 0}개 제거</div>
        <div class="tech-reason">GA, GTM, Pixel, Hotjar 등 불필요한 추적 코드 삭제</div>
      </div>
      <div class="tech-item">
        <div class="tech-cat">Token &amp; Hidden Input Scrubbing</div>
        <div class="tech-name">히든 인풋·메타 토큰 ${(pStats.redactedHiddenInputs || 0) + (pStats.redactedMetaTokens || 0)}개 마스킹</div>
        <div class="tech-reason">CSRF 토큰 및 숨겨진 폼 값 [REDACTED] 처리</div>
      </div>
      <div class="tech-item">
        <div class="tech-cat">AI Context Diet</div>
        <div class="tech-name">Base64·초대형 SVG ${(pStats.truncatedBase64 || 0) + (pStats.simplifiedSvgPaths || 0)}개 경량화</div>
        <div class="tech-reason">AI 컨텍스트 낭비를 막기 위해 인라인 바이너리 문자열 축약</div>
      </div>
      <div class="tech-item">
        <div class="tech-cat">PII &amp; Secret Key Redaction</div>
        <div class="tech-name">${redactedEntries.length > 0 ? redactedEntries.map(([k, v]) => `${escapeHtml(k)}: ${v}건`).join(', ') : '노출된 민감 키 없음 (안전)'}</div>
        <div class="tech-reason">이메일, 전화번호, API 키, 세션 파라미터 자동 마스킹</div>
      </div>
    </div>
  `;

  updateCodeViewer();

  const shotsWrap = document.getElementById('screenshotsWrap');
  if (res.screenshots && (res.screenshots.viewportPath || res.screenshots.fullPagePath)) {
    const base = `/output/${encodeURIComponent(res.folderName)}`;
    shotsWrap.innerHTML = `
      ${
        res.screenshots.viewportPath
          ? `<div class="shot-card">
              <h4>첫 화면 (Viewport Hero)</h4>
              <a href="${base}/${res.screenshots.viewportPath}" target="_blank">
                <img src="${base}/${res.screenshots.viewportPath}" alt="Viewport screenshot" />
              </a>
            </div>`
          : ''
      }
      ${
        res.screenshots.fullPagePath
          ? `<div class="shot-card">
              <h4>전체 페이지 (Full-Page)</h4>
              <a href="${base}/${res.screenshots.fullPagePath}" target="_blank">
                <img src="${base}/${res.screenshots.fullPagePath}" alt="Fullpage screenshot" />
              </a>
            </div>`
          : ''
      }
    `;
  } else {
    shotsWrap.innerHTML = `<div class="sub-desc">스크린샷이 비활성화되었거나 저장되지 않았습니다.</div>`;
  }
}

// History loader
async function loadHistory() {
  try {
    const res = await fetch('/api/history');
    const data = await res.json();
    if (!data.items || data.items.length === 0) {
      historyList.innerHTML = `<div class="empty-history">아직 추출된 사이트가 없습니다.</div>`;
      return;
    }

    historyList.innerHTML = data.items
      .map(
        (item) => `
      <div class="history-item ${currentResult && currentResult.folderName === item.folderName ? 'active' : ''}" data-folder="${escapeHtml(item.folderName)}">
        <div class="history-item-title">${escapeHtml(item.title || item.folderName)}</div>
        <div class="history-item-meta">
          <span>3D/캔버스: ${item.models3DCount || 0}</span>
          <span>기술: ${item.techCount || 0}</span>
        </div>
      </div>
    `
      )
      .join('');

    historyList.querySelectorAll('.history-item').forEach((el) => {
      el.addEventListener('click', async () => {
        const folder = el.getAttribute('data-folder');
        const r = await fetch(`/api/history/${encodeURIComponent(folder)}`);
        if (r.ok) {
          const detail = await r.json();
          renderResult(detail);
          loadHistory();
        }
      });
    });
  } catch (e) {}
}

loadHistory();
