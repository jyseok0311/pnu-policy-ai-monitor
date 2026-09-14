// 데이터(JSON) → 정적 HTML 렌더러.
// 파이프라인의 마지막 단계: 수집·분류·집계·LLM 서술이 끝난 결과물(weeks.json)을 HTML 한 장으로 굳힌다.
// 여기서는 어떤 수치도 만들어내지 않는다. 오직 데이터에 있는 값만 출력한다.
//
// UI 문자열(라벨·범례·안내문)은 src/strings.mjs 한 곳에서 가져온다.

import { sanjini } from './browser/sanjini.svg.js';
import { networkSvg, FIELD_COLOR, riskColor } from './network.mjs';
import { T } from './strings.mjs';

// 등급 → 산지니 표정. 숫자를 읽기 전에 상태가 전달되게 한다(등급 색의 보조 단서).
const TIER_MOOD = { 1: 'happy', 2: 'base', 3: 'tense', 4: 'angry' };

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// ── 각주: [11][12] → 클릭 가능한 버튼
function withRefs(text, refs) {
  if (!refs || !refs.length) return text;
  const sup = refs.map(n => `<button class="ref" data-ref="${n}" title="[${n}]">[${n}]</button>`).join('');
  return text + sup;
}

// ── 주차별 위험신호(위기+경고) 추이 — 막대 + 추세선 콤보
// 막대는 그 주의 수준, 선은 주차 간 흐름을 보여준다. 둘을 겹쳐야 '얼마나'와 '어느 쪽으로'가 함께 읽힌다.
function sparkline(weeks, T) {
  const series = [...weeks].reverse();   // 오래된 주차 → 최신
  // 주차 간 비교는 같은 소스 구성에서만 공정하다.
  // 완성 주차는 언론사 RSS까지 포함해 수집하므로, 추이에는 구글 국내 소스로 통일한 comparable 값을 쓴다.
  const riskOf = (w) => +(w.comparable ? w.comparable.crisis + w.comparable.warning : w.signal.crisis + w.signal.warning).toFixed(1);
  const vals = series.map(riskOf);

  const W = 1000, H = 210;
  const padL = 46, padR = 18, padT = 30, padB = 34;   // 좌측은 y축 눈금 자리
  const plotW = W - padL - padR, plotH = H - padT - padB;

  // 눈금은 읽기 쉬운 단위로 올림하되 촘촘하게 잡는다.
  // 1·2·5 배수만 쓰면 최댓값 11.7 에 눈금 20 이 잡혀 위쪽이 크게 비었다.
  const raw = Math.max(...vals, 1) * 1.12;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const STEPS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const max = STEPS.map((k) => k * mag).find((v) => v >= raw) || raw;

  const slot = plotW / series.length;
  const barW = Math.min(slot * 0.42, 46);             // 막대가 너무 굵어지지 않게 상한을 둔다
  const cx = (i) => padL + slot * i + slot / 2;
  const y = (v) => padT + plotH - (v / max) * plotH;

  const ticks = [0, max / 2, max].map((t) => `
    <line x1="${padL}" y1="${y(t).toFixed(1)}" x2="${W - padR}" y2="${y(t).toFixed(1)}"
      stroke="${t === 0 ? '#c8cfd9' : '#eceff3'}" stroke-width="1"/>
    <text x="${padL - 8}" y="${(y(t) + 4).toFixed(1)}" font-size="11" text-anchor="end" fill="#9ca3af">${Number.isInteger(t) ? t : +t.toFixed(1)}</text>`).join('');

  const bars = series.map((w, i) => {
    const v = vals[i], h = Math.max(plotH - (y(v) - padT), 1.5);
    const fill = w.tier === 4 ? 'var(--crisis)' : w.tier === 3 ? 'var(--warn)' : w.tier === 2 ? 'var(--watch)' : 'var(--ok)';
    return `<a class="bar" href="#${w.id}" aria-label="${esc(w.label)} ${v}%">
      <rect x="${(cx(i) - barW / 2).toFixed(1)}" y="${y(v).toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" rx="3" fill="${fill}" fill-opacity=".82"/>
      <rect x="${(cx(i) - slot / 2).toFixed(1)}" y="${padT}" width="${slot.toFixed(1)}" height="${plotH}" fill="transparent"/>
      <text x="${cx(i).toFixed(1)}" y="${(H - 12).toFixed(1)}" font-size="12" text-anchor="middle" fill="#6b7280">${esc(w.label.slice(5, 10))}</text>
      <text x="${cx(i).toFixed(1)}" y="${(H - 24).toFixed(1)}" font-size="10.5" text-anchor="middle" fill="#b6bcc6">W${w.id.replace('w', '')}</text>
    </a>`;
  }).join('');

  const pts = series.map((w, i) => `${cx(i).toFixed(1)},${y(vals[i]).toFixed(1)}`).join(' ');
  const dots = series.map((w, i) => `
    <circle cx="${cx(i).toFixed(1)}" cy="${y(vals[i]).toFixed(1)}" r="4" fill="#fff" stroke="var(--navy)" stroke-width="2"/>
    <text x="${cx(i).toFixed(1)}" y="${(y(vals[i]) - 11).toFixed(1)}" font-size="12" font-weight="700" text-anchor="middle" fill="var(--navy)">${vals[i]}</text>`).join('');

  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(T.trendAria)}">
    ${ticks}${bars}
    <polyline points="${pts}" fill="none" stroke="var(--navy)" stroke-width="2.5"
      stroke-linejoin="round" stroke-linecap="round" opacity=".85"/>
    ${dots}
    <text x="${padL - 8}" y="${(padT - 12).toFixed(1)}" font-size="10.5" text-anchor="end" fill="#9ca3af">%</text>
  </svg>`;
}

// ── 완성 주차 본문
function renderWeek(w, sources, T) {
  const F = sources._freqLabels;
  const s = w.signal, sum = +(s.crisis + s.warning).toFixed(1);
  const num = (n) => Number(n).toLocaleString(T.locale);
  const cnt = (n) => num(n) + T.unit;             // '64건' / '64'

  const head = `
  <div class="wk-head">
    <span class="tier-face" title="Tier ${w.tier} ${esc(T.tierWord[w.tier])}">${sanjini(TIER_MOOD[w.tier] || 'base', 46)}</span>
    <span class="tier t${w.tier}">Tier ${w.tier} ${esc(w.tierName || T.tierWord[w.tier])}</span>
    <div>
      <div class="wk-title">${esc(w.label)}</div>
      <div class="wk-range">${esc(T.collectRange)}: ${esc(w.range)}</div>
    </div>
    <div class="state t${w.tier}"><i class="dot d${w.tier}"></i>${esc(w.state)}</div>
  </div>
  <div class="signal">${T.signal(s.crisis, s.warning, sum, num(s.total), esc(s.trend))}</div>
  ${w.live ? `<div class="live-note"><span class="live-badge">${esc(T.liveBadge)}</span>${esc(w.sourceNote || '')}</div>` : ''}`;

  if (!w.complete) {
    return `<section class="week" id="${w.id}">${head}
      <div class="stub-body"><span class="empty-face">${sanjini(w.partial ? 'base' : 'question', 40)}</span><b>${esc(w.partial ? T.progressTitle : T.stubTitle)}</b><br>
      ${w.partial ? esc(T.progressBody) : T.stubBody}</div>
    </section>`;
  }

  const map = `
  <h2 class="sec">🏫 ${esc(T.secMap)}</h2>
  <div class="mapbox"><div class="lmap" id="map-${w.id}" data-week="${w.id}"></div></div>
  <div class="legend">
    <span class="k" style="background:var(--crisis)"></span>${esc(T.legPrimary)}: ${esc(w.map.legend.primary)}
    | <span class="k" style="background:var(--warn)"></span>${esc(T.legSecondary)}: ${esc(w.map.legend.secondary)}<br>
    <br>${T.legWorld}
    <br>${T.legMarker}
    (<span class="k" style="background:#2f8f5b"></span>${esc(T.legNone)}
     <span class="k" style="background:#c9a227"></span>${esc(T.legSome)}
     <span class="k" style="background:#d9822b"></span>${esc(T.legHas)}
     <span class="k" style="background:#b3261e"></span>${esc(T.legHigh)}).
    ${T.legHover}<br>
    ${T.legPaths}
    | ${esc(T.legDisturb)}: ${esc(w.map.legend.disturb)} | ${esc(T.legBuffer)}: ${esc(w.map.legend.buffer)}
  </div>`;

  // 🕸 주간 키워드 네트워크 — 지도가 '어디'라면 이건 '무엇끼리'다.
  const net = !w.network || !w.network.nodes || !w.network.nodes.length ? '' : `
  <h2 class="sec">🕸 ${esc(T.secNet)} <small>${esc(T.netSub(Math.min(w.network.nodes.length, 22), w.network.links.length, num(w.network.basis)))}</small></h2>
  <div class="netbox" data-net>${networkSvg(w.network, { esc, id: w.id, label: T.secNet })}</div>
  <div class="legend">
    ${Object.entries(FIELD_COLOR).map(([f, c]) => `<span class="k" style="background:${c}"></span>${esc(f)}`).join(' ')}
    <br><span class="k ring" style="border-color:${riskColor(0)}"></span>${esc(T.netRisk)} 0–8%
    <span class="k ring" style="border-color:${riskColor(10)}"></span>8–20%
    <span class="k ring" style="border-color:${riskColor(25)}"></span>20–40%
    <span class="k ring" style="border-color:${riskColor(50)}"></span>40%+
    <br>${T.netLegend(w.network.minEdge, w.network.minCount)}
  </div>`;

  const summary = `
  <h2 class="sec">${esc(T.secSummary)}</h2>
  <div class="sum">${w.summary.map(g => `
    <h3 class="sub">${esc(g.h)}</h3>
    <ul>${g.items.map(it => `<li>${withRefs(it.t, it.refs)}</li>`).join('')}</ul>`).join('')}
  </div>`;

  const articles = `
  <h2 class="sec">${esc(T.secArticles(num(s.total)))}</h2>
  ${w.articles.map(d => `
  <details class="day"${d.open ? ' open' : ''}>
    <summary><span>${esc(d.day)}${d.count && d.day.indexOf('건') < 0 ? ` — ${cnt(d.count)}` : ''}</span></summary>
    <div class="cat">${d.cats.map(c => `
      <h4>${esc(c.name)}${c.count ? ` (${cnt(c.count)})` : ''}</h4>
      <ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}
        ${c.count > c.items.length ? `<li class="more">${esc(T.more(c.count - c.items.length))}</li>` : `<li class="more">${esc(T.moreMany)}</li>`}
      </ul>`).join('')}</div>
  </details>`).join('')}`;

  // 🌐 해외 동향 — 참고용. 신호·지표·네트워크 어디에도 들어가지 않으므로 참조 기사 뒤에 따로 둔다.
  const LVW = { crisis: '위기', warning: '경고', watch: '관찰', normal: '일반' };
  const LVC = { crisis: 's', warning: 'i', watch: 'm', normal: 'l' };
  const O = w.overseas;
  const overseasRef = !O ? '' : `
  <h2 class="sec">${esc(T.secOverseas(num(O.total)))} <small>${esc(T.overseasSub)}</small></h2>
  ${!O.total ? `<p class="note-line">${esc(T.overseasNone)}</p>` : O.groups.map(g => `
  <details class="day">
    <summary><span>${esc(g.field)} — ${cnt(g.count)}</span></summary>
    <div class="cat"><ul class="artlist">${g.items.map(x => `
      <li><span class="lv ${LVC[x.level] || 'l'}"${x.why ? ` title="${esc(T.whyTip(LVW[x.level] || x.level, x.why))}"` : ''}>${esc(LVW[x.level] || x.level)}</span>
      <a href="${esc(x.link)}" target="_blank" rel="noopener">${esc(x.title)}</a>
      <span class="artmeta">${esc(x.media || '')}${x.date ? ' · ' + esc(x.date) : ''}</span></li>`).join('')}
      ${g.count > g.items.length ? `<li class="more">${esc(T.more(g.count - g.items.length))}</li>` : ''}
    </ul></div>
  </details>`).join('')}`;

  const changes = `
  <h2 class="sec">${esc(w.changesTitle || T.changesDefault)}</h2>
  ${w.changesNote ? `<p class="note-line">${esc(w.changesNote)}</p>` : ''}
  ${w.changes.map(c => `<div class="chg"><span class="arrow ${c.dir}">${c.dir === 'up' ? '🔺' : '🔻'}</span>
    <div><span class="v">${esc(c.v)}</span><div class="why">${esc(c.why)}</div></div></div>`).join('')}`;

  const watch = `
  <h2 class="sec"><span class="sec-face">${sanjini('question', 30)}</span>${esc(T.secWatch)}</h2>
  <div class="watch">${w.watch.map(x => `<div><span>${esc(x.when)}</span>${esc(x.t)}</div>`).join('')}</div>`;

  // 주간 자체산출 지표 — 매주 실제로 변하는 값만 모은 블록
  const weekly = !w.weeklyMetrics ? '' : `
  <h2 class="sec">${esc(T.secWeekly)} <small>${esc(T.secWeeklySub)}</small></h2>
  <div class="kpis">${w.weeklyMetrics.map(m => `
    <div class="kpi live">
      <div class="n"><span>${esc(m.name)}</span></div>
      <div class="val">${esc(m.value)}${m.unit ? `<small>${esc(m.unit)}</small>` : ''}</div>
      <div class="ch ${m.dir}">${m.dir === 'up' ? '▲' : m.dir === 'down' ? '▼' : '—'} ${esc(m.change)}</div>
      <span class="freq f-week">${esc(T.weekBadge)}</span>
    </div>`).join('')}</div>`;

  const kpis = !w.kpis || !w.kpis.length ? '' : `
  <h2 class="sec">${esc(T.secKpi)} <small>${esc(T.secKpiSub)}</small></h2>
  ${w.kpis.map(g => `
  <div class="kpi-group"><h4>${esc(g.group)}</h4><div class="kpis">${g.items.map(k => {
    const src = sources[k.src] || {};
    const f = F[k.freq] || F.year;
    const tip = ['원자료: ' + (src.name || '—'), src.note].filter(Boolean).join('\n');
    const nameHtml = src.url
      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener" title="${esc(tip)}">${esc(k.name)}</a>`
      : `<span title="${esc(tip)}">${esc(k.name)}</span>`;
    // 출처 상태 표시. 2차 출처(via)면 실제로 값을 가져온 문서로 바로 갈 수 있게 링크로 만든다.
    const dead = src.status === 'via' && src.viaUrl
      ? `<a class="warn-src via" href="${esc(src.viaUrl)}" target="_blank" rel="noopener" title="${esc(src.note || '')}">⚠ 2차 출처: ${esc(src.viaName || '')} ↗</a>`
      : src.status === 'dead'
        ? `<span class="warn-src" title="${esc(src.note || '')}">⚠ 출처 확인필요</span>`
        : '';
    const prof = src.profile ? ` <a class="prof" href="${esc(src.profile)}" target="_blank" rel="noopener" title="PNU">↗</a>` : '';
    return `<div class="kpi${k.freq === 'week' ? ' live' : ''}">
      <div class="n">${nameHtml}${prof}<span>${esc(k.period)}</span></div>
      <div class="val">${esc(k.value)}${k.unit ? `<small>${esc(k.unit)}</small>` : ''}</div>
      <div class="ch ${k.dir}">${k.dir === 'up' ? '▲' : k.dir === 'down' ? '▼' : '—'} ${esc(k.change)}</div>
      <span class="freq ${f.cls}">${f.label}</span>${dead}
    </div>`;
  }).join('')}</div></div>`).join('')}`;

  const paths = !w.paths || !w.paths.length ? '' : `
  <h2 class="sec">${esc(T.secPaths)}</h2>
  ${w.paths.map(p => `<div class="path"><span class="tag ${p.cls}">${esc(p.tag)}</span><b>${esc(p.title)}</b> 🏛 ${esc(T.pathRoute)}<div class="flow">${esc(p.flow)}</div></div>`).join('')}
  <h2 class="sec">${esc(T.secInner)}</h2>
  ${w.innerPaths.map(p => `<div class="path"><b>${esc(p.title)}</b><div class="flow">${esc(p.flow)}</div></div>`).join('')}`;

  const sectors = !w.sectors || !w.sectors.length ? '' : `
  <h2 class="sec">${esc(T.secSectors)}</h2>
  <div class="tbl"><table>
    <thead><tr><th>${esc(T.thSector)}</th><th>${esc(T.thDir)}</th><th>${esc(T.thEarly)}</th><th>${esc(T.thMid)}</th><th>${esc(T.thLate)}</th><th>${esc(T.thImpact)}</th><th>${esc(T.thChange)}</th></tr></thead>
    <tbody>${w.sectors.map(x => `<tr>
      <td>${esc(x.name)}</td>
      <td class="dir">${x.d === 'pos' ? '▲' : x.d === 'neg' ? '▼' : '◆'} ${esc(x.dir)}</td>
      ${x.lv.map(l => `<td><span class="lv ${l}">${esc(T.lvWord[l])}</span></td>`).join('')}
      <td>${esc(x.desc)}</td>
      <td>${x.chg === 'up' ? '🔺' : x.chg === 'down' ? '🔻' : '—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;

  const diag = !w.diagnosis ? '' : `
  <h2 class="sec">${esc(T.secDiag)}</h2>
  <div class="diag">
    <h4><span class="sec-face">${sanjini('question', 26)}</span>${esc(T.subWeak)}</h4>
    <ol>${w.diagnosis.weak.map(x => `<li><b>${esc(x.b)}</b>: ${esc(x.t)}</li>`).join('')}</ol>
    <h4><span class="sec-face">${sanjini('idea', 26)}</span>${esc(T.subRec)}</h4>
    <ol>${w.diagnosis.rec.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
  </div>`;

  // 🗣 주요 인물·기관 동향 — 개인 SNS는 수집하지 않는다(직책 추적 + 공적 기록만)
  const V = w.voices;
  const voices = !V ? '' : `
  <h2 class="sec">${esc(T.secVoices)} <small>${esc(T.secVoicesSub)}</small></h2>
  ${V.persons.length ? `<div class="kpi-group"><h4>${esc(T.grpPersons)}</h4><div class="kpis">${V.persons.map(p => `
    <div class="kpi${p.n === 0 ? ' muted' : p.risky ? '' : ' live'}">
      ${p.n === 0 ? `<span class="empty-face">${sanjini('question', 26)}</span>` : ''}
      <div class="n"><span>${esc(p.role)}</span></div>
      <div class="val" style="font-size:15px">${esc(p.who || p.role)}</div>
      <div class="ch ${p.n === 0 ? 'flat' : p.risky ? 'up' : 'flat'}">${cnt(p.n)}${p.risky ? ` · ${esc(T.riskySuffix(p.risky))}` : p.n === 0 ? ` · ${esc(T.noMention)}` : ''}</div>
    </div>`).join('')}</div></div>` : ''}
  ${V.orgs.length ? `<div class="kpi-group"><h4>${esc(T.grpOrgs)}</h4><div class="kpis">${V.orgs.map(o => `
    <div class="kpi${o.risky ? '' : ' live'}">
      <div class="n"><span>${esc(o.label)}</span></div>
      <div class="val">${num(o.n)}${T.unit ? `<small>${T.unit}</small>` : ''}</div>
      <div class="ch ${o.risky ? 'up' : 'flat'}">${o.risky ? esc(T.riskySuffix(o.risky)) : '—'}</div>
    </div>`).join('')}</div></div>` : ''}
  ${V.vacant && V.vacant.length ? `<p class="note-line">${T.vacantNote(V.vacant.map(esc).join(' · '))}</p>` : ''}
  ${!(V.feeds && V.feeds.length) && V.feedNote ? `<p class="note-line">${esc(T.grpFeeds)} — ${esc(V.feedNote)}</p>` : ''}
  ${V.feeds && V.feeds.length ? `
  <div class="kpi-group"><h4>${esc(T.grpFeeds)} <span style="font-weight:500;color:var(--mute);font-size:12px">${esc(V.feedNote || '')}</span></h4>
  <ul class="reflist feedlist">${V.feeds.map(f => `<li>
    <span class="n" style="font-size:11px;color:var(--mute)">${esc(f.channel)}</span>
    <div><a href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.title)}</a>
    <div class="meta">${esc(f.org)} · ${esc(f.date || '')}</div></div></li>`).join('')}</ul></div>` : ''}`;

  const refs = !w.refs || !w.refs.length ? '' : `
  <h2 class="sec">${esc(T.secRefs)} <small>${esc(T.secRefsSub)}</small></h2>
  <ul class="reflist">${w.refs.map(r => `
    <li id="${w.id}-ref-${r.n}">
      <span class="n">[${r.n}]</span>
      <div>
        <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
        <div class="meta">${esc(r.media)} · ${esc(r.date)}${w.live
          ? (r.direct ? ` · <span class="src-ok">${esc(T.srcDirect)}</span>` : ` · <span class="src-via">${esc(T.srcVia)}</span>`)
          : ''}</div>
      </div>
    </li>`).join('')}</ul>`;

  return `<section class="week" id="${w.id}">${head}${map}${net}${summary}${articles}${overseasRef}${changes}${watch}${weekly}${kpis}${voices}${paths}${sectors}${diag}${refs}</section>`;
}

