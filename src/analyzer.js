const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');
const { sanitizeHtml, sanitizeCss, redactSensitiveText, isTrackerUrl } = require('./sanitizer');

/**
 * Finds system-installed Chrome or Edge executable on Windows
 */
function findBrowserExecutable() {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA ? path.join(process.env.LOCALAPPDATA, 'Google\\Chrome\\Application\\chrome.exe') : '',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ].filter(Boolean);

  for (const exe of candidates) {
    if (fs.existsSync(exe)) {
      return exe;
    }
  }
  throw new Error('시스템에서 Chrome 또는 Edge 브라우저를 찾을 수 없습니다.');
}

/**
 * Classifies 3D / WebGL / Animation asset provider and type from a URL and content-type
 */
function classifyAsset(url, contentType = '', resourceType = '') {
  const lowerUrl = url.toLowerCase();
  const cleanPath = lowerUrl.split('?')[0].split('#')[0];

  // 1. Check 3D Models & Scene formats
  if (cleanPath.endsWith('.splinecode') || lowerUrl.includes('prod.spline.design') || lowerUrl.includes('my.spline.design') || lowerUrl.includes('@splinetool')) {
    return {
      category: '3d_model',
      type: cleanPath.endsWith('.splinecode') ? 'Spline 3D Scene (.splinecode)' : 'Spline 3D Runtime / Asset',
      provider: 'Spline (spline.design)',
      description: 'Spline 3D 인터랙티브 씬 데이터 또는 런타임 모듈'
    };
  }
  if (cleanPath.endsWith('.glb')) {
    return {
      category: '3d_model',
      type: 'glTF Binary 3D Model (.glb)',
      provider: detectHostProvider(url),
      description: 'Three.js / Babylon.js / model-viewer 등에서 로드하는 바이너리 3D 모델 파일'
    };
  }
  if (cleanPath.endsWith('.gltf')) {
    return {
      category: '3d_model',
      type: 'glTF 3D Model (.gltf)',
      provider: detectHostProvider(url),
      description: 'JSON 기반 glTF 3D 모델 정의 파일'
    };
  }
  if (/\.(obj|fbx|stl|usdz|dae|ply|3ds)$/i.test(cleanPath)) {
    const ext = path.extname(cleanPath).toUpperCase();
    return {
      category: '3d_model',
      type: `3D Mesh Asset (${ext})`,
      provider: detectHostProvider(url),
      description: `${ext} 포맷 3D 메쉬 에셋`
    };
  }
  if (/\.(hdr|exr)$/i.test(cleanPath)) {
    return {
      category: '3d_env',
      type: `3D HDRI Environment Map (${path.extname(cleanPath)})`,
      provider: detectHostProvider(url),
      description: '3D 씬의 사실적인 조명 및 반사(PBR IBL)를 위한 환경맵 텍스처'
    };
  }
  if (/\.(ktx2|ktx|basis|dds)$/i.test(cleanPath)) {
    return {
      category: '3d_texture',
      type: `GPU Compressed 3D Texture (${path.extname(cleanPath)})`,
      provider: detectHostProvider(url),
      description: 'WebGL GPU 전용 압축 3D 텍스처 파일'
    };
  }
  if (/draco|basis_transcoder|meshopt|rapier|ammo\.wasm|havok/i.test(lowerUrl)) {
    return {
      category: '3d_engine_wasm',
      type: '3D Decoder / Physics Engine (WASM/Worker)',
      provider: detectHostProvider(url),
      description: /draco/i.test(lowerUrl)
        ? 'Google Draco 3D 메쉬 압축 해제 디코더'
        : /basis/i.test(lowerUrl)
          ? 'Basis Universal GPU 텍스처 트랜스코더'
          : '3D 물리 엔진 또는 지오메트리 디코더 모듈'
    };
  }
  if (lowerUrl.includes('sketchfab.com')) {
    return {
      category: '3d_model',
      type: 'Sketchfab 3D Viewer / Model',
      provider: 'Sketchfab',
      description: 'Sketchfab 호스팅 3D 모델 또는 임베드 뷰어'
    };
  }
  if (lowerUrl.includes('unicorn.studio') || lowerUrl.includes('unicornstudio')) {
    return {
      category: '3d_model',
      type: 'Unicorn Studio WebGL Scene',
      provider: 'Unicorn Studio',
      description: 'Unicorn Studio 인터랙티브 WebGL 셰이더/씬 에셋'
    };
  }
  if (cleanPath.endsWith('.riv') || lowerUrl.includes('rive.app') || lowerUrl.includes('@rive-app')) {
    return {
      category: 'interactive_anim',
      type: 'Rive State-Machine Animation (.riv)',
      provider: 'Rive (rive.app)',
      description: '상태 머신 기반 인터랙티브 벡터/모션 에셋'
    };
  }
  if (cleanPath.endsWith('.lottie') || lowerUrl.includes('lottiefiles.com') || lowerUrl.includes('assets.lottiefiles')) {
    return {
      category: 'interactive_anim',
      type: 'Lottie Animation',
      provider: 'LottieFiles',
      description: 'Lottie 벡터 모션 그래픽 애니메이션'
    };
  }
  if (/\.(glsl|vert|frag|wgsl)$/i.test(cleanPath)) {
    return {
      category: 'shader',
      type: `External Shader (${path.extname(cleanPath)})`,
      provider: detectHostProvider(url),
      description: 'WebGL / WebGPU 커스텀 셰이더 소스 파일'
    };
  }
  if (/\.(woff2?|ttf|otf)$/i.test(cleanPath) || lowerUrl.includes('fonts.googleapis.com') || lowerUrl.includes('use.typekit.net')) {
    return {
      category: 'font',
      type: 'Web Font',
      provider: detectHostProvider(url),
      description: '웹 타이포그래피 폰트 리소스'
    };
  }
  if (/\.(mp4|webm|mov|m3u8)$/i.test(cleanPath) || contentType.includes('video/')) {
    return {
      category: 'video',
      type: `Video Media (${path.extname(cleanPath) || contentType})`,
      provider: detectHostProvider(url),
      description: '배경 비디오 또는 미디어 쇼케이스 영상'
    };
  }

  return null;
}

