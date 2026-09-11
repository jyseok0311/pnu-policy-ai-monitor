// 데이터(JSON) → 정적 HTML 렌더러.
// 파이프라인의 마지막 단계: 수집·분류·집계·LLM 서술이 끝난 결과물(weeks.json)을 HTML 한 장으로 굳힌다.
// 여기서는 어떤 수치도 만들어내지 않는다. 오직 데이터에 있는 값만 출력한다.

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const tierWord = { 4: '위기', 3: '경계', 2: '주의', 1: '관심' };

// ── 각주: [11][12] → 클릭 가능한 버튼
function withRefs(text, refs) {
  if (!refs || !refs.length) return text;
  const sup = refs.map(n => `<button class="ref" data-ref="${n}" title="참조 기사 보기">[${n}]</button>`).join('');
  return text + sup;
}

// ── 주차별 위험신호(위기+경고) 추이 스파크라인
function sparkline(weeks) {
  const series = [...weeks].reverse(); // 오래된 주차 → 최신
  // 주차 간 비교는 같은 소스 구성에서만 공정하다.
  // 완성 주차는 언론사 RSS까지 포함해 수집하므로, 추이에는 구글 소스로 통일한 comparable 값을 쓴다.
  const riskOf = (w) => +(w.comparable ? w.comparable.crisis + w.comparable.warning : w.signal.crisis + w.signal.warning).toFixed(1);
  const vals = series.map(riskOf);
  const max = Math.max(...vals) * 1.15, W = 1000, H = 150, pad = 26;
  const bw = (W - pad * 2) / series.length;
  const bars = series.map((w, i) => {
    const v = vals[i];
    const h = (v / max) * (H - 46);
    const x = pad + i * bw, y = H - 24 - h;
    const fill = w.tier === 4 ? 'var(--crisis)' : w.tier === 3 ? 'var(--warn)' : w.tier === 2 ? 'var(--watch)' : 'var(--ok)';
    return `<a class="bar" href="#${w.id}" aria-label="${esc(w.label)} ${v}%">
      <rect x="${(x + 2).toFixed(1)}" y="${y.toFixed(1)}" width="${(bw - 4).toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="${fill}"/>
      <text x="${(x + bw / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" font-size="12" text-anchor="middle" fill="#4b5563">${v}</text>
      <text x="${(x + bw / 2).toFixed(1)}" y="${H - 8}" font-size="11" text-anchor="middle" fill="#9ca3af">${w.id.replace('w', '')}</text>
    </a>`;
  }).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" role="img" aria-label="주차별 위험신호 비중 추이">
    <line x1="${pad}" y1="${H - 24}" x2="${W - pad}" y2="${H - 24}" stroke="#d9dee6"/>${bars}</svg>`;
}

// ── 완성 주차 본문
function renderWeek(w, sources) {
  const F = sources._freqLabels;
  const s = w.signal, sum = +(s.crisis + s.warning).toFixed(1);

  const head = `
  <div class="wk-head">
    <span class="tier t${w.tier}">Tier ${w.tier} ${esc(w.tierName || tierWord[w.tier])}</span>
    <div>
      <div class="wk-title">${esc(w.label)}</div>
      <div class="wk-range">기사수집기간: ${esc(w.range)}</div>
    </div>
    <div class="state t${w.tier}"><i class="dot d${w.tier}"></i>${esc(w.state)}</div>
  </div>
  <div class="signal">신호: <b>Crisis ${s.crisis}%</b> | <b>Warning ${s.warning}%</b> | 합산 ${sum}% | 총 ${s.total.toLocaleString('ko-KR')}건 | 추세: <b>${esc(s.trend)}</b></div>
  ${w.live ? `<div class="live-note"><span class="live-badge">실데이터</span>${esc(w.sourceNote || '')}</div>` : ''}`;

  if (!w.complete) {
    return `<section class="week" id="${w.id}">${head}
      <div class="stub-body"><b>이 주차는 아직 리포트가 생성되지 않았습니다.</b><br>
      수집·분류가 끝난 신호 집계값만 보유한 상태입니다. 파이프라인(<code>collect → classify → aggregate → narrate</code>)을 해당 주차에 실행하면
      상황요약·리스크 지도·전파경로·부문별 영향표가 이 자리에 동일한 서식으로 채워집니다.</div>
    </section>`;
  }

  const map = `
  <h2 class="sec">🗺 거점국립대 정책 리스크 지도</h2>
  <div class="mapbox"><div class="lmap" id="map-${w.id}" data-week="${w.id}"></div></div>
  <div class="legend">
    <span class="k" style="background:var(--crisis)"></span>주요: ${esc(w.map.legend.primary)}
    | <span class="k" style="background:var(--warn)"></span>부차: ${esc(w.map.legend.secondary)}<br>
    <br><b>세계 랭킹 레이어</b> — 지도 오른쪽 위 <b>🌐</b> 버튼을 누르면 QS·THE 랭킹 대학의 위치와 순위가 함께 표시됩니다.
    <br><b>마커 읽는 법</b> — 크기 = 주목도(주간 언급량) · 색 = 위험신호 비율
    (<span class="k" style="background:#2f8f5b"></span>없음
     <span class="k" style="background:#c9a227"></span>일부
     <span class="k" style="background:#d9822b"></span>있음
     <span class="k" style="background:#b3261e"></span>높음).
    마커에 마우스를 올리면 <b>소재지 · QS/THE 세계대학랭킹 · 주간 주요 키워드 · 대표 기사</b>가 표시됩니다. 지도를 <b>클릭하면 휠 확대/축소</b>가 켜지고(커서 위치 기준), 마우스가 지도를 벗어나면 꺼집니다. Ctrl+휠은 클릭 없이도 동작합니다.<br>
    ── 정책 전달 경로 | - - - 예산 배분 경로(RISE) | ·· AI 인재양성 사업
    | 교란 요인: ${esc(w.map.legend.disturb)} | 완충: ${esc(w.map.legend.buffer)}
  </div>`;

  const summary = `
  <h2 class="sec">상황 요약</h2>
  <div class="sum">${w.summary.map(g => `
    <h3 class="sub">${esc(g.h)}</h3>
    <ul>${g.items.map(it => `<li>${withRefs(it.t, it.refs)}</li>`).join('')}</ul>`).join('')}
  </div>`;

  const articles = `
  <h2 class="sec">📰 주간 참조 기사 (${s.total.toLocaleString('ko-KR')}건 · 7일)</h2>
  ${w.articles.map(d => `
  <details class="day"${d.open ? ' open' : ''}>
    <summary><span>${esc(d.day)}${d.count && d.day.indexOf('건') < 0 ? ` — ${d.count.toLocaleString('ko-KR')}건` : ''}</span></summary>
    <div class="cat">${d.cats.map(c => `
      <h4>${esc(c.name)}${c.count ? ` (${c.count}건)` : ''}</h4>
      <ul>${c.items.map(t => `<li>${esc(t)}</li>`).join('')}
        ${c.count > c.items.length ? `<li class="more">… 외 ${c.count - c.items.length}건</li>` : '<li class="more">… 외 다수</li>'}
      </ul>`).join('')}</div>
  </details>`).join('')}`;

  const changes = `
  <h2 class="sec">${esc(w.changesTitle || '전주 대비 주요 변화')}</h2>
  ${w.changesNote ? `<p class="note-line">${esc(w.changesNote)}</p>` : ''}
  ${w.changes.map(c => `<div class="chg"><span class="arrow ${c.dir}">${c.dir === 'up' ? '🔺' : '🔻'}</span>
    <div><span class="v">${esc(c.v)}</span><div class="why">${esc(c.why)}</div></div></div>`).join('')}`;

  const watch = `
  <h2 class="sec">향후 주시 포인트</h2>
  <div class="watch">${w.watch.map(x => `<div><span>${esc(x.when)}</span>${esc(x.t)}</div>`).join('')}</div>`;

  // 주간 자체산출 지표 — 매주 실제로 변하는 값만 모은 블록
  const weekly = !w.weeklyMetrics ? '' : `
  <h2 class="sec">⚡ 주간 변동 지표 <small>수집 기사에서 파이프라인이 직접 집계 · 매주 갱신</small></h2>
  <div class="kpis">${w.weeklyMetrics.map(m => `
    <div class="kpi live">
      <div class="n"><span>${esc(m.name)}</span></div>
      <div class="val">${esc(m.value)}${m.unit ? `<small>${esc(m.unit)}</small>` : ''}</div>
      <div class="ch ${m.dir}">${m.dir === 'up' ? '▲' : m.dir === 'down' ? '▼' : '—'} ${esc(m.change)}</div>
      <span class="freq f-week">주간</span>
    </div>`).join('')}</div>`;

  const kpis = !w.kpis || !w.kpis.length ? '' : `
  <h2 class="sec">📈 배경 지표 <small>(지표명 클릭 시 원자료 사이트로 이동 · 갱신주기 배지 확인)</small></h2>
  ${w.kpis.map(g => `
  <div class="kpi-group"><h4>${esc(g.group)}</h4><div class="kpis">${g.items.map(k => {
    const src = sources[k.src] || {};
    const f = F[k.freq] || F.year;
    const tip = ['원자료: ' + (src.name || '미지정'), src.note].filter(Boolean).join('\n');
    const nameHtml = src.url
      ? `<a href="${esc(src.url)}" target="_blank" rel="noopener" title="${esc(tip)}">${esc(k.name)}</a>`
      : `<span title="${esc(tip)}">${esc(k.name)}</span>`;
    // 출처 상태 표시. 2차 출처(via)면 실제로 값을 가져온 문서로 바로 갈 수 있게 링크로 만든다.
    const dead = src.status === 'via' && src.viaUrl
      ? `<a class="warn-src via" href="${esc(src.viaUrl)}" target="_blank" rel="noopener" title="${esc(src.note || '')}">⚠ 2차 출처: ${esc(src.viaName || '확인 필요')} ↗</a>`
      : src.status === 'dead'
        ? `<span class="warn-src" title="${esc(src.note || '')}">⚠ 출처 확인필요</span>`
        : '';
    const prof = src.profile ? ` <a class="prof" href="${esc(src.profile)}" target="_blank" rel="noopener" title="부산대 프로필 페이지">↗</a>` : '';
    return `<div class="kpi${k.freq === 'week' ? ' live' : ''}">
      <div class="n">${nameHtml}${prof}<span>${esc(k.period)}</span></div>
      <div class="val">${esc(k.value)}${k.unit ? `<small>${esc(k.unit)}</small>` : ''}</div>
      <div class="ch ${k.dir}">${k.dir === 'up' ? '▲' : k.dir === 'down' ? '▼' : '—'} ${esc(k.change)}</div>
      <span class="freq ${f.cls}">${f.label}</span>${dead}
    </div>`;
  }).join('')}</div></div>`).join('')}`;

  const paths = !w.paths || !w.paths.length ? '' : `
  <h2 class="sec">정책 → 대학 전파경로</h2>
  ${w.paths.map(p => `<div class="path"><span class="tag ${p.cls}">${esc(p.tag)}</span><b>${esc(p.title)}</b> 🏛 경로<div class="flow">${esc(p.flow)}</div></div>`).join('')}
  <h2 class="sec">대학 내 부문간 전파경로</h2>
  ${w.innerPaths.map(p => `<div class="path"><b>${esc(p.title)}</b><div class="flow">${esc(p.flow)}</div></div>`).join('')}`;

  const sectors = !w.sectors || !w.sectors.length ? '' : `
  <h2 class="sec">부문별 영향 및 전파경로</h2>
  <div class="tbl"><table>
    <thead><tr><th>부문</th><th>방향</th><th>초기(0-4주)</th><th>중기(4-12주)</th><th>장기(12주+)</th><th>영향 및 전파경로</th><th>변화</th></tr></thead>
    <tbody>${w.sectors.map(x => `<tr>
      <td>${esc(x.name)}</td>
      <td class="dir">${x.d === 'pos' ? '▲' : x.d === 'neg' ? '▼' : '◆'} ${esc(x.dir)}</td>
      ${x.lv.map(l => `<td><span class="lv ${l}">${{ s: '심각', i: '중요', m: '보통', l: '낮음' }[l]}</span></td>`).join('')}
      <td>${esc(x.desc)}</td>
      <td>${x.chg === 'up' ? '🔺' : x.chg === 'down' ? '🔻' : '—'}</td>
    </tr>`).join('')}</tbody>
  </table></div>`;

  const diag = !w.diagnosis ? '' : `
  <h2 class="sec">대학 취약점 진단 및 모니터링 권고</h2>
  <div class="diag">
    <h4>취약점 진단</h4>
    <ol>${w.diagnosis.weak.map(x => `<li><b>${esc(x.b)}</b>: ${esc(x.t)}</li>`).join('')}</ol>
    <h4>모니터링 권고</h4>
    <ol>${w.diagnosis.rec.map(t => `<li>${esc(t)}</li>`).join('')}</ol>
  </div>`;

  // 🗣 주요 인물·기관 동향 — 개인 SNS는 수집하지 않는다(직책 추적 + 공적 기록만)
  const V = w.voices;
  const voices = !V ? '' : `
  <h2 class="sec">🗣 주요 인물·기관 동향 <small>기사 언급 집계 + 기관 공식 채널 · 개인 SNS 계정은 수집하지 않음</small></h2>
  ${V.persons.length ? `<div class="kpi-group"><h4>인물 (직책 기준)</h4><div class="kpis">${V.persons.map(p => `
    <div class="kpi${p.risky ? '' : ' live'}">
      <div class="n"><span>${esc(p.role)}</span></div>
      <div class="val" style="font-size:15px">${esc(p.who || p.role)}</div>
      <div class="ch ${p.risky ? 'up' : 'flat'}">${p.n}건${p.risky ? ` · 위험신호 ${p.risky}` : ''}</div>
    </div>`).join('')}</div></div>` : ''}
  ${V.orgs.length ? `<div class="kpi-group"><h4>기관·단체</h4><div class="kpis">${V.orgs.map(o => `
    <div class="kpi${o.risky ? '' : ' live'}">
      <div class="n"><span>${esc(o.label)}</span></div>
      <div class="val">${o.n}<small>건</small></div>
      <div class="ch ${o.risky ? 'up' : 'flat'}">${o.risky ? `위험신호 ${o.risky}건` : '—'}</div>
    </div>`).join('')}</div></div>` : ''}
  ${V.vacant && V.vacant.length ? `<p class="note-line">직책만 등록되고 이름이 비어 있어 집계되지 않은 항목: ${V.vacant.map(esc).join(' · ')} — <code>data/watchlist.json</code> 에서 채우면 자동 집계됩니다.</p>` : ''}
  ${V.feeds && V.feeds.length ? `
  <div class="kpi-group"><h4>기관 공식 채널 최신 글 <span style="font-weight:500;color:var(--mute);font-size:12px">${esc(V.feedNote || '')}</span></h4>
  <ul class="reflist">${V.feeds.map(f => `<li>
    <span class="n" style="font-size:11px;color:var(--mute)">${esc(f.channel)}</span>
    <div><a href="${esc(f.link)}" target="_blank" rel="noopener">${esc(f.title)}</a>
    <div class="meta">${esc(f.org)} · ${esc(f.date || '')}</div></div></li>`).join('')}</ul></div>` : ''}`;

  const refs = !w.refs || !w.refs.length ? '' : `
  <h2 class="sec">🔗 참조 기사 원문 <small>본문의 [번호]를 클릭하면 해당 항목으로 이동합니다</small></h2>
  <ul class="reflist">${w.refs.map(r => `
    <li id="${w.id}-ref-${r.n}">
      <span class="n">[${r.n}]</span>
      <div>
        <a href="${esc(r.url)}" target="_blank" rel="noopener">${esc(r.title)}</a>
        <div class="meta">${esc(r.media)} · ${esc(r.date)}${w.live
          ? (r.direct ? ' · <span class="src-ok">원문 URL</span>' : ' · <span class="src-via">구글뉴스 경유</span>')
          : ' · <span class="sample" style="font-size:10px;padding:0 5px">샘플 — 실제 운영 시 기사 원문 URL</span>'}</div>
      </div>
    </li>`).join('')}</ul>`;

  return `<section class="week" id="${w.id}">${head}${map}${summary}${articles}${changes}${watch}${weekly}${kpis}${voices}${paths}${sectors}${diag}${refs}</section>`;
}

export function renderPage({ meta, weeks, sources, css, js, pdfPath, world, joongang }) {
  const nav = weeks.map((w, i) => `
    <li><a class="${i === 0 ? 'on' : ''}" href="#${w.id}" data-nav="${w.id}">
      <i class="dot d${w.tier}"></i>${esc(w.label)}${w.complete ? '' : '<span class="stub">미생성</span>'}
    </a></li>`).join('');

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

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(meta.title)} | PNU</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css">
<style>${css}</style>
</head>
<body>
<div class="shell">
<aside class="side">
  <a class="go" href="daily.html">Go To Daily ›</a>
  <ul>${nav}</ul>
</aside>

<div>
<header class="top">
  <div class="brand">
    <div class="logo">PNU</div>
    <div>
      <h1>${esc(meta.title)}</h1>
      <div class="sub">${esc(meta.org)}${meta.contact ? ' · ' + esc(meta.contact) : ''}</div>
    </div>
  </div>
  <div class="acts">
    <a class="btn" href="${esc(pdfPath)}" target="_blank" rel="noopener" data-pdf title="빌드 때 미리 생성한 표준 PDF">표준 PDF</a>
    <button class="btn ghost" data-print title="지도를 포함해 현재 보고 있는 화면 그대로 인쇄/PDF 저장">현재 화면 PDF</button>
    <button class="btn ghost" data-expand>기사 전체 펼치기</button>
  </div>
</header>

<main class="main">
<p class="notice">${esc(meta.notice)} <span class="sample">${esc(meta.sampleBadge)}</span></p>

<div class="trend">
  <h3>위험신호 비중 추이 (위기+경고, 최근 ${weeks.length}주)</h3>
  <div class="cap">막대를 클릭하면 해당 주차로 이동합니다. 외부 통계가 아니라 <b>수집 기사 분류 결과에서 파이프라인이 직접 산출</b>한 값입니다. 주차 간 비교가 공정하도록 <b>구글 뉴스 소스로 통일</b>해 계산했습니다(과거 주차는 언론사 RSS 소급이 불가).</div>
  <div class="spark-wrap">${sparkline(weeks)}</div>
</div>

${weeks.map(w => renderWeek(w, sources)).join('\n')}

<p class="foot">${esc(meta.foot)}<br>생성: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · 빌드 산출물(정적 HTML) · 데이터 소스: data/weeks.json</p>
</main>
</div>
</div>
<div id="toast"></div>
<script src="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js"></script>
<script>window.__MAPDATA__ = ${JSON.stringify(mapData)};</script>
<script>${js}</script>
</body>
</html>`;
}
