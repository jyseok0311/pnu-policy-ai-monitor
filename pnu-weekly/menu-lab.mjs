// 메뉴(헤더·주차 목록·모바일 띠) 디자인 시안 — dist/menu-lab.html
// 사용: node menu-lab.mjs
//
// 세 방향을 같은 실데이터(weeks.json)로 그려 나란히 비교한다. 본문은 건드리지 않고
// '메뉴'만 바꾼다 — 한 번에 한 가지만 달라야 무엇 때문에 달라 보이는지 알 수 있다.
//
// 방향은 장르 계열에서 고른다(taste 스킬의 방법: 방향을 먼저 정하고, 표면마다 강조색은 하나).
//   A 관제실   Systemic / data   — 이 제품이 실제로 하는 일(감시·신호)에 맞춘 방향
//   B 브리핑지 Retro / print     — 매주 발행되는 보고서라는 성격에 맞춘 방향
//   C 신성한 빛 Ethereal / divine — 스킬의 본래 미감을 UI 로 옮긴 방향
//
// 세 시안 모두 지키는 것
//   · 위험 등급 색(위기·경계·주의·관심)의 의미는 그대로 둔다
//   · 글자 대비 4.5:1 이상
//   · 공통으로 고치는 것: 'Go To Daily' 영어 → 주간/일일 전환, 반복되는 연도 제거,
//     등급을 점이 아닌 크기 있는 표시로, 행 높이 고정(줄바꿈 들쭉날쭉 제거), 월 단위 묶음

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const meta = J('data/meta.json');
const weeks = J('data/weeks.json');

// ── 메뉴가 쓰는 값만 추린다
const W = weeks.map((w) => {
  const c = w.comparable || w.signal || {};
  const risk = c.risk ?? +(((w.signal || {}).crisis || 0) + ((w.signal || {}).warning || 0)).toFixed(1);
  const [, m, d] = w.date.split('-');
  return {
    id: w.id, num: w.id.replace('w', ''), md: `${m}.${d}`, month: +m,
    tier: w.tier, tierWord: { 4: '위기', 3: '경계', 2: '주의', 1: '관심' }[w.tier] || '-',
    risk, total: (w.signal && w.signal.total) || 0,
    state: w.partial ? 'live' : !w.complete ? 'pending' : 'done'
  };
});
const maxRisk = Math.max(...W.map((w) => w.risk), 1);
const totalArticles = W.reduce((a, w) => a + w.total, 0);
// 펼쳐 둔 주차 — 본문이 있는 가장 최근 것. 활성 표시가 평범한 행에서 어떻게 보이는지 본다.
const ACTIVE = (W.find((w) => w.state === 'done') || W[0]).id;
const months = [...new Set(W.map((w) => w.month))];
const num = (n) => n.toLocaleString('ko-KR');
const STATE = { live: '진행 중', pending: '본문 대기' };
const STATE_SHORT = { live: '진행', pending: '대기' };
const TIERC = { 4: '#b3261e', 3: '#d9822b', 2: '#c9a227', 1: '#2f8f5b' };   // 면 색 — 추이 차트 막대와 같은 값