// PDF 파일명 규칙 — pdf.mjs 가 굽는 이름과 반드시 같아야 한다
const pdfName = (date) => `PNU_Univ_Policy_AI_Weekly(${date.replace(/-/g, '.')}).pdf`;

export function renderPage({ meta, weeks, sources, css, js, net3d, pdfPath, world, joongang }) {

  // 주차마다 취합한 국내 기사 수를 단다 — 어느 주가 조용했는지 목록만 훑어도 보인다.
  // signal.total 은 리포트 머리글의 '국내 기사 N건' 과 같은 수다(비교용 구글 한정 수치가 아니다).
  const navTotal = weeks.reduce((a, w) => a + ((w.signal && w.signal.total) || 0), 0);
  const nav = weeks.map((w, i) => {
    const n = (w.signal && w.signal.total) || 0;
    const badge = w.complete ? '' : `<span class="stub${w.partial ? ' live' : ''}">${esc(w.partial ? T.progressBadge : T.stubBadge)}</span>`;
    return `
    <li><a class="${i === 0 ? 'on' : ''}" href="#${w.id}" data-nav="${w.id}">
      <i class="dot d${w.tier}"></i>${esc(w.label)}${n ? `<span class="cnt">${esc(T.navCount(n))}</span>` : ''}${badge}
    </a></li>`;
  }).join('');

  const mapData = {
    universities: meta.universities,
    hub: meta.hub,
    // 세계 랭킹 대학(좌표 포함) — 지도 레이어로 켤 수 있다
    world: world ? {
      panel: world.panel,
      rows: world.universities.map((u) => [u.name, u.country, u.lat, u.lng,
        (u.the && u.the[world.panel.latest.the] || {}).rank || null,
        (u.qs && u.qs[world.panel.latest.qs] || {}).rank || null,
        u.the ? Object.keys(u.the).map((y) => [y, u.the[y].rank]) : []])
    } : null,
    joongang: joongang ? joongang.universities : null,
    weeks: Object.fromEntries(weeks.filter(w => w.complete).map(w => [w.id, w.map]))
  };

  const title = meta.title;

  // 네트워크 클릭 토스트 — 키워드마다 문구를 미리 만들어 둔다.
  // 조사(이/가·은/는) 규칙을 클라이언트에 한 벌 더 두지 않기 위해서다. {n} 만 런타임에 채운다.
  const netMsg = {};
  for (const w of weeks) {
    for (const nd of (w.network && w.network.nodes) || []) {
      if (netMsg[nd.key]) continue;
      netMsg[nd.key] = { hit: T.netHit(nd.key, '{n}'), miss: T.netMiss(nd.key) };
    }
  }

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} | PNU</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>${css}</style>
</head>
<body>
<div class="shell">
<aside class="side">
  <a class="go" href="daily.html">${esc(T.navDaily)}</a>
  <div class="side-sum">${esc(T.navTotal(weeks.length, navTotal))}</div>
  <ul>${nav}</ul>
