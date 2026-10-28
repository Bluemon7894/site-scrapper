const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { exec } = require('child_process');
const { analyzeSite } = require('./src/analyzer');
const { saveBlueprintFiles } = require('./src/blueprintGenerator');

const OUTPUT_ROOT = path.join(__dirname, 'output');

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

async function runExtraction(rawUrl) {
  const folderName = createFolderName(rawUrl);
  const outputDir = path.join(OUTPUT_ROOT, folderName);

  console.log('\n-------------------------------------------------------------');
  console.log(`[대상 URL] ${rawUrl}`);
  console.log(`[저장 경로] ${outputDir}`);
  console.log('-------------------------------------------------------------');

  const startTime = Date.now();

  const data = await analyzeSite(
    {
      url: rawUrl,
      viewport: { width: 1440, height: 900 },
      autoScroll: true,
      captureScreenshots: true,
      outputDir
    },
    (step, message, percent) => {
      console.log(`[${String(percent).padStart(2, ' ')}%] ${message}`);
    }
  );

  console.log('[95%] AI 전달용 마스터 블루프린트 및 정제 소스 파일 저장 중...');
  const saved = saveBlueprintFiles(data, outputDir);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const techNames = (data.techStack || []).map((t) => t.name).join(', ') || '표준 HTML/CSS/JS';
  const modelsCount =
    ((data.networkAssets && data.networkAssets.models3D) ? data.networkAssets.models3D.length : 0) +
    ((data.networkAssets && data.networkAssets.binaryBuffers) ? data.networkAssets.binaryBuffers.length : 0);
  const canvasCount = (data.howItWorks && data.howItWorks.canvases) ? data.howItWorks.canvases.length : 0;
  const shadersCount = (data.howItWorks && data.howItWorks.runtimeHooks && data.howItWorks.runtimeHooks.shaders)
    ? data.howItWorks.runtimeHooks.shaders.length
    : 0;

  const pStats = data.privacyStats || {};
  const scrubbedCount =
    (pStats.removedTrackers || 0) +
    (pStats.redactedHiddenInputs || 0) +
    (pStats.redactedMetaTokens || 0) +
    Object.values(pStats.redactedItems || {}).reduce((a, b) => a + b, 0);

  console.log('\n=============================================================');
  console.log(` 완료! (소요 시간: ${elapsed}초)`);
  console.log('=============================================================');
  console.log(` - 사이트 제목 : ${data.metadata.title || '-'}`);
  console.log(` - 테마 / 배경 : ${data.metadata.themeMode} (${data.metadata.pageBackground})`);
  console.log(` - 감지된 기술 : ${techNames}`);
  console.log(` - 3D / WebGL  : 캔버스 ${canvasCount}개 | 3D·특수에셋 ${modelsCount}개 | 캡처된 셰이더 ${shadersCount}개`);
  if (data.networkAssets && data.networkAssets.models3D && data.networkAssets.models3D.length > 0) {
    console.log(' - 3D 에셋 출처:');
    data.networkAssets.models3D.forEach((m) => {
      console.log(`   * [${m.type}] 출처: ${m.provider} -> ${m.url}`);
    });
  }
  console.log(` - 보안 정제   : 트래커 및 민감 정보 ${scrubbedCount}건 마스킹/제거됨`);
  console.log('-------------------------------------------------------------');
  console.log(' [생성된 파일 목록]');
  saved.files.forEach((f) => {
    console.log(`  * ${f.name} (${(f.size / 1024).toFixed(1)} KB) - ${f.description}`);
  });
  if (data.screenshots && data.screenshots.viewportPath) {
    console.log(`  * ${data.screenshots.viewportPath} / ${data.screenshots.fullPagePath}`);
  }
  console.log(`\n => 결과 폴더 위치: ${outputDir}`);
  console.log('=============================================================\n');

  // Open output folder in Windows Explorer
  if (process.platform === 'win32') {
    exec(`explorer.exe "${outputDir}"`);
  }
}

async function main() {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });

  // Direct CLI argument mode: node index.js <url>
  const argUrl = process.argv[2];
  if (argUrl) {
    try {
      await runExtraction(argUrl.trim());
      process.exit(0);
    } catch (err) {
      console.error(`\n[오류] ${err.message}\n`);
      process.exit(1);
    }
  }

  // Interactive CMD prompt mode
  console.log('=============================================================');
  console.log(' SiteScrap CLI - AI 참고용 사이트 디자인·구조·3D·소스 추출기');
  console.log('=============================================================');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const promptNext = () => {
    rl.question('\n분석할 사이트 URL 입력 (종료하려면 q 입력): ', async (answer) => {
      const input = (answer || '').trim();
      if (!input) {
        return promptNext();
      }
      if (input.toLowerCase() === 'q' || input.toLowerCase() === 'exit') {
        rl.close();
        process.exit(0);
      }

      try {
        await runExtraction(input);
      } catch (err) {
        console.error(`\n[오류 발생] ${err.message}\n`);
      }

      promptNext();
    });
  };

  promptNext();
}

main();
