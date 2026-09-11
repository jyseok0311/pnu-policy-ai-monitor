// 키워드·네트워크 시각화 시안 3종 — dist/viz-lab.html
// 사용: node viz-lab.mjs
//
// 세 안 모두 실제 수집 데이터로 그린다. 더미가 없다.
//   시안 A  키워드 리더보드     막대 = 언급량 · 색 = 위험신호 비율 · 칩 = 전주 대비
//   시안 B  공기어 네트워크     같은 제목에 함께 등장한 키워드를 잇는다
//   시안 C  이슈 흐름 타임라인   8주 × 키워드, 버블 = 그 주 기사 중 비중
//
// 좌표는 빌드 때 계산해 HTML 에 굳힌다. 열 때마다 그림이 달라지면 PDF 와 화면이 어긋난다.

import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { relevant, googleOnly } from './src/filter.mjs';
import { extract } from './src/keywords.mjs';
import { sanjini } from './src/browser/sanjini.svg.js';

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const meta = J('data/meta.json');
const weeks = J('data/weeks.json');
const files = readdirSync(join(root, 'data/collected')).filter((f) => f.endsWith('.json')).sort();

// 분야 색 — 리포트의 등급 색과 겹치지 않게 별도 팔레트를 쓴다.
// 등급(위기·경고)은 빨강 계열이 이미 차지하고 있다.
const FIELD_COLOR = {
  '거버넌스': '#3b6fb8',
  '재정': '#8a5fc0',
  '입시·학령인구': '#c07b2a',
  'AI·디지털': '#1f8f7a',
  '기타': '#7a8595'
};
const riskColor = (r) => (r >= 40 ? '#b3261e' : r >= 20 ? '#d9822b' : r >= 8 ? '#c9a227' : '#2f8f5b');

// ── 데이터: 최신 주 / 직전 주 / 8주 시계열
const latestFile = files[files.length - 1];
const prevFile = files[files.length - 2];
// 주차 간 비교는 같은 소스 구성에서만 공정하다.
// 최신 수집분에만 언론사 RSS 가 섞여 있어(2026-09-11: 687건 중 257건), 그대로 두면
// '이번 주에 갑자기 늘었다'가 소스가 늘어난 착시가 된다. 전 주차를 구글 뉴스로 통일한다.
const domestic = (f) => googleOnly(relevant(J(`data/collected/${f}`).items).filter((x) => x.region !== 'overseas'));

const cur = extract(domestic(latestFile), { top: 26, minEdge: 4 });
const prevItems = domestic(prevFile);
const prev = extract(prevItems, { top: 200, minCount: 1, minEdge: 999 });
const prevN = new Map(prev.nodes.map((n) => [n.key, n.n]));
const prevTotal = prevItems.length || 1;

// 전주 대비는 '건수'가 아니라 '비중'으로 봐야 한다.
// 주차마다 수집량이 176~1075건으로 달라 건수 증감은 이슈의 부침을 뜻하지 않는다.
const share = (n, total) => (n / total) * 100;
for (const n of cur.nodes) {
  const p = prevN.get(n.key) || 0;
  n.share = +share(n.n, cur.docCount).toFixed(2);
  n.prevShare = +share(p, prevTotal).toFixed(2);
  n.delta = +(n.share - n.prevShare).toFixed(2);
  n.isNew = p === 0;
}

// 8주 시계열 — 키워드별 주간 비중
const series = files.map((f) => {
  const items = domestic(f);
  const e = extract(items, { top: 400, minCount: 1, minEdge: 999 });
  const map = new Map(e.nodes.map((n) => [n.key, n]));
  const w = weeks.find((x) => x.range && x.range.startsWith(f.replace('.json', '')));
  return { file: f, date: f.replace('.json', ''), total: items.length, map, week: w };
});

