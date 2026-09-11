// 대학·지자체 공식 자료 수집 → data/univ-data.json
// 사용: node univdata.mjs
//
// 세 출처를 한 파일로 모은다.
//   1) 한국대학평가원(aims.kcue.or.kr)  대학기관평가인증 — 인증대학 현황 (키 불필요, 지금 바로 수집)
//   2) 대학알리미(academyinfo.go.kr)     공시 지표 — 공공데이터포털 OpenAPI (인증키 필요)
//   3) 국가통계포털(kosis.kr)            지자체 통계 — KOSIS OpenAPI (인증키 필요)
//
// 인증키는 환경변수로 넣는다. 없으면 그 출처는 '미수집'으로 남기고 나머지는 계속 진행한다.
//   DATA_GO_KR_KEY=...   (공공데이터포털 — 대학알리미)
//   KOSIS_KEY=...        (국가통계포털)

import { writeFileSync, readFileSync, mkdirSync, existsSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BS = (f) => readFileSync(join(root, 'src/browser', f), 'utf8');
const UAH = { 'User-Agent': 'PNU-AX-Monitor/0.1 (ax@pusan.ac.kr)' };

const CHROME = [process.env.CHROME_PATH, 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome']
  .filter(Boolean).find((p) => existsSync(p));

async function withBrowser(fn) {
  const PORT = 9820 + (process.pid % 120);
  const profile = join(tmpdir(), `ud-${process.pid}`);
  const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
  const proc = spawn(CHROME, ['--headless=new', '--disable-gpu', '--no-sandbox',
    `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, `--user-agent=${UA}`,
    '--no-first-run', '--disable-background-networking', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
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
      goto: async (url, waitMs = 6000) => { loaded = false; await send('Page.navigate', { url }); for (let i = 0; i < 80 && !loaded; i++) await sleep(250); await sleep(waitMs); },
      run: async (src) => (await send('Runtime.evaluate', { expression: src, awaitPromise: true, returnByValue: true })).result.value
    });
  } finally {
    try { ws?.close(); } catch {}
    proc.kill(); await sleep(300);
    try { rmSync(profile, { recursive: true, force: true }); } catch {}
  }
}

const meta = JSON.parse(readFileSync(join(root, 'data/meta.json'), 'utf8'));
const FULL = { pnu: '부산대학교', snu: '서울대학교', knu2: '경북대학교', jnu: '전남대학교', jbnu: '전북대학교',
  cnu: '충남대학교', cbnu: '충북대학교', knu: '강원대학교', gnu: '경상국립대학교', jeju: '제주대학교' };

const out = {
  _comment: '대학·지자체 공식 자료. 인증키가 필요한 출처는 키가 없으면 미수집으로 남는다.',
  collected: new Date().toISOString().slice(0, 10),
  sources: {}, accreditation: null, academyinfo: null, kosis: null
};

// ── 1) 한국대학평가원 — 대학기관평가인증 (키 불필요)
if (!CHROME) {
  console.log('· 한국대학평가원 … 건너뜀 (Chrome 없음)');
  out.sources.kcue = { status: 'skip', reason: 'Chrome 없음' };
} else {
  process.stdout.write('· 한국대학평가원 인증대학 현황 …');
  try {
    const r = await withBrowser(async (b) => {
      await b.goto('https://aims.kcue.or.kr/EgovPageLink.do?subMenu=4010000', 5000);
      return b.run(BS('kcue.js'));
    });
    if (r && r.rows && r.rows.length) {
      const byName = new Map(r.rows.map((x) => [x.name, x]));
      const focus = Object.fromEntries(Object.entries(FULL).map(([id, nm]) => {
        const hit = byName.get(nm) || null;
        return [id, hit ? { name: nm, type: hit.type, region: hit.region, from: hit.from, to: hit.to } : null];
      }));
      out.accreditation = {
        total: r.total, cycle: '4주기(2026~2030)',
        byRegion: r.rows.reduce((a, x) => { a[x.region] = (a[x.region] || 0) + 1; return a; }, {}),
        byType: r.rows.reduce((a, x) => { a[x.type] = (a[x.type] || 0) + 1; return a; }, {}),
        focus, rows: r.rows
      };
      out.sources.kcue = { status: 'ok', name: '한국대학평가원 대학기관평가인증',
        url: 'https://aims.kcue.or.kr/EgovPageLink.do?subMenu=4010000', count: r.rows.length };
      console.log(` ${r.rows.length}개교 (거점국립대 매칭 ${Object.values(focus).filter(Boolean).length}/10)`);
    } else { throw new Error((r && r.error) || '행 없음'); }
  } catch (e) {
    console.log(` 실패(${e.message.slice(0, 50)})`);
    out.sources.kcue = { status: 'fail', reason: e.message.slice(0, 120) };
  }
}

// ── 2) 대학알리미 — 공공데이터포털 OpenAPI (인증키 필요)
const DK = process.env.DATA_GO_KR_KEY;
const AI_SETS = [
  { id: '15158679', name: '대학알리미 교육여건 현황' },
  { id: '15158678', name: '대학알리미 교원·연구 현황' },
  { id: '15158626', name: '대학알리미 산학협력 현황' }
];
if (!DK) {
  console.log('· 대학알리미 … 미수집 (DATA_GO_KR_KEY 없음)');
  out.sources.academyinfo = {
    status: 'nokey', name: '대학알리미 정보공시', site: 'https://www.academyinfo.go.kr/index.do',
    datasets: AI_SETS.map((s) => ({ ...s, url: `https://www.data.go.kr/data/${s.id}/openapi.do` })),
    how: '공공데이터포털에서 활용신청 후 발급된 서비스키를 DATA_GO_KR_KEY 환경변수로 지정하면 자동 수집된다.'
  };
} else {
  process.stdout.write('· 대학알리미 …');
  out.academyinfo = { datasets: [] };
  for (const s of AI_SETS) {
    try {
      const u = `https://apis.data.go.kr/B551014/OpenApiSvc/${s.id}?serviceKey=${encodeURIComponent(DK)}&numOfRows=10&pageNo=1&type=json`;
      const t = await fetch(u, { headers: UAH }).then((r) => r.text());
      out.academyinfo.datasets.push({ ...s, ok: !/SERVICE_KEY|ERROR/i.test(t), sample: t.slice(0, 200) });
    } catch (e) { out.academyinfo.datasets.push({ ...s, ok: false, error: e.message }); }
    await sleep(400);
  }
  out.sources.academyinfo = { status: 'ok', name: '대학알리미 정보공시', site: 'https://www.academyinfo.go.kr/index.do' };
  console.log(` ${out.academyinfo.datasets.filter((d) => d.ok).length}/${AI_SETS.length} 응답`);
}

// ── 3) KOSIS — 지자체 통계 (인증키 필요)
const KK = process.env.KOSIS_KEY;
// 부산 관련 월간 지표 — 학령인구·인재 유출의 선행 신호
const KOSIS_TABLES = [
  { key: 'busan-move', name: '부산 20대 순이동 (국내인구이동)', orgId: '101', tblId: 'DT_1B26B02' },
  { key: 'busan-employ', name: '부산 청년(15~29세) 고용률 (경제활동인구조사)', orgId: '101', tblId: 'DT_1DA7104S' },
  { key: 'busan-pop', name: '부산 주민등록 연령별 인구', orgId: '101', tblId: 'DT_1B04005N' }
];
if (!KK) {
  console.log('· KOSIS … 미수집 (KOSIS_KEY 없음)');
  out.sources.kosis = {
    status: 'nokey', name: '국가통계포털(KOSIS)', site: 'https://kosis.kr/index/index.do',
    api: 'https://kosis.kr/openapi/',
    endpoint: 'https://kosis.kr/openapi/Param/statisticsParameterData.do',
    verified: '키 없이 호출 시 {"err":"11","errMsg":"유효하지 않은 인증KEY입니다."} — 엔드포인트 형태 확인됨(2026-09-11).',
    tables: KOSIS_TABLES,
    how: 'KOSIS 오픈API에서 발급받은 키를 KOSIS_KEY 환경변수로 지정하면 자동 수집된다. 표 ID(tblId)는 실제 조회 후 확정 필요.'
  };
} else {
  process.stdout.write('· KOSIS …');
  out.kosis = { tables: [] };
  for (const t of KOSIS_TABLES) {
    try {
      const u = `https://kosis.kr/openapi/Param/statisticsParameterData.do?method=getList&apiKey=${encodeURIComponent(KK)}`
        + `&itmId=ALL&objL1=ALL&format=json&jsonVD=Y&prdSe=M&newEstPrdCnt=13&orgId=${t.orgId}&tblId=${t.tblId}`;
      const j = await fetch(u, { headers: UAH }).then((r) => r.json());
      out.kosis.tables.push({ ...t, ok: Array.isArray(j), rows: Array.isArray(j) ? j.length : 0, err: j && j.errMsg });
    } catch (e) { out.kosis.tables.push({ ...t, ok: false, error: e.message }); }
    await sleep(500);
  }
  out.sources.kosis = { status: 'ok', name: '국가통계포털(KOSIS)', site: 'https://kosis.kr/index/index.do' };
  console.log(` ${out.kosis.tables.filter((x) => x.ok).length}/${KOSIS_TABLES.length} 응답`);
}

mkdirSync(join(root, 'data'), { recursive: true });
writeFileSync(join(root, 'data/univ-data.json'), JSON.stringify(out, null, 2), 'utf8');
console.log(`\n✓ data/univ-data.json`);
Object.entries(out.sources).forEach(([k, v]) => console.log(`  ${k.padEnd(12)} ${v.status}${v.count ? ' · ' + v.count + '건' : ''}`));
