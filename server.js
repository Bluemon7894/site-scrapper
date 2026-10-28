const express = require('express');
const path = require('path');
const fs = require('fs');
const { spawn, exec } = require('child_process');
const archiver = require('archiver');
const { analyzeSite } = require('./src/analyzer');
const { saveBlueprintFiles, renderAsciiDomTree } = require('./src/blueprintGenerator');

const app = express();
const PORT = process.env.PORT || 3847;
const OUTPUT_ROOT = path.join(__dirname, 'output');

fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));
app.use('/output', express.static(OUTPUT_ROOT));

// Active jobs map for SSE progress streaming
const activeJobs = new Map();

/**
 * Helper to create safe folder name from URL + timestamp
 */
function createFolderName(rawUrl) {
  let host = 'website';
  try {
    const u = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : 'https://' + rawUrl);
    host = u.hostname.replace(/^www\./i, '').replace(/[^a-zA-Z0-9.-]/g, '_');
  } catch (e) {}
  const now = new Date();
  const stamp = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
    '_',
    String(now.getHours()).padStart(2, '0'),
    String(now.getMinutes()).padStart(2, '0'),
    String(now.getSeconds()).padStart(2, '0')
  ].join('');
  return `${host}_${stamp}`;
}

/**
 * Start an extraction job
 */
app.post('/api/analyze', (req, res) => {
  const { url, viewport, autoScroll = true, captureScreenshots = true } = req.body || {};
  if (!url || !url.trim()) {
    return res.status(400).json({ error: '분석할 사이트 URL을 입력해 주세요.' });
  }

  const jobId = 'job_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
  const folderName = createFolderName(url.trim());
  const outputDir = path.join(OUTPUT_ROOT, folderName);

  const jobState = {
    jobId,
    folderName,
    status: 'running',
    step: 'init',
    message: '분석 작업을 준비 중입니다...',
    percent: 2,
    clients: new Set(),
    result: null,
    error: null
  };

  activeJobs.set(jobId, jobState);

  const notifyClients = (payload) => {
    const dataStr = `data: ${JSON.stringify(payload)}\n\n`;
    for (const clientRes of jobState.clients) {
      try {
        clientRes.write(dataStr);
      } catch (e) {}
    }
  };

  // Run analysis asynchronously
  (async () => {
    try {
      const analysisData = await analyzeSite(
        {
          url: url.trim(),
          viewport: viewport || { width: 1440, height: 900 },
          autoScroll,
          captureScreenshots,
          outputDir
        },
        (step, message, percent) => {
          jobState.step = step;
          jobState.message = message;
          jobState.percent = percent;
          notifyClients({ type: 'progress', step, message, percent });
        }
      );

      jobState.step = 'save';
      jobState.message = 'AI 마스터 블루프린트 및 정제된 소스코드 파일을 생성 중...';
      jobState.percent = 94;
      notifyClients({
        type: 'progress',
        step: 'save',
        message: jobState.message,
        percent: 94
      });

      const saved = saveBlueprintFiles(analysisData, outputDir);
      const asciiTree = renderAsciiDomTree(analysisData.domTree);

      const finalPayload = {
        folderName,
        outputDir,
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
        asciiTree,
        privacyStats: analysisData.privacyStats,
        files: saved.files,
        masterMarkdown: saved.masterMarkdown,
        sanitizedHtmlPreview: (analysisData.sanitizedHtml || '').slice(0, 45000),
        sanitizedCssPreview: (analysisData.sanitizedCss || '').slice(0, 45000)
      };

      jobState.status = 'completed';
      jobState.percent = 100;
      jobState.message = '분석 및 파일 생성이 완료되었습니다!';
      jobState.result = finalPayload;

      notifyClients({
        type: 'completed',
        percent: 100,
        message: jobState.message,
        result: finalPayload
      });
    } catch (err) {
      jobState.status = 'error';
      jobState.error = err.message || '분석 중 알 수 없는 오류가 발생했습니다.';
      notifyClients({
        type: 'error',
        error: jobState.error
      });
    }
  })();

  res.json({ jobId, folderName });
});

/**
 * SSE Endpoint for live job progress
 */