function detectHostProvider(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.toLowerCase();
    if (h.includes('spline.design')) return 'Spline CDN (prod.spline.design)';
    if (h.includes('sketchfab.com')) return 'Sketchfab';
    if (h.includes('cloudfront.net') || h.includes('amazonaws.com')) return `AWS S3 / CloudFront (${h})`;
    if (h.includes('vercel') || h.includes('nextjs')) return `Vercel CDN (${h})`;
    if (h.includes('jsdelivr.net') || h.includes('unpkg.com') || h.includes('cdnjs.cloudflare.com')) return `Public Open-Source CDN (${h})`;
    if (h.includes('gstatic.com') || h.includes('googleapis.com')) return `Google CDN (${h})`;
    if (h.includes('webflow.com') || h.includes('website-files.com')) return `Webflow CDN (${h})`;
    if (h.includes('framerusercontent.com') || h.includes('framer.com')) return `Framer CDN (${h})`;
    if (h.includes('shopify.com') || h.includes('cdn.shopify.com')) return `Shopify CDN (${h})`;
    if (h.includes('polyhaven.org') || h.includes('polyhaven.com')) return 'Poly Haven (3D Assets)';
    return `자체 호스팅 / 커스텀 도메인 (${h})`;
  } catch (e) {
    return 'Unknown Host';
  }
}


const { sanitizeJs } = require('./sanitizer');
const { inspectPage } = require('./pageInspector');
const { scanCodeSignatures, resolveAssetRefs, extractCssTokens } = require('./codeScanner');

const LIMITS = {
  scanScriptBytes: 25 * 1024 * 1024, // read & scan scripts up to 25MB for library signatures
  saveScriptBytes: 800 * 1024, // save individual scripts up to 800KB (raw)
  saveScriptsTotal: 15 * 1024 * 1024,
  saveScriptsCount: 80,
  cssFileBytes: 3 * 1024 * 1024,
  maxScrollShots: 12
};

/**
 * Runtime hooks injected before any page script runs.
 * Captures WebGL/WebGPU contexts, GLSL/WGSL shaders and interaction event listeners.
 */
