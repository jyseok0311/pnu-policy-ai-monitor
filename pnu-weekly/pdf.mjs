// dist/index.html → dist/pdf/*.pdf  (헤드리스 Chrome + DevTools Protocol)
// KMI 방식과 동일: 브라우저에서 실시간 생성하지 않고 빌드 때 미리 굽는다.
// --print-to-pdf 플래그는 지도 타일 같은 상시 네트워크 요청이 있으면 종료되지 않으므로 CDP로 직접 제어한다.
// 사용: node pdf.mjs
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const profile = join(tmpdir(), `pnu-pdf-${process.pid}`);

const weeks = JSON.parse(readFileSync(join(root, 'data/weeks.json'), 'utf8'));
const latest = weeks[0];
const outDir = join(root, 'dist/pdf');
mkdirSync(outDir, { recursive: true });
const stamp = latest.date.replace(/-/g, '.');

// 주간·일간 두 산출물을 같은 방식으로 굽는다. --only weekly|daily 로 하나만 지정할 수 있다.
const only = (() => { const i = process.argv.indexOf('--only'); return i > 0 ? process.argv[i + 1] : null; })();
const TARGETS = [
  { key: 'weekly', page: 'dist/index.html', file: `PNU_Univ_Policy_AI_Weekly(${stamp}).pdf`, label: '대학 정책 AI 주간 모니터링' },
  { key: 'daily', page: 'dist/daily.html', file: `PNU_Univ_Policy_AI_Daily(${stamp}).pdf`, label: '대학 정책 AI 일일 브리핑' }
].filter((t) => (!only || t.key === only) && existsSync(join(root, t.page)));

if (!TARGETS.length) { console.error('✗ 대상 페이지가 없습니다. build.mjs / daily.mjs 를 먼저 실행하세요.'); process.exit(1); }
console.log(`· 브라우저: ${chrome}`);
console.log(`· 대상:     ${TARGETS.map((t) => t.page).join(', ')}`);

const proc = spawn(chrome, [
  '--headless=new', '--disable-gpu', '--no-sandbox',
  `--remote-debugging-port=${PORT}`,
  `--user-data-dir=${profile}`,
  '--no-first-run', '--no-default-browser-check',
  '--disable-background-networking', '--disable-extensions', '--disable-sync',
  '--hide-scrollbars', '--window-size=1280,1800',
  'about:blank'
], { stdio: 'ignore' });

let ws, id = 0;
const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => {
  const n = ++id;
  pending.set(n, { res, rej });
  ws.send(JSON.stringify({ id: n, method, params }));
});

try {
  // 1) DevTools 엔드포인트 대기
  let target = null;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(250);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json());
      target = list.find((t) => t.type === 'page');
    } catch { /* 아직 안 뜸 */ }
  }
  if (!target) throw new Error('DevTools 엔드포인트에 연결하지 못했습니다');

  // 2) CDP 연결
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('WS 연결 실패')); });

  let loaded = false;
  ws.onmessage = (ev) => {
    const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) {
      const { res, rej } = pending.get(m.id);
      pending.delete(m.id);
      m.error ? rej(new Error(m.error.message)) : res(m.result);
    } else if (m.method === 'Page.loadEventFired') {
      loaded = true;
    }
  };

  await send('Page.enable');
  await send('Emulation.setEmulatedMedia', { media: 'print' });

  for (const T of TARGETS) {
  const src = pathToFileURL(join(root, T.page)).href;
  const out = join(outDir, T.file);
  loaded = false;
  await send('Page.navigate', { url: src });

  // 3) load 이벤트 + 지도/폰트 렌더 여유
  for (let i = 0; i < 80 && !loaded; i++) await sleep(250);
  await sleep(6000);

  // 아직 안 만들어진 지도까지 강제 생성 후 타일 대기
  await send('Runtime.evaluate', {
    expression: `document.querySelectorAll('details.day').forEach(d=>d.open=true);
                 window.dispatchEvent(new Event('beforeprint')); true;`
  });
  await sleep(5000);

  // 4) 인쇄
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
  console.log(`✓ dist/pdf/${T.file}  ${(statSync(out).size / 1024).toFixed(0)} KB`);
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
