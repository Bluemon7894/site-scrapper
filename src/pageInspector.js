/**
 * In-page inspector.
 * This function is serialized and executed inside the target page via page.evaluate().
 * It must be fully self-contained (no closures over Node-side variables).
 */
function inspectPage() {
  // ---------------------------------------------------------------------------
  // Helpers
  // ---------------------------------------------------------------------------
  function rgbToHex(rgbStr) {
    if (!rgbStr || rgbStr === 'transparent' || rgbStr === 'rgba(0, 0, 0, 0)') return null;
    const m = rgbStr.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*([\d.]+))?\s*\)/i);
    if (!m) return rgbStr.length < 60 ? rgbStr : null;
    const r = parseInt(m[1], 10);
    const g = parseInt(m[2], 10);
    const b = parseInt(m[3], 10);
    const a = m[4] !== undefined ? parseFloat(m[4]) : 1;
    if (a < 0.05) return null;
    const hex = '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('').toUpperCase();
    return a < 0.98 ? `${hex} (alpha: ${Math.round(a * 100)}%)` : hex;
  }

  function isHashedClass(c) {
    // CSS-modules / styled-components / emotion hashes (e.g. sc-KOGVz, css-1x2y3z, jaIwvI)
    return /^(sc-|css-|jsx-|svelte-|emotion-)/.test(c) || /^[a-z0-9_-]{20,}$/i.test(c) || /^[a-zA-Z]{5,7}$/.test(c) && /[A-Z]/.test(c.slice(1)) && /[a-z]/.test(c);
  }

  function getConciseSelector(el) {
    if (!el || !el.tagName) return '';
    const tag = el.tagName.toLowerCase();
    const id = el.id && typeof el.id === 'string' && el.id.length < 35 ? `#${el.id}` : '';
    let cls = '';
    const rawCls = typeof el.className === 'string' ? el.className : el.getAttribute && el.getAttribute('class');
    if (rawCls) {
      const uniq = Array.from(new Set(rawCls.trim().split(/\s+/)));
      const valid = uniq.filter((c) => c && c.length < 40 && !isHashedClass(c)).slice(0, 3);
      if (valid.length > 0) cls = '.' + valid.join('.');
    }
    const role = !id && !cls && el.getAttribute && el.getAttribute('role') ? `[role="${el.getAttribute('role')}"]` : '';
    return `${tag}${id}${cls}${role}`;
  }

  function isVisible(el, minW = 1, minH = 1) {
    const r = el.getBoundingClientRect();
    if (r.width < minW || r.height < minH) return false;
    const s = window.getComputedStyle(el);
    return !(s.display === 'none' || s.visibility === 'hidden');
  }

  function cleanText(str, max) {
    return (str || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function stripQuery(href) {
    if (!href) return '';
    try {
      const u = new URL(href, location.href);
      return u.origin === location.origin ? u.pathname + (u.hash && u.hash.length < 30 ? u.hash : '') : u.origin + u.pathname;
    } catch (e) {
      return href.split('?')[0];
    }
  }

  const SKIP_TAGS = ['script', 'style', 'link', 'meta', 'noscript', 'template', 'br'];
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const scrollY0 = window.scrollY;

  // ---------------------------------------------------------------------------
  // 1. Metadata
  // ---------------------------------------------------------------------------
  const getMeta = (name) => {
    const el = document.querySelector(`meta[name="${name}"], meta[property="${name}"]`);
    return el ? el.getAttribute('content') || '' : '';
  };

  const bodyStyle = window.getComputedStyle(document.body);
  const htmlStyle = window.getComputedStyle(document.documentElement);
  const pageBg = rgbToHex(bodyStyle.backgroundColor) || rgbToHex(htmlStyle.backgroundColor) || '#FFFFFF';

  let isDarkTheme = false;
  const bgSrc = rgbToHex(bodyStyle.backgroundColor) ? bodyStyle.backgroundColor : htmlStyle.backgroundColor;
  const bgMatch = (bgSrc || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (bgMatch) {
    const lum = 0.299 * +bgMatch[1] + 0.587 * +bgMatch[2] + 0.114 * +bgMatch[3];
    if (lum < 110) isDarkTheme = true;
  }

  const metadata = {
    title: document.title || '',
    description: getMeta('description') || getMeta('og:description'),
    ogTitle: getMeta('og:title'),
    ogImage: stripQuery(getMeta('og:image')),
    themeColor: getMeta('theme-color'),
    generator: getMeta('generator'),
    lang: document.documentElement.lang || '',
    finalUrl: location.origin + location.pathname,
    viewportWidth: vw,
    viewportHeight: vh,
    scrollHeight: Math.max(document.body.scrollHeight, document.documentElement.scrollHeight),
    pageBackground: pageBg,
    themeMode: isDarkTheme ? 'Dark Mode (다크 테마 중심)' : 'Light Mode (라이트 테마 중심)'
  };

  // ---------------------------------------------------------------------------
  // 2. Runtime tech detection (globals + DOM markers)
  // ---------------------------------------------------------------------------
  const techStack = [];
  const addTech = (name, category, reason) => {
    if (!techStack.some((t) => t.name === name)) techStack.push({ name, category, reason });
  };

  const scriptSrcs = Array.from(document.querySelectorAll('script[src]')).map((s) => s.src.toLowerCase());
  const allEls = Array.from(document.querySelectorAll('body *'));
  const sampleEls = allEls.slice(0, 1500);

  const hasReactFiber = (() => {
    const probe = [document.getElementById('__next'), document.getElementById('root'), document.getElementById('app'), document.body.firstElementChild, ...sampleEls.slice(0, 200)];
    return probe.some((el) => el && Object.keys(el).some((k) => k.startsWith('__reactFiber$') || k.startsWith('__reactContainer$') || k.startsWith('__reactProps$')));
  })();

  if (window.__NEXT_DATA__ || document.getElementById('__NEXT_DATA__')) {
    addTech('Next.js (Pages Router)', 'Frontend Framework', '__NEXT_DATA__ 감지');
  } else if (window.__next_f || scriptSrcs.some((s) => s.includes('/_next/'))) {
    addTech('Next.js (App Router / RSC)', 'Frontend Framework', '/_next/static 번들 및 self.__next_f(RSC) 감지');
  }
  if (hasReactFiber || window.React) addTech('React', 'UI Library', 'DOM 노드에 React Fiber 마운트 감지');
  if (window.__NUXT__ || window.useNuxtApp || scriptSrcs.some((s) => s.includes('/_nuxt/'))) addTech('Nuxt (Vue)', 'Frontend Framework', '/_nuxt/ 번들 또는 __NUXT__ 감지');
  if (window.__VUE__ || document.querySelector('[data-v-app]') || sampleEls.slice(0, 200).some((el) => el.__vue__ || el.__vueParentComponent || Array.from(el.attributes).some((a) => a.name.startsWith('data-v-')))) {
    addTech('Vue.js', 'UI Library', 'Vue 런타임 또는 data-v-* 스코프 속성 감지');
  }
  if (sampleEls.slice(0, 300).some((el) => typeof el.className === 'string' && /\bsvelte-[a-z0-9]+\b/.test(el.className))) addTech('Svelte / SvelteKit', 'UI Library', 'svelte-* 스코프 클래스 감지');
  if (document.querySelector('astro-island, [data-astro-cid], [data-astro-source-file]') || sampleEls.slice(0, 300).some((el) => Array.from(el.attributes).some((a) => a.name.startsWith('data-astro-cid')))) addTech('Astro', 'Frontend Framework', 'astro-island / data-astro-cid 감지');
  if (window.__remixContext) addTech('Remix / React Router', 'Frontend Framework', '__remixContext 감지');
  if (window.ng || document.querySelector('[ng-version]')) addTech('Angular', 'Frontend Framework', 'ng-version 속성 감지');
  if (window.jQuery) addTech(`jQuery ${window.jQuery.fn && window.jQuery.fn.jquery ? window.jQuery.fn.jquery : ''}`.trim(), 'DOM Utility', 'window.jQuery 감지');
  if (document.documentElement.hasAttribute('data-wf-site') || document.documentElement.hasAttribute('data-wf-page')) addTech('Webflow', 'Visual Web Platform', 'data-wf-site / data-wf-page 감지');
  if (document.querySelector('[data-framer-name], [data-framer-component-type], [data-framer-appear-id]')) addTech('Framer (사이트 빌더)', 'Visual Web & Motion Platform', 'data-framer-* 속성 감지');
  if (window.Shopify) addTech('Shopify', 'E-commerce Platform', 'window.Shopify 감지');
  if (document.querySelector('link[href*="wp-content"], script[src*="wp-content"]')) addTech('WordPress', 'CMS', 'wp-content 리소스 감지');
  if (window.Wix || document.querySelector('meta[name="generator"][content*="Wix"]')) addTech('Wix', 'Website Builder', 'Wix 런타임/메타 감지');
  if (document.querySelector('meta[name="generator"][content*="Squarespace"]')) addTech('Squarespace', 'Website Builder', 'generator 메타 감지');

  if (window.__THREE__ || window.THREE) addTech(`Three.js${window.__THREE__ ? ` (r${window.__THREE__})` : ''}`, '3D / WebGL Engine', 'window.__THREE__ 런타임 리비전 감지');
  if (document.querySelector('spline-viewer')) addTech('Spline Viewer (<spline-viewer>)', '3D / WebGL Engine', '<spline-viewer> 웹 컴포넌트 감지');
  if (document.querySelector('model-viewer')) addTech('Google <model-viewer>', '3D Viewer', '<model-viewer> 웹 컴포넌트 감지');
  if (window.BABYLON) addTech('Babylon.js', '3D / WebGL Engine', 'window.BABYLON 감지');
  if (window.PIXI) addTech('PixiJS', '2D WebGL Renderer', 'window.PIXI 감지');
  if (document.querySelector('[data-us-project]')) addTech('Unicorn Studio', 'WebGL Shader Engine', 'data-us-project 감지');

  if (window.gsap) addTech(`GSAP${window.gsap.version ? ' ' + window.gsap.version : ''}`, 'Animation Engine', 'window.gsap 감지');
  if (window.ScrollTrigger || document.querySelector('.pin-spacer')) addTech('GSAP ScrollTrigger', 'Scroll Interaction', 'ScrollTrigger 또는 .pin-spacer(섹션 고정) 감지');
  if (window.Lenis || window.lenis || document.documentElement.classList.contains('lenis')) addTech('Lenis Smooth Scroll', 'Scroll Interaction', 'html.lenis 클래스 또는 Lenis 인스턴스 감지');
  if (document.querySelector('[data-scroll-container], [data-scroll-section]')) addTech('Locomotive Scroll', 'Scroll Interaction', 'data-scroll-container 감지');
  if (document.querySelector('[data-aos]')) addTech('AOS (Animate On Scroll)', 'Scroll Interaction', 'data-aos 속성 감지');
  if (document.querySelector('.swiper, .swiper-container, swiper-container') || window.Swiper) addTech('Swiper.js', 'Slider / Carousel', '.swiper 컴포넌트 감지');
  if (window.lottie || window.bodymovin || document.querySelector('lottie-player, dotlottie-player, dotlottie-wc')) addTech('Lottie', 'Vector Motion', 'Lottie 플레이어 감지');
  if (document.querySelector('[data-barba]')) addTech('Barba.js', 'Page Transition', 'data-barba 감지');

  const classSample = sampleEls.slice(0, 400).map((el) => (typeof el.className === 'string' ? el.className : '')).join(' ');
  if (/(^|\s)(flex|grid|items-center|justify-between|px-\d+|py-\d+|text-\[[^\]]+\]|bg-\[[^\]]+\]|md:[\w-]+|lg:[\w-]+)(\s|$)/.test(classSample)) addTech('Tailwind CSS', 'Styling System', '유틸리티 클래스(flex, px-*, md:* 등) 감지');
  if (document.querySelector('style[data-styled], style[data-styled-version]')) addTech('styled-components', 'Styling System', 'style[data-styled] 감지');
  if (document.querySelector('style[data-emotion]')) addTech('Emotion', 'Styling System', 'style[data-emotion] 감지');
  if (/(^|\s)[A-Za-z0-9-]+_[a-zA-Z]+__[A-Za-z0-9_-]{5}/.test(classSample) || /(^|\s)[A-Za-z0-9]{6}_[a-zA-Z]+/.test(classSample)) addTech('CSS Modules (해시 클래스)', 'Styling System', '컴포넌트명_해시 형태 클래스 감지');

  // ---------------------------------------------------------------------------
  // 3. Design system: colors, gradients, glass, fonts, typography, radius, shadows
  // ---------------------------------------------------------------------------
  const bgColors = new Map();
  const textColors = new Map();
  const accentColors = new Map();
  const borderColors = new Map();
  const gradients = [];
  const glassEffects = [];
  const fontMap = new Map();
  const radiusMap = new Map();
  const shadowMap = new Map();
  const spacingMap = new Map();

  const designEls = allEls.slice(0, 2500);
  for (const el of designEls) {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.includes(tag) || el.closest('svg') && tag !== 'svg') continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') continue;

    const areaWeight = Math.min(Math.round((rect.width * rect.height) / 10000) + 1, 60);
    const sel = getConciseSelector(el);

    const bgHex = rgbToHex(style.backgroundColor);
    if (bgHex) {
      const prev = bgColors.get(bgHex) || { hex: bgHex, rgb: style.backgroundColor, score: 0, examples: [] };
      prev.score += areaWeight;
      if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
      bgColors.set(bgHex, prev);
    }

    if (style.backgroundImage && style.backgroundImage.includes('gradient(') && gradients.length < 12) {
      const grad = style.backgroundImage.slice(0, 260);
      if (!gradients.some((g) => g.value === grad)) gradients.push({ selector: sel, value: grad });
    }

    const backdrop = style.backdropFilter || style.webkitBackdropFilter;
    if (backdrop && backdrop !== 'none' && glassEffects.length < 10 && !glassEffects.some((g) => g.selector === sel)) {
      glassEffects.push({ selector: sel, backdropFilter: backdrop, background: style.backgroundColor, border: style.border });
    }

    const hasOwnText = Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim().length > 0);
    if (hasOwnText) {
      const txtHex = rgbToHex(style.color);
      if (txtHex) {
        const prev = textColors.get(txtHex) || { hex: txtHex, rgb: style.color, count: 0, examples: [] };
        prev.count += 1;
        if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
        textColors.set(txtHex, prev);
      }
      const primaryFont = (style.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
      if (primaryFont) fontMap.set(primaryFont, (fontMap.get(primaryFont) || 0) + 1);
    }

    if (tag === 'button' || tag === 'a' || el.getAttribute('role') === 'button' || /btn|button|cta|badge|chip|tag/i.test(sel)) {
      const btnBg = rgbToHex(style.backgroundColor);
      if (btnBg && btnBg !== pageBg) {
        const prev = accentColors.get(btnBg) || { hex: btnBg, role: 'Button / CTA Background', count: 0, examples: [] };
        prev.count += 1;
        if (prev.examples.length < 3 && !prev.examples.includes(sel)) prev.examples.push(sel);
        accentColors.set(btnBg, prev);
      }
    }

    if (style.borderTopWidth !== '0px' && style.borderTopStyle !== 'none') {
      const bc = rgbToHex(style.borderTopColor);
      if (bc) borderColors.set(bc, (borderColors.get(bc) || 0) + 1);
    }

    if (style.borderRadius && style.borderRadius !== '0px') radiusMap.set(style.borderRadius, (radiusMap.get(style.borderRadius) || 0) + 1);
    if (style.boxShadow && style.boxShadow !== 'none') shadowMap.set(style.boxShadow.slice(0, 160), (shadowMap.get(style.boxShadow.slice(0, 160)) || 0) + 1);
    if (style.gap && style.gap !== 'normal' && style.gap !== '0px') spacingMap.set(style.gap, (spacingMap.get(style.gap) || 0) + 1);
  }

  const typoTargets = [
    { role: 'Hero / Main Heading (H1)', query: 'h1' },
    { role: 'Section Heading (H2)', query: 'h2' },
    { role: 'Sub Heading (H3)', query: 'h3' },
    { role: 'Card / Feature Title (H4)', query: 'h4' },
    { role: 'Body Paragraph (P)', query: 'p' },
    { role: 'Primary Button / CTA', query: 'button, a[class*="btn"], a[class*="button"], [class*="cta"], [role="button"]' },
    { role: 'Navigation Link', query: 'nav a, header a' },
    { role: 'Small / Caption', query: 'small, figcaption, [class*="caption"], [class*="label"]' }
  ];

  const typographyScale = [];
  for (const t of typoTargets) {
    const el = Array.from(document.querySelectorAll(t.query)).find((e) => isVisible(e, 4, 4) && cleanText(e.textContent, 5));
    if (!el) continue;
    const s = window.getComputedStyle(el);
    typographyScale.push({
      role: t.role,
      selector: getConciseSelector(el),
      fontFamily: s.fontFamily,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      lineHeight: s.lineHeight,
      letterSpacing: s.letterSpacing,
      textTransform: s.textTransform,
      color: rgbToHex(s.color) || s.color,
      sampleText: cleanText(el.textContent, 50)
    });
  }

  // Buttons look & feel (first 4 distinct)
  const buttonStyles = [];
  for (const b of Array.from(document.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role="button"]'))) {
    if (buttonStyles.length >= 4) break;
    if (!isVisible(b, 30, 16)) continue;
    const s = window.getComputedStyle(b);
    const key = `${s.backgroundColor}|${s.borderRadius}|${s.padding}`;
    if (buttonStyles.some((x) => x.key === key)) continue;
    buttonStyles.push({
      key,
      selector: getConciseSelector(b),
      text: cleanText(b.textContent, 30),
      background: rgbToHex(s.backgroundColor) || s.backgroundImage.slice(0, 80),
      color: rgbToHex(s.color),
      borderRadius: s.borderRadius,
      padding: s.padding,
      border: s.border,
      fontSize: s.fontSize,
      fontWeight: s.fontWeight,
      transition: s.transition && s.transition !== 'all 0s ease 0s' ? s.transition.slice(0, 100) : null
    });
  }

  // CSS variables / keyframes / breakpoints from same-origin stylesheets (cross-origin handled Node-side)
  const cssVariables = [];
  const keyframesList = [];
  const mediaBreakpoints = new Set();
  const inlineStyleTexts = [];

  for (const sheet of Array.from(document.styleSheets)) {
    let rules;
    try {
      rules = sheet.cssRules;
    } catch (e) {
      continue;
    }
    if (!rules) continue;
    for (const rule of Array.from(rules)) {
      if (rule.type === CSSRule.STYLE_RULE && /(:root|^html|^body|\[data-theme|\.dark|\.light)/i.test(rule.selectorText || '')) {
        const st = rule.style;
        for (let i = 0; i < st.length; i++) {
          const prop = st[i];
          if (prop.startsWith('--') && !prop.startsWith('--tw-')) {
            const val = st.getPropertyValue(prop).trim();
            if (val && val.length < 140 && cssVariables.length < 120 && !cssVariables.some((v) => v.name === prop && v.selector === rule.selectorText)) {
              cssVariables.push({ name: prop, value: val, selector: rule.selectorText.slice(0, 80) });
            }
          }
        }
      }
      if (rule.type === CSSRule.KEYFRAMES_RULE && keyframesList.length < 40 && !keyframesList.some((k) => k.name === rule.name)) {
        keyframesList.push({ name: rule.name, cssText: rule.cssText.replace(/\s+/g, ' ').slice(0, 350) });
      }
      if (rule.type === CSSRule.MEDIA_RULE && rule.conditionText) {
        const m = rule.conditionText.match(/\((?:max|min)-width:\s*[\d.]+(?:px|rem|em)\)/g);
        if (m) m.forEach((bp) => mediaBreakpoints.add(bp.replace(/\s+/g, '')));
      }
    }
  }

  // Inline <style> tags (styled-components, emotion, Framer, Webflow embeds...) — CSS-in-JS often uses insertRule, so read rules too
  document.querySelectorAll('style').forEach((st, idx) => {
    let txt = st.textContent || '';
    if (txt.trim().length < 20 && st.sheet) {
      try {
        txt = Array.from(st.sheet.cssRules).map((r) => r.cssText).join('\n');
      } catch (e) {}
    }
    if (txt.trim()) inlineStyleTexts.push({ label: `inline <style> #${idx + 1}${st.getAttribute('data-styled') !== null ? ' (styled-components)' : st.getAttribute('data-emotion') ? ' (emotion)' : ''}`, text: txt.slice(0, 400000) });
  });

  // ---------------------------------------------------------------------------
  // 4. 3D / Canvas / embeds
  // ---------------------------------------------------------------------------
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c, idx) => {
    const rect = c.getBoundingClientRect();
    const s = window.getComputedStyle(c);
    const contextType = c.getAttribute('data-sitescrap-context') || null;
    let webglRenderer = null;
    // Only probe canvases that already own a WebGL context (probing a fresh canvas would create one)
    if (contextType && contextType.includes('webgl')) {
      try {
        const gl = c.getContext(contextType);
        const dbg = gl && gl.getExtension('WEBGL_debug_renderer_info');
        if (dbg) webglRenderer = gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL);
      } catch (e) {}
    }
    const isFullViewport = rect.width >= vw * 0.85 && rect.height >= vh * 0.7;
    const parent = c.parentElement;
    return {
      index: idx + 1,
      selector: getConciseSelector(c),
      parentSelector: parent ? getConciseSelector(parent) : 'body',
      ancestorPath: (() => {
        const path = [];
        let p = c.parentElement;
        while (p && p !== document.body && path.length < 4) {
          path.unshift(getConciseSelector(p));
          p = p.parentElement;
        }
        return path.join(' > ');
      })(),
      contextType: contextType || '(컨텍스트 미생성 / 비활성)',
      engineAttr: c.getAttribute('data-engine') || null,
      dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px (internal: ${c.width}x${c.height}, DPR≈${rect.width ? (c.width / rect.width).toFixed(2) : '?'})`,
      position: s.position,
      zIndex: s.zIndex,
      pointerEvents: s.pointerEvents,
      topY: Math.round(rect.top + scrollY0),
      roleDescription:
        (s.position === 'fixed' || (parent && window.getComputedStyle(parent).position === 'fixed')) && isFullViewport
          ? '전체 화면 고정(Fixed) 배경 캔버스 — 스크롤과 무관하게 뒤에서 상시 렌더링, 스크롤 진행도에 따라 카메라/씬이 변하는 구조일 가능성 높음'
          : isFullViewport
            ? '히어로/섹션 전체를 채우는 풀스크린 인터랙티브 캔버스'
            : rect.width < 2 || rect.height < 2
              ? '화면에 보이지 않는 오프스크린/보조 캔버스 (텍스처 생성, 측정용 등)'
              : '특정 섹션/컴포넌트 내부에 배치된 인라인 캔버스',
      webglRenderer
    };
  });

  const embeddedViewers = [];
  document.querySelectorAll('spline-viewer, model-viewer, lottie-player, dotlottie-player, dotlottie-wc, rive-canvas, iframe, video').forEach((el) => {
    const tag = el.tagName.toLowerCase();
    const rect = el.getBoundingClientRect();
    if (rect.width < 20 && rect.height < 20 && !['spline-viewer', 'model-viewer'].includes(tag)) return;
    const src = el.getAttribute('url') || el.getAttribute('src') || el.currentSrc || (el.querySelector('source') ? el.querySelector('source').src : '') || '';
    if (tag === 'iframe' && (!src || /googletagmanager|doubleclick|facebook\.com\/tr|hotjar|recaptcha/i.test(src))) return;
    embeddedViewers.push({
      tag: `<${tag}>`,
      selector: getConciseSelector(el),
      sourceUrl: stripQuery(src),
      dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
      attributes: Array.from(el.attributes)
        .filter((a) => !['class', 'style', 'src', 'url'].includes(a.name) && a.value.length < 120)
        .map((a) => (a.value ? `${a.name}="${a.value}"` : a.name))
        .join(' ')
    });
  });
  embeddedViewers.splice(25);

  // ---------------------------------------------------------------------------
  // 5. How it works: sticky/fixed, scroll attributes, CSS animations, hover transitions
  // ---------------------------------------------------------------------------
  const stickyAndFixedElements = [];
  const animatedElements = [];
  const scrollSnap = [];

  for (const el of allEls.slice(0, 6000)) {
    const tag = el.tagName.toLowerCase();
    if (SKIP_TAGS.includes(tag)) continue;
    const s = window.getComputedStyle(el);
    if (s.display === 'none') continue;
    const rect = el.getBoundingClientRect();

    if ((s.position === 'sticky' || s.position === 'fixed') && stickyAndFixedElements.length < 20 && rect.width > 0 && rect.height > 0) {
      const parent = el.parentElement;
      const parentHeight = parent ? Math.round(parent.getBoundingClientRect().height) : 0;
      const isTrack = s.position === 'sticky' && parentHeight > vh * 1.4;
      stickyAndFixedElements.push({
        selector: getConciseSelector(el),
        position: s.position,
        top: s.top,
        zIndex: s.zIndex,
        dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
        parentSelector: parent ? getConciseSelector(parent) : '',
        parentTrackHeight: `${parentHeight}px (${(parentHeight / vh).toFixed(1)}vh)`,
        mechanism: isTrack
          ? `스크롤리텔링 고정 섹션: 부모 트랙(${(parentHeight / vh).toFixed(1)}vh)을 스크롤하는 동안 이 요소가 화면에 고정(sticky)되고, 내부 콘텐츠/3D가 스크롤 진행도에 따라 변하는 구조`
          : s.position === 'fixed'
            ? rect.height >= vh * 0.8
              ? '뷰포트 전체를 덮는 고정 배경/오버레이 레이어'
              : rect.top < 10
                ? '상단 고정 헤더/네비게이션 바'
                : '플로팅 UI (고정 버튼, 커서, 배너 등)'
            : '스크롤 시 특정 위치에 달라붙는 Sticky 요소'
      });
    }

    if (s.scrollSnapType && s.scrollSnapType !== 'none' && scrollSnap.length < 5) {
      scrollSnap.push({ selector: getConciseSelector(el), scrollSnapType: s.scrollSnapType });
    }

    const scrollAttrs = Array.from(el.attributes).filter((a) => /^data-(scroll|aos|speed|lag|w-id|framer-appear|animate|anim|parallax|reveal|gsap|splitting|lenis)/.test(a.name));
    const hasKeyframes = s.animationName && s.animationName !== 'none';
    const has3DTransform = s.transform && s.transform.startsWith('matrix3d');
    const hasWillChange = s.willChange && s.willChange !== 'auto';

    if ((scrollAttrs.length || hasKeyframes || has3DTransform || hasWillChange) && animatedElements.length < 30 && rect.width > 0) {
      animatedElements.push({
        selector: getConciseSelector(el),
        animationName: hasKeyframes ? `${s.animationName} (${s.animationDuration} ${s.animationTimingFunction} ${s.animationIterationCount === 'infinite' ? 'infinite' : ''})`.trim() : null,
        transition: s.transition && s.transition !== 'all 0s ease 0s' && !s.transition.startsWith('all 0s') ? s.transition.slice(0, 110) : null,
        transform: s.transform !== 'none' ? s.transform.slice(0, 80) : null,
        willChange: hasWillChange ? s.willChange : null,
        dataAttributes: scrollAttrs.length ? scrollAttrs.map((a) => `${a.name}="${a.value.slice(0, 60)}"`).join(', ') : null
      });
    }
  }

  // ---------------------------------------------------------------------------
  // 6. Site structure: navigation, internal pages, forms, key images
  // ---------------------------------------------------------------------------
  const navigation = [];
  const navSeen = new Set();
  document.querySelectorAll('header a, nav a, [role="navigation"] a').forEach((a) => {
    if (navigation.length >= 40) return;
    const text = cleanText(a.textContent || a.getAttribute('aria-label') || '', 40);
    const href = stripQuery(a.getAttribute('href') || '');
    const key = text + '|' + href;
    if (!text && !href) return;
    if (navSeen.has(key)) return;
    navSeen.add(key);
    navigation.push({ text: text || '(아이콘 링크)', href, inHeader: !!a.closest('header') });
  });

  const internalPaths = new Map();
  const externalDomains = new Map();
  document.querySelectorAll('a[href]').forEach((a) => {
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('#') || /^(mailto|tel|javascript):/i.test(raw)) return;
    try {
      const u = new URL(raw, location.href);
      if (u.origin === location.origin) {
        const p = u.pathname;
        if (!internalPaths.has(p)) internalPaths.set(p, cleanText(a.textContent, 40));
      } else {
        externalDomains.set(u.hostname, (externalDomains.get(u.hostname) || 0) + 1);
      }
    } catch (e) {}
  });

  const forms = Array.from(document.querySelectorAll('form'))
    .slice(0, 6)
    .map((f) => ({
      selector: getConciseSelector(f),
      method: (f.getAttribute('method') || 'GET').toUpperCase(),
      action: stripQuery(f.getAttribute('action') || ''),
      fields: Array.from(f.querySelectorAll('input, textarea, select'))
        .filter((i) => i.type !== 'hidden')
        .slice(0, 10)
        .map((i) => `${i.tagName.toLowerCase()}[type=${i.type || 'text'}]${i.placeholder ? ` "${i.placeholder.slice(0, 30)}"` : ''}`)
    }));

  const images = Array.from(document.querySelectorAll('img'))
    .map((img) => {
      const r = img.getBoundingClientRect();
      return { img, area: r.width * r.height, r };
    })
    .filter((x) => x.area > 6000)
    .sort((a, b) => b.area - a.area)
    .slice(0, 15)
    .map(({ img, r }) => ({
      src: stripQuery(img.currentSrc || img.src),
      alt: cleanText(img.alt, 60),
      displayed: `${Math.round(r.width)}x${Math.round(r.height)}`,
      natural: `${img.naturalWidth}x${img.naturalHeight}`,
      objectFit: window.getComputedStyle(img).objectFit,
      topY: Math.round(r.top + scrollY0)
    }));

  const counts = {
    elements: allEls.length,
    images: document.images.length,
    svgs: document.querySelectorAll('svg').length,
    videos: document.querySelectorAll('video').length,
    canvases: document.querySelectorAll('canvas').length,
    iframes: document.querySelectorAll('iframe').length,
    buttons: document.querySelectorAll('button, [role="button"]').length,
    links: document.querySelectorAll('a[href]').length,
    forms: document.forms.length,
    headings: document.querySelectorAll('h1, h2, h3, h4, h5, h6').length
  };

  const headingOutline = Array.from(document.querySelectorAll('h1, h2, h3'))
    .filter((h) => cleanText(h.textContent, 2))
    .slice(0, 50)
    .map((h) => ({ level: +h.tagName[1], text: cleanText(h.textContent, 90) }));

  // ---------------------------------------------------------------------------
  // 7. Section anatomy (top → bottom visual blocks)
  // ---------------------------------------------------------------------------
  function visibleKids(el) {
    return Array.from(el.children).filter((c) => {
      const t = c.tagName.toLowerCase();
      if (SKIP_TAGS.includes(t)) return false;
      const s = window.getComputedStyle(c);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = c.getBoundingClientRect();
      return r.height >= 30 && r.width >= 100;
    });
  }

  function isVerticalStack(kids) {
    const flowKids = kids.filter((k) => {
      const pos = window.getComputedStyle(k).position;
      return pos !== 'fixed' && pos !== 'absolute';
    });
    if (flowKids.length < 2) return true;
    for (let i = 1; i < flowKids.length; i++) {
      const a = flowKids[i - 1].getBoundingClientRect();
      const b = flowKids[i].getBoundingClientRect();
      if (b.top < a.top + a.height * 0.3) return false;
    }
    return true;
  }

  let root = document.body;
  for (let i = 0; i < 12; i++) {
    const k = visibleKids(root);
    if (k.length === 1) root = k[0];
    else break;
  }
  let blocks = visibleKids(root);
  for (let pass = 0; pass < 6; pass++) {
    const next = [];
    let changed = false;
    for (const b of blocks) {
      const t = b.tagName.toLowerCase();
      const r = b.getBoundingClientRect();
      let kids = visibleKids(b);
      // Descend single-child wrappers
      let inner = b;
      while (kids.length === 1 && ['div', 'main', 'article'].includes(inner.tagName.toLowerCase())) {
        inner = kids[0];
        kids = visibleKids(inner);
      }
      const hasStickyChild = kids.some((k) => window.getComputedStyle(k).position === 'sticky');
      const hasExplicitSections = kids.some((k) => {
        const kt = k.tagName.toLowerCase();
        const kc = typeof k.className === 'string' ? k.className : '';
        return kt === 'section' || kt === 'header' || kt === 'footer' || kt === 'main' || /\bsection\b/i.test(kc) || k.hasAttribute('data-section');
      });
      const expandable = ['main', 'div', 'article', 'body'].includes(t) && (r.height > vh * 1.5 || hasExplicitSections) && kids.length >= 2 && (isVerticalStack(kids) || hasExplicitSections) && !hasStickyChild;
      if (expandable && blocks.length + kids.length < 50) {
        next.push(...kids);
        changed = true;
      } else {
        next.push(b);
      }
    }
    blocks = next;
    if (!changed) break;
  }

  const sections = blocks.slice(0, 35).map((el) => {
    const rect = el.getBoundingClientRect();
    const s = window.getComputedStyle(el);

    const headings = Array.from(el.querySelectorAll('h1, h2, h3, h4'))
      .filter((h) => isVisible(h))
      .slice(0, 4)
      .map((h) => ({ tag: h.tagName.toLowerCase(), text: cleanText(h.textContent, 80) }))
      .filter((h) => h.text);

    const buttons = Array.from(el.querySelectorAll('button, a[class*="btn"], a[class*="button"], [role="button"]'))
      .map((b) => cleanText(b.textContent, 40))
      .filter(Boolean)
      .slice(0, 5);

    // Layout pattern of the section or its first meaningful container
    function describeLayout(node) {
      const cs = window.getComputedStyle(node);
      if (cs.display.includes('grid')) {
        const cols = cs.gridTemplateColumns.split(' ').length;
        return `CSS Grid ${cols}열 (columns: ${cs.gridTemplateColumns.slice(0, 80)}, gap: ${cs.gap})`;
      }
      if (cs.display.includes('flex')) return `Flexbox ${cs.flexDirection} (justify: ${cs.justifyContent}, align: ${cs.alignItems}, gap: ${cs.gap}${cs.flexWrap === 'wrap' ? ', wrap' : ''})`;
      return null;
    }
    let layoutPattern = describeLayout(el);
    if (!layoutPattern) {
      const queue = visibleKids(el).slice(0, 3);
      for (const q of queue) {
        const d = describeLayout(q);
        if (d) {
          layoutPattern = `Block → 내부 ${getConciseSelector(q)}: ${d}`;
          break;
        }
        const deeper = visibleKids(q).slice(0, 2);
        for (const dq of deeper) {
          const dd = describeLayout(dq);
          if (dd) {
            layoutPattern = `Block → 내부 ${getConciseSelector(dq)}: ${dd}`;
            break;
          }
        }
        if (layoutPattern) break;
      }
    }

    // Container max-width detection
    let containerWidth = null;
    const firstKid = visibleKids(el)[0];
    if (firstKid) {
      const fs = window.getComputedStyle(firstKid);
      if (fs.maxWidth && fs.maxWidth !== 'none') containerWidth = fs.maxWidth;
    }

    const hasSticky = !!Array.from(el.querySelectorAll('*')).slice(0, 400).find((x) => window.getComputedStyle(x).position === 'sticky');
    const bgImage = s.backgroundImage && s.backgroundImage !== 'none' ? s.backgroundImage.replace(/url\("?([^")]+)"?\)/g, (m, u) => `url(${stripQuery(u)})`).slice(0, 140) : null;

    // Build per-element computed CSS specification tree for 1:1 section cloning
    let compBudget = 28;
    function buildComponentSpec(node, depth = 0) {
      if (!node || compBudget <= 0 || depth > 4) return null;
      const t = node.tagName ? node.tagName.toLowerCase() : '';
      if (!t || SKIP_TAGS.includes(t) || t === 'path' || t === 'g' || t === 'defs') return null;
      const r = node.getBoundingClientRect();
      const cs = window.getComputedStyle(node);
      if (cs.display === 'none' || cs.visibility === 'hidden' || (r.width < 2 && r.height < 2)) return null;
      compBudget--;

      const cssSpec = {};
      if (cs.display && cs.display !== 'block') cssSpec.display = cs.display;
      if (cs.display.includes('flex')) {
        if (cs.flexDirection !== 'row') cssSpec.flexDirection = cs.flexDirection;
        if (cs.justifyContent !== 'normal') cssSpec.justifyContent = cs.justifyContent;
        if (cs.alignItems !== 'normal') cssSpec.alignItems = cs.alignItems;
        if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') cssSpec.gap = cs.gap;
      }
      if (cs.display.includes('grid')) {
        cssSpec.gridTemplateColumns = cs.gridTemplateColumns;
        if (cs.gap && cs.gap !== 'normal' && cs.gap !== '0px') cssSpec.gap = cs.gap;
      }
      if (cs.position !== 'static') {
        cssSpec.position = cs.position;
        if (cs.top !== 'auto') cssSpec.top = cs.top;
        if (cs.left !== 'auto') cssSpec.left = cs.left;
        if (cs.zIndex !== 'auto') cssSpec.zIndex = cs.zIndex;
      }
      if (cs.maxWidth && cs.maxWidth !== 'none') cssSpec.maxWidth = cs.maxWidth;
      if (cs.padding && cs.padding !== '0px') cssSpec.padding = cs.padding;
      if (cs.margin && cs.margin !== '0px') cssSpec.margin = cs.margin;
      const bg = rgbToHex(cs.backgroundColor);
      if (bg) cssSpec.background = bg;
      if (cs.backgroundImage && cs.backgroundImage !== 'none') cssSpec.backgroundImage = cs.backgroundImage.slice(0, 120);
      if (cs.borderRadius && cs.borderRadius !== '0px') cssSpec.borderRadius = cs.borderRadius;
      if (cs.borderTopWidth !== '0px' && cs.borderTopStyle !== 'none') cssSpec.border = `${cs.borderTopWidth} ${cs.borderTopStyle} ${rgbToHex(cs.borderTopColor) || cs.borderTopColor}`;
      if (cs.boxShadow && cs.boxShadow !== 'none') cssSpec.boxShadow = cs.boxShadow.slice(0, 100);
      const bf = cs.backdropFilter || cs.webkitBackdropFilter;
      if (bf && bf !== 'none') cssSpec.backdropFilter = bf;

      // Text / Typography styles if element has direct text or is a heading/button/link
      const ownTxt = Array.from(node.childNodes)
        .filter((n) => n.nodeType === 3)
        .map((n) => n.textContent.trim())
        .join(' ')
        .trim();
      if (ownTxt || ['h1', 'h2', 'h3', 'h4', 'p', 'a', 'button', 'span', 'li'].includes(t)) {
        cssSpec.fontFamily = (cs.fontFamily || '').split(',')[0].replace(/["']/g, '').trim();
        cssSpec.fontSize = cs.fontSize;
        cssSpec.fontWeight = cs.fontWeight;
        cssSpec.lineHeight = cs.lineHeight;
        if (cs.letterSpacing && cs.letterSpacing !== 'normal') cssSpec.letterSpacing = cs.letterSpacing;
        cssSpec.color = rgbToHex(cs.color) || cs.color;
      }
      if (cs.transition && cs.transition !== 'all 0s ease 0s' && !cs.transition.startsWith('all 0s')) {
        cssSpec.transition = cs.transition.slice(0, 90);
      }

      const item = {
        selector: getConciseSelector(node),
        tag: t,
        box: `${Math.round(r.width)}x${Math.round(r.height)}px`,
        text: ownTxt ? ownTxt.slice(0, 100) : null,
        href: t === 'a' ? stripQuery(node.getAttribute('href') || '') : null,
        imgSrc: t === 'img' ? stripQuery(node.currentSrc || node.src || '') : null,
        styles: cssSpec,
        children: []
      };

      if (t !== 'svg' && depth < 4) {
        for (const ch of Array.from(node.children).slice(0, 8)) {
          const childSpec = buildComponentSpec(ch, depth + 1);
          if (childSpec) item.children.push(childSpec);
        }
      }
      return item;
    }

    const componentSpecTree = buildComponentSpec(el, 0);
    const rawSectionHtml = el.outerHTML || '';
    const sectionHtmlSnippet = rawSectionHtml.length > 10000 ? rawSectionHtml.slice(0, 10000) + '\n<!-- ... [SECTION_HTML_TRUNCATED] ... -->' : rawSectionHtml;

    return {
      selector: getConciseSelector(el),
      tag: el.tagName.toLowerCase(),
      topY: Math.round(rect.top + scrollY0),
      dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}px`,
      viewportHeightRatio: `${(rect.height / vh).toFixed(1)}vh`,
      position: s.position,
      background: rgbToHex(s.backgroundColor) || 'transparent',
      backgroundImage: bgImage,
      padding: `${s.paddingTop} ${s.paddingRight} ${s.paddingBottom} ${s.paddingLeft}`,
      borderRadius: s.borderRadius !== '0px' ? s.borderRadius : null,
      border: s.borderTopWidth !== '0px' && s.borderTopStyle !== 'none' ? `${s.borderTopWidth} ${s.borderTopStyle} ${rgbToHex(s.borderTopColor) || s.borderTopColor}` : null,
      boxShadow: s.boxShadow !== 'none' ? s.boxShadow.slice(0, 100) : null,
      containerMaxWidth: containerWidth,
      layoutPattern: layoutPattern || s.display,
      hasStickyInside: hasSticky,
      headings,
      buttons,
      textPreview: cleanText(el.innerText, 160),
      mediaSummary: {
        images: el.querySelectorAll('img, picture').length,
        svgs: el.querySelectorAll('svg').length,
        videos: el.querySelectorAll('video').length,
        canvases: el.querySelectorAll('canvas, spline-viewer, model-viewer').length
      },
      componentSpecTree,
      sectionHtmlSnippet
    };
  });
  sections.sort((a, b) => a.topY - b.topY);

  // ---------------------------------------------------------------------------
  // 8. Visual DOM tree (single-child wrapper chains are collapsed)
  // ---------------------------------------------------------------------------
  let nodeBudget = 450;
  const MAX_DEPTH = 7;

  function treeKids(node) {
    if (node.tagName.toLowerCase() === 'svg') return [];
    return Array.from(node.children).filter((c) => {
      const t = c.tagName.toLowerCase();
      if (SKIP_TAGS.includes(t)) return false;
      const s = window.getComputedStyle(c);
      if (s.display === 'none' || s.visibility === 'hidden') return false;
      const r = c.getBoundingClientRect();
      return !(r.width === 0 && r.height === 0 && t !== 'canvas');
    });
  }

  function directText(node) {
    let t = '';
    for (const ch of Array.from(node.childNodes)) if (ch.nodeType === 3) t += ch.textContent + ' ';
    return cleanText(t, 50);
  }

  function hint(node) {
    const t = node.tagName.toLowerCase();
    if (t === 'img') return `img: ${(stripQuery(node.currentSrc || node.src).split('/').pop() || '').slice(0, 40)}${node.alt ? ` alt="${node.alt.slice(0, 30)}"` : ''}`;
    if (t === 'a') return `href=${stripQuery(node.getAttribute('href') || '').slice(0, 50)}`;
    if (t === 'video') return `video: ${(stripQuery(node.currentSrc || node.src).split('/').pop() || '').slice(0, 40)}`;
    if (t === 'input' || t === 'textarea') return `${node.type || t}${node.placeholder ? ` "${node.placeholder.slice(0, 25)}"` : ''}`;
    return null;
  }

  function buildDomTree(node, depth) {
    if (!node || nodeBudget <= 0) return null;
    const chain = [node];
    let cur = node;
    while (chain.length < 5) {
      const k = treeKids(cur);
      const t = cur.tagName.toLowerCase();
      if (k.length === 1 && !directText(cur) && !['canvas', 'svg', 'a', 'button'].includes(t)) {
        cur = k[0];
        chain.push(cur);
      } else break;
    }
    nodeBudget--;
    const rect = cur.getBoundingClientRect();
    const s = window.getComputedStyle(cur);
    const tag = cur.tagName.toLowerCase();
    const badges = [];
    if (s.position === 'fixed' || s.position === 'sticky' || s.position === 'absolute') badges.push(`pos:${s.position}`);
    if (s.display.includes('flex')) badges.push(`flex-${s.flexDirection === 'column' ? 'col' : 'row'}`);
    if (s.display.includes('grid')) badges.push(`grid(${s.gridTemplateColumns.split(' ').length}col)`);
    if (['canvas', 'spline-viewer', 'model-viewer'].includes(tag)) badges.push('3D/Canvas');
    if (s.animationName && s.animationName !== 'none') badges.push(`anim:${s.animationName.slice(0, 20)}`);

    const text = directText(cur) || hint(cur);
    const children = [];
    const kids = treeKids(cur);
    if (depth < MAX_DEPTH) {
      for (const k of kids.slice(0, 12)) {
        const c = buildDomTree(k, depth + 1);
        if (c) children.push(c);
      }
      if (kids.length > 12) children.push({ selector: `… (+${kids.length - 12} more siblings)`, children: [] });
    } else if (kids.length) {
      children.push({ selector: `… (${kids.length} children, depth limit)`, children: [] });
    }

    return {
      selector: chain.map(getConciseSelector).join(' > '),
      tag,
      dimensions: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
      layout: badges.join(', '),
      text: text || null,
      children
    };
  }

  const domTree = buildDomTree(document.body, 0);

  // Extract unique visible SVGs (logos, icons, decorative graphics) for 1:1 cloning
  const svgCatalog = [];
  const seenSvgHashes = new Set();
  for (const svg of Array.from(document.querySelectorAll('svg'))) {
    if (svgCatalog.length >= 35) break;
    const r = svg.getBoundingClientRect();
    if (r.width < 4 || r.height < 4) continue;
    const rawSvg = svg.outerHTML || '';
    if (rawSvg.length < 25 || rawSvg.length > 20000) continue;
    const sig = rawSvg.replace(/\s+/g, ' ').slice(0, 220);
    if (seenSvgHashes.has(sig)) continue;
    seenSvgHashes.add(sig);

    const parent = svg.parentElement;
    const parentLabel = parent ? `${getConciseSelector(parent)}${cleanText(parent.textContent, 30) ? ` ("${cleanText(parent.textContent, 30)}")` : ''}` : 'body';
    svgCatalog.push({
      selector: getConciseSelector(svg),
      parentContext: parentLabel,
      dimensions: `${Math.round(r.width)}x${Math.round(r.height)}px`,
      viewBox: svg.getAttribute('viewBox') || null,
      svgCode: rawSvg
    });
  }

  const sortCount = (map, n) => Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, n).map(([value, count]) => ({ value, count }));

  return {
    metadata,
    techStack,
    designSystem: {
      backgroundColors: Array.from(bgColors.values()).sort((a, b) => b.score - a.score).slice(0, 12),
      textColors: Array.from(textColors.values()).sort((a, b) => b.count - a.count).slice(0, 10),
      accentColors: Array.from(accentColors.values()).sort((a, b) => b.count - a.count).slice(0, 10),
      borderColors: sortCount(borderColors, 6),
      gradients,
      glassEffects,
      fonts: Array.from(fontMap.entries()).sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, usageCount: count })),
      typographyScale,
      buttonStyles: buttonStyles.map(({ key, ...rest }) => rest),
      borderRadii: sortCount(radiusMap, 8),
      shadows: sortCount(shadowMap, 6),
      gaps: sortCount(spacingMap, 8),
      cssVariables,
      mediaBreakpoints: Array.from(mediaBreakpoints)
    },
    howItWorks: {
      canvases,
      embeddedViewers,
      stickyAndFixedElements,
      animatedElements,
      scrollSnap,
      keyframes: keyframesList,
      runtimeHooks: window.__SITESCRAP_HOOKS__ || { webglContexts: [], shaders: [], eventListeners: {} }
    },
    structure: {
      navigation,
      internalPages: Array.from(internalPaths.entries()).slice(0, 80).map(([path, text]) => ({ path, text })),
      externalDomains: sortCount(externalDomains, 15),
      forms,
      images,
      svgCatalog,
      counts,
      headingOutline
    },
    sections,
    domTree,
    inlineStyleTexts
  };
}

module.exports = { inspectPage };