// ════════════════════════════════════════════════════════════════
// A. 관제실 — Systemic / data
// ════════════════════════════════════════════════════════════════
// 헤더를 위 전체로 펴 브랜드와 목록을 한 틀에 묶는다(지금은 목록이 헤더 옆에 따로 서 있다).
// 행마다 주차 번호·날짜·위험신호 막대·건수를 고정 칸으로 — 어느 주가 높았는지 훑으면 보인다.
// 강조색은 남색 하나. 등급 색은 막대에만 쓴다.
function optA() {
  const rows = months.map((mo) => `
    <div class="a-mo">${mo}월</div>
    ${W.filter((w) => w.month === mo).map((w) => `
    <a class="a-row${w.id === ACTIVE ? ' on' : ''}" title="Week ${w.num} · ${w.tierWord} · 위험신호 ${w.risk}%">
      <span class="a-wk">W${w.num}</span>
      <span class="a-dt">${w.md}${w.state !== 'done' ? `<i class="a-st ${w.state}" title="${STATE[w.state]}">${STATE_SHORT[w.state]}</i>` : ''}</span>
      <span class="a-bar"><i style="width:${Math.max(4, (w.risk / maxRisk) * 100).toFixed(0)}%;background:${TIERC[w.tier]}"></i></span>
      <span class="a-n">${num(w.total)}</span>
    </a>`).join('')}`).join('');

  const desk = `
  <div class="frame a">
    <header class="a-top">
      <div class="a-brand"><img src="assets/pnu-symbol.png" alt="" width="30" height="30"><b>AXON</b><span>대학 AX정책 AI 주간 모니터링</span></div>
      <nav class="a-seg" aria-label="보기 전환"><a class="on">주간 리포트</a><a>일일 브리핑</a></nav>
      <div class="a-acts"><span class="a-sel">전체 (${W.length}주차 합본) ▾</span><a class="a-btn">PDF</a></div>
    </header>
    <div class="a-body">
      <aside class="a-rail">
        <div class="a-sum"><div><b>${W.length}</b><small>주차</small></div><div><b>${num(totalArticles)}</b><small>국내 기사</small></div></div>
        <div class="a-head"><span>주차</span><span>위험신호</span><span>기사</span></div>
        ${rows}
      </aside>
      <main class="a-main">${fakeContent('light')}</main>
    </div>
  </div>`;

  const mob = `
  <div class="phone a">
    <div class="a-mbar">
      <div class="a-mtop"><b>AXON</b><nav class="a-seg sm"><a class="on">주간</a><a>일일</a></nav><a class="a-ico" title="PDF">⤓</a></div>
      <div class="a-chips">${W.map((w) => `<a class="a-chip${w.id === ACTIVE ? ' on' : ''}" style="--t:${TIERC[w.tier]}"><b>W${w.num}</b>${w.md}</a>`).join('')}</div>
    </div>
    ${fakeContent('light', true)}
  </div>`;
  return { desk, mob };
}

// ════════════════════════════════════════════════════════════════
// B. 브리핑지 — Retro / print
// ════════════════════════════════════════════════════════════════
// 매주 발행되는 보고서다. 제호(masthead)·호수·목차라는 신문의 문법을 빌린다.
// 주차는 '제41호', 목록은 점선 리더가 있는 목차. 등급은 작은 네모 표시로만.
// 강조색은 먹색 남색 하나. 화면과 PDF 의 인상이 가장 가깝다.
function optB() {
  const latest = W[0];
  const rows = months.map((mo) => `
    <div class="b-mo">${mo}월</div>
    ${W.filter((w) => w.month === mo).map((w) => `
    <a class="b-row${w.id === ACTIVE ? ' on' : ''}">
      <i class="b-mk" style="background:${TIERC[w.tier]}" title="${w.tierWord}"></i>
      <span class="b-no">제${w.num}호</span><span class="b-dt">${w.md}</span>
      <span class="b-ld"></span>
      <span class="b-n">${w.state !== 'done' ? `<em>${STATE[w.state]}</em>` : `${num(w.total)}건`}</span>
    </a>`).join('')}`).join('');

  const desk = `
  <div class="frame b">
    <header class="b-top">
      <div class="b-issue"><span>부산대 AX·정보화혁신본부 AX혁신과</span><span>제${latest.num}호 · 2026년 ${latest.month}월 ${+latest.md.split('.')[1]}일</span></div>
      <div class="b-mast"><b>AXON</b><span>대학 AX정책 AI 주간 모니터링</span></div>
      <nav class="b-tabs"><a class="on">주간 리포트</a><a>일일 브리핑</a><span class="b-sp"></span><a class="b-pdf">PDF 내려받기 ↓</a></nav>
    </header>
    <div class="b-body">
      <aside class="b-rail"><div class="b-toc">목차</div>${rows}
        <div class="b-foot">${W.length}개 호 · 국내 기사 ${num(totalArticles)}건</div></aside>
      <main class="b-main">${fakeContent('paper')}</main>
    </div>
  </div>`;

  const mob = `
  <div class="phone b">
    <div class="b-mbar">
      <div class="b-mmast"><b>AXON</b><span>제${latest.num}호</span></div>
      <nav class="b-mtabs"><a class="on">주간</a><a>일일</a><a class="b-pdf">PDF ↓</a></nav>
      <div class="b-chips">${W.map((w) => `<a class="b-chip${w.id === ACTIVE ? ' on' : ''}"><i style="background:${TIERC[w.tier]}"></i>${w.num}호 <small>${w.md}</small></a>`).join('')}</div>
    </div>
    ${fakeContent('paper', true)}
  </div>`;
  return { desk, mob };
}

