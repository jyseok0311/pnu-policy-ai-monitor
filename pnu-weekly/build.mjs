// 빌드: data/*.json + src/* → dist/index.html (자기완결 정적 파일 1장)
// 사용: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './src/render.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const read = (p) => readFileSync(join(root, p), 'utf8');
const json = (p) => JSON.parse(read(p));

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

const latest = weeks[0];
const pdfPath = 'pdf/PNU_Univ_Policy_AI_Weekly_All.pdf';   // 합본. 주차별 파일은 날짜가 들어간다

const readOpt = (p) => { try { return json(p); } catch { return null; } };
const world = readOpt('data/world-universities.json');
const joongang = readOpt('data/joongang-ranking.json');

const html = renderPage({
  meta, weeks, sources, world, joongang,
  css: read('src/styles.css'),
  js: read('src/app.js'),
  pdfPath
});

mkdirSync(join(root, 'dist/pdf'), { recursive: true });
writeFileSync(join(root, 'dist/index.html'), html, 'utf8');

const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
const done = weeks.filter((w) => w.complete).length;
console.log(`✓ dist/index.html  ${kb} KB`);
if (world) console.log(`  세계 랭킹 ${world.stats.located}개교 · ${world.stats.countries}개국 (THE ${world.panel.the.join('/')}, QS ${world.panel.qs.join('/')})`);
if (joongang) console.log(`  중앙일보 패널 ${Object.keys(joongang.universities).length}개교`);
console.log(`  주차 ${weeks.length}개 (본문 생성 ${done} / 신호만 ${weeks.length - done})`);
console.log(`  PDF 링크 대상: ${pdfPath}`);
