// 빌드: data/*.json + src/* → dist/index.html (자기완결 정적 파일 1장) · 언어판마다 한 장
// 사용: node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { renderPage } from './src/render.mjs';
import { LANGS } from './src/i18n.mjs';

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
const boot = read('src/theme-boot.js');

// 언어별 파일명 — ko 는 index.html, 나머지는 index.<code>.html
const pageFor = (code) => (code === 'ko' ? 'index.html' : 'index.' + code + '.html');
const hrefs = Object.fromEntries(LANGS.map((L) => [L.code, pageFor(L.code)]));

mkdirSync(join(root, 'dist/pdf'), { recursive: true });

// 언어판을 나눠 굽는다. 서술(narrative)은 data/narrative/<id>.<lang>.json 이 있으면 갈아끼우고,
// 없으면 한국어 본문을 그대로 쓴다 — i18n 의 narrNotice 가 그 사실을 화면에 알린다.
for (const L of LANGS) {
  let translated = 0;
  const localized = L.code === 'ko' ? weeks : weeks.map((w) => {
    const over = readOpt('data/narrative/' + w.id + '.' + L.code + '.json');
    if (over) translated++;
    return over ? { ...w, ...over } : w;
  });
  const html = renderPage({
    meta, weeks: localized, sources, world, joongang,
    css, js, boot, pdfPath, lang: L.code, hrefs
  });
  writeFileSync(join(root, 'dist/' + pageFor(L.code)), html, 'utf8');
  const kb = (Buffer.byteLength(html) / 1024).toFixed(0);
  const note = L.code === 'ko' ? '' : `  본문 번역 ${translated}/${weeks.length}주차`;
  console.log(`✓ dist/${pageFor(L.code)}  ${kb} KB  [${L.label}]${note}`);
}

const done = weeks.filter((w) => w.complete).length;
if (world) console.log(`  세계 랭킹 ${world.stats.located}개교 · ${world.stats.countries}개국 (THE ${world.panel.the.join('/')}, QS ${world.panel.qs.join('/')})`);
if (joongang) console.log(`  중앙일보 패널 ${Object.keys(joongang.universities).length}개교`);
console.log(`  주차 ${weeks.length}개 (본문 생성 ${done} / 신호만 ${weeks.length - done})`);
console.log(`  PDF 링크 대상: ${pdfPath}`);
