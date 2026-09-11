// 세계대학랭킹 패널 수집 + Wikidata 좌표 → data/world-universities.json
// 사용: node worldrank.mjs [--top 200] [--the 2022,2023,2024,2025,2026] [--qs 2027]
//
// 패널 구조: 대학별로 연도별 순위를 함께 보관해 추이를 볼 수 있게 한다.
//   universities[i].the = { "2026": {rank, score}, "2025": {...}, ... }
//
// 왜 헤드리스 브라우저인가:
//   THE  랭킹 표가 Next.js 하이드레이션 데이터에만 있어 원시 HTML 파싱 불가
//   QS   curl·fetch 는 HTTP 403(봇 차단)
// 브라우저에서 돌릴 코드는 src/browser/*.js 에 따로 둔다.
// (템플릿 리터럴에 정규식을 넣으면 이스케이프가 깨져 조용히 0건이 되는 문제를 겪었다)

import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : null; };
const TOP = Number(arg('--top')) || 200;
const THE_YEARS = (arg('--the') || '2024,2025,2026').split(',').map((s) => s.trim());
const QS_YEARS = (arg('--qs') || '2027').split(',').map((s) => s.trim());
const BS = (f) => readFileSync(join(root, 'src/browser', f), 'utf8');

const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .filter(Boolean).find((p) => existsSync(p));
if (!CHROME) { console.error('✗ Chrome 을 찾지 못했습니다.'); process.exit(1); }

async function withBrowser(fn) {
  const PORT = 9700 + (process.pid % 150);
  const profile = join(tmpdir(), `wr-${process.pid}`);
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--user-agent=${UA}`,
    '--no-first-run', '--disable-background-networking', '--hide-scrollbars',
    '--window-size=1400,1000', 'about:blank'], { stdio: 'ignore' });
  let ws, id = 0; const pending = new Map();
  const send = (m, p = {}) => new Promise((res, rej) => { const n = ++id; pending.set(n, { res, rej }); ws.send(JSON.stringify({ id: n, method: m, params: p })); });
  try {
    let t = null;
    for (let i = 0; i < 80 && !t; i++) { await sleep(250); try { t = (await fetch(`http://127.0.0.1:${PORT}/json/list`).then((r) => r.json())).find((x) => x.type === 'page'); } catch {} }
    if (!t) throw new Error('DevTools 연결 실패');
    ws = new WebSocket(t.webSocketDebuggerUrl);
    await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
    let loaded = false;
    ws.onmessage = (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); } else if (m.method === 'Page.loadEventFired') loaded = true; };
    await send('Page.enable');
    return await fn({
      goto: async (url, waitMs = 8000) => { loaded = false; await send('Page.navigate', { url }); for (let i = 0; i < 80 && !loaded; i++) await sleep(250); await sleep(waitMs); },
      run: async (src) => {
        const r = await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true });
        if (r.exceptionDetails) throw new Error('브라우저 스크립트 오류: ' + (r.exceptionDetails.exception?.description || '').slice(0, 120));
        return r.result.value;
      }
    });
  } finally {
    try { ws?.close(); } catch {}
    proc.kill(); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

// ── 1. 수집
const panel = new Map();   // key → { name, country, city, the:{}, qs:{} }
const cleanKey = (n) => n.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/[’]/g, "'").replace(/\s+/g, ' ').trim();
const put = (name, src, year, val, country, city) => {
  const key = cleanKey(name);
  if (!panel.has(key)) panel.set(key, { name, key, country: country || null, city: city || null, the: {}, qs: {} });
  const o = panel.get(key);
  o[src][year] = val;
  if (!o.country && country) o.country = country;
  if (!o.city && city) o.city = city;
};

const meta = await withBrowser(async (b) => {
  const info = { the: {}, qs: {} };

  for (const y of THE_YEARS) {
    process.stdout.write(`· THE ${y} …`);
    try {
      await b.goto(`https://www.timeshighereducation.com/world-university-rankings/${y}/world-ranking`, 8000);
      const r = await b.run(BS('the.js'));
      if (r.error) { console.log(` 실패(${r.error})`); continue; }
      const keep = [...r.rows.slice(0, TOP), ...r.rows.filter((x) => x.country === 'South Korea')];
      keep.forEach((x) => put(x.name, 'the', y, { rank: x.rank, score: x.score }, x.country));
      info.the[y] = { total: r.total, kept: keep.length };
      console.log(` ${r.total}개교 중 ${keep.length}건`);
    } catch (e) { console.log(` 실패(${e.message.slice(0, 60)})`); }
  }

  for (const y of QS_YEARS) {
    process.stdout.write(`· QS ${y} …`);
    try {
      await b.goto('https://www.topuniversities.com/world-university-rankings', 9000);
      const seen = new Set(); let pages = 0;
      for (let p = 0; p < Math.ceil(TOP / 30) + 3; p++) {
        const r = await b.run(BS('qs.js'));
        r.rows.forEach((x) => { if (!seen.has(x.name)) { seen.add(x.name); put(x.name, 'qs', y, { rank: x.rank, score: x.score }, x.country, x.city); } });
        pages++;
        if (seen.size >= TOP) break;
        const ok = await b.run(BS('qs-next.js'));
        if (!ok) break;
        await sleep(3200);
      }
      // 한국 대학은 상위 TOP 밖이라도 전부 필요하다 — 국가 필터 페이지를 추가로 훑는다
      await b.goto('https://www.topuniversities.com/world-university-rankings?countries=kr', 9000);
      let krCount = 0;
      for (let p = 0; p < 8; p++) {
        const r = await b.run(BS('qs.js'));
        r.rows.forEach((x) => { if (!seen.has(x.name)) { seen.add(x.name); krCount++; put(x.name, 'qs', y, { rank: x.rank, score: x.score }, x.country, x.city); } });
        const ok = await b.run(BS('qs-next.js'));
        if (!ok) break;
        await sleep(3200);
      }
      info.qs[y] = { kept: seen.size, pages, korea: krCount };
      console.log(` ${seen.size}건 (${pages}페이지 + 한국 추가 ${krCount}건)`);
    } catch (e) { console.log(` 실패(${e.message.slice(0, 60)})`); }
  }
  return info;
});