// ══════════════ 시안 A — 키워드 리더보드 ══════════════
function optionA() {
  const rows = cur.nodes.slice(0, 14);
  const max = Math.max(...rows.map((r) => r.n));
  return `<div class="kw-board">
  ${rows.map((r) => {
    const w = (r.n / max) * 100;
    const up = r.delta > 0.15, down = r.delta < -0.15;
    const chip = r.isNew ? '<span class="kchip new">NEW</span>'
      : up ? `<span class="kchip up">▲ ${r.delta.toFixed(1)}%p</span>`
      : down ? `<span class="kchip down">▼ ${Math.abs(r.delta).toFixed(1)}%p</span>`
      : '<span class="kchip flat">—</span>';
    return `<div class="kw-row" title="${esc(r.sample ? r.sample.title : '')}">
      <span class="kw-name">${esc(r.key)}</span>
      <span class="kw-bar"><i style="width:${w.toFixed(1)}%;background:${riskColor(r.risk)}"></i></span>
      <span class="kw-n">${r.n}</span>
      <span class="kw-risk" style="color:${riskColor(r.risk)}">${r.risk}%</span>
      ${chip}
    </div>`;
  }).join('')}
  </div>
  <div class="kw-legend">막대 길이 = 주간 언급 기사 수 · 막대 색 = 그 키워드가 붙은 기사 중 위험신호(위기+경고) 비율
  (<i class="sw" style="background:#2f8f5b"></i>8% 미만 <i class="sw" style="background:#c9a227"></i>8–20%
  <i class="sw" style="background:#d9822b"></i>20–40% <i class="sw" style="background:#b3261e"></i>40% 이상) ·
  칩 = 전주 대비 <b>비중</b> 증감(%p). 수집량이 주마다 달라 건수가 아닌 비중으로 비교한다.</div>`;
}

// ══════════════ 시안 B — 공기어 네트워크 ══════════════
// 힘-기반 배치를 빌드 때 돌려 좌표를 굳힌다. 열 때마다 흔들리면 PDF 와 화면이 달라진다.
function layout(nodes, links, W, H, radii, steps = 900) {
  const N = nodes.length;
  // 결정론적 초기 배치 — 난수를 쓰면 빌드마다 그림이 바뀐다
  const P = nodes.map((n, i) => {
    const a = (i / N) * Math.PI * 2, r = Math.min(W, H) * 0.36;
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.8 };
  });
  const deg = nodes.map(() => 0);
  links.forEach((l) => { deg[l.s]++; deg[l.t]++; });

  // Fruchterman–Reingold: 반발 k²/d, 인력 d²/k.
  // 반발을 k²/d² 로 두면 조금만 멀어져도 힘이 사라져 전부 한 덩어리로 뭉친다(실제로 그랬다).
  const k = Math.sqrt((W * H) / N) * 0.55;
  const maxE = Math.max(...links.map((l) => l.n), 1);

  for (let step = 0; step < steps; step++) {
    const temp = (W / 12) * Math.pow(1 - step / steps, 1.5);
    const D = P.map(() => ({ x: 0, y: 0 }));

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
        let d = Math.sqrt(dx * dx + dy * dy);
        if (d < 0.5) { dx = ((i % 3) - 1) || 1; dy = ((j % 3) - 1) || 1; d = 1.4; }
        const f = (k * k) / d;
        D[i].x += (dx / d) * f; D[i].y += (dy / d) * f;
        D[j].x -= (dx / d) * f; D[j].y -= (dy / d) * f;
      }
    }
    // 인력 — 함께 등장한 횟수가 많을수록 세게 당기되, 최대 2배까지만.
    for (const l of links) {
      const dx = P[l.s].x - P[l.t].x, dy = P[l.s].y - P[l.t].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
      const f = ((d * d) / k) * (0.6 + (l.n / maxE) * 1.4);
      D[l.s].x -= (dx / d) * f; D[l.s].y -= (dy / d) * f;
      D[l.t].x += (dx / d) * f; D[l.t].y += (dy / d) * f;
    }
    // 약한 중력 — 연결이 없는 노드가 화면 밖으로 날아가지 않을 만큼만
    for (let i = 0; i < N; i++) {
      D[i].x += (W / 2 - P[i].x) * 0.012;
      D[i].y += (H / 2 - P[i].y) * 0.012;
    }
    for (let i = 0; i < N; i++) {
      const d = Math.max(Math.hypot(D[i].x, D[i].y), 0.01);
      const m = Math.min(d, temp) / d;
      P[i].x += D[i].x * m;
      P[i].y += D[i].y * m;
    }
    // 겹침 해소 — 원 반지름 + 라벨 높이만큼은 떼어 놓는다. 글자가 겹치면 그림이 아니라 얼룩이다.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const min = radii[i] + radii[j] + 20;
          let dx = P[j].x - P[i].x, dy = P[j].y - P[i].y;
          let d = Math.hypot(dx, dy);
          if (d < 0.5) { dx = 1; dy = 0.3; d = 1.04; }
          if (d < min) {
            const push = (min - d) / 2;
            P[i].x -= (dx / d) * push; P[i].y -= (dy / d) * push;
            P[j].x += (dx / d) * push; P[j].y += (dy / d) * push;
          }
        }
      }
      for (let i = 0; i < N; i++) {
        P[i].x = Math.max(radii[i] + 8, Math.min(W - radii[i] - 8, P[i].x));
        P[i].y = Math.max(radii[i] + 10, Math.min(H - radii[i] - 20, P[i].y));
      }
    }
  }
  return P;
}

