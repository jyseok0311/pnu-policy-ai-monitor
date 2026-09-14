// 주간 키워드 네트워크 3D 시안 3종 — dist/net-lab.html
// 사용: node net-lab.mjs
//
// 지금 화면이 3D 로 안 보이는 이유는 분명하다(실측):
//   · 가로:세로:깊이 = 584 : 431 : 203 — 깊이가 가로의 35% 뿐이라 거의 평면이다.
//   · 카메라가 멀어(z0=1250, 깊이폭 203) 앞뒤 크기 차이가 18% 밖에 안 난다.
//   · 회전 폭 ±24°, 자동 회전 초당 3.2° — 시차(parallax)가 생기지 않는다.
// 세 시안은 이 셋을 각각 다른 방식으로 푼다. 전부 w37 실데이터로 그린다.

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(fileURLToPath(import.meta.url));
const J = (p) => JSON.parse(readFileSync(join(root, p), 'utf8'));
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const meta = J('data/meta.json');
const week = J('data/weeks.json').find((w) => w.network && w.network.nodes.length);
const NET = week.network;

const FIELD_COLOR = {
  '거버넌스': '#3b6fb8', '재정': '#8a5fc0', '입시·학령인구': '#c07b2a',
  'AI·디지털': '#1f8f7a', '기타': '#7a8595'
};
const riskColor = (r) => (r >= 40 ? '#b3261e' : r >= 20 ? '#d9822b' : r >= 8 ? '#c9a227' : '#2f8f5b');

// 세 시안이 같은 데이터를 쓴다. 좌표만 다르게 만든다.
const nodes = NET.nodes.slice(0, 22).map((n) => ({
  key: n.key, n: n.n, risk: n.risk, field: n.field,
  fill: FIELD_COLOR[n.field] || FIELD_COLOR['기타'], ring: riskColor(n.risk),
  sample: n.sample ? n.sample.title : ''
}));
const pos = new Map(nodes.map((n, i) => [n.key, i]));
const links = NET.links
  .map((l) => ({ s: pos.get(NET.nodes[l.s] && NET.nodes[l.s].key), t: pos.get(NET.nodes[l.t] && NET.nodes[l.t].key), n: l.n }))
  .filter((l) => l.s !== undefined && l.t !== undefined);

const maxN = Math.max(...nodes.map((n) => n.n));
const maxE = Math.max(...links.map((l) => l.n), 1);
const rOf = (n) => 13 + Math.sqrt(n.n / maxN) * 25;

/* ══════════════ 시안 1 — 깊은 원근 ══════════════
   같은 배치를 쓰되 깊이를 가로만큼 벌리고 카메라를 바짝 붙인다.
   먼 노드는 흐려지고(피사계 심도) 작아진다. */
