/**
 * Static code scanner
 * - Detects libraries / engines / loaders inside (minified, bundled) JS by stable string signatures
 * - Finds 3D model / animation / media asset paths referenced in code (even if not loaded during the visit)
 * - Extracts CSS design tokens (custom properties, keyframes, breakpoints) from raw CSS text
 */

const LIBRARY_SIGNATURES = [
  // ---------- 3D / WebGL / WebGPU ----------
  { name: 'Three.js', category: '3D / WebGL Engine', patterns: [/Multiple instances of Three\.js being imported/, /__THREE_DEVTOOLS__/, /THREE\.WebGLRenderer/] },
  { name: 'Three.js WebGPURenderer / TSL', category: '3D / WebGPU Engine', patterns: [/WebGPURenderer/, /THREE\.WebGPURenderer/, /\bNodeMaterial\b.*\btsl\b/i] },
  { name: 'React Three Fiber (@react-three/fiber)', category: '3D / React Renderer', patterns: [/@react-three\/fiber/, /\b__r3f\b/, /R3F: /] },
  { name: 'Drei (@react-three/drei)', category: '3D Helpers', patterns: [/@react-three\/drei/] },
  { name: 'Spline Runtime (@splinetool/runtime)', category: '3D / WebGL Engine', patterns: [/@splinetool\/runtime/, /prod\.spline\.design/, /\.splinecode/] },
  { name: 'Babylon.js', category: '3D / WebGL Engine', patterns: [/BABYLON\.Engine/, /babylonjs/i, /Babylon\.js v\d/] },
  { name: 'PlayCanvas', category: '3D / WebGL Engine', patterns: [/playcanvas/i] },
  { name: 'PixiJS', category: '2D WebGL Renderer', patterns: [/PixiJS \d/, /pixi\.js/i, /PIXI\.Application/] },
  { name: 'OGL', category: '3D / WebGL (minimal)', patterns: [/from ["']ogl["']/, /\bogl\b.*Renderer/] },
  { name: 'Google <model-viewer>', category: '3D Viewer', patterns: [/model-viewer/, /@google\/model-viewer/] },
  { name: 'Unicorn Studio', category: 'WebGL Shader Engine', patterns: [/unicornstudio/i, /unicorn\.studio/i] },
  { name: 'Postprocessing (EffectComposer / Bloom 등)', category: '3D Post-Processing', patterns: [/THREE\.EffectComposer/, /UnrealBloomPass/, /\bBloomEffect\b/, /EffectComposer/] },
  { name: 'Theatre.js', category: '3D Animation Sequencer', patterns: [/@theatre\/(core|studio)/] },
  { name: 'cannon-es (Physics)', category: 'Physics Engine', patterns: [/cannon-es/, /CANNON\.World/] },
  { name: 'Rapier (Physics, WASM)', category: 'Physics Engine', patterns: [/@dimforge\/rapier/, /rapier_wasm/, /RAPIER\./] },
  { name: 'Ammo.js (Physics)', category: 'Physics Engine', patterns: [/Ammo\(\)\.then/, /ammo\.wasm/] },
  { name: 'Matter.js (2D Physics)', category: 'Physics Engine', patterns: [/Matter\.Engine/, /matter-js/] },
  { name: 'p5.js', category: 'Creative Coding', patterns: [/p5\.prototype/, /p5\.js v?\d/] },
  { name: 'WebGPU API 직접 사용', category: '3D / GPU API', patterns: [/navigator\.gpu\b/, /requestAdapter\(/] },
  { name: 'OffscreenCanvas (Worker 렌더링)', category: 'Rendering Architecture', patterns: [/transferControlToOffscreen/] },

  // ---------- Animation / Scroll ----------
  { name: 'GSAP (GreenSock)', category: 'Animation Engine', patterns: [/GreenSock/, /\b_gsap\b/, /gsap\.registerPlugin/] },
  { name: 'GSAP ScrollTrigger', category: 'Scroll Interaction', patterns: [/ScrollTrigger/] },
  { name: 'GSAP ScrollSmoother', category: 'Scroll Interaction', patterns: [/ScrollSmoother/] },
  { name: 'GSAP SplitText / SplitType', category: 'Text Animation', patterns: [/SplitText/, /SplitType/, /splitting\.js/i] },
  { name: 'GSAP Flip / Draggable / MotionPath', category: 'Animation Plugins', patterns: [/MotionPathPlugin/, /\bDraggable\b.*\bgsap\b/, /\bFlip\.getState\b/] },
  { name: 'Lenis Smooth Scroll', category: 'Scroll Interaction', patterns: [/lenis-smooth/, /lenis-scrolling/, /\bLenis\b/] },
  { name: 'Locomotive Scroll', category: 'Scroll Interaction', patterns: [/locomotive-scroll/, /data-scroll-container/] },
  { name: 'Framer Motion / Motion', category: 'Animation Library', patterns: [/framer-motion/, /framerAppearId/, /data-framer-appear-id/] },
  { name: 'Motion One', category: 'Animation Library', patterns: [/@motionone/] },
  { name: 'anime.js', category: 'Animation Library', patterns: [/animejs/, /anime\.timeline/] },
  { name: 'Lottie (lottie-web / dotLottie)', category: 'Vector Motion', patterns: [/bodymovin/, /lottie-web/, /@lottiefiles/, /dotlottie/i] },
  { name: 'Rive', category: 'Interactive Motion', patterns: [/@rive-app/, /rive\.wasm/] },
  { name: 'Barba.js (페이지 전환)', category: 'Page Transition', patterns: [/@barba\/core/, /data-barba/] },
  { name: 'Swup (페이지 전환)', category: 'Page Transition', patterns: [/\bswup\b/i] },
  { name: 'Swiper', category: 'Slider / Carousel', patterns: [/swiper-wrapper/, /swiper-slide/] },
  { name: 'Embla Carousel', category: 'Slider / Carousel', patterns: [/embla/i] },
  { name: 'AOS (Animate On Scroll)', category: 'Scroll Interaction', patterns: [/data-aos/, /aos-animate/] },
  { name: 'IntersectionObserver 기반 뷰포트 진입 감지', category: 'Scroll Reveal Mechanism', patterns: [/new IntersectionObserver/] },

  // ---------- Misc ----------
  { name: 'Howler.js (오디오)', category: 'Audio', patterns: [/howler/i, /Howler\./] },
  { name: 'Tone.js (오디오)', category: 'Audio', patterns: [/Tone\.js/, /Tone\.Transport/] },
  { name: 'D3.js', category: 'Data Visualization', patterns: [/d3-selection/, /d3\.select/] },
  { name: 'Chart.js', category: 'Data Visualization', patterns: [/Chart\.js v\d/, /chartjs/i] },
  { name: 'jQuery', category: 'DOM Utility', patterns: [/jQuery v\d/, /jquery\.min\.js/i] },
  { name: 'Alpine.js', category: 'UI Library', patterns: [/x-data/, /Alpine\.start/] },
  { name: 'Svelte', category: 'UI Library', patterns: [/svelte-[a-z0-9]{6}/, /__svelte/] },
  { name: 'Vue', category: 'UI Library', patterns: [/__VUE__/, /Vue\.createApp/, /createVNode/] },
  { name: 'React', category: 'UI Library', patterns: [/react\.production\.min\.js/, /__reactFiber/, /react-dom/, /ReactCurrentDispatcher/] }
];

/** Three.js modules referenced in warnings/error strings, e.g. "THREE.GLTFLoader: ..." */
const THREE_MODULE_REGEX = /THREE\.([A-Z][A-Za-z0-9]*(?:Loader|Controls|Composer|Pass|Renderer|Exporter|Helper|Shader))\b/g;

/** 3D / animation / media asset paths referenced in code */
const ASSET_REF_REGEX = /["'`]((?:https?:)?\/{0,2}[^"'`\s<>(){}]{0,300}?\.(?:glb|gltf|splinecode|hdr|exr|fbx|usdz|riv|lottie|ktx2|drc|basis|mp4|webm|mp3|ogg|wav))(?:\?[^"'`\s]*)?["'`]/gi;

function scanCodeSignatures(text, fileLabel, found, threeModules, assetRefs) {
  if (!text || typeof text !== 'string') return;
  // Large bundles: scan full text but cap to 25MB for safety
  const src = text.length > 25000000 ? text.slice(0, 25000000) : text;

  for (const lib of LIBRARY_SIGNATURES) {
    for (const p of lib.patterns) {
      const m = src.match(p);
      if (m) {
        const entry = found.get(lib.name) || { name: lib.name, category: lib.category, evidence: m[0].slice(0, 80), files: [] };
        if (entry.files.length < 5 && !entry.files.includes(fileLabel)) entry.files.push(fileLabel);
        found.set(lib.name, entry);
        break;
      }
    }
  }

  // Three.js revision from bundle (`REVISION = "160"` survives as a string constant near the warning)
  if (found.has('Three.js') && !found.get('Three.js').revision) {
    const rev = src.match(/__THREE__\s*=\s*["'](\d{3})|REVISION\s*=\s*["'](\d{3})|["'](1[0-9]{2})(?:dev)?["']\s*[,;)][^]{0,400}?Multiple instances of Three\.js/);
    if (rev) found.get('Three.js').revision = rev[1] || rev[2] || rev[3];
  }

  let m;
  THREE_MODULE_REGEX.lastIndex = 0;
  while ((m = THREE_MODULE_REGEX.exec(src)) !== null) {
    threeModules.add(m[1]);
    if (threeModules.size > 60) break;
  }

  ASSET_REF_REGEX.lastIndex = 0;
  let count = 0;
  while ((m = ASSET_REF_REGEX.exec(src)) !== null && count < 300) {
    count++;
    const ref = m[1];
    if (ref.length < 5 || /\$\{|\+/.test(ref)) continue;
    if (!assetRefs.has(ref)) assetRefs.set(ref, fileLabel);
  }
}

/**
 * Resolves raw code-referenced asset paths into absolute URLs and classifies by extension
 */
function resolveAssetRefs(assetRefs, baseUrl) {
  const out = [];
  for (const [ref, fileLabel] of assetRefs.entries()) {
    let abs = ref;
    try {
      abs = new URL(ref, baseUrl).href;
    } catch (e) {}
    const ext = (ref.split('?')[0].match(/\.([a-z0-9]+)$/i) || [])[1] || '';
    const lower = ext.toLowerCase();
    let kind = 'Media';
    if (['glb', 'gltf', 'fbx', 'usdz', 'drc', 'splinecode'].includes(lower)) kind = '3D Model';
    else if (['hdr', 'exr'].includes(lower)) kind = 'HDRI Environment';
    else if (['ktx2', 'basis'].includes(lower)) kind = 'GPU Texture';
    else if (['riv', 'lottie'].includes(lower)) kind = 'Motion Asset';
    else if (['mp4', 'webm'].includes(lower)) kind = 'Video';
    else if (['mp3', 'ogg', 'wav'].includes(lower)) kind = 'Audio';
    out.push({ kind, ext: '.' + lower, path: ref, resolvedUrl: abs, foundIn: fileLabel });
  }
  const order = ['3D Model', 'HDRI Environment', 'GPU Texture', 'Motion Asset', 'Video', 'Audio', 'Media'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind)).slice(0, 150);
}

/**
 * Extracts design tokens from raw CSS text (works for cross-origin stylesheets that cssRules cannot read)
 */
function extractCssTokens(cssText) {
  const result = { variables: [], keyframes: [], breakpoints: [], fontFaces: [], hoverRules: [] };
  if (!cssText) return result;

  // Custom properties declared on :root / html / body / theme selectors
  const blockRe = /(^|})\s*([^{}@]*(?::root|html|body|\[data-theme[^\]]*\]|\.dark|\.light|\[data-mode[^\]]*\])[^{}]*)\{([^{}]*)\}/g;
  const seen = new Set();
  let m;
  while ((m = blockRe.exec(cssText)) !== null && result.variables.length < 120) {
    const selector = m[2].trim().slice(0, 80);
    const body = m[3];
    const varRe = /(--[\w-]+)\s*:\s*([^;]+);?/g;
    let v;
    while ((v = varRe.exec(body)) !== null) {
      const name = v[1];
      const value = v[2].trim();
      if (name.startsWith('--tw-') || value.length > 140) continue;
      const key = selector + '|' + name;
      if (seen.has(key)) continue;
      seen.add(key);
      result.variables.push({ name, value, selector });
      if (result.variables.length >= 120) break;
    }
  }

  // @keyframes with a compact body snippet
  const kfRe = /@(?:-webkit-)?keyframes\s+([\w-]+)\s*\{/g;
  const kfSeen = new Set();
  while ((m = kfRe.exec(cssText)) !== null && result.keyframes.length < 40) {
    const name = m[1];
    if (kfSeen.has(name)) continue;
    kfSeen.add(name);
    let depth = 1;
    let i = kfRe.lastIndex;
    const start = m.index;
    while (i < cssText.length && depth > 0 && i - start < 3000) {
      if (cssText[i] === '{') depth++;
      else if (cssText[i] === '}') depth--;
      i++;
    }
    result.keyframes.push({ name, cssText: cssText.slice(start, i).replace(/\s+/g, ' ').slice(0, 350) });
  }

  // Breakpoints
  const bpSet = new Set();
  const bpRe = /\((?:max|min)-width\s*:\s*[\d.]+(?:px|em|rem)\)/g;
  while ((m = bpRe.exec(cssText)) !== null && bpSet.size < 30) {
    bpSet.add(m[0].replace(/\s+/g, ''));
  }
  result.breakpoints = Array.from(bpSet);

  // @font-face declarations
  const ffRe = /@font-face\s*\{([^{}]+)\}/gi;
  const ffSeen = new Set();
  while ((m = ffRe.exec(cssText)) !== null && result.fontFaces.length < 25) {
    const body = m[1];
    const fam = (body.match(/font-family\s*:\s*([^;]+)/i) || [])[1];
    const weight = (body.match(/font-weight\s*:\s*([^;]+)/i) || [])[1] || 'normal';
    const style = (body.match(/font-style\s*:\s*([^;]+)/i) || [])[1] || 'normal';
    const urlMatch = body.match(/url\(\s*["']?([^"')]+)["']?\s*\)/i);
    if (fam) {
      const cleanFam = fam.replace(/["']/g, '').trim();
      const key = `${cleanFam}|${weight.trim()}|${style.trim()}`;
      if (!ffSeen.has(key)) {
        ffSeen.add(key);
        result.fontFaces.push({
          family: cleanFam,
          weight: weight.trim(),
          style: style.trim(),
          srcUrl: urlMatch ? urlMatch[1] : null,
          rawCss: `@font-face { ${body.replace(/\s+/g, ' ').trim()} }`
        });
      }
    }
  }

  // :hover rules (for 1:1 interactive state reproduction)
  const hoverRe = /(^|\})\s*([^{}@\n]{1,120}:hover[^{}@\n]{0,60})\{([^{}]{3,320})\}/g;
  const hoverSeen = new Set();
  while ((m = hoverRe.exec(cssText)) !== null && result.hoverRules.length < 40) {
    const sel = m[2].replace(/\s+/g, ' ').trim();
    const props = m[3].replace(/\s+/g, ' ').trim();
    if (!hoverSeen.has(sel) && !sel.startsWith(':') && props.length > 4) {
      hoverSeen.add(sel);
      result.hoverRules.push({ selector: sel, declarations: props });
    }
  }

  return result;
}

module.exports = {
  scanCodeSignatures,
  resolveAssetRefs,
  extractCssTokens
};
