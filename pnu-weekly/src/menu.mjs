// 메뉴(헤더·주차/날짜 목록) — 주간 리포트와 일일 브리핑이 함께 쓴다.
//
// 시안 A '관제실'(dist/menu-lab.html)을 옮긴 것이다. 두 페이지가 같은 틀을 쓰도록
// 한 곳에 둔다 — 따로 두면 한쪽만 고쳐져 어긋난다(예전 'Go To Daily'와 '‹ Go To Weekly'가 그랬다).
//
// 줄기
//   헤더  위쪽 전체로 편 한 줄. 브랜드 · 주간/일일 전환 · 설명 · PDF.
//   목록  행마다 [번호] [날짜] [위험신호 막대] [건수] 를 고정 칸으로 둔다.
//         등급을 8px 점이 아니라 길이 있는 막대로 — 훑기만 해도 어느 주가 높았는지 보인다.
//         막대 색은 추이 차트 막대와 같은 면 색(--crisis·--warn·--watch·--ok)이다.
//   모바일 같은 <a> 를 칩으로 줄여 쓴다(번호 + 날짜, 위쪽 띠가 등급 색). 마크업은 하나다.

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// 막대는 '면'이다 — 글자 배경용 어두운 토큰(--*-ink)이 아니라 차트와 같은 밝은 면 색을 쓴다.
// 등급 미산정(표본 부족)은 회색. 색만으로 뜻을 전하지 않도록 행 제목(title·aria-label)에 등급 낱말을 함께 둔다.
const FILL = { 4: 'var(--crisis)', 3: 'var(--warn)', 2: 'var(--watch)', 1: 'var(--ok)' };
const WORD = { 4: '위기', 3: '경계', 2: '주의', 1: '관심' };
export const fillOf = (tier) => FILL[tier] || 'var(--slate-ink)';
export const wordOf = (tier) => WORD[tier] || '등급 미산정';

/**
 * 헤더.
 * @param view  'weekly' | 'daily' — 전환 단추의 켜진 쪽
 * @param acts  오른쪽에 둘 HTML(PDF 선택·단추)
 */
export function header({ brand, sub, view, acts, T }) {
  const tab = (key, href, long, short) => {
    const on = view === key;
    // 긴 이름·짧은 이름을 둘 다 넣고 폭에 따라 하나를 숨긴다. 화면 낭독기는 숨김과 상관없이
    // 둘을 이어 '주간 리포트주간'으로 읽었다 — 링크 자체에 이름을 붙여 한 번만 읽게 한다.
    return `<a href="${href}" aria-label="${esc(long)}"${on ? ' class="on" aria-current="page"' : ''}><span class="l" aria-hidden="true">${esc(long)}</span><span class="s" aria-hidden="true">${esc(short)}</span></a>`;
  };
  return `<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="30" height="30">
    <h1 class="bmark">${esc(brand)}</h1>
  </div>
  <nav class="seg" aria-label="${esc(T.segLabel)}">${tab('weekly', 'index.html', T.segWeekly, T.segWeeklyShort)}${tab('daily', 'daily.html', T.segDaily, T.segDailyShort)}</nav>
  <p class="sub">${esc(sub)}</p>
  <div class="acts">${acts}</div>
</header>`;
}

/**
 * 목록(레일).
 * @param stats  [{ v, label }] 위쪽 요약 두 칸
 * @param cols   [번호, 위험신호, 건수] 칸 머리글
 * @param rows   [{ id, on, tag, dt, state, stateFull, risk, tier, n, aria, month }]
 * @param maxRisk 막대 길이의 기준(가장 높은 값이 꽉 찬다)
 */
export function rail({ stats, cols, rows, maxRisk, T }) {
  const fmt = (n) => Number(n || 0).toLocaleString('ko-KR');
  let lastMonth = null;
  const items = rows.map((r) => {
    const mo = r.month !== lastMonth ? `<li class="mo" aria-hidden="true">${r.month}월</li>` : '';
    lastMonth = r.month;
    // 등급을 매기지 못한 날(표본 부족)은 길이를 그리지 않는다.
    // 기사 19건짜리 날의 위험신호 비율이 가장 높게 나와 회색 막대가 꽉 차 있었다 —
    // '가장 위험한 날'로 읽히는데, 실제 뜻은 '표본이 적어 판단하지 않는다'였다. 빈 점선 칸으로 둔다.
    const na = !r.tier;
    const w = na ? 0 : Math.max(4, Math.min(100, (r.risk / (maxRisk || 1)) * 100)).toFixed(0);
    const st = r.state ? `<i class="st ${r.state}" title="${esc(r.stateFull || '')}">${esc(T.navState[r.state])}</i>` : '';
    return `${mo}<li><a${r.on ? ' class="on"' : ''} href="#${esc(r.id)}" data-nav="${esc(r.id)}" style="--t:${fillOf(r.tier)}" title="${esc(r.aria)}" aria-label="${esc(r.aria)}">
      <span class="wk">${esc(r.tag)}</span><span class="dt">${esc(r.dt)}${st}</span>
      <span class="bar${na ? ' na' : ''}" aria-hidden="true"><i style="width:${w}%"></i></span><span class="n">${fmt(r.n)}</span></a></li>`;
  }).join('');

  return `<aside class="side">
  <div class="side-stats">${stats.map((s) => `<div><b>${esc(s.v)}</b><small>${esc(s.label)}</small></div>`).join('')}</div>
  <div class="side-head" aria-hidden="true"><span>${esc(cols[0])}</span><span>${esc(cols[1])}</span><span>${esc(cols[2])}</span></div>
  <ul>${items}</ul>
</aside>`;
}