function layoutDeep(steps = 900) {
  const N = nodes.length, R = 300;
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const P = nodes.map((_, i) => {
    const y = N === 1 ? 0 : 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(1 - y * y, 0)), th = GOLD * i;
    return { x: Math.cos(th) * r * R, y: y * R, z: Math.sin(th) * r * R };
  });
  const k = Math.cbrt((R * R * R * 8) / N) * 0.9;
  for (let s = 0; s < steps; s++) {
    const temp = (R / 6) * Math.pow(1 - s / steps, 1.5);
    const D = P.map(() => ({ x: 0, y: 0, z: 0 }));
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z;
      let d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1.8;
      const f = (k * k) / d;
      D[i].x += dx / d * f; D[i].y += dy / d * f; D[i].z += dz / d * f;
      D[j].x -= dx / d * f; D[j].y -= dy / d * f; D[j].z -= dz / d * f;
    }
    for (const l of links) {
      const a = P[l.s], b = P[l.t];
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d = Math.max(Math.hypot(dx, dy, dz), 0.5);
      const f = (d * d / k) * (0.6 + l.n / maxE * 1.4);
      D[l.s].x -= dx / d * f; D[l.s].y -= dy / d * f; D[l.s].z -= dz / d * f;
      D[l.t].x += dx / d * f; D[l.t].y += dy / d * f; D[l.t].z += dz / d * f;
    }
    for (let i = 0; i < N; i++) { D[i].x -= P[i].x * 0.014; D[i].y -= P[i].y * 0.014; D[i].z -= P[i].z * 0.014; }
    for (let i = 0; i < N; i++) {
      const d = Math.max(Math.hypot(D[i].x, D[i].y, D[i].z), 0.01), m = Math.min(d, temp) / d;
      P[i].x += D[i].x * m; P[i].y += D[i].y * m; P[i].z += D[i].z * m;
    }
  }
  const c = P.reduce((a, p) => ({ x: a.x + p.x / N, y: a.y + p.y / N, z: a.z + p.z / N }), { x: 0, y: 0, z: 0 });
  P.forEach((p) => { p.x -= c.x; p.y -= c.y; p.z -= c.z; });
  // 깊이를 '누르지' 않는다 — 그게 지금 안 보이던 이유였다.
  // 다만 무작정 벌리면 안 된다. 카메라(z0=640) 를 넘어선 노드는 뒤집히고, 가까운 노드는
  // 배율이 폭주한다(실제로 화면 밖으로 나갔다). 원근이 감당하는 범위 ±Z 안에 정규화한다.
  //   배율비 = (z0+Z)/(z0-Z) → Z=230, z0=640 이면 약 2.1배. 지금(1.18배)의 두 배 가까이다.
  const sp = (f) => Math.max(...P.map((p) => Math.abs(f(p)))) || 1;
  const Z = 230;
  const kz = Z / sp((p) => p.z);
  P.forEach((p) => { p.z *= kz; });
  // 가로·세로는 프레임에 맞춘다. 배율이 커진 만큼 좌표를 줄여야 화면 안에 들어온다.
  // 가로·세로를 각각 맞춘다. 작은 쪽에 맞춰 등비로 줄이면 넓은 쪽이 텅 빈다
  // (가로가 1000 중 165px 만 쓰는 일이 실제로 있었다). 찌그러짐은 1.6배로 묶는다.
  const kx = 330 / sp((p) => p.x), ky = 200 / sp((p) => p.y);
  const lo = Math.min(kx, ky);
  const fx = Math.min(kx, lo * 1.6), fy = Math.min(ky, lo * 1.6);
  P.forEach((p) => { p.x *= fx; p.y *= fy; });
  return P;
}

/* ══════════════ 시안 2 — 회전 구체 ══════════════
   AX360 처럼 점을 구 표면에 올린다. 다만 아무 데나 두지 않고,
   함께 등장한 키워드가 표면에서도 가깝도록 접선 방향으로만 힘을 준다. */