// ── 2. Wikidata 좌표
const rows = [...panel.values()];
console.log(`· Wikidata 좌표 조회 — ${rows.length}건`);
const coords = new Map();
const WD = { 'User-Agent': 'PNU-AX-Monitor/0.1 (ax@pusan.ac.kr)', Accept: 'application/sparql-results+json' };

for (let i = 0; i < rows.length; i += 60) {
  const batch = rows.slice(i, i + 60);
  const values = batch.map((o) => `"${o.key.replace(/"/g, '\\"')}"@en`).join(' ');
  const q = `SELECT ?l ?c WHERE { VALUES ?l { ${values} } { ?i rdfs:label ?l } UNION { ?i skos:altLabel ?l } ?i wdt:P625 ?c . }`;
  try {
    const j = await fetch('https://query.wikidata.org/sparql?format=json&query=' + encodeURIComponent(q), { headers: WD }).then((r) => r.json());
    for (const bnd of j.results.bindings) {
      const m = bnd.c.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
      if (m && !coords.has(bnd.l.value)) coords.set(bnd.l.value, { lng: +m[1], lat: +m[2] });
    }
  } catch (e) { console.log(`  배치 ${i} 실패`); }
  await sleep(900);
  process.stdout.write(`\r  ${Math.min(i + 60, rows.length)}/${rows.length} · 매칭 ${coords.size}`);
}
console.log('');

const missing = rows.filter((o) => !coords.has(o.key));
if (missing.length) {
  console.log(`· 2차 보강 (검색 API) — ${missing.length}건`);
  for (const o of missing) {
    try {
      const sj = await fetch(`https://www.wikidata.org/w/api.php?action=wbsearchentities&format=json&language=en&type=item&limit=1&search=${encodeURIComponent(o.key)}`, { headers: WD }).then((r) => r.json());
      const qid = sj.search && sj.search[0] && sj.search[0].id;
      if (!qid) continue;
      const cj = await fetch(`https://www.wikidata.org/w/api.php?action=wbgetclaims&format=json&property=P625&entity=${qid}`, { headers: WD }).then((r) => r.json());
      const v = cj.claims && cj.claims.P625 && cj.claims.P625[0].mainsnak.datavalue.value;
      if (v) coords.set(o.key, { lat: v.latitude, lng: v.longitude });
    } catch {}
    await sleep(350);
  }
  console.log(`  보강 후 매칭 ${coords.size}`);
}

// ── 3. 저장
const rankNum = (r) => { const n = parseInt(String(r || '').replace(/[^\d]/g, ''), 10); return Number.isFinite(n) ? n : 99999; };
const latestThe = THE_YEARS[THE_YEARS.length - 1], latestQs = QS_YEARS[QS_YEARS.length - 1];
const located = rows.filter((o) => coords.has(o.key))
  .map((o) => ({ ...o, ...coords.get(o.key) }))
  .sort((a, b) => Math.min(rankNum(a.the[latestThe]?.rank), rankNum(a.qs[latestQs]?.rank))
    - Math.min(rankNum(b.the[latestThe]?.rank), rankNum(b.qs[latestQs]?.rank)));

const out = {
  _comment: '세계대학랭킹 패널(연도별) + 좌표. QS·THE 공식 페이지 + Wikidata SPARQL 결합.',
  collected: new Date().toISOString().slice(0, 10),
  panel: { the: THE_YEARS, qs: QS_YEARS, latest: { the: latestThe, qs: latestQs } },
  sources: {
    the: { name: 'THE World University Rankings', url: 'https://www.timeshighereducation.com/world-university-rankings', years: meta.the },
    qs: { name: 'QS World University Rankings', url: 'https://www.topuniversities.com/world-university-rankings', years: meta.qs },
    coords: { name: 'Wikidata (P625)', url: 'https://query.wikidata.org/' }
  },
  stats: {
    total: rows.length, located: located.length,
    withThe: located.filter((o) => Object.keys(o.the).length).length,
    withQs: located.filter((o) => Object.keys(o.qs).length).length,
    both: located.filter((o) => Object.keys(o.the).length && Object.keys(o.qs).length).length,
    countries: new Set(located.map((o) => o.country)).size
  },
  missingCoords: rows.filter((o) => !coords.has(o.key)).map((o) => o.name),
  universities: located
};

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/world-universities.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`\n✓ data/world-universities.json`);
console.log(`  대학 ${out.stats.total} · 좌표 ${out.stats.located} · THE ${out.stats.withThe} · QS ${out.stats.withQs} · 양쪽 ${out.stats.both} · ${out.stats.countries}개국`);
console.log(`  THE 연도 ${THE_YEARS.join(', ')} / QS 연도 ${QS_YEARS.join(', ')}`);