function runtimeHooksInitScript() {
  window.__SITESCRAP_HOOKS__ = {
    webglContexts: [],
    shaders: [],
    eventListeners: { windowEvents: {}, documentEvents: {}, elementEvents: {} }
  };
  const H = window.__SITESCRAP_HOOKS__;

  function pushShader(type, source) {
    try {
      if (typeof source !== 'string' || source.length < 40 || H.shaders.length >= 30) return;
      const trimmed = source.trim();
      const preview = trimmed.slice(0, 160);
      if (H.shaders.some((s) => s.preview === preview)) return;
      H.shaders.push({
        type,
        length: trimmed.length,
        preview,
        source: trimmed.length > 6000 ? trimmed.slice(0, 6000) + '\n/* ... [SHADER_TRUNCATED] ... */' : trimmed
      });
    } catch (e) {}
  }

  const origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function (type, attrs) {
    const ctx = origGetContext.apply(this, arguments);
    try {
      if (ctx && type && !this.hasAttribute('data-sitescrap-context')) {
        this.setAttribute('data-sitescrap-context', type);
        H.webglContexts.push({ type, attrs: attrs ? JSON.parse(JSON.stringify(attrs)) : null, width: this.width, height: this.height });
      }
    } catch (e) {}
    return ctx;
  };

  if (window.OffscreenCanvas) {
    const origOff = OffscreenCanvas.prototype.getContext;
    OffscreenCanvas.prototype.getContext = function (type) {
      try {
        H.webglContexts.push({ type: `${type} (OffscreenCanvas)`, width: this.width, height: this.height });
      } catch (e) {}
      return origOff.apply(this, arguments);
    };
  }

  function hookGL(proto) {
    if (!proto || !proto.shaderSource) return;
    const orig = proto.shaderSource;
    proto.shaderSource = function (shader, source) {
      try {
        const isVertex = /gl_Position\b/.test(source);
        pushShader(isVertex ? 'GLSL Vertex Shader' : /gl_FragColor\b|out\s+(highp\s+|mediump\s+)?vec4\b/.test(source) ? 'GLSL Fragment Shader' : 'GLSL Shader', source);
      } catch (e) {}
      return orig.apply(this, arguments);
    };
  }
  if (window.WebGLRenderingContext) hookGL(WebGLRenderingContext.prototype);
  if (window.WebGL2RenderingContext) hookGL(WebGL2RenderingContext.prototype);

  // WebGPU: capture WGSL shader modules
  if (window.GPUDevice && GPUDevice.prototype.createShaderModule) {
    const origCSM = GPUDevice.prototype.createShaderModule;
    GPUDevice.prototype.createShaderModule = function (desc) {
      try {
        const code = desc && desc.code;
        const kind = /@vertex/.test(code) && /@fragment/.test(code) ? 'WGSL Vertex+Fragment' : /@vertex/.test(code) ? 'WGSL Vertex Shader' : /@fragment/.test(code) ? 'WGSL Fragment Shader' : /@compute/.test(code) ? 'WGSL Compute Shader' : 'WGSL Shader';
        pushShader(kind, code);
      } catch (e) {}
      return origCSM.apply(this, arguments);
    };
  }

  const WATCH = ['scroll', 'wheel', 'mousemove', 'pointermove', 'pointerdown', 'resize', 'keydown', 'touchstart', 'touchmove', 'deviceorientation', 'visibilitychange', 'click', 'mouseenter', 'mouseleave'];
  const origAdd = EventTarget.prototype.addEventListener;
  EventTarget.prototype.addEventListener = function (type) {
    try {
      if (WATCH.includes(type)) {
        const bucket = this === window ? H.eventListeners.windowEvents : this === document ? H.eventListeners.documentEvents : this instanceof Element ? H.eventListeners.elementEvents : null;
        if (bucket) bucket[type] = (bucket[type] || 0) + 1;
      }
    } catch (e) {}
    return origAdd.apply(this, arguments);
  };
}

