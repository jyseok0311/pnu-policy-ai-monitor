// 일일 브리핑 생성 — dist/daily.html (+ 언어판)
// 사용: node daily.mjs
//
// 주간 리포트와 같은 수집본을 날짜로 쪼개 쓴다. 추가 수집이 필요 없다.
// 일간은 서술(LLM)을 두지 않는다. 집계와 기사 목록만으로 구성해 매일 돌려도 비용이 들지 않게 했다.
// 해석이 필요한 판단은 주간 리포트가 맡는다.

import { readFileSync, writeFileSync, readdirSync, cpSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant, mentionsOf } from './src/filter.mjs';
import { sanjini } from './src/browser/sanjini.svg.js';
import { t as pack, LANGS } from './src/i18n.mjs';
import { headerControls } from './src/render.mjs';
const TIER_MOOD = { 1: 'happy', 2: 'base', 3: 'tense', 4: 'angry' };

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const meta = J('data/meta.json');
const pdfPath = 'pdf/PNU_Univ_Policy_AI_Daily_All.pdf';   // 합본
const dailyPdf = (d) => `pdf/PNU_Univ_Policy_AI_Daily(${d.replace(/-/g, '.')}).pdf`;
const TH = J('data/thresholds.json');
const files = readdirSync(join(root, 'data/collected')).filter((f) => f.endsWith('.json')).sort();

// 최근 수집본들을 합쳐 일자별로 재구성 (중복은 제목 기준 제거)
const seen = new Set(); const all = [];
for (const f of files.slice(-2)) {
  for (const it of relevant(J(`data/collected/${f}`).items)) {
    const k = it.title.replace(/\s+/g, '').slice(0, 40);
    if (seen.has(k) || !it.date) continue;
    seen.add(k); all.push(it);
  }
}
const days = [...new Set(all.map((x) => x.date))].sort().reverse().slice(0, 10);

const LVCLS = { crisis: 's', warning: 'i', watch: 'm', normal: 'l' };
const ORDER = { crisis: 0, warning: 1, watch: 2, normal: 3 };

// 일간 등급은 주간 임계값을 그대로 쓰면 안 된다.
// 하루 표본이 20~200건으로 들쭉날쭉해 위험신호 비중의 분산이 주간보다 훨씬 크다.
// (실제로 24건짜리 날이 12.5%로 튀어 Tier4가 됐다)
// 그래서 ① 일간 분포로 임계값을 따로 뽑고 ② 표본이 MIN_N 미만이면 등급을 매기지 않는다.
const MIN_N = 30;
const medOf = (a) => { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length ? (b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2) : 0; };
let DTH = { t4: TH.t4, t3: TH.t3, t2: TH.t2 };
function calibrateDaily(dayRisks) {
  const v = dayRisks.filter((r) => r !== null);
  if (v.length < 5) return;
  const M = medOf(v), MAD = Math.max(medOf(v.map((r) => Math.abs(r - M))), 1.5);
  DTH = { t4: +(M + 2 * MAD).toFixed(1), t3: +(M + MAD).toFixed(1), t2: +M.toFixed(1) };
}
function tierOf(risk, n) {
  if (n < MIN_N) return null;                       // 표본 부족 — 등급 없음
  return risk >= DTH.t4 ? 4 : risk >= DTH.t3 ? 3 : risk >= DTH.t2 ? 2 : 1;
}
const STATE = { 4: 'Crisis', 3: 'Warning', 2: 'Watch', 1: 'Normal' };

const stat = (items) => {
  const n = items.length || 1;
  const p = (l) => +((items.filter((x) => x.level === l).length / n) * 100).toFixed(1);
  const risk = +(p('crisis') + p('warning')).toFixed(1);
  return { n: items.length, crisis: p('crisis'), warning: p('warning'), risk, tier: tierOf(risk, items.length) };
};

// 일간 분포로 임계값 보정 (표본 하한을 넘는 날만 사용)
calibrateDaily(days.map((d) => {
  const it = all.filter((x) => x.date === d);
  if (it.length < MIN_N) return null;
  const n = it.length;
  const q = (l) => (it.filter((x) => x.level === l).length / n) * 100;
  return +(q('crisis') + q('warning')).toFixed(1);
}));

const FIELDS = ['거버넌스', '재정', '입시·학령인구', 'AI·디지털', '기타'];
const wd = (d, T) => T.daily.weekday[new Date(Date.parse(d)).getDay()];