function optionB() {
  const W = 1000, H = 560;
  const nodes = cur.nodes.slice(0, 22);
  const keep = new Set(nodes.map((n) => n.key));
  const links = cur.links
    .filter((l) => keep.has(cur.nodes[l.s].key) && keep.has(cur.nodes[l.t].key))
    .map((l) => ({ s: nodes.findIndex((n) => n.key === cur.nodes[l.s].key), t: nodes.findIndex((n) => n.key === cur.nodes[l.t].key), n: l.n }))
    .filter((l) => l.s >= 0 && l.t >= 0);

  const maxN = Math.max(...nodes.map((n) => n.n));
  const rOf = (n) => 12 + Math.sqrt(n.n / maxN) * 26;
  const radii = nodes.map(rOf);
  const P = layout(nodes, links, W, H, radii);
  const maxE = Math.max(...links.map((l) => l.n), 1);

  const edges = links.map((l) => `<line class="ed" data-a="${l.s}" data-b="${l.t}"
    x1="${P[l.s].x.toFixed(1)}" y1="${P[l.s].y.toFixed(1)}" x2="${P[l.t].x.toFixed(1)}" y2="${P[l.t].y.toFixed(1)}"
    stroke-width="${(0.8 + (l.n / maxE) * 4.5).toFixed(2)}"><title>${esc(nodes[l.s].key)} × ${esc(nodes[l.t].key)} — 같은 기사 ${l.n}건</title></line>`).join('');

  const circles = nodes.map((n, i) => {
    const r = rOf(n);
    return `<g class="nd" data-i="${i}" transform="translate(${P[i].x.toFixed(1)},${P[i].y.toFixed(1)})">
      <circle r="${r.toFixed(1)}" fill="${FIELD_COLOR[n.field] || FIELD_COLOR['기타']}" fill-opacity=".88"
        stroke="${riskColor(n.risk)}" stroke-width="${n.risk >= 20 ? 3 : 1.5}"/>
      <text y="${(r + 13).toFixed(1)}" text-anchor="middle" class="nl">${esc(n.key)}</text>
      <title>${esc(n.key)} — ${n.n}건 · 위험신호 ${n.risk}% · ${esc(n.field)}${n.sample ? '\n대표 기사: ' + esc(n.sample.title) : ''}</title>
    </g>`;
  }).join('');

  return `<div class="netbox"><svg class="net" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="주간 키워드 공기 네트워크 — 원 크기는 언급량, 선 굵기는 같은 기사에 함께 등장한 횟수">
    <g class="edges">${edges}</g>${circles}</svg></div>
  <div class="kw-legend">원 크기 = 언급 기사 수 · 원 색 = 대표 분야
  (${Object.entries(FIELD_COLOR).map(([f, c]) => `<i class="sw" style="background:${c}"></i>${esc(f)}`).join(' ')}) ·
  테두리 = 위험신호 비율 · 선 굵기 = <b>같은 기사 제목에 함께 등장한 횟수</b>(${links.length}개 연결, 4회 이상만 표시).
  원에 마우스를 올리면 이웃만 남기고 대표 기사를 보여준다. 좌표는 빌드 때 한 번 계산해 고정한다 — 열 때마다 그림이 바뀌면 PDF 와 화면이 어긋난다.</div>`;
}