// ════════════════════════════════════════════════════════════════
// C. 신성한 빛 — Ethereal / divine (taste 스킬의 본래 미감)
// ════════════════════════════════════════════════════════════════
// 거의 검은 바탕 위에 하나의 따뜻한 빛. 활성 주차만 금빛으로 빛난다.
// 본문은 밝게 두고 틀만 어둡게 한다 — 보고서를 어둡게 하면 표·지도가 읽히지 않는다.
// 어두운 바탕에서는 등급 색을 한 단계 밝혀 점이 묻히지 않게 한다(아래 TIERC_DARK).
const TIERC_DARK = { 4: '#ff6b5e', 3: '#ffa25a', 2: '#f2cf5b', 1: '#5fd39a' };
function optC() {
  const rows = months.map((mo) => `
    <div class="c-mo">${mo}월</div>
    ${W.filter((w) => w.month === mo).map((w) => `
    <a class="c-row${w.id === ACTIVE ? ' on' : ''}">
      <i class="c-dot" style="--g:${TIERC_DARK[w.tier]}"></i>
      <span class="c-wk">Week ${w.num}</span><span class="c-dt">${w.md}</span>
      <span class="c-n">${w.state !== 'done' ? STATE[w.state] : num(w.total)}</span>
    </a>`).join('')}`).join('');

  const desk = `
  <div class="frame c">
    <header class="c-top">
      <div class="c-brand"><b>AXON</b><span>대학 AX정책 AI 주간 모니터링 · 부산대 AX혁신과</span></div>
      <nav class="c-seg"><a class="on">주간</a><a>일일</a></nav>
      <a class="c-btn">PDF ↓</a>
    </header>
    <div class="c-body">
      <aside class="c-rail">
        <div class="c-sum">${W.length}주차 <span>·</span> 국내 기사 ${num(totalArticles)}건</div>
        ${rows}
      </aside>
      <main class="c-main">${fakeContent('light')}</main>
    </div>
  </div>`;

  const mob = `
  <div class="phone c">
    <div class="c-mbar">
      <div class="c-mtop"><b>AXON</b><nav class="c-seg sm"><a class="on">주간</a><a>일일</a></nav></div>
      <div class="c-chips">${W.map((w) => `<a class="c-chip${w.id === ACTIVE ? ' on' : ''}"><i style="--g:${TIERC_DARK[w.tier]}"></i>W${w.num} <small>${w.md}</small></a>`).join('')}</div>
    </div>
    ${fakeContent('light', true)}
  </div>`;
  return { desk, mob };
}

// 본문 자리 — 메뉴와의 관계를 보려고 흐릿하게만 둔다
function fakeContent(tone, mobile) {
  const cls = tone === 'paper' ? 'fc paper' : 'fc';
  return `<div class="${cls}${mobile ? ' m' : ''}">
    <div class="fc-card"><div class="fc-t">위험신호 비중 추이</div>
      <div class="fc-bars">${W.slice().reverse().map((w) => `<i style="height:${Math.max(6, (w.risk / maxRisk) * 100)}%;background:${TIERC[w.tier]}"></i>`).join('')}</div></div>
    <div class="fc-card"><div class="fc-t">${W.find((w) => w.id === ACTIVE).md} · Week ${W.find((w) => w.id === ACTIVE).num}</div>
      <div class="fc-l"></div><div class="fc-l s"></div><div class="fc-l"></div></div>
  </div>`;
}