function renderDay(d, idx, T) {
  const D = T.daily;
  const items = all.filter((x) => x.date === d).sort((a, b) => ORDER[a.level] - ORDER[b.level]);
  const s = stat(items);
  const prev = days[idx + 1] ? stat(all.filter((x) => x.date === days[idx + 1])) : null;
  const delta = prev ? (s.risk - prev.risk).toFixed(1) : null;
  const deltaHtml = delta === null ? '' : D.vsPrev(+delta > 0 ? 'up' : 'down', (+delta >= 0 ? '+' : '') + delta);

  const byField = FIELDS.map((f) => ({ f, list: items.filter((x) => x.field === f) })).filter((x) => x.list.length);
  const uni = meta.universities.map((u) => ({ n: u.name, c: mentionsOf(items, u.name) })).filter((x) => x.c).sort((a, b) => b.c - a.c);

  return `<section class="week" id="d-${d}">
  <div class="wk-head">
    <span class="tier-face">${sanjini(s.tier ? (TIER_MOOD[s.tier] || 'base') : 'sad', 44)}</span>
    ${s.tier ? `<span class="tier t${s.tier}">Tier ${s.tier} ${esc(D.tierWord[s.tier])}</span>` : `<span class="tier t0">${esc(D.noTier)}</span>`}
    <div>
      <div class="wk-title">${d.replace(/-/g, '.')} (${esc(wd(d, T))})</div>
      <div class="wk-range">${esc(D.subline)}</div>
    </div>
    ${s.tier ? `<div class="state t${s.tier}"><i class="dot d${s.tier}"></i>${STATE[s.tier]}</div>` : `<div class="state t0">${D.noTierState(MIN_N)}</div>`}
  </div>
  <div class="signal">${D.signal(s.crisis, s.warning, s.risk, s.n, deltaHtml)}</div>
  <div class="live-note"><span class="live-badge">${esc(T.liveBadge)}</span>${esc(D.liveNote)}</div>

  <h2 class="sec">${esc(D.secFields)} <small>${esc(D.dayTotal(s.n))}</small></h2>
  <div class="kpis">${byField.map(({ f, list }) => {
    const r = stat(list);
    return `<div class="kpi${list.length >= 5 && r.risk >= DTH.t3 ? '' : ' live'}">
      <div class="n"><span>${esc(f)}</span></div>
      <div class="val">${list.length}<small>${esc(T.unit)}</small></div>
      <div class="ch ${list.length < 5 ? 'flat' : r.risk >= DTH.t3 ? 'up' : 'flat'}">${esc(list.length < 5 ? D.riskNone : D.riskPct(r.risk))}</div>
    </div>`;
  }).join('')}</div>

  ${uni.length ? `<h2 class="sec">${esc(D.secUni)}</h2>
  <div class="kpis">${uni.map((u) => `<div class="kpi${u.n === '부산대' ? ' live' : ''}">
    <div class="n"><span>${esc(u.n)}</span></div><div class="val">${u.c}<small>${esc(T.unit)}</small></div></div>`).join('')}</div>` : ''}

  <h2 class="sec">${esc(D.secArticles)} <small>${esc(D.secArticlesSub)}</small></h2>
  ${byField.map(({ f, list }) => `
  <details class="day"${f === byField[0].f ? ' open' : ''}>
    <summary><span>${esc(f)} — ${esc(D.count(list.length))}</span></summary>
    <div class="cat"><ul class="artlist">${list.slice(0, 40).map((x) => `
      <li><span class="lv ${LVCLS[x.level]}">${esc(D.lvWord[x.level])}</span>
      <a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <span class="artmeta">${esc(x.media)}</span></li>`).join('')}
      ${list.length > 40 ? `<li class="more">${esc(D.more(list.length - 40))}</li>` : ''}
    </ul></div>
  </details>`).join('')}
</section>`;
}

// 언어별 파일명 — ko 는 daily.html, 나머지는 daily.<code>.html
const pageFor = (code) => (code === 'ko' ? 'daily.html' : 'daily.' + code + '.html');
const weeklyFor = (code) => (code === 'ko' ? 'index.html' : 'index.' + code + '.html');
const hrefs = Object.fromEntries(LANGS.map((L) => [L.code, pageFor(L.code)]));