// ══════════════ 시안 C — 이슈 흐름 타임라인 ══════════════
function optionC() {
  const keys = cur.nodes.slice(0, 12).map((n) => n.key);
  const cells = keys.map((k) => series.map((s) => {
    const hit = s.map.get(k);
    const n = hit ? hit.n : 0;
    return { n, share: +share(n, s.total).toFixed(2), risk: hit ? hit.risk : 0, date: s.date, week: s.week };
  }));
  const maxShare = Math.max(...cells.flat().map((c) => c.share), 0.1);

  const colW = 92, rowH = 42, padL = 132, padT = 34;
  const W = padL + colW * series.length + 16, H = padT + rowH * keys.length + 14;

  const head = series.map((s, i) => `<text x="${padL + colW * i + colW / 2}" y="20" text-anchor="middle"
    class="tl-h">${s.date.slice(5).replace('-', '/')}</text>
    <text x="${padL + colW * i + colW / 2}" y="32" text-anchor="middle" class="tl-h2">${s.week ? 'W' + s.week.id.replace('w', '') : ''}</text>`).join('');

  const rows = keys.map((k, r) => {
    const y = padT + rowH * r + rowH / 2;
    const line = cells[r].map((c, i) => `${padL + colW * i + colW / 2},${(y - (c.share / maxShare) * 15).toFixed(1)}`).join(' ');
    const dots = cells[r].map((c, i) => {
      const rad = c.share === 0 ? 2 : 4 + Math.sqrt(c.share / maxShare) * 13;
      const cx = padL + colW * i + colW / 2;
      return `<circle cx="${cx}" cy="${y}" r="${rad.toFixed(1)}"
        fill="${c.share === 0 ? 'var(--line)' : riskColor(c.risk)}" fill-opacity="${c.share === 0 ? 1 : 0.82}">
        <title>${esc(k)} · ${c.date} — ${c.n}건 (그 주 기사의 ${c.share}%)${c.n ? ' · 위험신호 ' + c.risk + '%' : ''}</title></circle>`;
    }).join('');
    return `<g class="tl-row">
      <rect x="0" y="${padT + rowH * r}" width="${W}" height="${rowH}" fill="${r % 2 ? 'var(--soft)' : 'transparent'}"/>
      <text x="${padL - 12}" y="${y + 4}" text-anchor="end" class="tl-k">${esc(k)}</text>
      <polyline points="${line}" fill="none" stroke="var(--mute)" stroke-width="1.2" opacity=".4"/>
      ${dots}
    </g>`;
  }).join('');

  return `<div class="tlbox"><svg class="tl" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="키워드별 8주 흐름 — 원 크기는 그 주 기사 중 비중">${head}${rows}</svg></div>
  <div class="kw-legend">가로 = 수집 주차 8개 · 세로 = 이번 주 상위 키워드 12개 ·
  원 크기 = <b>그 주 수집 기사 중 비중(%)</b> · 원 색 = 그 주 위험신호 비율 · 작은 회색 점 = 그 주 언급 없음.
  주차별 수집량이 176~1,075건으로 달라 건수로 비교하면 흐름이 왜곡된다 — 그래서 비중으로 그린다.</div>`;
}