</aside>

<div>
<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="48" height="48">
    <div>
      <h1>${esc(title)}</h1>
      <div class="sub">${esc(T.brandSub(meta.org))}${meta.contact ? ' · ' + esc(meta.contact) : ''}</div>
    </div>
  </div>
  <div class="acts">
    <select class="pdf-sel" data-pdf-select aria-label="${esc(T.pdfSelectLabel)}">
      <option value="${esc(pdfPath)}">${esc(T.pdfAll(weeks.length))}</option>
      ${weeks.filter(w => w.complete).map(w => `<option value="pdf/${esc(pdfName(w.date))}">${esc(w.label)}</option>`).join('')}
    </select>
    <a class="btn" href="${esc(pdfPath)}" target="_blank" rel="noopener" data-pdf>${esc(T.pdfDownload)}</a>
  </div>
</header>

<main class="main">
<p class="notice"><span class="sec-face notice-face">${sanjini('grad', 40)}</span>${esc(meta.notice)} <span class="sample">${esc(meta.sampleBadge)}</span></p>

<details class="trend" open>
  <summary><h3>${esc(T.trendTitle(weeks.length))}</h3></summary>
  <div class="cap">${T.trendCap}</div>
  <div class="spark-wrap">${sparkline(weeks, T)}</div>
</details>

${weeks.map(w => renderWeek(w, sources, T)).join('\n')}

<p class="foot">${esc(meta.foot)}<br>${esc(T.genAt)}: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · data/weeks.json</p>
</main>
</div>
</div>
<div id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>window.__MAPDATA__ = ${JSON.stringify(mapData)};
window.__SANJINI_TENSE__ = ${JSON.stringify(sanjini('tense', 44))};
window.__PNU_NETMSG__ = ${JSON.stringify(netMsg)};</script>
<script>${net3d || ''}</script>
<script>${js}</script>
</body>
</html>`;
}