const OPTS = [
  { id: 'A', tag: '추천', name: '관제실', family: 'Systemic / data', fn: optA,
    lead: '이 사이트가 실제로 하는 일 — 신호를 감시하는 일 — 에 맞춘 방향. 목록을 훑기만 해도 어느 주가 높았는지 보인다.',
    spec: [['헤더', '위쪽 전체로 펴서 브랜드·전환·PDF 를 한 줄에. 높이 64px(지금 96px)'],
      ['주차 행', '주차 번호 · 날짜 · 위험신호 막대 · 기사 수를 고정 칸으로 — 줄바꿈 없음'],
      ['등급', '점 대신 길이 있는 막대. 추이 차트 막대와 같은 색'],
      ['강조색', '남색 하나(활성 행). 등급 색은 막대에만'],
      ['모바일', '브랜드를 고정 띠 안으로 넣어 본문이 약 140px 위로 올라온다']] },
  { id: 'B', tag: '', name: '브리핑지', family: 'Retro / print', fn: optB,
    lead: '매주 발행되는 보고서라는 성격에 맞춘 방향. 제호·호수·목차라는 신문의 문법을 빌린다. 화면과 PDF 의 인상이 가장 가깝다.',
    spec: [['헤더', '제호(masthead)와 호수 표기, 아래 이중선. 탭은 글자 밑줄'],
      ['주차 행', '"제41호 10.09 ······ 1,515건" — 점선 리더가 있는 목차'],
      ['등급', '작은 네모 표시'],
      ['강조색', '먹색 남색 하나'],
      ['비용', '명조 글꼴(Noto Serif KR)을 한 벌 더 받는다']] },
  { id: 'C', tag: '스킬 본래', name: '신성한 빛', family: 'Ethereal / divine', fn: optC,
    lead: 'taste 스킬의 본래 미감을 UI 로 옮긴 방향. 어둠 속 하나의 따뜻한 빛 — 활성 주차만 금빛으로 빛난다. 본문은 밝게 둔다.',
    spec: [['헤더·목록', '거의 검은 틀. 본문만 밝다'],
      ['주차 행', '여백이 넉넉한 한 줄. 등급은 은은히 빛나는 점'],
      ['등급', '어두운 바탕에서 묻히지 않도록 등급 색을 한 단계 밝힘'],
      ['강조색', '금빛 하나(활성 행·워드마크)'],
      ['주의', '공공기관 보고서로는 인상이 가장 강하다 — 기관 정체성과 거리가 있다']] }
];