// ── 시안 카드
const CARDS = [
  {
    id: 'a', tag: '시안 A', name: '키워드 리더보드',
    lead: '무엇이 얼마나, 그리고 지난주보다 얼마나 더 — 세 가지만 답한다.',
    body: optionA(),
    pros: ['읽는 데 설명이 필요 없다. 표와 같은 규칙이라 기존 리포트에 그대로 얹힌다.',
      'SVG·JS 없이 CSS 막대만 쓴다. PDF·인쇄·모바일에서 깨지지 않는다.',
      '전주 대비 증감을 비중(%p)으로 보여줘 주차별 수집량 차이에 속지 않는다.'],
    cons: ['키워드 사이의 <b>관계</b>가 보이지 않는다. 등록금과 지방이 같은 기사에서 나온다는 사실이 드러나지 않는다.'],
    fit: '주간 리포트 본문 상단 — 상황 요약 바로 다음'
  },
  {
    id: 'b', tag: '시안 B', name: '공기어 네트워크',
    lead: '이번 주 이슈가 몇 덩어리로 뭉쳐 있는지, 어느 덩어리가 위험한지 한눈에 보여준다.',
    body: optionB(),
    pros: ['이슈의 <b>구조</b>가 보인다. 충남대–공주대–통합, 국립대–등록금–지방처럼 묶음이 그대로 드러난다.',
      '분야(색)와 위험도(테두리)를 분리해 "AI 얘기가 많다"와 "AI 얘기가 위험하다"를 섞지 않는다.',
      '좌표를 빌드 때 고정하므로 PDF 와 화면이 같은 그림이다.'],
    cons: ['해석에 학습이 필요하다. 처음 보는 사람에게는 범례 설명이 필수다.',
      '키워드가 25개를 넘으면 글자가 겹친다. 상위 20여 개로 제한해야 한다.'],
    fit: '리스크 지도 아래 — 지도가 "어디"라면 이건 "무엇끼리"'
  },
  {
    id: 'c', tag: '시안 C', name: '이슈 흐름 타임라인',
    lead: '지금 뜨는 이슈와 식은 이슈를 8주 궤적으로 가른다.',
    body: optionC(),
    pros: ['이미 쌓아 둔 8주치 수집본을 그대로 쓴다. 추가 수집이 없다.',
      '"이번 주에 많다"와 "계속 많았다"를 구분해 준다 — 신규 이슈 탐지에 가장 강하다.',
      '기존 위험신호 추이 그래프와 가로축(주차)이 같아 나란히 읽힌다.'],
    cons: ['최신 주 상위 키워드만 행으로 잡으므로, 과거에 컸다가 지금 사라진 이슈는 빠진다.',
      '행이 12개를 넘으면 세로로 길어져 한 화면에 안 들어온다.'],
    fit: '위험신호 추이 섹션 안 — 접기/펴기로 같이 묶기'
  }
];

