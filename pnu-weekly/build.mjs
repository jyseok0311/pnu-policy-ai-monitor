// 빌드: data/*.json + src/* → dist/index.html (자기완결 정적 파일 1장) · 언어판마다 한 장
// 사용: node build.mjs
import { readFileSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './src/render.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));
const readOpt = (p) => { try { return json(p); } catch { return null; } };

const meta = json('data/meta.json');
const weeks = json('data/weeks.json');
const sources = json('data/sources.json');

// 정합성 검사 — 데이터가 깨지면 조용히 넘어가지 말고 빌드를 세운다
const errs = [];
const ids = new Set();
for (const w of weeks) {
  if (ids.has(w.id)) errs.push(`중복 주차 id: ${w.id}`);
  ids.add(w.id);
  if (!w.signal) errs.push(`${w.id}: signal 누락`);
  if (!w.complete) continue;
  const declared = new Set((w.refs || []).map((r) => r.n));
  const used = new Set();
  for (const g of w.summary || []) for (const it of g.items || []) (it.refs || []).forEach((n) => used.add(n));
  for (const n of used) if (!declared.has(n)) errs.push(`${w.id}: 본문 각주 [${n}]에 대응하는 refs 항목 없음`);
  for (const g of w.kpis || []) for (const k of g.items || []) {
    if (!sources[k.src]) errs.push(`${w.id}: 알 수 없는 출처 키 "${k.src}" (${k.name})`);
    if (!sources._freqLabels[k.freq]) errs.push(`${w.id}: 알 수 없는 갱신주기 "${k.freq}" (${k.name})`);
  }
}
if (errs.length) {
  console.error('✗ 데이터 정합성 오류:\n  - ' + errs.join('\n  - '));
  process.exit(1);
}

const pdfPath = 'pdf/PNU_Univ_Policy_AI_Weekly_All.pdf';   // 합본. 주차별 파일은 날짜가 들어간다
const world = readOpt('data/world-universities.json');
const joongang = readOpt('data/joongang-ranking.json');

const css = read('src/styles.css');
const js = read('src/app.js');
const net3d = read('src/browser/net3d.js');   // 캔버스 렌더러 — app.js 보다 먼저 실려야 한다

// 원본 자산(assets/)을 산출물 옆으로 복사한다. dist/ 는 git 에 없으므로 빌드가 매번 채워야 한다.
cpSync(join(root, 'assets'), join(root, 'dist/assets'), { recursive: true });
mkdirSync(join(root, 'dist/pdf'), { recursive: true });

const html = renderPage({ meta, weeks, sources, world, joongang, css, js, net3d, pdfPath });
writeFileSync(join(root, 'dist/index.html'), html, 'utf8');
console.log(`✓ dist/index.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);

const done = weeks.filter((w) => w.complete).length;
if (world) console.log(`  세계 랭킹 ${world.stats.located}개교 · ${world.stats.countries}개국 (THE ${world.panel.the.join('/')}, QS ${world.panel.qs.join('/')})`);
if (joongang) console.log(`  중앙일보 패널 ${Object.keys(joongang.universities).length}개교`);
console.log(`  주차 ${weeks.length}개 (본문 생성 ${done} / 신호만 ${weeks.length - done})`);
console.log(`  PDF 링크 대상: ${pdfPath}`);
