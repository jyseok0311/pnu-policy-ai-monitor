// dist/*.html → dist/pdf/*.pdf  (헤드리스 Chrome + DevTools Protocol)
// KMI 방식과 동일: 브라우저에서 실시간 생성하지 않고 빌드 때 미리 굽는다.
// --print-to-pdf 플래그는 지도 타일 같은 상시 네트워크 요청이 있으면 종료되지 않으므로 CDP로 직접 제어한다.
//
// 산출물
//   합본   PNU_Univ_Policy_AI_Weekly_All.pdf / ..._Daily_All.pdf
//   회차별 PNU_Univ_Policy_AI_Weekly(2026.09.11).pdf / ..._Daily(2026.09.11).pdf
//   회차별은 ?only=<섹션id> 로 열어 해당 회차만 남긴 화면을 인쇄한다(app.js 의 only 필터).
//
// 사용: node pdf.mjs [--only weekly|daily] [--skip-parts]
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const SKIP_PARTS = process.argv.includes('--skip-parts');

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
].filter(Boolean);
const chrome = CANDIDATES.find((p) => existsSync(p));
if (!chrome) { console.error('✗ Chrome/Edge를 찾지 못했습니다. CHROME_PATH 환경변수로 지정하세요.'); process.exit(1); }

const PORT = 9333 + (process.pid % 200);
// A4(210mm) - 좌우 여백(12mm×2) = 186mm. CSS 는 1in=96px, 1in=25.4mm 로 센다.
const PAPER_W = Math.round((210 - 24) / 25.4 * 96);   // = 703
const profile = join(tmpdir(), `pnu-pdf-${process.pid}`);
const outDir = join(root, 'dist/pdf');
mkdirSync(outDir, { recursive: true });
const stamp = (d) => d.replace(/-/g, '.');

// ── 인쇄 대상 목록 만들기
const weeks = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8'));
const only = arg('--only');
const JOBS = [];

if (!only || only === 'weekly') {
  if (existsSync(join(root, 'dist/index.html'))) {
    JOBS.push({ page: 'dist/index.html', file: 'PNU_Univ_Policy_AI_Weekly_All.pdf', label: '대학 AX정책 AI 주간 모니터링' });
    if (!SKIP_PARTS) {
      weeks.filter((w) => w.complete).forEach((w) => JOBS.push({
        page: 'dist/index.html', query: `?only=${w.id}`,
        file: `PNU_Univ_Policy_AI_Weekly(${stamp(w.date)}).pdf`,
        label: `대학 AX정책 AI 주간 모니터링 · ${w.label}`
      }));
    }
  }
}
if (!only || only === 'daily') {
  if (existsSync(join(root, 'dist/daily.html'))) {
    JOBS.push({ page: 'dist/daily.html', file: 'PNU_Univ_Policy_AI_Daily_All.pdf', label: '대학 AX정책 AI 일일 브리핑' });
    if (!SKIP_PARTS) {
      // 일일 브리핑의 날짜 섹션 id 는 d-YYYY-MM-DD 이다
      const html = readFileSync(join(root, 'dist/daily.html'), 'utf8');
      [...new Set([...html.matchAll(/id="(d-\d{4}-\d{2}-\d{2})"/g)].map((m) => m[1]))].forEach((id) => {
        const d = id.slice(2);
        JOBS.push({ page: 'dist/daily.html', query: `?only=${id}`,
          file: `PNU_Univ_Policy_AI_Daily(${stamp(d)}).pdf`,
          label: `대학 AX정책 AI 일일 브리핑 · ${stamp(d)}` });
      });
    }
  }
}
if (!JOBS.length) { console.error('✗ 대상 페이지가 없습니다. build.mjs / daily.mjs 를 먼저 실행하세요.'); process.exit(1); }

console.log(`· 브라우저: ${chrome}`);
console.log(`· 작업 ${JOBS.length}건 (합본 + 회차별)`);

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-sync',
  '--hide-scrollbars', '--window-size=1280,1800', 'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id; pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});