function registrableDomain(hostname) {
  const parts = hostname.replace(/^www\./, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const sld = parts[parts.length - 2];
  if (['co', 'com', 'or', 'ne', 'go', 'ac', 'net', 'org', 'gov', 'edu'].includes(sld) && parts[parts.length - 1].length === 2) {
    return parts.slice(-3).join('.');
  }
  return parts.slice(-2).join('.');
}

function scriptFileName(url, index) {
  try {
    const u = new URL(url);
    const base = (u.pathname.split('/').pop() || 'index').replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 60) || 'script';
    const host = u.hostname.replace(/^www\./, '').replace(/[^a-zA-Z0-9.-]/g, '_').slice(0, 40);
    const name = base.endsWith('.js') || base.endsWith('.mjs') ? base : base + '.js';
    return `${String(index).padStart(2, '0')}_${host}__${name}`;
  } catch (e) {
    return `${String(index).padStart(2, '0')}_script.js`;
  }
}

/**
 * Main Website Deep Analyzer
 */
async function analyzeSite(options, onProgress = () => {}) {
  const {
    url: rawUrl,
    mobile = false,
    autoScroll = true,
    captureScreenshots = true,
    saveScripts = true,
    headless = true,
    outputDir
  } = options;
  const viewport = options.viewport || (mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });

  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;
  try {
    new URL(targetUrl);
  } catch (e) {
    throw new Error(`올바른 URL이 아닙니다: ${rawUrl}`);
  }

  onProgress('init', '브라우저 엔진 시작 (WebGL/WebGPU 활성화)', 5);
  const browser = await chromium.launch({
    executablePath: findBrowserExecutable(),
    headless,
    args: [
      '--enable-webgl',
      '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader',
      '--enable-unsafe-webgpu',
      '--disable-blink-features=AutomationControlled',
      '--autoplay-policy=no-user-gesture-required',
      '--no-sandbox'
    ]
  });

  try {
    const major = (browser.version() || '131').split('.')[0];
    const userAgent = mobile
      ? `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Mobile Safari/537.36`
      : `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${major}.0.0.0 Safari/537.36`;

    const context = await browser.newContext({
      viewport,
      userAgent,
      isMobile: mobile,
      hasTouch: mobile,
      deviceScaleFactor: mobile ? 2 : 1,
      ignoreHTTPSErrors: true,
      locale: 'ko-KR'
    });
    await context.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
    });

    const page = await context.newPage();
    await page.addInitScript(runtimeHooksInitScript);

    // ------------------------------------------------------------------
    // Network sniffer
    // ------------------------------------------------------------------
    const networkAssets = { models3D: [], animations: [], shaders: [], fonts: [], videos: [], scripts: [], stylesheets: [], binaryBuffers: [], apiEndpoints: [] };
    const capturedScripts = []; // { url, text }
    const capturedStyles = []; // { url, text }
    const seenUrls = new Set();
    const pending = new Set();
    const siteDomain = registrableDomain(new URL(targetUrl).hostname);
    const isFirstParty = (u) => {
      try {
        return registrableDomain(new URL(u).hostname) === siteDomain;
      } catch (e) {
        return false;
      }
    };

    async function handleResponse(response) {
      const reqUrl = response.url();
      if (!reqUrl || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || seenUrls.has(reqUrl)) return;
      seenUrls.add(reqUrl);
      if (isTrackerUrl(reqUrl)) return;

      const status = response.status();
      if (status >= 300) return;

      const headers = response.headers();
      const contentType = (headers['content-type'] || '').toLowerCase();
      const contentLength = parseInt(headers['content-length'] || '0', 10);
      const reqType = response.request().resourceType();
      const cleanUrl = redactSensitiveText(reqUrl, { redactedItems: {} });
      const cleanPath = reqUrl.toLowerCase().split('?')[0].split('#')[0];

      if (cleanPath.endsWith('.bin')) {
        networkAssets.binaryBuffers.push({ url: cleanUrl, type: 'Binary Buffer (.bin - glTF geometry/animation buffer)', provider: detectHostProvider(reqUrl), sizeBytes: contentLength });
        return;
      }

      const classification = classifyAsset(reqUrl, contentType, reqType);
      if (classification) {
        const item = { url: cleanUrl, ...classification, sizeBytes: contentLength, contentType };
        if (['3d_model', '3d_env', '3d_texture', '3d_engine_wasm'].includes(classification.category)) networkAssets.models3D.push(item);
        else if (classification.category === 'interactive_anim') networkAssets.animations.push(item);
        else if (classification.category === 'shader') {
          networkAssets.shaders.push(item);
          try {
            item.source = (await response.text()).slice(0, 6000);
          } catch (e) {}
        } else if (classification.category === 'font') networkAssets.fonts.push(item);
        else if (classification.category === 'video') networkAssets.videos.push(item);
        // Spline runtime / Rive / Lottie JS modules are still scripts worth scanning
        if (!(reqType === 'script' || cleanPath.endsWith('.js') || cleanPath.endsWith('.mjs'))) return;
      }

      // JSON: Lottie / Three.js JSON / glTF JSON / API endpoint record
      if (contentType.includes('json') || cleanPath.endsWith('.json')) {
        if (reqType === 'fetch' || reqType === 'xhr') {
          if (networkAssets.apiEndpoints.length < 40) {
            try {
              const u = new URL(reqUrl);
              networkAssets.apiEndpoints.push({ method: response.request().method(), endpoint: `${u.origin}${u.pathname}`, firstParty: isFirstParty(reqUrl) });
            } catch (e) {}
          }
        }
        if (contentLength > 8000000) return;
        try {
          const text = await response.text();
          if (!text || text.length > 6000000 || !text.trim().startsWith('{')) return;
          const head = text.slice(0, 2000);
          if (/"v"\s*:\s*"\d/.test(head) && /"fr"\s*:/.test(head) && /"layers"\s*:/.test(text.slice(0, 5000))) {
            networkAssets.animations.push({ url: cleanUrl, category: 'interactive_anim', type: 'Lottie Vector Animation (.json)', provider: detectHostProvider(reqUrl), description: 'JSON 기반 Lottie 벡터 모션 데이터', sizeBytes: contentLength || text.length });
          } else if (/"metadata"\s*:\s*\{[^}]*"type"\s*:\s*"(Object|BufferGeometry|Geometry|Material)"/i.test(head) || /"geometries"\s*:\s*\[/.test(head)) {
            networkAssets.models3D.push({ url: cleanUrl, category: '3d_model', type: 'Three.js Scene / Geometry JSON', provider: detectHostProvider(reqUrl), description: 'Three.js ObjectLoader / BufferGeometryLoader용 3D JSON', sizeBytes: contentLength || text.length });
          } else if (/"asset"\s*:\s*\{[^}]*"version"\s*:\s*"2\.0"/i.test(head) && /"meshes"|"nodes"|"scenes"/.test(head)) {
            networkAssets.models3D.push({ url: cleanUrl, category: '3d_model', type: 'glTF 2.0 3D Asset (JSON)', provider: detectHostProvider(reqUrl), description: '동적 로드된 glTF 2.0 씬 데이터', sizeBytes: contentLength || text.length });
          }
        } catch (e) {}
        return;
      }

      if (reqType === 'script' || cleanPath.endsWith('.js') || cleanPath.endsWith('.mjs')) {
        const entry = { url: cleanUrl, host: detectHostProvider(reqUrl), firstParty: isFirstParty(reqUrl), sizeBytes: contentLength };
        networkAssets.scripts.push(entry);
        if (contentLength && contentLength > LIMITS.scanScriptBytes) return;
        try {
          const text = await response.text();
          entry.sizeBytes = text.length;
          capturedScripts.push({ url: reqUrl, cleanUrl, text, entry });
        } catch (e) {}
        return;
      }

      if (reqType === 'stylesheet' || cleanPath.endsWith('.css')) {
        const entry = { url: cleanUrl, host: detectHostProvider(reqUrl), firstParty: isFirstParty(reqUrl), sizeBytes: contentLength };
        networkAssets.stylesheets.push(entry);
        try {
          const text = await response.text();
          entry.sizeBytes = text.length;
          capturedStyles.push({ url: cleanUrl, text });
        } catch (e) {}
      }
    }

    page.on('response', (response) => {
      const p = handleResponse(response).catch(() => {});
      pending.add(p);
      p.finally(() => pending.delete(p));
    });

    // ------------------------------------------------------------------
    // Navigate
    // ------------------------------------------------------------------
    onProgress('navigate', `접속 중: ${targetUrl}`, 12);
    let mainResponse = null;
    try {
      mainResponse = await page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    } catch (navErr) {
      if (!page.url() || page.url() === 'about:blank') {
        throw new Error(`사이트에 접속할 수 없습니다: ${navErr.message.split('\n')[0]}`);
      }
    }
    if (mainResponse && mainResponse.status() >= 400) {
      onProgress('navigate', `경고: 메인 문서 HTTP ${mainResponse.status()} 응답 (봇 차단/로그인 필요 가능성)`, 14);
    }

    onProgress('load', '리소스 로딩 대기 (load / network idle)', 20);
    await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
    await page.waitForLoadState('networkidle', { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);

    // Wake up interactive canvases / hover states
    try {
      for (const [fx, fy] of [[0.3, 0.4], [0.6, 0.5], [0.5, 0.6]]) {
        await page.mouse.move(viewport.width * fx, viewport.height * fy, { steps: 6 });
        await page.waitForTimeout(120);
      }
    } catch (e) {}

    // ------------------------------------------------------------------
    // Scroll pass (wheel-driven so smooth-scroll libraries react too)
    // ------------------------------------------------------------------
    if (autoScroll) {
      onProgress('scroll', '페이지 끝까지 스크롤 (지연 로딩 에셋 / 스크롤 애니메이션 / 3D 씬 트리거)', 30);
      let lastY = -1;
      let still = 0;
      const started = Date.now();
      for (let i = 0; i < 60 && Date.now() - started < 25000; i++) {
        try {
          if (mobile) await page.evaluate((d) => window.scrollBy(0, d), Math.round(viewport.height * 0.8));
          else await page.mouse.wheel(0, Math.round(viewport.height * 0.8));
        } catch (e) {}
        await page.waitForTimeout(300);
        const y = await page.evaluate(() => window.scrollY).catch(() => 0);
        if (Math.abs(y - lastY) < 2) {
          still++;
          if (still === 2) await page.evaluate((d) => window.scrollBy(0, d), Math.round(viewport.height * 0.8)).catch(() => {});
          if (still >= 4) break;
        } else still = 0;
        lastY = y;
      }
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
      await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
      try {
        if (!mobile) for (let i = 0; i < 6; i++) await page.mouse.wheel(0, -5000);
      } catch (e) {}
      await page.waitForTimeout(1200);
    }

    // ------------------------------------------------------------------
    // Screenshots
    // ------------------------------------------------------------------
    const screenshots = { viewportPath: null, fullPagePath: null, scrollShots: [] };
    if (captureScreenshots && outputDir) {
      onProgress('screenshot', '스크린샷 촬영 (첫 화면 / 스크롤 단계별 / 전체 페이지)', 45);
      const dir = path.join(outputDir, 'screenshots');
      fs.mkdirSync(dir, { recursive: true });

      await page.screenshot({ path: path.join(dir, 'viewport_hero.png'), timeout: 15000 }).catch(() => {});
      if (fs.existsSync(path.join(dir, 'viewport_hero.png'))) screenshots.viewportPath = 'screenshots/viewport_hero.png';

      // Step-by-step viewport shots show the real rendered state (sticky, WebGL, scroll-triggered animations)
      const totalH = await page.evaluate(() => Math.max(document.body.scrollHeight, document.documentElement.scrollHeight)).catch(() => viewport.height);
      const steps = Math.min(LIMITS.maxScrollShots, Math.max(1, Math.ceil(totalH / viewport.height)));
      if (steps > 1) {
        for (let i = 1; i < steps; i++) {
          const y = i * viewport.height;
          await page.evaluate((yy) => window.scrollTo(0, yy), y).catch(() => {});
          await page.waitForTimeout(700);
          const actualY = await page.evaluate(() => Math.round(window.scrollY)).catch(() => y);
          const name = `scroll_${String(i + 1).padStart(2, '0')}_y${actualY}.png`;
          try {
            await page.screenshot({ path: path.join(dir, name), timeout: 15000 });
            screenshots.scrollShots.push(`screenshots/${name}`);
          } catch (e) {}
        }
        await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
        await page.waitForTimeout(800);
      }

      try {
        const h = Math.min(totalH, 16000);
        await page.screenshot({ path: path.join(dir, 'fullpage.png'), fullPage: true, clip: { x: 0, y: 0, width: viewport.width, height: h }, timeout: 30000 });
        screenshots.fullPagePath = 'screenshots/fullpage.png';
      } catch (e) {
        screenshots.fullPagePath = null;
      }
    }

    // ------------------------------------------------------------------
    // DOM inspection
    // ------------------------------------------------------------------
    onProgress('inspect', '디자인 시스템 / 레이아웃 / 작동 원리 / 3D 컨텍스트 분석', 60);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    const pageAnalysis = await page.evaluate(inspectPage);

    // Make sure all in-flight response handlers finished before reading results
    await Promise.race([Promise.allSettled(Array.from(pending)), new Promise((r) => setTimeout(r, 10000))]);

    const rawHtml = await page.content();
    const finalUrl = page.url();
    await browser.close().catch(() => {});

    // ------------------------------------------------------------------
    // Static code analysis (bundles + inline scripts)
    // ------------------------------------------------------------------
    onProgress('code', `JS 번들 ${capturedScripts.length}개 정적 분석 (라이브러리 / 3D 로더 / 에셋 경로)`, 72);
    const libraries = new Map();
    const threeModules = new Set();
    const assetRefs = new Map();
    for (const s of capturedScripts) {
      const label = s.cleanUrl.split('?')[0].split('/').slice(-2).join('/');
      scanCodeSignatures(s.text, label, libraries, threeModules, assetRefs);
    }
    const inlineScriptRe = /<script\b(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi;
    let im;
    while ((im = inlineScriptRe.exec(rawHtml)) !== null) {
      if (im[1].trim().length > 30) scanCodeSignatures(im[1], 'inline <script>', libraries, threeModules, assetRefs);
    }
    // Asset refs in raw HTML (e.g. <spline-viewer url="...">, data-src="model.glb")
    scanCodeSignatures(rawHtml.replace(/<script[\s\S]*?<\/script>/gi, ''), 'HTML', new Map(), new Set(), assetRefs);

    const codeLibraries = Array.from(libraries.values()).map((l) => ({
      ...l,
      name: l.name === 'Three.js' && l.revision ? `Three.js (r${l.revision})` : l.name
    }));
    const referencedAssets = resolveAssetRefs(assetRefs, finalUrl);

    // ------------------------------------------------------------------
    // Sanitize sources
    // ------------------------------------------------------------------
    onProgress('sanitize', '소스코드 정제 (트래커 / 토큰 / 개인정보 제거 및 절대경로 변환)', 82);
    const { html: sanitizedHtml, stats: privacyStats } = sanitizeHtml(rawHtml, finalUrl);

    // Sanitize each section's HTML snippet so 06_section_cloning_specs.md has clean, ready-to-use section markup
    for (const sec of pageAnalysis.sections || []) {
      if (sec.sectionHtmlSnippet) {
        sec.sectionHtmlSnippet = sanitizeHtml(sec.sectionHtmlSnippet, finalUrl).html;
      }
    }

    // CSS: external stylesheets (incl. cross-origin) + inline <style>
    const cssParts = [];
    let cssBytes = 0;
    const allCssSources = [...capturedStyles.map((s) => ({ label: s.url, text: s.text, baseUrl: s.url })), ...pageAnalysis.inlineStyleTexts.map((t) => ({ ...t, baseUrl: finalUrl }))];
    for (const part of allCssSources) {
      if (cssBytes > LIMITS.cssFileBytes) {
        cssParts.push(`/* ===== SKIPPED (size limit): ${part.label} ===== */`);
        continue;
      }
      const clean = sanitizeCss(part.text.length > 1500000 ? part.text.slice(0, 1500000) : part.text, privacyStats, part.baseUrl);
      cssBytes += clean.length;
      cssParts.push(`/* =====================================================================\n * SOURCE: ${part.label}\n * ===================================================================== */\n${clean}`);
    }
    const sanitizedCss = cssParts.join('\n\n');

    // Merge CSS tokens parsed from raw CSS text (covers cross-origin sheets)
    const ds = pageAnalysis.designSystem;
    const parsedTokens = extractCssTokens(allCssSources.map((p) => p.text).join('\n'));
    for (const v of parsedTokens.variables) {
      if (ds.cssVariables.length >= 120) break;
      if (!ds.cssVariables.some((x) => x.name === v.name && x.selector === v.selector)) ds.cssVariables.push(v);
    }
    for (const k of parsedTokens.keyframes) {
      if (!pageAnalysis.howItWorks.keyframes.some((x) => x.name === k.name)) pageAnalysis.howItWorks.keyframes.push(k);
    }
    pageAnalysis.howItWorks.keyframes = pageAnalysis.howItWorks.keyframes.slice(0, 40);
    ds.mediaBreakpoints = Array.from(new Set([...ds.mediaBreakpoints, ...parsedTokens.breakpoints])).sort((a, b) => parseFloat(a.match(/[\d.]+/)) - parseFloat(b.match(/[\d.]+/)));
    ds.fontFaces = parsedTokens.fontFaces || [];
    pageAnalysis.howItWorks.hoverRules = parsedTokens.hoverRules || [];

    // Scripts to save
    const savedScripts = [];
    if (saveScripts) {
      let total = 0;
      const ordered = [...capturedScripts].sort((a, b) => (b.entry.firstParty ? 1 : 0) - (a.entry.firstParty ? 1 : 0));
      let idx = 1;
      for (const s of ordered) {
        if (savedScripts.length >= LIMITS.saveScriptsCount) {
          s.entry.saved = 'skipped: count limit';
          continue;
        }
        if (s.text.length > LIMITS.saveScriptBytes) {
          s.entry.saved = `skipped: too large (${(s.text.length / 1024).toFixed(0)}KB)`;
          continue;
        }
        if (total + s.text.length > LIMITS.saveScriptsTotal) {
          s.entry.saved = 'skipped: total size limit';
          continue;
        }
        const fileName = scriptFileName(s.url, idx++);
        const code = `/**\n * SOURCE: ${s.cleanUrl}\n * ${s.entry.firstParty ? 'First-party' : 'Third-party'} script — sanitized (secrets/PII redacted) & beautified for reading.\n */\n` + sanitizeJs(s.text, privacyStats);
        total += s.text.length;
        s.entry.saved = `05_scripts/${fileName}`;
        savedScripts.push({ fileName, code, sourceUrl: s.cleanUrl, firstParty: s.entry.firstParty, rawBytes: s.text.length });
      }
      for (const inl of privacyStats.extractedInlineScripts) {
        savedScripts.push({ fileName: inl.fileName, code: `/** SOURCE: inline <script> in HTML — sanitized */\n` + sanitizeJs(inl.code, privacyStats), sourceUrl: 'inline <script>', firstParty: true, rawBytes: inl.code.length });
      }
    }
    delete privacyStats.extractedInlineScripts;

    onProgress('done', '분석 완료', 90);

    return {
      targetUrl: redactSensitiveText(targetUrl, { redactedItems: {} }),
      finalUrl: redactSensitiveText(finalUrl, { redactedItems: {} }),
      httpStatus: mainResponse ? mainResponse.status() : null,
      analyzedAt: new Date().toISOString(),
      viewport,
      mobile,
      screenshots,
      metadata: pageAnalysis.metadata,
      techStack: pageAnalysis.techStack,
      codeLibraries,
      threeModules: Array.from(threeModules).sort(),
      designSystem: ds,
      howItWorks: pageAnalysis.howItWorks,
      networkAssets,
      referencedAssets,
      structure: pageAnalysis.structure,
      sections: pageAnalysis.sections,
      domTree: pageAnalysis.domTree,
      sanitizedHtml,
      sanitizedCss,
      savedScripts,
      privacyStats
    };
  } catch (err) {
    await browser.close().catch(() => {});
    throw err;
  }
}

module.exports = {
  analyzeSite
};
