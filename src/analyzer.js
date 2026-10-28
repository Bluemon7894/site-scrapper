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

/**
 * Main Website Deep Analyzer
 */
async function analyzeSite(options, onProgress = () => {}) {
  const {
    url: rawUrl,
    viewport = { width: 1440, height: 900 },
    autoScroll = true,
    captureScreenshots = true,
    outputDir
  } = options;

  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  onProgress('init', '브라우저 엔진(WebGL/3D 가속 활성화)을 시작하는 중...', 8);
  const executablePath = findBrowserExecutable();

  const browser = await chromium.launch({
    executablePath,
    headless: true,
    args: [
      '--enable-webgl',
      '--use-gl=angle',
      '--ignore-gpu-blocklist',
      '--disable-blink-features=AutomationControlled',
      '--no-sandbox'
    ]
  });

  try {
    const context = await browser.newContext({
      viewport,
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
      deviceScaleFactor: 1,
      ignoreHTTPSErrors: true
    });

    const page = await context.newPage();

    // Inject runtime hooks BEFORE page scripts run to capture WebGL contexts, GLSL shaders, and event listeners
    await page.addInitScript(() => {
      window.__SITESCRAP_HOOKS__ = {
        webglContexts: [],
        shaders: [],
        eventListeners: {
          windowEvents: {},
          documentEvents: {},
          interactiveTags: {}
        },
        fetchedThreeJson: []
      };

      // 1. Hook HTMLCanvasElement.prototype.getContext
      const origGetContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, attrs) {
        const ctx = origGetContext.apply(this, arguments);
        try {
          if (type && (type.includes('webgl') || type.includes('webgpu') || type === '2d')) {
            this.setAttribute('data-sitescrap-context', type);
            window.__SITESCRAP_HOOKS__.webglContexts.push({
              type,
              attrs: attrs ? JSON.parse(JSON.stringify(attrs)) : null,
              width: this.width,
              height: this.height,
              id: this.id || null,
              className: typeof this.className === 'string' ? this.className : null
            });
          }
        } catch (e) {}
        return ctx;
      };

      // 2. Hook WebGL shaderSource to capture custom GLSL vertex/fragment shaders
      function hookShaderSource(proto) {
        if (!proto || !proto.shaderSource) return;
        const origShaderSource = proto.shaderSource;
        proto.shaderSource = function (shader, source) {
          try {
            if (typeof source === 'string' && source.length > 40 && window.__SITESCRAP_HOOKS__.shaders.length < 25) {
              // Check if it's not already recorded
              const trimmed = source.trim();
              const isVertex = /gl_Position\b/.test(trimmed);
              const isFragment = /gl_FragColor\b|out\s+vec4\b/.test(trimmed);
              const exists = window.__SITESCRAP_HOOKS__.shaders.some((s) => s.preview === trimmed.slice(0, 120));
              if (!exists) {
                window.__SITESCRAP_HOOKS__.shaders.push({
                  type: isVertex ? 'Vertex Shader' : isFragment ? 'Fragment Shader' : 'GLSL Shader',
                  length: trimmed.length,
                  preview: trimmed.slice(0, 120),
                  source: trimmed.length > 2500 ? trimmed.slice(0, 2500) + '\n/* ... [SHADER_TRUNCATED] ... */' : trimmed
                });
              }
            }
          } catch (e) {}
          return origShaderSource.apply(this, arguments);
        };
      }
      if (window.WebGLRenderingContext) hookShaderSource(window.WebGLRenderingContext.prototype);
      if (window.WebGL2RenderingContext) hookShaderSource(window.WebGL2RenderingContext.prototype);

      // 3. Hook addEventListener to understand how interactions work (wheel hijack, mousemove parallax, scroll listeners)
      const origWindowAdd = window.addEventListener;
      window.addEventListener = function (type) {
        try {
          if (['scroll', 'wheel', 'mousemove', 'pointermove', 'resize', 'keydown', 'touchmove', 'deviceorientation'].includes(type)) {
            window.__SITESCRAP_HOOKS__.eventListeners.windowEvents[type] =
              (window.__SITESCRAP_HOOKS__.eventListeners.windowEvents[type] || 0) + 1;
          }
        } catch (e) {}
        return origWindowAdd.apply(this, arguments);
      };

      const origDocAdd = document.addEventListener;
      document.addEventListener = function (type) {
        try {
          if (['scroll', 'wheel', 'mousemove', 'pointermove', 'keydown', 'touchmove', 'visibilitychange'].includes(type)) {
            window.__SITESCRAP_HOOKS__.eventListeners.documentEvents[type] =
              (window.__SITESCRAP_HOOKS__.eventListeners.documentEvents[type] || 0) + 1;
          }
        } catch (e) {}
        return origDocAdd.apply(this, arguments);
      };
    });

    // Network sniffer state
    const networkAssets = {
      models3D: [],
      animations: [],
      shaders: [],
      fonts: [],
      videos: [],
      scripts: [],
      stylesheets: [],
      binaryBuffers: []
    };
    const seenUrls = new Set();

    page.on('response', async (response) => {
      try {
        const reqUrl = response.url();
        if (!reqUrl || reqUrl.startsWith('data:') || reqUrl.startsWith('blob:') || seenUrls.has(reqUrl)) return;
        seenUrls.add(reqUrl);

        if (isTrackerUrl(reqUrl)) return;

        const status = response.status();
        if (status >= 400) return;

        const headers = response.headers();
        const contentType = (headers['content-type'] || '').toLowerCase();
        const contentLength = parseInt(headers['content-length'] || '0', 10);
        const reqType = response.request().resourceType();
        const cleanUrl = redactSensitiveText(reqUrl, { redactedItems: {} });
        const lowerUrl = reqUrl.toLowerCase();
        const cleanPath = lowerUrl.split('?')[0];

        // Check if it's a .bin file (often companion buffer for .gltf models)
        if (cleanPath.endsWith('.bin')) {
          networkAssets.binaryBuffers.push({
            url: cleanUrl,
            type: 'Binary Buffer (.bin - glTF/3D geometry buffer)',
            provider: detectHostProvider(reqUrl),
            sizeBytes: contentLength
          });
          return;
        }

        // Classify specialized assets (3D, Spline, HDR, KTX2, Draco, Rive, Lottie, Video, Fonts)
        const classification = classifyAsset(reqUrl, contentType, reqType);
        if (classification) {
          const item = {
            url: cleanUrl,
            ...classification,
            sizeBytes: contentLength,
            contentType
          };
          if (['3d_model', '3d_env', '3d_texture', '3d_engine_wasm'].includes(classification.category)) {
            networkAssets.models3D.push(item);
          } else if (classification.category === 'interactive_anim') {
            networkAssets.animations.push(item);
          } else if (classification.category === 'shader') {
            networkAssets.shaders.push(item);
          } else if (classification.category === 'font') {
            networkAssets.fonts.push(item);
          } else if (classification.category === 'video') {
            networkAssets.videos.push(item);
          }
          return;
        }

        // Check JSON responses for Three.js scene/geometry JSON or Lottie JSON
        if ((contentType.includes('json') || cleanPath.endsWith('.json')) && contentLength < 5000000) {
          try {
            const text = await response.text();
            if (text && text.length < 3000000 && text.trim().startsWith('{')) {
              const head = text.slice(0, 600);
              // Lottie signature: has "v", "fr", "ip", "op", "layers"
              if (/"v"\s*:/.test(head) && /"fr"\s*:/.test(head) && /"layers"\s*:/.test(text.slice(0, 2000))) {
                networkAssets.animations.push({
                  url: cleanUrl,
                  category: 'interactive_anim',
                  type: 'Lottie Vector Animation (.json)',
                  provider: detectHostProvider(reqUrl),
                  description: 'JSON 기반 Lottie 벡터 모션 애니메이션 데이터',
                  sizeBytes: contentLength || text.length
                });
              }
              // Three.js Object / BufferGeometry / Material JSON signature
              else if (/"metadata"\s*:\s*\{[^}]*"type"\s*:\s*"(Object|BufferGeometry|Geometry|Material)"/i.test(head) || /"geometries"\s*:\s*\[/.test(head)) {
                networkAssets.models3D.push({
                  url: cleanUrl,
                  category: '3d_model',
                  type: 'Three.js 3D Geometry / Scene JSON',
                  provider: detectHostProvider(reqUrl),
                  description: 'Three.js ObjectLoader / BufferGeometryLoader 전용 3D 모델 JSON 파일',
                  sizeBytes: contentLength || text.length
                });
              }
              // glTF JSON served without .gltf extension
              else if (/"asset"\s*:\s*\{[^}]*"version"\s*:\s*"2\.0"/i.test(head) && /"meshes"|"nodes"|"scenes"/.test(text.slice(0, 2000))) {
                networkAssets.models3D.push({
                  url: cleanUrl,
                  category: '3d_model',
                  type: 'glTF 2.0 3D Asset (JSON)',
                  provider: detectHostProvider(reqUrl),
                  description: '네트워크로 동적 로드된 glTF 2.0 3D 씬 구조 데이터',
                  sizeBytes: contentLength || text.length
                });
              }
            }
          } catch (e) {}
        }

        // Record scripts and stylesheets
        if (reqType === 'script' || cleanPath.endsWith('.js') || cleanPath.endsWith('.mjs')) {
          networkAssets.scripts.push({
            url: cleanUrl,
            host: detectHostProvider(reqUrl),
            sizeBytes: contentLength
          });
        } else if (reqType === 'stylesheet' || cleanPath.endsWith('.css')) {
          networkAssets.stylesheets.push({
            url: cleanUrl,
            host: detectHostProvider(reqUrl),
            sizeBytes: contentLength
          });
        }
      } catch (e) {}
    });

    onProgress('navigate', `대상 사이트(${targetUrl})에 접속하여 리소스 및 네트워크 트래픽을 수집 중...`, 20);

    try {
      await page.goto(targetUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 35000
      });
    } catch (navErr) {
      // Even if timeout on slow assets, continue if DOM loaded
      if (!page.url() || page.url() === 'about:blank') {
        throw new Error(`사이트에 접속할 수 없습니다: ${navErr.message}`);
      }
    }

    // Wait a moment for initial hydration / 3D scene initialization
    await page.waitForTimeout(2500);

    // Move mouse slightly to wake up interactive canvases
    try {
      await page.mouse.move(viewport.width * 0.3, viewport.height * 0.4);
      await page.waitForTimeout(200);
      await page.mouse.move(viewport.width * 0.7, viewport.height * 0.6);
    } catch (e) {}

    // Auto-scroll to trigger lazy loading, ScrollTrigger, and dynamic sections
    if (autoScroll) {
      onProgress('scroll', '페이지를 스크롤하며 지연 로딩(Lazy-load) 에셋, 3D 씬, 스크롤 애니메이션을 활성화 중...', 38);
      await page.evaluate(async () => {
        await new Promise((resolve) => {
          const maxScroll = Math.min(document.body.scrollHeight || 5000, 12000);
          const step = Math.max(window.innerHeight * 0.75, 500);
          let current = 0;
          const timer = setInterval(() => {
            current += step;
            window.scrollTo({ top: current, behavior: 'instant' });
            if (current >= maxScroll) {
              clearInterval(timer);
              setTimeout(() => {
                window.scrollTo({ top: 0, behavior: 'instant' });
                resolve();
              }, 400);
            }
          }, 220);
        });
      });
      await page.waitForTimeout(1200);
    }

    // Capture screenshots
    const screenshots = {
      viewportPath: null,
      fullPagePath: null
    };

    if (captureScreenshots && outputDir) {
      onProgress('screenshot', '시각적 디자인 레퍼런스를 위한 스크린샷을 촬영 중...', 52);
      const screenshotsDir = path.join(outputDir, 'screenshots');
      fs.mkdirSync(screenshotsDir, { recursive: true });

      const viewportFile = path.join(screenshotsDir, 'viewport_hero.png');
      await page.screenshot({ path: viewportFile, fullPage: false });
      screenshots.viewportPath = 'screenshots/viewport_hero.png';

      try {
        const fullPageFile = path.join(screenshotsDir, 'fullpage.png');
        await page.screenshot({ path: fullPageFile, fullPage: true, timeout: 15000 });
        screenshots.fullPagePath = 'screenshots/fullpage.png';
      } catch (e) {
        // Fallback if page is infinitely tall or WebGL locks fullPage screenshot
        screenshots.fullPagePath = screenshots.viewportPath;
      }
    }

    onProgress('inspect_dom', '디자인 시스템(색상, 폰트, CSS 토큰), 레이아웃 트리, 작동 원리 및 3D 컨텍스트를 정밀 분석 중...', 68);

    // Run comprehensive in-page inspection
    const pageAnalysis = await page.evaluate(() => {
      // Helper: convert rgb/rgba string to HEX
      function rgbToHex(rgbStr) {
        if (!rgbStr || rgbStr === 'transparent' || rgbStr === 'rgba(0, 0, 0, 0)') return null;
        const m = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
        if (!m) return rgbStr;
        const r = parseInt(m[1], 10);
        const g = parseInt(m[2], 10);
        const b = parseInt(m[3], 10);
        const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
        if (a < 0.05) return null;
        const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
        return a < 0.98 ? `${hex} (alpha: ${Math.round(a * 100)}%)` : hex;
      }

      // Helper: concise selector for an element
      function getConciseSelector(el) {
        if (!el || !el.tagName) return '';
        const tag = el.tagName.toLowerCase();
        const id = el.id && typeof el.id === 'string' && el.id.length < 35 ? `#${el.id}` : '';
        let cls = '';
        if (el.className && typeof el.className === 'string') {
          const validClasses = el.className
            .trim()
            .split(/\s+/)
            .filter((c) => c && c.length < 36 && !/^[a-z0-9_-]{25,}$/i.test(c))
            .slice(0, 3);
          if (validClasses.length > 0) {
            cls = '.' + validClasses.join('.');
          }
        }
        return `${tag}${id}${cls}`;
      }

      // 1. Metadata
      const getMeta = (name) => {
        const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
        return el ? el.getAttribute('content') || '' : '';
      };

      const bodyStyle = window.getComputedStyle(document.body);
      const htmlStyle = window.getComputedStyle(document.documentElement);
      const pageBg = rgbToHex(bodyStyle.backgroundColor) || rgbToHex(htmlStyle.backgroundColor) || '#FFFFFF';

      // Estimate dark mode vs light mode
      let isDarkTheme = false;
      const bgMatch = (bodyStyle.backgroundColor || htmlStyle.backgroundColor || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (bgMatch) {
        const lum = 0.299 * parseInt(bgMatch[1], 10) + 0.587 * parseInt(bgMatch[2], 10) + 0.114 * parseInt(bgMatch[3], 10);
        if (lum < 110) isDarkTheme = true;
      }

      const metadata = {
        title: document.title || '',
        description: getMeta('description') || getMeta('og:description'),
        ogTitle: getMeta('og:title'),
        ogType: getMeta('og:type'),
        lang: document.documentElement.lang || 'ko/en',
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
        pageBackground: pageBg,
        themeMode: isDarkTheme ? 'Dark Mode (다크 테마 중심)' : 'Light Mode (라이트 테마 중심)'
      };

      // 2. Tech Stack & Libraries Detection
      const techStack = [];
      const addTech = (name, category, reason) => {
        if (!techStack.some((t) => t.name === name)) {
          techStack.push({ name, category, reason });
        }
      };

      const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src.toLowerCase());
      const allScriptText = Array.from(document.querySelectorAll('script:not([src])'))
        .map((s) => s.textContent.slice(0, 1500))
        .join('\n');

      // Frameworks
      if (window.__NEXT_DATA__ || document.getElementById('__NEXT_DATA__') || scripts.some((s) => s.includes('/_next/'))) {
        addTech('Next.js (React SSR/App Router)', 'Frontend Framework', '/_next/ 번들 및 __NEXT_DATA__ 감지');
      }
      if (window.React || document.querySelector('[data-reactroot], [id="__next"], [id="root"]')) {
        const hasFiber = Array.from(document.body.children).some((el) =>
          Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$'))
        );
        if (hasFiber || window.React) {
          addTech('React', 'UI Library', 'DOM React Fiber 노드 마운트 감지');
        }
      }
      if (window.__NUXT__ || scripts.some((s) => s.includes('/_nuxt/'))) {
        addTech('Nuxt.js (Vue)', 'Frontend Framework', '/_nuxt/ 번들 및 __NUXT__ 감지');
      }
      if (window.__VUE__ || document.querySelector('[data-v-app]') || Array.from(document.querySelectorAll('*')).slice(0, 60).some((el) => Array.from(el.attributes).some((a) => a.name.startsWith('data-v-')))) {
        addTech('Vue.js', 'UI Library', 'Vue data-v-* 스코프 속성 또는 런타임 감지');
      }
      if (document.querySelector('astro-island, [data-astro-cid]')) {
        addTech('Astro', 'Frontend Framework', 'astro-island 아키텍처 감지');
      }
      if (document.documentElement.hasAttribute('data-wf-site') || document.documentElement.hasAttribute('data-wf-page') || scripts.some((s) => s.includes('webflow'))) {
        addTech('Webflow', 'Visual Web Platform', 'data-wf-page / Webflow 인터랙션 엔진 감지');
      }
      if (document.querySelector('[data-framer-appear-id], [data-framer-name]') || scripts.some((s) => s.includes('framer'))) {
        addTech('Framer', 'Visual Web & Motion Platform', 'Framer 컴포넌트 및 모션 속성 감지');
      }

      // 3D & WebGL Engines
      if (window.THREE || window.__THREE__ || scripts.some((s) => s.includes('three'))) {
        const rev = window.__THREE__ ? ` (r${window.__THREE__})` : '';
        addTech(`Three.js${rev}`, '3D / WebGL Engine', 'Three.js 3D WebGL 엔진 감지');
      }
      if (document.querySelector('spline-viewer') || scripts.some((s) => s.includes('splinetool') || s.includes('spline.design')) || document.querySelector('canvas[data-engine*="three.js"]')) {
        if (document.querySelector('spline-viewer') || scripts.some((s) => s.includes('spline'))) {
          addTech('Spline 3D (@splinetool/runtime)', '3D / WebGL Engine', 'Spline 3D 인터랙티브 씬 뷰어/런타임 감지');
        }
      }
      if (document.querySelector('model-viewer') || scripts.some((s) => s.includes('model-viewer'))) {
        addTech('Google <model-viewer>', '3D / WebGL Engine', '3D GLTF/GLB 웹 컴포넌트 뷰어 감지');
      }
      if (window.BABYLON || scripts.some((s) => s.includes('babylon'))) {
        addTech('Babylon.js', '3D / WebGL Engine', 'Babylon.js 3D 엔진 감지');
      }
      if (window.PIXI || scripts.some((s) => s.includes('pixi'))) {
        addTech('PixiJS', '2D WebGL Renderer', 'PixiJS WebGL 렌더러 감지');
      }
      if (document.querySelector('[data-us-project]') || scripts.some((s) => s.includes('unicornstudio'))) {
        addTech('Unicorn Studio', 'WebGL Shader Engine', 'Unicorn Studio WebGL 프로젝트 감지');
      }

      // Animation & Scroll Libraries
      if (window.gsap || window.GreenSockGlobals || scripts.some((s) => s.includes('gsap'))) {
        addTech('GSAP (GreenSock)', 'Animation Engine', 'GSAP 타임라인 및 트윈 애니메이션 엔진 감지');
      }
      if (window.ScrollTrigger || document.querySelector('.pin-spacer, [style*="pin-spacer"]') || scripts.some((s) => s.includes('scrolltrigger'))) {
        addTech('GSAP ScrollTrigger', 'Scroll Interaction', '스크롤 연동 애니메이션 및 섹션 고정(Pinning) 감지');
      }
      if (window.Lenis || document.documentElement.classList.contains('lenis') || document.querySelector('.lenis')) {
        addTech('Lenis Smooth Scroll', 'Scroll Interaction', 'Lenis 관성 스무스 스크롤 엔진 감지');
      }
      if (document.querySelector('[data-scroll-container], [data-scroll-section], [data-scroll-speed]') || scripts.some((s) => s.includes('locomotive-scroll'))) {
        addTech('Locomotive Scroll', 'Scroll Interaction', 'Locomotive 패럴랙스/스무스 스크롤 속성 감지');
      }
      if (document.querySelector('[data-aos]') || scripts.some((s) => s.includes('aos.js'))) {
        addTech('AOS (Animate On Scroll)', 'Scroll Interaction', 'data-aos 스크롤 등장 애니메이션 감지');
      }
      if (document.querySelector('.swiper, .swiper-container, swiper-container') || window.Swiper) {
        addTech('Swiper.js', 'Interactive UI', '터치/드래그 슬라이더 및 캐러셀 컴포넌트 감지');
      }
      if (window.lottie || window.bodymovin || document.querySelector('lottie-player, dotlottie-player') || scripts.some((s) => s.includes('lottie'))) {
        addTech('Lottie / Bodymovin', 'Vector Motion', 'Lottie JSON 벡터 애니메이션 플레이어 감지');
      }

      // CSS Styling Approaches
      const allClasses = Array.from(document.querySelectorAll('*'))
        .slice(0, 150)
        .map((el) => (typeof el.className === 'string' ? el.className : ''))
        .join(' ');
      if (/\b(flex|grid|items-center|justify-between|px-\d|py-\d|text-\[|bg-\[|sm:|md:|lg:)\b/.test(allClasses)) {
        addTech('Tailwind CSS', 'Styling System', '유틸리티 퍼스트 클래스(flex, items-center, lg:* 등) 감지');
      }
      if (document.querySelector('style[data-styled], style[data-emotion]')) {
        addTech('CSS-in-JS (Styled-Components / Emotion)', 'Styling System', '동적 생성 스타일시트 태그 감지');
      }

      // 3. Design System Extraction (Colors, Gradients, Glassmorphism, Fonts, CSS Variables)
      const bgColors = new Map();
      const textColors = new Map();
      const accentColors = new Map();
      const gradients = [];
      const glassEffects = [];
      const fontMap = new Map();

      const visibleElements = Array.from(document.querySelectorAll('body, header, nav, main, section, article, aside, footer, div, h1, h2, h3, h4, p, a, button, span, canvas')).slice(0, 450);

      for (const el of visibleElements) {
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) continue;
        const style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

        const areaWeight = Math.min(Math.round((rect.width * rect.height) / 10000) + 1, 50);
        const sel = getConciseSelector(el);

        // Background color
        const bgHex = rgbToHex(style.backgroundColor);
        if (bgHex) {
          const prev = bgColors.get(bgHex) || { hex: bgHex, rgb: style.backgroundColor, score: 0, examples: [] };
          prev.score += areaWeight;
          if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
          bgColors.set(bgHex, prev);
        }

        // Background gradient
        if (style.backgroundImage && style.backgroundImage.includes('gradient(') && gradients.length < 8) {
          const grad = style.backgroundImage;
          if (!gradients.some((g) => g.value === grad)) {
            gradients.push({ selector: sel, value: grad.slice(0, 220) });
          }
        }

        // Glassmorphism (backdrop-filter)
        const backdrop = style.backdropFilter || style.webkitBackdropFilter;
        if (backdrop && backdrop !== 'none' && glassEffects.length < 8) {
          if (!glassEffects.some((g) => g.selector === sel)) {
            glassEffects.push({
              selector: sel,
              backdropFilter: backdrop,
              background: style.backgroundColor,
              border: style.border
            });
          }
        }

        // Text color
        if (el.children.length === 0 && el.textContent && el.textContent.trim().length > 0) {
          const txtHex = rgbToHex(style.color);
          if (txtHex) {
            const prev = textColors.get(txtHex) || { hex: txtHex, rgb: style.color, count: 0, examples: [] };
            prev.count += 1;
            if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
            textColors.set(txtHex, prev);
          }
        }

        // Accent / Interactive colors (buttons, links, badges, colored borders)
        const tag = el.tagName.toLowerCase();
        if (tag === 'button' || tag === 'a' || /btn|button|cta|badge|tag|accent/i.test(sel)) {
          const btnBg = rgbToHex(style.backgroundColor);
          if (btnBg && btnBg !== pageBg) {
            const prev = accentColors.get(btnBg) || { hex: btnBg, role: 'Button / CTA Background', count: 0, examples: [] };
            prev.count += 1;
            if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
            accentColors.set(btnBg, prev);
          }
          const btnTxt = rgbToHex(style.color);
          if (btnTxt) {
            const prev = accentColors.get(btnTxt) || { hex: btnTxt, role: 'Interactive Text / Link', count: 0, examples: [] };
            prev.count += 1;
            if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
            accentColors.set(btnTxt, prev);
          }
        }

        // Font family tracking
        if (style.fontFamily) {
          const primaryFont = style.fontFamily.split(',')[0].replace(/["']/g, '').trim();
          if (primaryFont) {
            fontMap.set(primaryFont, (fontMap.get(primaryFont) || 0) + 1);
          }
        }
      }

      // Typography Scale (h1, h2, h3, h4, p, button, nav a)
      const typoTargets = [
        { role: 'Hero / Main Heading (H1)', query: 'h1' },
        { role: 'Section Heading (H2)', query: 'h2' },
        { role: 'Sub Heading (H3)', query: 'h3' },
        { role: 'Card / Feature Title (H4)', query: 'h4' },
        { role: 'Body Paragraph (P)', query: 'p' },
        { role: 'Primary Button / CTA', query: 'button, a[class*="btn"], a[class*="button"], [class*="cta"]' },
        { role: 'Navigation Link', query: 'nav a, header a' }
      ];

      const typographyScale = [];
      for (const t of typoTargets) {
        const el = document.querySelector(t.query);
        if (el) {
          const s = window.getComputedStyle(el);
          typographyScale.push({
            role: t.role,
            selector: getConciseSelector(el),
            fontFamily: s.fontFamily,
            fontSize: s.fontSize,
            fontWeight: s.fontWeight,
            lineHeight: s.lineHeight,
            letterSpacing: s.letterSpacing,
            color: rgbToHex(s.color) || s.color,
            sampleText: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 50)
          });
        }
      }

      // CSS Custom Properties (:root / html / body) & @keyframes
      const cssVariables = [];
      const keyframesList = [];
      const mediaBreakpoints = new Set();
      let collectedCssText = '';

      for (const sheet of Array.from(document.styleSheets)) {
        try {
          const rules = sheet.cssRules || sheet.rules;
          if (!rules) continue;
          for (const rule of Array.from(rules)) {
            if (collectedCssText.length < 120000) {
              collectedCssText += rule.cssText + '\n';
            }
            // Extract :root / html / body custom properties
            if (rule.type === CSSRule.STYLE_RULE && /^(:root|html|body|\[data-theme)/i.test(rule.selectorText || '')) {
              const style = rule.style;
              for (let i = 0; i < style.length; i++) {
                const prop = style[i];
                if (prop.startsWith('--') && !prop.startsWith('--tw-') && !prop.startsWith('-- framer-')) {
                  const val = style.getPropertyValue(prop).trim();
                  if (val && val.length < 120 && cssVariables.length < 60 && !cssVariables.some((v) => v.name === prop)) {
                    cssVariables.push({ name: prop, value: val, selector: rule.selectorText });
                  }
                }
              }
            }
            // Extract @keyframes
            if (rule.type === CSSRule.KEYFRAMES_RULE && keyframesList.length < 25) {
              keyframesList.push({
                name: rule.name,
                cssText: rule.cssText.replace(/\s+/g, ' ').slice(0, 350)
              });
            }
            // Extract @media breakpoints
            if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText) {
              const m = rule.conditionText.match(/\((?:max|min)-width:\s*[\d.]+(?:px|rem|em)\)/g);
              if (m) m.forEach((bp) => mediaBreakpoints.add(bp));
            }
          }
        } catch (corsErr) {
          // Cross-origin stylesheet cannot be read via cssRules; handled separately
        }
      }

      // 4. 3D / Canvas / Interactive Media DOM Inspection
      const canvases = Array.from(document.querySelectorAll('canvas')).map((c, idx) => {
        const rect = c.getBoundingClientRect();
        const s = window.getComputedStyle(c);
        let webglRenderer = null;
        let contextType = c.getAttribute('data-sitescrap-context') || c.getAttribute('data-engine') || null;
        try {
          const gl = c.getContext('webgl2') || c.getContext('webgl');
          if (gl) {
            if (!contextType) contextType = gl instanceof WebGL2RenderingContext ? 'webgl2' : 'webgl';
            const dbg = gl.getExtension('WEBGL_debug_renderer_info');
            if (dbg) {
              webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
            }
          }
        } catch (e) {}

        const isFullViewport = rect.width >= window.innerWidth * 0.85 && rect.height >= window.innerHeight * 0.7;
        const parentSel = c.parentElement ? getConciseSelector(c.parentElement) : 'body';

        return {
          index: idx + 1,
          selector: getConciseSelector(c),
          parentSelector: parentSel,
          contextType: contextType || 'Canvas / WebGL',
          engineAttr: c.getAttribute('data-engine') || null,
          dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px (internal: ${c.width}x${c.height})`,
          position: s.position,
          zIndex: s.zIndex,
          pointerEvents: s.pointerEvents,
          roleDescription:
            s.position === 'fixed' && isFullViewport
              ? '전체 화면 고정(Fixed) 배경 3D/WebGL 캔버스 레이어 (스크롤에 연동되거나 배경에서 상시 렌더링)'
              : isFullViewport
                ? '히어로/섹션 전체를 채우는 풀스크린 3D/WebGL 인터랙티브 캔버스'
                : '특정 섹션/컴포넌트 내부에 배치된 인라인 그래픽/3D 캔버스',
          webglRenderer
        };
      });

      // Custom 3D viewers & embeds (<spline-viewer>, <model-viewer>, <lottie-player>, <iframe>)
      const embeddedViewers = [];
      document.querySelectorAll('spline-viewer, model-viewer, lottie-player, dotlottie-player, iframe, video').forEach((el) => {
        const tag = el.tagName.toLowerCase();
        const rect = el.getBoundingClientRect();
        if (rect.width < 20 && rect.height < 20 && tag !== 'spline-viewer' && tag !== 'model-viewer') return;

        const src =
          el.getAttribute('url') ||
          el.getAttribute('src') ||
          (el.querySelector('source') ? el.querySelector('source').src : '') ||
          '';

        // Skip tracking iframes
        if (tag === 'iframe' && (!src || /googletagmanager|doubleclick|facebook|hotjar/i.test(src))) return;

        embeddedViewers.push({
          tag: `<${tag}>`,
          selector: getConciseSelector(el),
          sourceUrl: src,
          dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          attributes: Array.from(el.attributes)
            .filter((a) => !['class', 'style'].includes(a.name) && a.value.length < 150)
            .map((a) => `${a.name}="${a.value}"`)
            .join(' ')
        });
      });

      // 5. How It Works: Scroll Mechanics, Sticky/Pinned Scrollytelling, Transitions, Hover/Motion
      const stickyAndFixedElements = [];
      const animatedElements = [];

      document.querySelectorAll('*').forEach((el) => {
        const s = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        // Detect Sticky / Fixed layout elements & Scrollytelling tracks
        if ((s.position === 'sticky' || s.position === 'fixed') && stickyAndFixedElements.length < 20) {
          const parent = el.parentElement;
          const parentHeight = parent ? Math.round(parent.getBoundingClientRect().height) : 0;
          const isScrollytellingTrack = s.position === 'sticky' && parentHeight > window.innerHeight * 1.4;
          stickyAndFixedElements.push({
            selector: getConciseSelector(el),
            position: s.position,
            top: s.top,
            zIndex: s.zIndex,
            dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
            parentSelector: parent ? getConciseSelector(parent) : '',
            parentTrackHeight: `${parentHeight}px (${(parentHeight / window.innerHeight).toFixed(1)}vh)`,
            mechanism: isScrollytellingTrack
              ? `Scrollytelling Pinned Section: 부모 트랙(${(parentHeight / window.innerHeight).toFixed(1)}vh)을 스크롤하는 동안 화면에 고정(sticky)되어 내부 요소/3D가 변화하는 구조`
              : s.position === 'fixed'
                ? '뷰포트 고정(Fixed) 레이어 (네비게이션 바, 플로팅 UI 또는 고정 배경)'
                : '스크롤 시 상단/특정 위치에 붙는 Sticky 요소'
          });
        }

        // Detect elements with scroll/motion attributes or complex CSS animations/transforms
        const hasScrollAttr =
          el.hasAttribute('data-scroll') ||
          el.hasAttribute('data-scroll-speed') ||
          el.hasAttribute('data-aos') ||
          el.hasAttribute('data-w-id') ||
          el.hasAttribute('data-framer-appear-id') ||
          el.hasAttribute('data-speed');

        const hasKeyframes = s.animationName && s.animationName !== 'none';
        const has3DTransform = s.transform && s.transform.startsWith('matrix3d');

        if ((hasScrollAttr || hasKeyframes || has3DTransform) && animatedElements.length < 25) {
          const dataAttrs = Array.from(el.attributes)
            .filter((a) => a.name.startsWith('data-') && a.value.length < 80)
            .map((a) => `${a.name}="${a.value}"`)
            .join(', ');
          animatedElements.push({
            selector: getConciseSelector(el),
            animationName: hasKeyframes ? `${s.animationName} (${s.animationDuration} ${s.animationTimingFunction})` : null,
            transition: s.transition && s.transition !== 'all 0s ease 0s' ? s.transition.slice(0, 100) : null,
            transform: s.transform !== 'none' ? s.transform.slice(0, 80) : null,
            dataAttributes: dataAttrs || null
          });
        }
      });

      // 6. Section-by-Section Anatomy (Major Visual Blocks from Top to Bottom)
      const candidateSections = [];
      const topLevelBlocks = document.querySelectorAll('header, nav, main > *, body > section, body > div > section, body > main, footer');
      const blockList = topLevelBlocks.length >= 2 ? Array.from(topLevelBlocks) : Array.from(document.body.children);

      const seenBlocks = new Set();
      for (const el of blockList) {
        if (!el || seenBlocks.has(el)) continue;
        const tag = el.tagName.toLowerCase();
        if (['script', 'style', 'link', 'meta', 'noscript'].includes(tag)) continue;

        // If a wrapper div just wraps multiple sections, expand its children
        if ((tag === 'div' || tag === 'main') && el.children.length > 2 && el.getBoundingClientRect().height > window.innerHeight * 1.8) {
          Array.from(el.children).forEach((child) => {
            if (!['script', 'style', 'noscript'].includes(child.tagName.toLowerCase())) {
              seenBlocks.add(child);
            }
          });
          if (tag === 'main') continue;
        }
        seenBlocks.add(el);
      }

      for (const el of Array.from(seenBlocks)) {
        const rect = el.getBoundingClientRect();
        if (rect.height < 35 || rect.width < 100) continue;
        const s = window.getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden') continue;

        const headings = Array.from(el.querySelectorAll('h1, h2, h3'))
          .slice(0, 4)
          .map((h) => ({
            tag: h.tagName.toLowerCase(),
            text: (h.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 70)
          }))
          .filter((h) => h.text);

        const buttons = Array.from(el.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role="button"]'))
          .slice(0, 4)
          .map((b) => (b.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40))
          .filter(Boolean);

        const mediaSummary = {
          images: el.querySelectorAll('img, picture').length,
          svgs: el.querySelectorAll('svg').length,
          videos: el.querySelectorAll('video').length,
          canvases: el.querySelectorAll('canvas, spline-viewer, model-viewer').length
        };

        // Determine layout pattern description
        let layoutPattern = s.display;
        if (s.display.includes('flex')) {
          layoutPattern = `Flexbox (direction: ${s.flexDirection}, justify: ${s.justifyContent}, align: ${s.alignItems}, gap: ${s.gap || '0px'})`;
        } else if (s.display.includes('grid')) {
          layoutPattern = `CSS Grid (columns: ${s.gridTemplateColumns}, gap: ${s.gap || '0px'})`;
        } else {
          // Check first child container if this section has an inner container
          const firstChild = el.firstElementChild;
          if (firstChild) {
            const cs = window.getComputedStyle(firstChild);
            if (cs.display.includes('flex')) {
              layoutPattern = `Block container -> Inner Flexbox (${ getConciseSelector(firstChild) }, direction: ${cs.flexDirection}, justify: ${cs.justifyContent}, gap: ${cs.gap || '0px'})`;
            } else if (cs.display.includes('grid')) {
              layoutPattern = `Block container -> Inner CSS Grid (${ getConciseSelector(firstChild) }, columns: ${cs.gridTemplateColumns}, gap: ${cs.gap || '0px'})`;
            }
          }
        }

        candidateSections.push({
          selector: getConciseSelector(el),
          tag: el.tagName.toLowerCase(),
          topY: Math.round(rect.top + window.scrollY),
          dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
          viewportHeightRatio: `${(rect.height / window.innerHeight).toFixed(1)}vh`,
          position: s.position,
          background: rgbToHex(s.backgroundColor) || (s.backgroundImage !== 'none' ? s.backgroundImage.slice(0, 100) : 'transparent'),
          padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
          layoutPattern,
          headings,
          buttons,
          mediaSummary
        });
      }

      candidateSections.sort((a, b) => a.topY - b.topY);

      // 7. Hierarchical Visual DOM Blueprint Tree (ASCII + JSON Tree up to depth 5)
      function buildDomTree(node, depth = 0) {
        if (!node || depth > 5) return null;
        const tag = node.tagName ? node.tagName.toLowerCase() : '';
        if (!tag || ['script', 'style', 'noscript', 'link', 'meta', 'path', 'defs', 'clippath', 'g'].includes(tag)) return null;

        const rect = node.getBoundingClientRect();
        const s = window.getComputedStyle(node);
        if (s.display === 'none' || s.visibility === 'hidden' || (rect.width === 0 && rect.height === 0 && tag !== 'canvas')) return null;

        const selector = getConciseSelector(node);
        const layoutBadges = [];
        if (s.position === 'fixed' || s.position === 'sticky') layoutBadges.push(`pos:${s.position}`);
        if (s.display.includes('flex')) layoutBadges.push(`flex(${s.flexDirection})`);
        if (s.display.includes('grid')) layoutBadges.push('grid');
        if (tag === 'canvas' || tag === 'spline-viewer' || tag === 'model-viewer') layoutBadges.push('3D/Canvas');

        let directText = '';
        for (const child of Array.from(node.childNodes)) {
          if (child.nodeType === Node.TEXT_NODE && child.textContent.trim()) {
            directText += child.textContent.trim() + ' ';
          }
        }
        directText = directText.trim().replace(/\s+/g, ' ').slice(0, 45);

        const children = [];
        if (depth < 5 && tag !== 'svg') {
          const childElements = Array.from(node.children);
          // Limit max children per node to keep blueprint clean and readable
          for (const child of childElements.slice(0, 14)) {
            const childNode = buildDomTree(child, depth + 1);
            if (childNode) children.push(childNode);
          }
        }

        return {
          selector,
          tag,
          dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          layout: layoutBadges.join(', '),
          text: directText || null,
          children
        };
      }

      const domTree = buildDomTree(document.body, 0);

      return {
        metadata,
        techStack,
        designSystem: {
          backgroundColors: Array.from(bgColors.values()).sort((a, b) => b.score - a.score).slice(0, 12),
          textColors: Array.from(textColors.values()).sort((a, b) => b.count - a.count).slice(0, 10),
          accentColors: Array.from(accentColors.values()).sort((a, b) => b.count - a.count).slice(0, 10),
          gradients,
          glassEffects,
          fonts: Array.from(fontMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, usageCount: count })),
          typographyScale,
          cssVariables,
          mediaBreakpoints: Array.from(mediaBreakpoints)
        },
        howItWorks: {
          canvases,
          embeddedViewers,
          stickyAndFixedElements,
          animatedElements,
          keyframes: keyframesList,
          runtimeHooks: window.__SITESCRAP_HOOKS__ || { webglContexts: [], shaders: [], eventListeners: {} }
        },
        sections: candidateSections.slice(0, 25),
        domTree,
        collectedCssText
      };
    });

    onProgress('sanitize', 'HTML/CSS 소스코드를 추출하고 개인정보·민감 토큰·트래커를 안전하게 제거(Sanitize) 중...', 84);

    const rawHtml = await page.content();
    const { html: sanitizedHtml, stats: privacyStats } = sanitizeHtml(rawHtml);
    const sanitizedCss = sanitizeCss(pageAnalysis.collectedCssText, privacyStats);

    await browser.close();

    return {
      targetUrl: redactSensitiveText(targetUrl, { redactedItems: {} }),
      analyzedAt: new Date().toISOString(),
      viewport,
      screenshots,
      metadata: pageAnalysis.metadata,
      techStack: pageAnalysis.techStack,
      designSystem: pageAnalysis.designSystem,
      howItWorks: pageAnalysis.howItWorks,
      networkAssets,
      sections: pageAnalysis.sections,
      domTree: pageAnalysis.domTree,
      sanitizedHtml,
      sanitizedCss,
      privacyStats
    };
  } catch (err) {
    await browser.close();
    throw err;
  }
}

module.exports = {
  analyzeSite
};