const css = `
:root{--navy:#1a2b4c;--ink:#1f2937;--mute:#676d7b;--line:#d9dee6;--bg:#eef0f3;--link:#2f68bd;--sky-l:#e6eef9}
*{box-sizing:border-box}
body{margin:0;background:#e4e7ec;color:var(--ink);font-family:Pretendard,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;font-size:14px;line-height:1.55}
a{color:inherit;text-decoration:none;cursor:pointer}
.wrap{max-width:1580px;margin:0 auto;padding:28px 24px 60px}
h1{font-size:22px;margin:0 0 6px;color:var(--navy)}
.intro{color:var(--mute);margin:0 0 6px;max-width:860px;font-size:13.5px}
.keep{background:#fff;border:1px solid var(--line);border-radius:8px;padding:12px 16px;margin:14px 0 26px;font-size:13px;max-width:980px}
.keep b{color:var(--navy)}
.opt{background:#fff;border:1px solid var(--line);border-radius:12px;padding:20px 22px 24px;margin-bottom:26px}
.opt-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.opt-h .id{font-weight:900;font-size:20px;color:var(--navy)}
.opt-h .nm{font-weight:800;font-size:19px}
.opt-h .fam{font-size:12px;color:var(--mute);border:1px solid var(--line);border-radius:10px;padding:0 8px}
.opt-h .tag{font-size:11px;font-weight:800;color:#fff;background:var(--navy);border-radius:4px;padding:1px 7px}
.opt-h .tag.k{background:#8a6d00}
.lead{color:var(--ink);margin:2px 0 10px;max-width:880px;font-size:13.5px}
.spec{display:grid;grid-template-columns:max-content 1fr;gap:3px 14px;font-size:12.5px;margin:0 0 16px;max-width:880px}
.spec dt{color:var(--navy);font-weight:700}.spec dd{margin:0;color:#374151}
.stage{display:flex;gap:22px;align-items:flex-start;flex-wrap:wrap}
.cap{font-size:11.5px;color:var(--mute);margin:0 0 6px}
.frame{width:1040px;height:560px;border-radius:10px;overflow:hidden;border:1px solid #cdd3dc;box-shadow:0 6px 24px rgba(15,23,42,.10);display:flex;flex-direction:column;background:#eef0f3}
.phone{width:375px;height:560px;border-radius:22px;overflow:hidden;border:7px solid #1b1f27;box-shadow:0 6px 24px rgba(15,23,42,.14);background:#eef0f3;display:flex;flex-direction:column}
@media (max-width:1520px){.frame{width:100%;max-width:1040px}}

/* 본문 자리 */
.fc{flex:1;padding:16px;display:flex;flex-direction:column;gap:12px;overflow:hidden}
.fc.m{padding:12px}
.fc-card{background:#fff;border:1px solid var(--line);border-radius:9px;padding:12px 14px}
.fc.paper .fc-card{background:#fffefb;border-color:#e3ddd0}
.fc-t{font-weight:800;font-size:13px;color:var(--navy);margin-bottom:8px}
.fc-bars{display:flex;align-items:flex-end;gap:6px;height:110px}
.fc.m .fc-bars{height:80px;gap:3px}
.fc-bars i{flex:1;border-radius:3px 3px 0 0;opacity:.82}
.fc-l{height:9px;border-radius:4px;background:#e6e9ee;margin:7px 0}.fc-l.s{width:62%}

/* ── A 관제실 ───────────────────────────── */
.a-top{height:64px;flex:none;background:#1a2b4c;color:#fff;display:flex;align-items:center;gap:18px;padding:0 18px}
.a-brand{display:flex;align-items:center;gap:10px;width:230px;flex:none}
.a-brand img{background:#fff;border-radius:50%;padding:2px}
.a-brand b{font-size:19px;font-weight:800;letter-spacing:.14em}
.a-brand span{display:none}
.a-top .a-brand + .a-seg{margin-right:auto}
.a-seg{display:inline-flex;background:rgba(255,255,255,.10);border-radius:8px;padding:3px;gap:2px}
.a-seg a{padding:6px 14px;border-radius:6px;font-size:12.5px;font-weight:700;color:#d6deeb}
.a-seg a.on{background:#fff;color:#1a2b4c}
.a-seg.sm a{padding:4px 11px;font-size:12px}
.a-acts{display:flex;gap:8px;align-items:center}
.a-sel{background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.22);color:#fff;border-radius:6px;padding:6px 10px;font-size:12px;font-weight:600}
.a-btn{background:#fff;color:#1a2b4c;border-radius:6px;padding:6px 12px;font-size:12px;font-weight:800}
.a-body{flex:1;display:flex;min-height:0}
.a-rail{width:256px;flex:none;background:#f7f8fa;border-right:1px solid var(--line);overflow:hidden;padding:12px 0}
.a-sum{display:grid;grid-template-columns:1fr 1fr;gap:6px;margin:0 12px 12px}
.a-sum div{background:#fff;border:1px solid var(--line);border-radius:7px;padding:6px 9px;line-height:1.15}
.a-sum b{display:block;font-size:17px;font-weight:800;color:#1a2b4c;font-variant-numeric:tabular-nums}
.a-sum small{font-size:10.5px;color:var(--mute)}
.a-head{display:grid;grid-template-columns:38px 1fr 54px 44px;gap:6px;padding:0 14px 4px;font-size:10.5px;color:var(--mute);border-bottom:1px solid var(--line);margin-bottom:2px}
.a-head span:nth-child(2){grid-column:3}.a-head span:nth-child(3){text-align:right}
.a-mo{font-size:10.5px;font-weight:800;color:var(--mute);padding:7px 14px 2px;letter-spacing:.04em}
.a-row{display:grid;grid-template-columns:38px 1fr 54px 44px;gap:6px;align-items:center;height:27px;padding:0 14px;font-size:12.5px;color:#374151}
.a-row:hover{background:#eef2f8}
.a-row.on{background:var(--sky-l);color:#1a2b4c;font-weight:700;box-shadow:inset 3px 0 0 #1a2b4c}
.a-wk{font-family:ui-monospace,"SFMono-Regular",Consolas,monospace;font-size:11.5px;color:#1a2b4c;font-weight:700}
.a-dt{white-space:nowrap;font-variant-numeric:tabular-nums;display:flex;align-items:center;gap:5px}
.a-st{font-style:normal;font-size:9.5px;font-weight:800;border-radius:3px;padding:0 4px;line-height:15px}
.a-st.live{background:#2a8152;color:#fff}.a-st.pending{background:#fff;color:#ab6622;border:1px solid #ecd2b6}
.a-bar{height:6px;background:#e3e7ee;border-radius:3px;overflow:hidden}
.a-bar i{display:block;height:100%;border-radius:3px}
.a-n{text-align:right;font-variant-numeric:tabular-nums;font-size:11.5px;color:var(--mute)}
.a-row.on .a-n{color:#4b5563}
.a-main{flex:1;min-width:0;display:flex}
.a-mbar{flex:none;background:#1a2b4c;color:#fff}
.a-mtop{display:flex;align-items:center;gap:10px;height:50px;padding:0 12px}
.a-mtop b{font-size:16px;letter-spacing:.14em;font-weight:800;margin-right:auto}
.a-ico{width:32px;height:32px;display:grid;place-items:center;background:#fff;color:#1a2b4c;border-radius:7px;font-weight:900}
.a-chips{display:flex;gap:6px;overflow:hidden;padding:0 12px 10px}
.a-chip{flex:none;display:flex;gap:5px;align-items:baseline;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.18);border-top:3px solid var(--t);
  border-radius:6px;padding:4px 9px 5px;font-size:11.5px;color:#d6deeb;font-variant-numeric:tabular-nums}
.a-chip b{font-family:ui-monospace,Consolas,monospace;color:#fff;font-size:11px}
.a-chip.on{background:#fff;color:#1a2b4c}.a-chip.on b{color:#1a2b4c}

/* ── B 브리핑지 ─────────────────────────── */
.frame.b,.phone.b{background:#f3f0e8}
.b-top{flex:none;background:#fbfaf6;border-bottom:3px double #1a2b4c;padding:8px 22px 0}
.b-issue{display:flex;justify-content:space-between;font-size:11px;color:#5d5a52;border-bottom:1px solid #1a2b4c;padding-bottom:4px;letter-spacing:.02em}
.b-mast{display:flex;align-items:baseline;gap:16px;padding:8px 0 6px}
.b-mast b{font-family:"Noto Serif KR",Georgia,serif;font-weight:900;font-size:34px;letter-spacing:.06em;color:#14213d;line-height:1}
.b-mast span{font-family:"Noto Serif KR",Georgia,serif;font-size:14px;color:#3b3a36}
.b-tabs{display:flex;gap:20px;font-size:13px;font-weight:700;color:#5d5a52}
.b-tabs a{padding:6px 0 7px;border-bottom:2px solid transparent}
.b-tabs a.on{color:#14213d;border-color:#14213d}
.b-sp{flex:1}
.b-pdf{color:#14213d}
.b-body{flex:1;display:flex;min-height:0}
.b-rail{width:246px;flex:none;background:#fbfaf6;border-right:1px solid #ddd6c6;overflow:hidden;padding:14px 16px}
.b-toc{font-family:"Noto Serif KR",Georgia,serif;font-weight:800;font-size:15px;color:#14213d;border-bottom:1px solid #14213d;padding-bottom:4px;margin-bottom:4px}
.b-mo{font-size:10.5px;color:#6b665b;text-align:center;margin:7px 0 1px;letter-spacing:.2em}
.b-row{display:flex;align-items:center;gap:6px;height:24px;font-size:12.5px;color:#3b3a36}
.b-row.on{color:#14213d;font-weight:800}
.b-row.on .b-no{text-decoration:underline;text-underline-offset:3px}
.b-mk{width:7px;height:7px;flex:none}
.b-no{font-family:"Noto Serif KR",Georgia,serif;font-weight:700}
.b-dt{color:#5d5a52;font-variant-numeric:tabular-nums;font-size:11.5px}
.b-ld{flex:1;border-bottom:1px dotted #a39d8f;transform:translateY(3px);min-width:10px}
.b-n{font-variant-numeric:tabular-nums;font-size:11.5px;color:#5d5a52}
.b-n em{font-style:normal;font-size:10.5px;color:#8a5a12;font-weight:700}
.b-foot{margin-top:10px;padding-top:6px;border-top:1px solid #ddd6c6;font-size:11px;color:#5d5a52}
.b-main{flex:1;min-width:0;display:flex}
.b-mbar{flex:none;background:#fbfaf6;border-bottom:3px double #14213d}
.b-mmast{display:flex;align-items:baseline;justify-content:space-between;padding:10px 14px 2px}
.b-mmast b{font-family:"Noto Serif KR",Georgia,serif;font-weight:900;font-size:24px;letter-spacing:.06em;color:#14213d}
.b-mmast span{font-family:"Noto Serif KR",Georgia,serif;font-size:12px;color:#3b3a36}
.b-mtabs{display:flex;gap:16px;padding:0 14px;font-size:12.5px;font-weight:700;color:#5d5a52;border-bottom:1px solid #ddd6c6}
.b-mtabs a{padding:4px 0 6px;border-bottom:2px solid transparent}.b-mtabs a.on{color:#14213d;border-color:#14213d}
.b-mtabs .b-pdf{margin-left:auto}
.b-chips{display:flex;gap:14px;overflow:hidden;padding:8px 14px 9px;font-size:12px;white-space:nowrap}
.b-chip{display:flex;align-items:center;gap:5px;color:#3b3a36;font-family:"Noto Serif KR",Georgia,serif;font-weight:700}
.b-chip i{width:6px;height:6px}
.b-chip small{font-family:Pretendard,sans-serif;font-weight:500;color:#5d5a52;font-size:11px}
.b-chip.on{color:#14213d;text-decoration:underline;text-underline-offset:4px}

/* ── C 신성한 빛 ───────────────────────── */
.frame.c{background:#0b0d14}
.c-top{height:62px;flex:none;background:#0b0d14;color:#f1ede4;display:flex;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid #1f2330}
.c-brand{display:flex;align-items:baseline;gap:14px;margin-right:auto}
.c-brand b{font-size:21px;font-weight:800;letter-spacing:.22em;color:#fff3dc;text-shadow:0 0 18px rgba(255,178,77,.45),0 0 2px rgba(255,178,77,.6)}
.c-brand span{font-size:12px;color:#a8acb8}
.c-seg{display:inline-flex;border:1px solid #2a2f3e;border-radius:20px;padding:2px}
.c-seg a{padding:5px 14px;border-radius:16px;font-size:12px;font-weight:700;color:#a8acb8}
.c-seg a.on{background:rgba(255,178,77,.14);color:#ffd08a;box-shadow:inset 0 0 0 1px rgba(255,178,77,.45)}
.c-seg.sm a{padding:3px 11px}
.c-btn{border:1px solid #2a2f3e;color:#e9e4d8;border-radius:20px;padding:5px 13px;font-size:12px;font-weight:700}
.c-body{flex:1;display:flex;min-height:0}
.c-rail{width:246px;flex:none;background:#0b0d14;border-right:1px solid #1f2330;overflow:hidden;padding:14px 0}
.c-sum{font-size:11.5px;color:#a8acb8;padding:0 18px 10px;letter-spacing:.02em}
.c-sum span{color:#8a8fa0}
.c-mo{font-size:10.5px;color:#8a8fa0;padding:9px 18px 3px;letter-spacing:.18em}
.c-row{position:relative;display:flex;align-items:center;gap:10px;height:30px;padding:0 18px;font-size:12.5px;color:#cfd2db}
.c-row:hover{background:rgba(255,255,255,.03)}
.c-row.on{color:#ffd08a;font-weight:700;background:linear-gradient(90deg,rgba(255,178,77,.13),rgba(255,178,77,0) 85%)}
.c-row.on::before{content:"";position:absolute;left:0;top:6px;bottom:6px;width:2px;background:#ffb24d;box-shadow:0 0 10px #ffb24d}
.c-dot{width:7px;height:7px;border-radius:50%;background:var(--g);box-shadow:0 0 7px var(--g);flex:none}
.c-wk{min-width:60px}
.c-dt{color:#a8acb8;font-variant-numeric:tabular-nums;font-size:12px}
.c-row.on .c-dt{color:#f2c784}
.c-n{margin-left:auto;font-variant-numeric:tabular-nums;font-size:11.5px;color:#9a9fae}
.c-main{flex:1;min-width:0;display:flex;background:#eef0f3}
.phone.c{background:#eef0f3}
.c-mbar{flex:none;background:#0b0d14}
.c-mtop{display:flex;align-items:center;justify-content:space-between;height:50px;padding:0 14px}
.c-mtop b{font-size:17px;letter-spacing:.22em;font-weight:800;color:#fff3dc;text-shadow:0 0 14px rgba(255,178,77,.45)}
.c-chips{display:flex;gap:6px;overflow:hidden;padding:0 12px 11px}
.c-chip{flex:none;display:flex;align-items:center;gap:6px;border:1px solid #2a2f3e;border-radius:16px;padding:4px 11px;font-size:11.5px;color:#cfd2db;font-variant-numeric:tabular-nums}
.c-chip i{width:6px;height:6px;border-radius:50%;background:var(--g);box-shadow:0 0 6px var(--g)}
.c-chip small{color:#a8acb8;font-size:11px}
.c-chip.on{color:#ffd08a;border-color:rgba(255,178,77,.55);background:rgba(255,178,77,.10)}
`;