// 원본 자산(assets/)을 산출물 옆으로 복사한다. dist/ 는 git 에 없으므로 빌드가 매번 채워야 한다.
cpSync(join(root, 'assets'), join(root, 'dist/assets'), { recursive: true });
const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const js = readFileSync(join(root, 'src/app.js'), 'utf8');
const boot = readFileSync(join(root, 'src/theme-boot.js'), 'utf8');

function renderDaily(lang) {
  const T = pack(lang), D = T.daily;
  // 언어별 meta 문구 — <field>En 이 있으면 쓰고, 없으면 한국어 원문을 그대로 둔다
  const M = (k) => (lang !== 'ko' && meta[k + lang.replace(/^(.)/, (c) => c.toUpperCase())]) || meta[k];
  const title = M('title') + ' · ' + D.suffix;

  const nav = days.map((d, i) => {
    const s = stat(all.filter((x) => x.date === d));
    return `<li><a class="${i === 0 ? 'on' : ''}" href="#d-${d}" data-nav="d-${d}">
      <i class="dot ${s.tier ? 'd' + s.tier : 'd0'}"></i>${d.replace(/-/g, '.')} (${esc(wd(d, T))})
      <span class="stub">${esc(D.count(s.n))}</span></a></li>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="${T.htmlLang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | PNU</title>
<script>${boot}</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css}
.artlist{list-style:none;margin:0;padding:0}
.artlist li{display:grid;grid-template-columns:46px 1fr auto;gap:8px;align-items:baseline;padding:5px 0;border-bottom:1px dashed var(--line);font-size:13.5px}
.artlist li:last-child{border-bottom:0}
.artlist .lv{text-align:center;font-size:11px}
.artmeta{color:var(--mute);font-size:12px;white-space:nowrap}
@media (max-width:860px){.artlist li{grid-template-columns:46px 1fr}.artmeta{display:none}}
</style>
</head>
<body>
<div class="shell">
<aside class="side">
  <a class="go" href="${weeklyFor(lang)}">${esc(T.navWeekly)}</a>
  <ul>${nav}</ul>
</aside>
<div>
<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="48" height="48">
    <div><h1>${esc(title)}</h1>
    <div class="sub">${esc(T.brandSub(meta.org))}${meta.contact ? ' · ' + esc(meta.contact) : ''}</div></div>
  </div>
  <div class="acts">
    <select class="pdf-sel" data-pdf-select aria-label="${esc(T.pdfDateLabel)}">
      <option value="${esc(pdfPath)}">${esc(T.pdfAllDays(days.length))}</option>
      ${days.map((d) => `<option value="${esc(dailyPdf(d))}">${d.replace(/-/g, '.')} (${esc(wd(d, T))})</option>`).join('')}
    </select>
    <a class="btn" href="${weeklyFor(lang)}">${esc(T.weeklyLink)}</a>
    <a class="btn ghost" href="${esc(pdfPath)}" target="_blank" rel="noopener" data-pdf>${esc(T.pdfDownload)}</a>
    ${headerControls(T, lang, hrefs)}
  </div>
</header>
<main class="main">
<p class="notice"><span class="sec-face notice-face">${sanjini('grad', 40)}</span>${D.notice}
<span class="sample">${esc(D.thresholdNote(DTH, MIN_N))}</span></p>
${days.map((d, i) => renderDay(d, i, T)).join('\n')}
<p class="foot">${esc(M('foot'))}<br>${esc(T.genAt)}: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · data/collected/</p>
</main>
</div>
</div>
<div id="toast"></div>
<script>${js}</script>
</body>
</html>`;
}

for (const L of LANGS) {
  const html = renderDaily(L.code);
  writeFileSync(join(root, 'dist/' + pageFor(L.code)), html, 'utf8');
  console.log(`✓ dist/${pageFor(L.code)}  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB  [${L.label}]`);
}
console.log(`  ${days.length}일치 · 총 ${all.length}건`);
console.log(`  일간 임계값 T4≥${DTH.t4}% T3≥${DTH.t3}% T2≥${DTH.t2}% (표본 ${MIN_N}건 미만은 미산정)`);
days.forEach((d) => { const s = stat(all.filter((x) => x.date === d)); console.log(`  ${d}  ${String(s.n).padStart(3)}건  위험신호 ${String(s.risk).padStart(5)}%  ${s.tier ? 'T' + s.tier : '—'}`); });