let ok = 0, fail = 0;
try {
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page');
    } catch { /* 아직 안 뜸 */ }
  }
  if (!target) throw new Error('DevTools 엔드포인트에 연결하지 못했습니다');

  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 연결 실패')); });

  let loaded = false;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id); pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Page.loadEventFired') loaded = true;
  };

  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { media: 'print' });
  // 뷰포트를 '종이 본문 폭'으로 맞춘다.
  //   printToPDF 는 종이 크기로 레이아웃을 다시 잡는데, 그 전에 도는 스크립트(지도 fitBounds 등)는
  //   브라우저 창 폭(1262px)을 보고 계산한다. 그래서 한반도를 1262px 기준으로 가운데 맞춰 놓으면
  //   종이(703px)로 잘릴 때 오른쪽으로 밀려 나왔다 — 실제로 PDF 에서 그랬다.
  //   @page{size:A4;margin:14mm 12mm} → 본문 폭 210-24=186mm = 703 CSS px.
  await send('Emulation.setDeviceMetricsOverride', {
    width: PAPER_W, height: 1600, deviceScaleFactor: 1, mobile: false
  });

  for (const T of JOBS) {
    const src = pathToFileURL(join(root, T.page)).href + (T.query || '');
    const out = join(outDir, T.file);
    try {
      loaded = false;
      await send('Page.navigate', { url: src });
      for (let i = 0; i < 80 && !loaded; i++) await sleep(250);
      // 회차별은 섹션 하나뿐이라 렌더가 빠르다
      await sleep(T.query ? 3500 : 6000);

      await send('Runtime.evaluate', {
        expression: `document.querySelectorAll('details.day').forEach(d=>d.open=true);
                     window.dispatchEvent(new Event('beforeprint')); true;`
      });
      await sleep(T.query ? 2000 : 3500);

      // 지도 시야를 한반도에 맞춘다. beforeprint 는 화면 중심을 유지하므로,
      // 폭이 다른 인쇄 지면에서는 한반도가 한쪽으로 밀린다.
      const fitted = await send('Runtime.evaluate', {
        expression: 'window.__pnuFitKorea ? window.__pnuFitKorea() : 0', returnByValue: true
      });
      if (fitted.result.value) await sleep(2500);   // 새 시야의 타일 로딩 대기

      const { data } = await send('Page.printToPDF', {
        printBackground: true,
        paperWidth: 8.27, paperHeight: 11.69,          // A4
        marginTop: 0.55, marginBottom: 0.55, marginLeft: 0.47, marginRight: 0.47,
        preferCSSPageSize: true,
        displayHeaderFooter: true,
        headerTemplate: '<span></span>',
        footerTemplate: `<div style="width:100%;font-size:8px;color:#6b7280;padding:0 12mm;display:flex;justify-content:space-between">
          <span>부산대 AX·정보화혁신본부 AX혁신과 · ${T.label}</span>
          <span class="pageNumber"></span>/<span class="totalPages"></span></div>`
      });
      writeFileSync(out, Buffer.from(data, 'base64'));
      ok++;
      console.log(`  ✓ ${T.file}  ${(statSync(out).size / 1024).toFixed(0)} KB${fitted.result.value && fitted.result.value.center ? `  [지도 ${fitted.result.value.w}px 중심 ${fitted.result.value.center[1]}°E z${fitted.result.value.zoom}]` : ""}`);
    } catch (e) {
      fail++;
      console.log(`  ✗ ${T.file} — ${e.message.slice(0, 60)}`);
    }
  }
} catch (e) {
  console.error('✗ PDF 생성 실패:', e.message);
  process.exitCode = 1;
} finally {
  try { ws?.close(); } catch {}
  proc.kill();
  await sleep(400);
  try { rmSync(profile, { recursive: true, force: true }); } catch {}
}
console.log(`\n완료 — 성공 ${ok} / 실패 ${fail}`);