app.get('/api/jobs/:jobId/stream', (req, res) => {
  const job = activeJobs.get(req.params.jobId);
  if (!job) {
    return res.status(404).json({ error: '작업을 찾을 수 없습니다.' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Send current state immediately
  if (job.status === 'completed') {
    res.write(`data: ${JSON.stringify({ type: 'completed', percent: 100, message: job.message, result: job.result })}\n\n`);
    return res.end();
  }
  if (job.status === 'error') {
    res.write(`data: ${JSON.stringify({ type: 'error', error: job.error })}\n\n`);
    return res.end();
  }

  res.write(`data: ${JSON.stringify({ type: 'progress', step: job.step, message: job.message, percent: job.percent })}\n\n`);
  job.clients.add(res);

  req.on('close', () => {
    job.clients.delete(res);
  });
});

/**
 * List saved history folders
 */
app.get('/api/history', (req, res) => {
  try {
    if (!fs.existsSync(OUTPUT_ROOT)) return res.json({ items: [] });
    const dirs = fs
      .readdirSync(OUTPUT_ROOT, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => {
        const folderPath = path.join(OUTPUT_ROOT, d.name);
        const jsonPath = path.join(folderPath, '04_3d_and_interactions_data.json');
        let meta = { targetUrl: d.name, title: d.name, analyzedAt: null };
        if (fs.existsSync(jsonPath)) {
          try {
            const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
            meta = {
              targetUrl: parsed.targetUrl || d.name,
              title: (parsed.metadata && parsed.metadata.title) || parsed.targetUrl || d.name,
              analyzedAt: parsed.analyzedAt || null,
              themeMode: parsed.metadata && parsed.metadata.themeMode,
              techCount: (parsed.techStack || []).length,
              models3DCount: (parsed.networkAssets && parsed.networkAssets.models3D ? parsed.networkAssets.models3D.length : 0) +
                (parsed.howItWorks && parsed.howItWorks.canvases ? parsed.howItWorks.canvases.length : 0)
            };
          } catch (e) {}
        }
        return {
          folderName: d.name,
          ...meta,
          mtime: fs.statSync(folderPath).mtimeMs
        };
      })
      .sort((a, b) => b.mtime - a.mtime);

    res.json({ items: dirs });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Load a previously saved extraction folder
 */
app.get('/api/history/:folderName', (req, res) => {
  try {
    const folderName = path.basename(req.params.folderName);
    const outputDir = path.join(OUTPUT_ROOT, folderName);
    const jsonPath = path.join(outputDir, '04_3d_and_interactions_data.json');
    if (!fs.existsSync(jsonPath)) {
      return res.status(404).json({ error: '저장된 분석 데이터를 찾을 수 없습니다.' });
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
    const masterPath = path.join(outputDir, '01_AI_MASTER_BLUEPRINT.md');
    const htmlPath = path.join(outputDir, '02_sanitized_source.html');
    const cssPath = path.join(outputDir, '03_styles_and_tokens.css');

    const masterMarkdown = fs.existsSync(masterPath) ? fs.readFileSync(masterPath, 'utf8') : '';
    const sanitizedHtmlPreview = fs.existsSync(htmlPath) ? fs.readFileSync(htmlPath, 'utf8').slice(0, 45000) : '';
    const sanitizedCssPreview = fs.existsSync(cssPath) ? fs.readFileSync(cssPath, 'utf8').slice(0, 45000) : '';

    const files = [
      { name: '01_AI_MASTER_BLUEPRINT.md', description: 'AI 프롬프트 입력용 통합 마스터 블루프린트 (디자인+구조+작동원리+3D출처+코드요약)', size: fs.existsSync(masterPath) ? fs.statSync(masterPath).size : 0 },
      { name: '02_sanitized_source.html', description: '민감 정보·트래커가 제거되고 정렬된 전체 HTML 소스코드', size: fs.existsSync(htmlPath) ? fs.statSync(htmlPath).size : 0 },
      { name: '03_styles_and_tokens.css', description: '추출된 CSS 디자인 토큰(:root 변수), 키프레임 및 스타일시트', size: fs.existsSync(cssPath) ? fs.statSync(cssPath).size : 0 },
      { name: '04_3d_and_interactions_data.json', description: '3D 에셋, 셰이더, 레이아웃 트리, 테크스택 구조화 데이터 (JSON)', size: fs.statSync(jsonPath).size }
    ];

    res.json({
      folderName,
      outputDir,
      ...data,
      asciiTree: renderAsciiDomTree(data.domTree),
      files,
      masterMarkdown,
      sanitizedHtmlPreview,
      sanitizedCssPreview
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * Open folder in Windows Explorer
 */
app.post('/api/open-folder', (req, res) => {
  const { folderName } = req.body || {};
  const targetDir = folderName ? path.join(OUTPUT_ROOT, path.basename(folderName)) : OUTPUT_ROOT;
  if (!fs.existsSync(targetDir)) {
    return res.status(404).json({ error: '폴더가 존재하지 않습니다.' });
  }
  exec(`explorer.exe "${targetDir}"`);
  res.json({ ok: true, path: targetDir });
});

/**
 * Download ZIP archive of the folder
 */
app.get('/api/download-zip/:folderName', (req, res) => {
  const folderName = path.basename(req.params.folderName);
  const targetDir = path.join(OUTPUT_ROOT, folderName);
  if (!fs.existsSync(targetDir)) {
    return res.status(404).send('Folder not found');
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename="${folderName}_AI_Blueprint.zip"`);

  const archive = archiver('zip', { zlib: { level: 9 } });
  archive.pipe(res);
  archive.directory(targetDir, false);
  archive.finalize();
});

/**
 * Launches standalone Desktop App Window using Chrome or Edge App Mode
 */
function launchDesktopAppWindow(url) {
  const candidates = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe'
  ];

  const exe = candidates.find((p) => fs.existsSync(p));
  if (!exe) {
    console.log(`브라우저에서 열기: ${url}`);
    exec(`start "" "${url}"`);
    return;
  }

  const profileDir = path.join(__dirname, '.app_profile');
  const child = spawn(
    exe,
    [
      `--app=${url}`,
      '--window-size=1440,920',
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check'
    ],
    {
      detached: true,
      stdio: 'ignore'
    }
  );
  child.unref();
}

const server = app.listen(PORT, '127.0.0.1', () => {
  const appUrl = `http://127.0.0.1:${PORT}`;
  console.log(`====================================================`);
  console.log(` 🚀 AI 사이트 블루프린트 추출기 (SiteBlueprint AI) 실행됨`);
  console.log(` 🔗 로컬 앱 주소: ${appUrl}`);
  console.log(` 📂 결과물 저장 위치: ${OUTPUT_ROOT}`);
  console.log(`====================================================`);

  if (!process.env.NO_WINDOW) {
    launchDesktopAppWindow(appUrl);
  }
});

module.exports = server;
