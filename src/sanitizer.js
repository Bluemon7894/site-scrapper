const beautify = require('js-beautify');

/**
 * Known tracking, analytics, and advertising script patterns to strip
 */
const TRACKER_PATTERNS = [
  /google-analytics\.com/i,
  /googletagmanager\.com/i,
  /gtag\/js/i,
  /connect\.facebook\.net/i,
  /fbevents\.js/i,
  /hotjar\.com/i,
  /clarity\.ms/i,
  /sentry\.io/i,
  /browser\.sentry-cdn\.com/i,
  /mixpanel\.com/i,
  /segment\.com/i,
  /amplitude\.com/i,
  /doubleclick\.net/i,
  /googlesyndication\.com/i,
  /tiktok\.com\/i18n\/pixel/i,
  /snap\.licdn\.com/i,
  /bat\.bing\.com/i,
  /intercom\.io/i,
  /crisp\.chat/i,
  /channel\.io/i,
  /beusable\.net/i,
  /wcs\.naver\.net/i,
  /kakao\.com.*pixel/i
];

/**
 * Sensitive patterns to redact in HTML/CSS/JS text
 */
const SENSITIVE_REGEXES = [
  {
    name: 'JWT Token',
    regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
    replacement: '[REDACTED_JWT_TOKEN]'
  },
  {
    name: 'Google API Key',
    regex: /\bAIza[0-9A-Za-z_-]{35}\b/g,
    replacement: '[REDACTED_GOOGLE_API_KEY]'
  },
  {
    name: 'OpenAI / Secret API Key',
    regex: /\b(sk|pk)_(live|test|proj)_[0-9a-zA-Z_-]{16,}\b/g,
    replacement: '[REDACTED_API_KEY]'
  },
  {
    name: 'Generic Secret / Bearer Key',
    regex: /\b(sk-[a-zA-Z0-9]{20,}|ghp_[a-zA-Z0-9]{30,}|xox[baprs]-[a-zA-Z0-9-]{10,})\b/g,
    replacement: '[REDACTED_SECRET_KEY]'
  },
  {
    name: 'AWS Access Key',
    regex: /\bAKIA[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]'
  },
  {
    name: 'URL Auth / Session Query Parameter',
    regex: /([?&](?:api_?key|access_?token|auth_?token|client_?secret|secret|password|passwd|session_?id|signature|sig)=)([^&#"'\s>]+)/gi,
    replacement: '$1[REDACTED_PARAM]'
  },
  {
    name: 'JSON Sensitive Key-Value',
    regex: /(["'](?:apiKey|api_key|secretKey|secret_key|accessToken|access_token|refreshToken|refresh_token|privateKey|private_key|clientSecret|client_secret|password|csrfToken|csrf_token|sessionId)["']\s*:\s*["'])([^"']{4,})(["'])/gi,
    replacement: '$1[REDACTED_SECRET]$3'
  },
  {
    name: 'Email Address',
    regex: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
    replacement: '[REDACTED_EMAIL]'
  },
  {
    name: 'Phone Number (KR/Intl)',
    // Separators are required so that long digit runs (IDs, timestamps, SVG coordinates) are not mangled
    regex: /(?<![\w.])(?:01[016789][-.\s]\d{3,4}[-.\s]\d{4}|0(?:2|[3-6][1-5])[-.\s]\d{3,4}[-.\s]\d{4}|\+\d{1,3}[\s.-]\(?\d{1,4}\)?[\s.-]\d{3,4}[\s.-]\d{4})(?![\w.])/g,
    replacement: '[REDACTED_PHONE]'
  }
];

/**
 * Sanitizes text content and tracks redaction statistics
 */
function redactSensitiveText(text, stats) {
  if (!text || typeof text !== 'string') return text;
  let result = text;

  for (const rule of SENSITIVE_REGEXES) {
    const matches = result.match(rule.regex);
    if (matches && matches.length > 0) {
      // Avoid redacting css @media or package@version emails likefoo@2x.png
      if (rule.name === 'Email Address') {
        result = result.replace(rule.regex, (match) => {
          if (/\.(png|jpg|jpeg|webp|svg|gif|woff2?|ttf|js|css)$/i.test(match)) {
            return match;
          }
          stats.redactedItems[rule.name] = (stats.redactedItems[rule.name] || 0) + 1;
          return rule.replacement;
        });
      } else {
        stats.redactedItems[rule.name] = (stats.redactedItems[rule.name] || 0) + matches.length;
        result = result.replace(rule.regex, rule.replacement);
      }
    }
  }

  return result;
}

/**
 * Checks whether a URL belongs to a known analytics/tracker service
 */
function isTrackerUrl(url) {
  if (!url) return false;
  return TRACKER_PATTERNS.some((pattern) => pattern.test(url));
}

/**
 * Sanitizes raw HTML string for safe, clean AI consumption
 */
function sanitizeHtml(rawHtml, baseUrl = '') {
  const stats = {
    removedTrackers: 0,
    removedInlineScripts: 0,
    redactedHiddenInputs: 0,
    redactedMetaTokens: 0,
    truncatedBase64: 0,
    simplifiedSvgPaths: 0,
    extractedInlineScripts: [],
    redactedItems: {}
  };

  if (!rawHtml) return { html: '', stats };

  let html = rawHtml;

  // Convert relative src / href / poster attributes to absolute URLs so assets work out-of-the-box when cloned
  if (baseUrl) {
    html = html.replace(/\b(src|href|poster|url)=(["'])([^"']+)\2/gi, (match, attr, quote, val) => {
      const trimmed = val.trim();
      if (!trimmed || /^(https?:|data:|blob:|mailto:|tel:|javascript:|#)/i.test(trimmed)) return match;
      try {
        const abs = new URL(trimmed, baseUrl).href;
        return `${attr}=${quote}${abs}${quote}`;
      } catch (e) {
        return match;
      }
    });
  }

  // 1. Remove tracking/analytics <script> tags and inline scripts that contain tracker signatures or massive webpack dumps
  html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (fullMatch, attrs, body) => {
    const srcMatch = attrs.match(/\bsrc=["']([^"']+)["']/i);
    const typeMatch = attrs.match(/\btype=["']([^"']+)["']/i);
    const scriptType = typeMatch ? typeMatch[1].toLowerCase() : '';

    // Keep shader scripts! (x-shader/x-vertex, x-shader/x-fragment, etc.)
    if (scriptType.includes('shader') || scriptType.includes('glsl')) {
      return fullMatch;
    }

    if (srcMatch) {
      const src = srcMatch[1];
      if (isTrackerUrl(src)) {
        stats.removedTrackers++;
        return `<!-- [REMOVED_TRACKER_SCRIPT: ${src.split('?')[0]}] -->`;
      }
      // Keep clean external script reference (with query params redacted if sensitive)
      const cleanAttrs = redactSensitiveText(attrs, stats);
      return `<script${cleanAttrs}></script>`;
    }

    // Inline script analysis
    const trimmedBody = body.trim();
    if (!trimmedBody) return '';

    if (isTrackerUrl(trimmedBody) || /fbq\(|gtag\(|GoogleAnalyticsObject|_hjSettings|clarity\(/i.test(trimmedBody)) {
      stats.removedTrackers++;
      return '<!-- [REMOVED_INLINE_TRACKER_SCRIPT] -->';
    }

    // Remove Next.js / Nuxt / RSC hydration state blobs that may hold user/session data or bloat tokens
    if (
      /__NEXT_DATA__|__NUXT__|window\.__INITIAL_STATE__|window\.__APOLLO_STATE__|window\.__PRELOADED_STATE__|self\.__next_f\.push|__remixContext|__sveltekit_/i.test(trimmedBody) ||
      attrs.includes('__NEXT_DATA__')
    ) {
      stats.removedInlineScripts++;
      return '<!-- [REDACTED_SSR_STATE_BLOB: Removed for privacy & AI token efficiency] -->';
    }

    // Large inline JSON data blobs carry content/data, not logic -> drop
    if (scriptType.includes('json') && trimmedBody.length > 3500) {
      stats.removedInlineScripts++;
      return `<!-- [INLINE_JSON_DATA_OMITTED (${trimmedBody.length} chars)] -->`;
    }

    // Large inline logic scripts are moved to separate files (05_scripts/inline_N.js) to keep the HTML readable
    if (trimmedBody.length > 3500) {
      stats.removedInlineScripts++;
      const fileName = `inline_${String(stats.extractedInlineScripts.length + 1).padStart(2, '0')}.js`;
      stats.extractedInlineScripts.push({ fileName, code: redactSensitiveText(trimmedBody, stats) });
      return `<!-- [INLINE_SCRIPT_MOVED (${trimmedBody.length} chars) -> 05_scripts/${fileName}] -->`;
    }

    const sanitizedBody = redactSensitiveText(trimmedBody, stats);
    return `<script${attrs}>\n${sanitizedBody}\n</script>`;
  });

  // 2. Remove <noscript> tracking pixels
  html = html.replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, (match) => {
    if (isTrackerUrl(match) || /<iframe|<img/i.test(match)) {
      stats.removedTrackers++;
      return '';
    }
    return match;
  });

  // 3. Redact <input type="hidden"> values
  html = html.replace(/<input\b([^>]*\btype=["']?hidden["']?[^>]*)>/gi, (fullMatch, attrs) => {
    if (/\bvalue=["'][^"']+["']/i.test(attrs)) {
      stats.redactedHiddenInputs++;
      const cleanAttrs = attrs.replace(/\bvalue=["'][^"']*["']/i, 'value="[REDACTED_HIDDEN_VALUE]"');
      return `<input${cleanAttrs}>`;
    }
    return fullMatch;
  });

  // 4. Redact CSRF / Verification meta tags
  html = html.replace(/<meta\b([^>]*)>/gi, (fullMatch, attrs) => {
    if (/\bname=["']?(csrf-token|xsrf-token|_token|google-site-verification|naver-site-verification|facebook-domain-verification)["']?/i.test(attrs)) {
      stats.redactedMetaTokens++;
      const cleanAttrs = attrs.replace(/\bcontent=["'][^"']*["']/i, 'content="[REDACTED_META_TOKEN]"');
      return `<meta${cleanAttrs}>`;
    }
    return fullMatch;
  });

  // 5. Truncate long data:image/...;base64,... strings so AI context isn't flooded
  html = html.replace(/data:([a-zA-Z0-9/+.-]+);base64,[A-Za-z0-9+/=]{120,}/g, (match, mime) => {
    stats.truncatedBase64++;
    return `data:${mime};base64,[BASE64_TRUNCATED_FOR_AI]`;
  });

  // 6. Keep normal SVG icons/logos intact; only truncate gigantic vector illustration paths (> 12,000 chars)
  html = html.replace(/\bd=["']([^"']{12000,})["']/g, (match, dVal) => {
    stats.simplifiedSvgPaths++;
    return `d="${dVal.slice(0, 120)}... [SVG_PATH_TRUNCATED_${dVal.length}_CHARS]"`;
  });

  // 7. Run general sensitive regex redaction (emails, phones, API keys, JWTs, auth query params)
  html = redactSensitiveText(html, stats);

  // 8. Beautify HTML for clean readability
  try {
    html = beautify.html(html, {
      indent_size: 2,
      wrap_line_length: 120,
      preserve_newlines: true,
      max_preserve_newlines: 1,
      unformatted: ['code', 'pre']
    });
  } catch (e) {
    // Fallback to unformatted if beautify fails
  }

  return { html, stats };
}

/**
 * Sanitizes and formats CSS content
 */
function sanitizeCss(rawCss, stats, baseUrl = '') {
  if (!rawCss) return '';
  let css = rawCss;

  // Convert relative url(...) in CSS to absolute URLs against baseUrl
  if (baseUrl && /^https?:\/\//i.test(baseUrl)) {
    css = css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (match, quote, relUrl) => {
      const trimmed = relUrl.trim();
      if (!trimmed || /^(https?:|data:|blob:|#)/i.test(trimmed)) return match;
      try {
        const abs = new URL(trimmed, baseUrl).href;
        return `url("${abs}")`;
      } catch (e) {
        return match;
      }
    });
  }

  // Truncate long base64 fonts/images embedded in CSS
  css = css.replace(/data:([a-zA-Z0-9/+.-]+);base64,[A-Za-z0-9+/=]{120,}/g, (match, mime) => {
    if (stats) stats.truncatedBase64 = (stats.truncatedBase64 || 0) + 1;
    return `data:${mime};base64,[BASE64_TRUNCATED]`;
  });

  css = redactSensitiveText(css, stats || { redactedItems: {} });

  try {
    css = beautify.css(css, {
      indent_size: 2,
      newline_between_rules: true
    });
  } catch (e) {
    // Keep as-is
  }

  return css;
}

/**
 * Sanitizes and (optionally) beautifies JavaScript source
 * - Redacts secrets / PII
 * - Truncates embedded base64 blobs
 * - Beautifies only when the source is small enough for js-beautify to stay fast
 */
function sanitizeJs(rawJs, stats, { beautifyLimit = 700000 } = {}) {
  if (!rawJs) return '';
  let js = rawJs;

  js = js.replace(/data:([a-zA-Z0-9/+.-]+);base64,[A-Za-z0-9+/=]{200,}/g, (match, mime) => {
    if (stats) stats.truncatedBase64 = (stats.truncatedBase64 || 0) + 1;
    return `data:${mime};base64,[BASE64_TRUNCATED]`;
  });

  js = redactSensitiveText(js, stats || { redactedItems: {} });

  if (js.length <= beautifyLimit) {
    try {
      js = beautify.js(js, {
        indent_size: 2,
        max_preserve_newlines: 2,
        wrap_line_length: 0
      });
    } catch (e) {
      // Keep as-is
    }
  }

  return js;
}

module.exports = {
  sanitizeHtml,
  sanitizeCss,
  sanitizeJs,
  redactSensitiveText,
  isTrackerUrl
};