function layoutSphere(steps = 1200) {
  const N = nodes.length, R = 290;
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const P = nodes.map((_, i) => {
    const y = 1 - (i / Math.max(N - 1, 1)) * 2;
    const r = Math.sqrt(Math.max(1 - y * y, 0)), th = GOLD * i;
    return { x: Math.cos(th) * r, y: y, z: Math.sin(th) * r };
  });
  const norm = (p) => { const d = Math.hypot(p.x, p.y, p.z) || 1; p.x /= d; p.y /= d; p.z /= d; };
  for (let s = 0; s < steps; s++) {
    const rate = 0.06 * (1 - s / steps) + 0.004;
    const D = P.map(() => ({ x: 0, y: 0, z: 0 }));
    // 반발 — 표면 위 각거리가 가까울수록 세게
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z;
      const d2 = dx * dx + dy * dy + dz * dz + 0.02;
      const f = 0.55 / d2;
      const d = Math.sqrt(d2);
      D[i].x += dx / d * f; D[i].y += dy / d * f; D[i].z += dz / d * f;
      D[j].x -= dx / d * f; D[j].y -= dy / d * f; D[j].z -= dz / d * f;
    }
    // 인력 — 함께 등장한 만큼 끌어당긴다
    for (const l of links) {
      const a = P[l.s], b = P[l.t];
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const f = 0.5 * (0.4 + l.n / maxE * 1.6);
      D[l.s].x -= dx * f; D[l.s].y -= dy * f; D[l.s].z -= dz * f;
      D[l.t].x += dx * f; D[l.t].y += dy * f; D[l.t].z += dz * f;
    }
    for (let i = 0; i < N; i++) {
      // 접선 성분만 남긴다 — 구 표면을 벗어나지 않게
      const dot = D[i].x * P[i].x + D[i].y * P[i].y + D[i].z * P[i].z;
      P[i].x += (D[i].x - dot * P[i].x) * rate;
      P[i].y += (D[i].y - dot * P[i].y) * rate;
      P[i].z += (D[i].z - dot * P[i].z) * rate;
      norm(P[i]);
    }
  }
  return P.map((p) => ({ x: p.x * R, y: p.y * R * 0.92, z: p.z * R }));
}

/* ══════════════ 시안 3 — 분야별 깊이판 ══════════════
   분야마다 깊이를 하나씩 준다. 판이 겹쳐 보이는 것만으로 3D 가 읽히고,
   '어느 분야가 어느 분야와 엮였는지'가 판을 가로지르는 선으로 드러난다. */