const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const boot = readFileSync(join(root, 'src/theme-boot.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>키워드·네트워크 시각화 시안 | PNU</title>
<script>${boot}</script>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css}
.lab{max-width:1120px;margin:0 auto}
.opt{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:22px 26px;margin-bottom:26px}
.opt-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:4px}
.opt-tag{background:var(--head-bg);color:var(--head-ink);font-weight:800;font-size:12px;border-radius:5px;padding:3px 9px}
.opt-h h2{margin:0;font-size:20px;font-weight:800;color:var(--navy)}
.opt-lead{color:var(--ink-3);font-size:14px;margin:0 0 16px}
.opt-fit{margin-left:auto;font-size:12px;color:var(--mute)}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:16px}
.pc > div{border:1px solid var(--line);border-radius:7px;padding:10px 14px;background:var(--soft)}
.pc h4{margin:0 0 6px;font-size:12.5px;font-weight:800}
.pc.good h4,.pc div.good h4{color:#1f6b42}
.pc div.bad h4{color:var(--crisis)}
.pc ul{margin:0;padding-left:17px;font-size:13px;line-height:1.65}
.kw-legend{font-size:12px;color:var(--ink-3);line-height:1.7;margin-top:12px;border-top:1px dashed var(--line);padding-top:10px}
.sw{display:inline-block;width:9px;height:9px;border-radius:2px;margin:0 3px 0 6px;vertical-align:middle}

/* 시안 A */
.kw-board{display:flex;flex-direction:column;gap:5px}
.kw-row{display:grid;grid-template-columns:132px 1fr 44px 48px 78px;gap:9px;align-items:center;font-size:13px}
.kw-name{font-weight:700;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kw-bar{background:var(--soft);border-radius:3px;height:15px;overflow:hidden}
.kw-bar i{display:block;height:100%;border-radius:3px}
.kw-n{text-align:right;font-weight:800;font-variant-numeric:tabular-nums}
.kw-risk{text-align:right;font-size:12px;font-weight:700;font-variant-numeric:tabular-nums}
.kchip{font-size:11px;font-weight:800;border-radius:4px;padding:1px 6px;text-align:center}
.kchip.up{background:#fdeceb;color:#b3261e}
.kchip.down{background:#e9f4ee;color:#1f6b42}
.kchip.flat{background:var(--soft);color:var(--mute)}
.kchip.new{background:var(--head-bg);color:var(--head-ink)}
:root[data-theme="dark"] .kchip.up{background:#3a1e1c;color:#e88a80}
:root[data-theme="dark"] .kchip.down{background:#16281f;color:#7fd0a4}

/* 시안 B */
.netbox{overflow-x:auto}
.net{display:block;width:100%;min-width:600px;height:auto}
.net .ed{stroke:var(--mute);stroke-opacity:.28}
.net .nl{font-size:12.5px;font-weight:700;fill:var(--ink);paint-order:stroke;stroke:var(--paper);stroke-width:3.5px}
.net .nd{cursor:default}
.net.dim .ed{stroke-opacity:.07}
.net.dim .nd{opacity:.22}
.net.dim .ed.on{stroke-opacity:.85;stroke:var(--navy)}
.net.dim .nd.on{opacity:1}

/* 시안 C */
.tlbox{overflow-x:auto}
.tl{display:block;width:100%;min-width:760px;height:auto}
.tl .tl-h{font-size:11.5px;font-weight:700;fill:var(--ink-3)}
.tl .tl-h2{font-size:10px;fill:var(--faint)}
.tl .tl-k{font-size:12.5px;font-weight:700;fill:var(--ink)}

@media (max-width:640px){
  .opt{padding:16px 13px}
  .pc{grid-template-columns:1fr}
  .kw-row{grid-template-columns:96px 1fr 36px 42px 66px;gap:6px;font-size:12px}
  .opt-fit{margin-left:0;flex-basis:100%}
}
</style>
</head>
<body>
<div class="shell" style="grid-template-columns:minmax(0,1fr)">
<div>
<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="48" height="48">
    <div><h1>키워드 · 네트워크 시각화 시안</h1>
    <div class="sub">${esc(meta.org)} · 주간 모니터링 화면에 넣을 후보 3종</div></div>
  </div>
  <div class="acts">
    <a class="btn" href="index.html">‹ 주간 리포트</a>
    <div class="ctl" data-theme-ctl role="group" aria-label="화면 테마">
      <button type="button" data-theme="auto" aria-pressed="false">자동</button>
      <button type="button" data-theme="light" aria-pressed="false">밝게</button>
      <button type="button" data-theme="dark" aria-pressed="false">어둡게</button>
    </div>
  </div>
</header>
<main class="main lab">
<p class="notice"><span class="sec-face notice-face">${sanjini('idea', 40)}</span>
세 안 모두 <b>${esc(latestFile.replace('.json', ''))} 기준 실제 수집 기사 ${cur.docCount.toLocaleString('ko-KR')}건</b>(국내분)으로 그렸습니다. 더미 데이터가 없습니다.
키워드는 <b>기사 제목에서만</b> 뽑습니다 — 본문은 저장하지 않습니다(저작권).
주차 간 비교가 공정하도록 <b>구글 뉴스 소스로 통일</b>했습니다(최신 주차에만 언론사 RSS 가 섞여 있어 그대로 두면 소스 증가가 이슈 증가로 보입니다).
도메인 사전 ${'약 90개 용어'} + 자동 n-gram 을 합쳐 추출하며, 최소 ${cur.minCount}회 이상 등장한 말만 남깁니다.
<span class="sample">세 안은 배타적이지 않습니다. A+C 또는 A+B 조합도 가능합니다</span></p>

${CARDS.map((c) => `
<section class="opt" id="opt-${c.id}">
  <div class="opt-h">
    <span class="opt-tag">${esc(c.tag)}</span>
    <h2>${esc(c.name)}</h2>
    <span class="opt-fit">놓을 자리: ${esc(c.fit)}</span>
  </div>
  <p class="opt-lead">${esc(c.lead)}</p>
  ${c.body}
  <div class="pc">
    <div class="good"><h4>좋은 점</h4><ul>${c.pros.map((p) => `<li>${p}</li>`).join('')}</ul></div>
    <div class="bad"><h4>걸리는 점</h4><ul>${c.cons.map((p) => `<li>${p}</li>`).join('')}</ul></div>
  </div>
</section>`).join('')}

<p class="foot">${esc(meta.foot)}<br>생성: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} ·
데이터: data/collected/${esc(latestFile)} (국내 ${cur.docCount}건) · 8주 시계열 ${series.length}개 파일</p>
</main>
</div>
</div>
<div id="toast"></div>
<script>
${boot.includes('__pnuTheme') ? '' : ''}
// 테마 버튼
(function () {
  var box = document.querySelector('[data-theme-ctl]');
  if (!box || !window.__pnuTheme) return;
  var btns = [].slice.call(box.querySelectorAll('button'));
  function paint() { btns.forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.theme === window.__pnuTheme.pref)); }); }
  btns.forEach(function (b) { b.addEventListener('click', function () { window.__pnuTheme.apply(b.dataset.theme); paint(); }); });
  paint();
})();

// 시안 B — 원에 올리면 이웃만 남긴다
(function () {
  var svg = document.querySelector('.net');
  if (!svg) return;
  var eds = [].slice.call(svg.querySelectorAll('.ed'));
  var nds = [].slice.call(svg.querySelectorAll('.nd'));
  nds.forEach(function (g) {
    g.addEventListener('mouseenter', function () {
      var i = g.dataset.i, near = {};
      near[i] = 1;
      eds.forEach(function (e) {
        var on = e.dataset.a === i || e.dataset.b === i;
        e.classList.toggle('on', on);
        if (on) { near[e.dataset.a] = 1; near[e.dataset.b] = 1; }
      });
      nds.forEach(function (n) { n.classList.toggle('on', !!near[n.dataset.i]); });
      svg.classList.add('dim');
    });
    g.addEventListener('mouseleave', function () {
      svg.classList.remove('dim');
      eds.forEach(function (e) { e.classList.remove('on'); });
      nds.forEach(function (n) { n.classList.remove('on'); });
    });
  });
})();
</script>
</body>
</html>`;

writeFileSync(join(root, 'dist/viz-lab.html'), html, 'utf8');
console.log(`✓ dist/viz-lab.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
console.log(`  기준 ${latestFile} · 국내 ${cur.docCount}건 · 키워드 ${cur.nodes.length}개 · 연결 ${cur.links.length}개`);
console.log(`  8주 시계열: ${series.map((s) => s.date.slice(5) + '(' + s.total + ')').join(' ')}`);
console.log(`  상위 6: ${cur.nodes.slice(0, 6).map((n) => n.key + ' ' + n.n).join(' / ')}`);
