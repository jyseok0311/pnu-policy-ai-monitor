// 공기어(共起) 네트워크 — 같은 기사 제목에 함께 등장한 키워드를 잇는다.
//
// 배치는 빌드 때 계산해 좌표를 SVG 에 굳힌다. 브라우저에서 물리 시뮬레이션을 돌리면
// 열 때마다 그림이 달라져 화면과 PDF 가 어긋나고, 인쇄 시점에는 아직 안정되지도 않는다.

// 분야 색 — 등급 색(빨강 계열)과 겹치지 않는 별도 팔레트.
// '많다'와 '위험하다'를 한 색으로 섞지 않기 위해 크기·색·테두리를 각각 다른 축에 쓴다.
export const FIELD_COLOR = {
  '거버넌스': '#3b6fb8',
  '재정': '#8a5fc0',
  '입시·학령인구': '#c07b2a',
  'AI·디지털': '#1f8f7a',
  '기타': '#7a8595'
};
export const riskColor = (r) => (r >= 40 ? '#b3261e' : r >= 20 ? '#d9822b' : r >= 8 ? '#c9a227' : '#2f8f5b');

// Fruchterman–Reingold. 반발 k²/d, 인력 d²/k.
// 반발을 k²/d² 로 두면 조금만 멀어져도 힘이 사라져 전부 한 덩어리로 뭉친다(처음에 그렇게 만들어 실패했다).
export function layout(nodes, links, W, H, radii, steps = 900) {
  const N = nodes.length;
  if (!N) return [];
  // 결정론적 초기 배치 — 난수를 쓰면 빌드마다 그림이 바뀐다
  const P = nodes.map((n, i) => {
    const a = (i / N) * Math.PI * 2, r = Math.min(W, H) * 0.36;
    return { x: W / 2 + Math.cos(a) * r, y: H / 2 + Math.sin(a) * r * 0.8 };
  });
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
    // 함께 등장한 횟수가 많을수록 세게 당기되 최대 2배까지만
    for (const l of links) {
      const dx = P[l.s].x - P[l.t].x, dy = P[l.s].y - P[l.t].y;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy), 0.5);
      const f = ((d * d) / k) * (0.6 + (l.n / maxE) * 1.4);
      D[l.s].x -= (dx / d) * f; D[l.s].y -= (dy / d) * f;
      D[l.t].x += (dx / d) * f; D[l.t].y += (dy / d) * f;
    }
    // 약한 중력 — 연결 없는 노드가 화면 밖으로 날아가지 않을 만큼만
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

  // 자리를 다 쓰도록 맞춘다.
  // 힘 계산만 끝내면 그림이 화면 한쪽에 쏠린 채 남는다(오른쪽 아래가 통째로 비었다).
  // 실제 차지한 범위를 재서 가운데로 옮기고, 여백이 남는 만큼만 키운다.
  const pad = 34;
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i < N; i++) {
    x0 = Math.min(x0, P[i].x - radii[i]); x1 = Math.max(x1, P[i].x + radii[i]);
    y0 = Math.min(y0, P[i].y - radii[i]); y1 = Math.max(y1, P[i].y + radii[i] + 16);  // 라벨 높이
  }
  const sx = (W - pad * 2) / Math.max(x1 - x0, 1);
  const sy = (H - pad * 2) / Math.max(y1 - y0, 1);
  // 1.35배까지만 키운다. 더 키우면 원 사이가 벌어져 묶음이 흩어져 보인다.
  const sc = Math.min(sx, sy, 1.35);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (let i = 0; i < N; i++) {
    P[i].x = W / 2 + (P[i].x - cx) * sc;
    P[i].y = H / 2 + (P[i].y - cy) * sc;
  }
  // 키운 뒤 다시 떼어 놓는다. 확대는 간격도 같이 늘리지만 반지름은 그대로다.
  for (let pass = 0; pass < 3; pass++) {
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
  return P;
}

/**
 * 네트워크 SVG 한 장.
 * @param net  { nodes:[{key,n,risk,field,sample}], links:[{s,t,n}] }
 * @param opt  { esc, id, W, H, max, label }
 */
export function networkSvg(net, opt = {}) {
  const esc = opt.esc || ((x) => x);
  const W = opt.W || 1000, H = opt.H || 560;
  const MAX = opt.max || 22;

  const nodes = net.nodes.slice(0, MAX);
  const pos = new Map(nodes.map((n, i) => [n.key, i]));
  const links = net.links
    .map((l) => ({ s: pos.get(net.nodes[l.s] && net.nodes[l.s].key), t: pos.get(net.nodes[l.t] && net.nodes[l.t].key), n: l.n }))
    .filter((l) => l.s !== undefined && l.t !== undefined);

  if (!nodes.length) return '';

  const maxN = Math.max(...nodes.map((n) => n.n));
  const rOf = (n) => 12 + Math.sqrt(n.n / maxN) * 26;
  const radii = nodes.map(rOf);
  const P = layout(nodes, links, W, H, radii);
  const maxE = Math.max(...links.map((l) => l.n), 1);

  const edges = links.map((l) => `<line class="ed" data-a="${l.s}" data-b="${l.t}"
    x1="${P[l.s].x.toFixed(1)}" y1="${P[l.s].y.toFixed(1)}" x2="${P[l.t].x.toFixed(1)}" y2="${P[l.t].y.toFixed(1)}"
    stroke-width="${(0.8 + (l.n / maxE) * 4.5).toFixed(2)}"><title>${esc(nodes[l.s].key)} × ${esc(nodes[l.t].key)} — ${l.n}</title></line>`).join('');

  const circles = nodes.map((n, i) => {
    const r = radii[i];
    const tip = [`${n.key} — ${n.n} · ${n.risk}% · ${n.field}`, n.sample ? n.sample.title : null].filter(Boolean).join('\n');
    return `<g class="nd" data-i="${i}" data-key="${esc(n.key)}">
      <g transform="translate(${P[i].x.toFixed(1)},${P[i].y.toFixed(1)})">
      <circle r="${r.toFixed(1)}" fill="${FIELD_COLOR[n.field] || FIELD_COLOR['기타']}" fill-opacity=".88"
        stroke="${riskColor(n.risk)}" stroke-width="${n.risk >= 20 ? 3 : 1.5}"/>
      <text y="${(r + 13).toFixed(1)}" text-anchor="middle" class="nl">${esc(n.key)}</text>
      <title>${esc(tip)}</title></g>
    </g>`;
  }).join('');

  return `<svg class="net" id="net-${esc(opt.id || 'x')}" viewBox="0 0 ${W} ${H}" role="img"
    aria-label="${esc(opt.label || '주간 키워드 공기 네트워크')}">
    <g class="edges">${edges}</g>${circles}</svg>`;
}