const FIELD_ORDER = ['AI·디지털', '거버넌스', '재정', '입시·학령인구', '기타'];
function layoutLayers(steps = 700) {
  const used = FIELD_ORDER.filter((f) => nodes.some((n) => n.field === f));
  const GAP = 210, Z0 = -((used.length - 1) / 2) * GAP;
  const planeZ = {};
  used.forEach((f, i) => { planeZ[f] = Z0 + i * GAP; });

  const P = nodes.map((n, i) => ({
    x: Math.cos(i * 2.399) * 150, y: Math.sin(i * 2.399) * 110, z: planeZ[n.field] !== undefined ? planeZ[n.field] : 0
  }));
  // 판 안에서만 2D 로 편다. 판을 가로지르는 선은 당기지 않는다(판이 흐트러진다).
  for (let s = 0; s < steps; s++) {
    const temp = 26 * Math.pow(1 - s / steps, 1.4);
    const D = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      const same = P[i].z === P[j].z;
      let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
      let d = Math.hypot(dx, dy) || 1;
      // 다른 판이라도 화면에서 겹치면 읽기 나쁘다. 약하게 밀어 둔다.
      const f = (same ? 5200 : 2100) / (d * d);
      D[i].x += dx / d * f; D[i].y += dy / d * f;
      D[j].x -= dx / d * f; D[j].y -= dy / d * f;
    }
    for (const l of links) {
      if (P[l.s].z !== P[l.t].z) continue;
      const dx = P[l.s].x - P[l.t].x, dy = P[l.s].y - P[l.t].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = d * 0.014 * (0.5 + l.n / maxE);
      D[l.s].x -= dx / d * f; D[l.s].y -= dy / d * f;
      D[l.t].x += dx / d * f; D[l.t].y += dy / d * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      D[i].x -= P[i].x * 0.05; D[i].y -= P[i].y * 0.05;
      const d = Math.max(Math.hypot(D[i].x, D[i].y), 0.01), m = Math.min(d, temp) / d;
      P[i].x += D[i].x * m; P[i].y += D[i].y * m;
    }
  }
  // 판마다 가운데로 모으고 크기를 맞춘다
  used.forEach((f) => {
    const idx = nodes.map((n, i) => (n.field === f ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const cx = idx.reduce((a, i) => a + P[i].x, 0) / idx.length;
    const cy = idx.reduce((a, i) => a + P[i].y, 0) / idx.length;
    idx.forEach((i) => { P[i].x -= cx; P[i].y -= cy; });
  });
  return { P, planeZ, used };
}

const deep = layoutDeep();
const sphere = layoutSphere();
const layers = layoutLayers();

const PAYLOAD = {
  nodes: nodes.map((n, i) => ({ k: n.key, n: n.n, r: n.risk, f: n.field, c: n.fill, g: n.ring, s: n.sample, rad: rOf(n) })),
  links: links.map((l) => [l.s, l.t, l.n]),
  maxE,
  deep, sphere,
  layers: layers.P, planeZ: layers.planeZ, used: layers.used,
  fieldColor: FIELD_COLOR
};

const SPEC = [
  {
    id: 'deep', tag: '시안 1', name: '깊은 원근',
    lead: '배치는 그대로 두고 깊이를 가로만큼 벌린 뒤 카메라를 바짝 붙였다.',
    spec: [
      ['노드', '구체 + 접지 그림자. 앞뒤 크기 차이 <b>2.0배</b> (현재는 1.18배)'],
      ['엣지', '깊이에 따라 굵기·진하기가 바뀌는 곡선. 먼 선은 흐려진다'],
      ['폰트', '가까운 노드만 라벨. 멀어지면 서서히 사라진다(겹침 방지)'],
      ['색', '분야색 + 위험신호 테두리. 배경은 밝게 유지'],
      ['기능', '마우스로 ±55° 회전 · 먼 노드 흐림(피사계 심도) · 호버 시 이웃만']
    ],
    pros: ['지금 그림과 배치가 같아 <b>바꿔 끼우기만 하면 된다</b>.',
      '깊이를 벌리고 카메라를 당긴 것만으로 앞뒤 크기 차이가 18% → <b>96%</b> 가 된다(실측).',
      '흐림(심도)이 들어가 어느 것이 앞인지 한눈에 읽힌다.'],
    cons: ['원근이 세지면 뒤쪽 노드가 많이 작아져 라벨을 못 붙인다.',
      '회전 폭이 커서 라벨이 겹치는 각도가 생긴다.']
  },
  {
    id: 'sphere', tag: '시안 2', name: '회전 구체',
    lead: 'AX360 처럼 구 표면에 올리되, 함께 등장한 키워드가 표면에서도 붙도록 배치했다.',
    spec: [
      ['노드', '구 표면의 점. 앞면은 또렷하고 뒷면은 배경에 잠긴다'],
      ['엣지', '표면을 따라 도는 호(arc). 구의 둥근 느낌을 만드는 주인공'],
      ['폰트', '앞면만 표시. 구가 돌면서 라벨이 자연스럽게 교대한다'],
      ['색', '분야색 + 위도선(격자)으로 구를 읽게 함'],
      ['기능', '360° 상시 회전 · 드래그로 굴리기 · 호버 시 이웃만']
    ],
    pros: ['참고하신 AX360 화면에 가장 가깝다. <b>구의 윤곽</b>이 3D 를 바로 전달한다.',
      '상시 회전이 자연스럽다 — 평면 그림은 돌리면 어색하지만 구는 안 그렇다.',
      '노드가 늘어도 표면에 고르게 퍼져 덜 겹친다.'],
    cons: ['거리가 <b>표면 위 거리</b>라 군집이 평면만큼 또렷하지 않다.',
      '항상 절반은 뒤에 있다 — 한 화면에 다 안 보인다.',
      'PDF 는 한 각도만 굽는다. 뒤쪽 키워드가 인쇄본에서 빠진다.']
  },
  {
    id: 'layers', tag: '시안 3', name: '분야별 깊이판',
    lead: '분야마다 깊이를 하나씩 준다. 판이 겹쳐 보이는 것만으로 3D 가 읽힌다.',
    spec: [
      ['노드', '자기 분야 판 위에 놓이고, 판까지 기둥(stem)이 내려간다'],
      ['엣지', '<b>판을 가로지르는 선만 진하게</b> — 분야 간 얽힘이 핵심 정보'],
      ['폰트', '전부 표시. 판마다 분리돼 있어 겹치지 않는다'],
      ['색', '판은 분야색 옅게, 노드는 진하게. 위험신호는 테두리'],
      ['기능', '고정 각도 + 약한 시차 · 판 클릭 시 그 분야만 · 호버 시 이웃만']
    ],
    pros: ['<b>가장 잘 읽힌다.</b> 판이 기준면이 되어 깊이가 착시 없이 보인다.',
      '분야가 축이 되므로 "AI 가 거버넌스와 얼마나 엮였나" 가 바로 보인다.',
      '라벨이 판마다 나뉘어 겹침이 거의 없다. 인쇄에도 그대로 쓸 수 있다.'],
    cons: ['분야가 축을 차지해 <b>군집(무엇끼리 뭉쳤나)은 약해진다</b>.',
      '분야가 5개로 고정이라 한 분야에 노드가 몰리면 그 판만 빽빽해진다.']
  }
];

const css = readFileSync(join(root, 'src/styles.css'), 'utf8');
const renderer = readFileSync(join(root, 'src/browser/netlab.js'), 'utf8');

const html = `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>키워드 네트워크 3D 시안 | PNU</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>${css}
.lab{max-width:1100px;margin:0 auto}
.why{background:var(--paper);border:1px solid var(--line);border-left:3px solid var(--crisis);
  border-radius:8px;padding:14px 18px;margin:18px 0}
.why h3{margin:0 0 8px;font-size:15px;color:var(--navy)}
.why table{font-size:13px;margin:0}
.why td,.why th{padding:5px 8px}
.opt{background:var(--paper);border:1px solid var(--line);border-radius:10px;padding:20px 24px;margin-bottom:24px}
.opt-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin-bottom:3px}
.opt-tag{background:var(--head-bg);color:var(--head-ink);font-weight:800;font-size:12px;border-radius:5px;padding:3px 9px}
.opt-h h2{margin:0;font-size:20px;font-weight:800;color:var(--navy)}
.opt-lead{color:var(--ink-3);font-size:14px;margin:0 0 14px}
.stage{position:relative;border:1px solid var(--line);border-radius:10px;overflow:hidden;background:#fbfcfe}
.stage canvas{display:block;width:100%;height:auto;cursor:grab}
.stage canvas:active{cursor:grabbing}
.sp{width:100%;font-size:13px;margin:14px 0 0;border-collapse:collapse}
.sp th{width:64px;text-align:left;color:var(--navy);font-weight:700;padding:5px 10px 5px 0;vertical-align:top;background:none;border:0}
.sp td{padding:5px 0;border:0;border-top:1px solid var(--line);color:var(--ink-2)}
.sp tr:first-child td,.sp tr:first-child th{border-top:0}
.pc{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:14px}
.pc > div{border:1px solid var(--line);border-radius:7px;padding:10px 14px;background:var(--soft)}
.pc h4{margin:0 0 6px;font-size:12.5px;font-weight:800}
.pc .good h4{color:#1f6b42}
.pc .bad h4{color:var(--crisis)}
.pc ul{margin:0;padding-left:17px;font-size:13px;line-height:1.65}
.tipbox{position:fixed;z-index:9998;pointer-events:none;max-width:300px;background:#fff;color:var(--ink);
  border:1px solid var(--line);border-radius:8px;padding:8px 11px;font-size:12.5px;line-height:1.5;
  box-shadow:0 8px 22px rgba(26,43,76,.18)}
.tipbox b{display:block;font-size:14px;margin-bottom:2px;color:var(--navy)}
.tipbox span{display:block;color:var(--mute);font-size:11.5px}
@media (max-width:640px){ .pc{grid-template-columns:1fr} .opt{padding:15px 13px} }
</style>
</head>
<body>
<div class="shell" style="grid-template-columns:minmax(0,1fr)">
<div>
<header class="top">
  <div class="brand">
    <img class="logo-img" src="assets/pnu-symbol.png" alt="PNU" width="48" height="48">
    <div><h1>키워드 네트워크 3D 시안</h1>
    <div class="sub">${esc(meta.org)} · ${esc(week.label)} 실데이터 · 키워드 ${nodes.length}개 · 연결 ${links.length}개</div></div>
  </div>
  <div class="acts"><a class="btn" href="index.html">‹ 주간 리포트</a></div>
</header>
<main class="main lab">

<div class="why">
  <h3>지금 화면이 3D 로 안 보이는 이유</h3>
  <div class="tbl"><table>
    <thead><tr><th>항목</th><th>현재</th><th>무엇이 문제인가</th></tr></thead>
    <tbody>
      <tr><td>가로 : 세로 : 깊이</td><td>584 : 431 : <b>203</b></td><td>깊이가 가로의 <b>35%</b> 뿐 — 사실상 평면이다</td></tr>
      <tr><td>원근 배율</td><td>0.845 ~ 0.994</td><td>앞뒤 크기 차이가 <b>18%</b> 밖에 안 난다</td></tr>
      <tr><td>회전 폭</td><td>±24° / ±15°</td><td>좁아서 시차(parallax)가 생기지 않는다</td></tr>
      <tr><td>자동 회전</td><td>초당 3.2°</td><td>거의 멈춰 있는 것처럼 보인다</td></tr>
    </tbody>
  </table></div>
  <p class="note-line">깊이를 눌러 놓고(z×0.62) 카메라를 멀리 둔 탓이다. 라벨이 겹치지 않게 하려고 그렇게 잡았는데,
  그 대가로 입체감을 전부 잃었다. 아래 세 안은 이 맞바꿈을 각각 다르게 푼다.</p>
</div>

${SPEC.map((o) => `
<section class="opt" id="opt-${o.id}">
  <div class="opt-h"><span class="opt-tag">${esc(o.tag)}</span><h2>${esc(o.name)}</h2></div>
  <p class="opt-lead">${esc(o.lead)}</p>
  <div class="stage"><canvas data-lab="${o.id}"></canvas></div>
  <table class="sp"><tbody>${o.spec.map(([k, v]) => `<tr><th>${esc(k)}</th><td>${v}</td></tr>`).join('')}</tbody></table>
  <div class="pc">
    <div class="good"><h4>좋은 점</h4><ul>${o.pros.map((p) => `<li>${p}</li>`).join('')}</ul></div>
    <div class="bad"><h4>걸리는 점</h4><ul>${o.cons.map((p) => `<li>${p}</li>`).join('')}</ul></div>
  </div>
</section>`).join('')}

<p class="foot">${esc(meta.foot)}<br>생성: ${new Date().toISOString().slice(0, 19).replace('T', ' ')} · ${esc(week.label)} 실데이터</p>
</main>
</div>
</div>
<script>window.__LAB__ = ${JSON.stringify(PAYLOAD)};</script>
<script>${renderer}</script>
</body>
</html>`;

writeFileSync(join(root, 'dist/net-lab.html'), html, 'utf8');
console.log(`✓ dist/net-lab.html  ${(Buffer.byteLength(html) / 1024).toFixed(0)} KB`);
console.log(`  ${week.label} · 노드 ${nodes.length} · 연결 ${links.length}`);
const spread = (P, f) => (Math.max(...P.map(f)) - Math.min(...P.map(f))).toFixed(0);
console.log(`  시안1 깊은원근  가로 ${spread(deep, (p) => p.x)} : 깊이 ${spread(deep, (p) => p.z)}`);
console.log(`  시안2 회전구체  반지름 290 · 표면 배치`);
console.log(`  시안3 깊이판    판 ${layers.used.length}개 · 간격 210`);