const sections = OPTS.map((o) => {
  const { desk, mob } = o.fn();
  return `
  <section class="opt" id="opt-${o.id}">
    <div class="opt-h"><span class="id">${o.id}</span><span class="nm">${esc(o.name)}</span><span class="fam">${esc(o.family)}</span>${o.tag ? `<span class="tag${o.id === 'C' ? ' k' : ''}">${esc(o.tag)}</span>` : ''}</div>
    <p class="lead">${esc(o.lead)}</p>
    <dl class="spec">${o.spec.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>
    <div class="stage">
      <div><p class="cap">PC</p>${desk}</div>
      <div><p class="cap">휴대전화</p>${mob}</div>
    </div>
  </section>`;
}).join('');

const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>메뉴 디자인 시안 | ${esc(meta.brand || 'AXON')}</title>
<link rel="icon" href="assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@700;900&display=swap">
<style>${css}</style></head>
<body><div class="wrap">
<h1>메뉴 디자인 시안 — 헤더 · 주차 목록 · 모바일 띠</h1>
<p class="intro">세 방향을 같은 실데이터(${W.length}개 주차)로 그렸습니다. 본문은 흐릿한 자리로만 두고 메뉴만 바꿨습니다. 활성 표시는 본문이 있는 가장 최근 주차(Week ${W.find((w) => w.id === ACTIVE).num})에 걸어 두었습니다.</p>
<div class="keep"><b>세 시안 모두 공통으로 고치는 것</b> — 'Go To Daily' 영어 버튼을 <b>주간 / 일일 전환</b>으로 바꾸고, 열두 번 반복되던 <b>'2026.'</b>을 걷어내고, 8px 점이던 <b>등급을 크기 있는 표시</b>로 키우고, 행 높이를 고정해 <b>두 줄로 접히던 행</b>을 없애고, <b>월 단위</b>로 묶습니다. 위험 등급 색의 의미와 글자 대비 4.5:1 은 셋 다 지킵니다.</div>
${sections}
</div></body></html>`;

writeFileSync(join(root, 'dist/menu-lab.html'), html, 'utf8');
console.log(`✓ dist/menu-lab.html — 시안 ${OPTS.length}개 · 주차 ${W.length}개 · 활성 ${ACTIVE}`);
