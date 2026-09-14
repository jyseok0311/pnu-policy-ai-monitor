// 공기어(共起) 네트워크 — 같은 기사 제목에 함께 등장한 키워드를 잇는다.
//
// 배치는 3차원으로 계산하고 원근 투영해 SVG 로 굳힌다.
//   · WebGL 이 아니라 SVG 인 이유: PDF 를 헤드리스 크롬으로 굽는데, 벡터로 남아야
//     인쇄에서 글자가 깨지지 않는다. 외부 라이브러리(CDN)도 끌어오지 않는다.
//   · 좌표(x,y,z)는 빌드 때 한 번 계산해 노드마다 박아 둔다. 브라우저는 그 좌표를
//     회전·투영만 다시 한다 — 열 때마다 물리 시뮬레이션을 돌리면 그림이 매번 달라져
//     화면과 PDF 가 어긋나고, 인쇄 시점에는 아직 안정되지도 않는다.
//   · 마우스를 올리면 app.js 가 카메라를 살짝 돌린다. 원근이 살아 있어 깊이가 읽힌다.

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

// 카메라. app.js 가 같은 값을 써야 첫 화면과 회전 후가 이어진다.
export const CAM = { f: 1150, z0: 1250 };
// 마우스로 돌릴 수 있는 최대 각도(라디안). app.js 가 같은 값을 쓴다.
// 더 돌리면 라벨이 서로 넘어가고, 잘라 둔 뷰박스 밖으로 노드가 나간다.
export const MAXYAW = 0.42, MAXPITCH = 0.26;

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

/**
 * 3차원 힘-기반 배치. Fruchterman–Reingold 를 z 축까지 확장했다.
 * 반발 k²/d, 인력 d²/k. 반발을 k²/d² 로 두면 조금만 멀어져도 힘이 사라져
 * 전부 한 덩어리로 뭉친다(2D 때 그렇게 만들어 실패했다).
 * @returns [{x,y,z}] — 원점 중심, 반지름 R 안으로 정규화된 좌표
 */
export function layout3d(nodes, links, halfX, halfY, radii, steps = 800) {
  const N = nodes.length;
  if (!N) return [];

  // 초기 배치는 피보나치 구 — 난수를 쓰면 빌드마다 그림이 바뀐다.
  const GOLD = Math.PI * (3 - Math.sqrt(5));
  const P = nodes.map((_, i) => {
    const y = N === 1 ? 0 : 1 - (i / (N - 1)) * 2;
    const r = Math.sqrt(Math.max(1 - y * y, 0));
    const th = GOLD * i;
    const R0 = Math.min(halfX, halfY);
    return { x: Math.cos(th) * r * R0, y: y * R0, z: Math.sin(th) * r * R0 };
  });

  const R = Math.min(halfX, halfY);
  const k = Math.cbrt((R * R * R * 8) / N) * 0.9;
  const maxE = Math.max(...links.map((l) => l.n), 1);

  for (let step = 0; step < steps; step++) {
    const temp = (R / 6) * Math.pow(1 - step / steps, 1.5);
    const D = P.map(() => ({ x: 0, y: 0, z: 0 }));

    for (let i = 0; i < N; i++) {
      for (let j = i + 1; j < N; j++) {
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y, dz = P[i].z - P[j].z;
        let d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < 0.5) { dx = ((i % 3) - 1) || 1; dy = ((j % 3) - 1) || 1; dz = 1; d = 1.8; }
        const f = (k * k) / d;
        D[i].x += (dx / d) * f; D[i].y += (dy / d) * f; D[i].z += (dz / d) * f;
        D[j].x -= (dx / d) * f; D[j].y -= (dy / d) * f; D[j].z -= (dz / d) * f;
      }
    }
    // 함께 등장한 횟수가 많을수록 세게 당기되 최대 2배까지만.
    // 힘은 반드시 변위(D)에 쌓는다 — 위치(P)를 여기서 직접 건드리면 같은 스텝 안에서
    // 거리가 변해 다음 계산이 어긋나고, 온도 제한도 걸리지 않아 좌표가 발산한다(NaN).
    for (const l of links) {
      const a = P[l.s], b = P[l.t];
      const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
      const d = Math.max(Math.sqrt(dx * dx + dy * dy + dz * dz), 0.5);
      const f = ((d * d) / k) * (0.6 + (l.n / maxE) * 1.4);
      D[l.s].x -= (dx / d) * f; D[l.s].y -= (dy / d) * f; D[l.s].z -= (dz / d) * f;
      D[l.t].x += (dx / d) * f; D[l.t].y += (dy / d) * f; D[l.t].z += (dz / d) * f;
    }
    // 약한 중력 — 연결 없는 노드가 무한히 날아가지 않을 만큼만
    for (let i = 0; i < N; i++) {
      D[i].x -= P[i].x * 0.014; D[i].y -= P[i].y * 0.014; D[i].z -= P[i].z * 0.014;
    }
    for (let i = 0; i < N; i++) {
      const d = Math.max(Math.hypot(D[i].x, D[i].y, D[i].z), 0.01);
      const m = Math.min(d, temp) / d;
      P[i].x += D[i].x * m; P[i].y += D[i].y * m; P[i].z += D[i].z * m;
    }
  }

  // 원점 중심으로 옮긴다.
  const c = P.reduce((a, p) => ({ x: a.x + p.x / N, y: a.y + p.y / N, z: a.z + p.z / N }), { x: 0, y: 0, z: 0 });
  P.forEach((p) => { p.x -= c.x; p.y -= c.y; p.z -= c.z; });

  // 깊이는 앞뒤로 너무 벌리지 않는다. 원근이 과하면 뒤쪽 글자가 읽히지 않는다.
  P.forEach((p) => { p.z *= 0.62; });

  // ── 화면 맞춤 → 겹침 해소 순서로 간다.
  // 반대로 하면(겹침 해소 뒤 축소) 벌려 놓은 간격을 도로 좁힌다.

  // 경계 상자로 맞춘다. 중심에서 가장 먼 점(최대 반경)으로 재면 한쪽으로 치우친 구름에서
  // 바깥 노드 하나가 전체 배율을 정해 버려, 주차마다 프레임 활용이 36~77% 로 널뛰었다.
  // 가로가 훨씬 넓은 화면이라 x 만 조금 더 늘린다 — 최대 1.5배. 그 이상은 찌그러져 보인다.
  const fitBox = () => {
    const xs = P.map((p) => p.x), ys = P.map((p) => p.y);
    const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
    const cx2 = (x0 + x1) / 2, cy2 = (y0 + y1) / 2;
    const fx = (halfX * 2) / Math.max(x1 - x0, 1), fy = (halfY * 2) / Math.max(y1 - y0, 1);
    const base = Math.min(fx, fy), wide = Math.min(fx, base * 1.5);
    P.forEach((p) => {
      p.x = (p.x - cx2) * wide;
      p.y = (p.y - cy2) * base;
      p.z *= base;
    });
  };
  fitBox();

  // 겹침 해소 — 원 반지름 + 라벨 자리만큼은 떼어 놓는다. 글자가 겹치면 그림이 아니라 얼룩이다.
  // 3D 라서 돌리면 다시 겹칠 수 있지만, 정면(첫 화면·PDF)에서만큼은 깨끗해야 한다.
  // 화면에서 겹치는지가 기준이다 — 깊이(z)는 가려질 뿐 겹침을 풀어 주지 않는다.
  // 겹침은 '투영된 화면'에서 일어난다. 투영 전 좌표로 재면 안 된다 —
  // 깊이가 크게 다른 두 노드는 투영 전 89px 떨어져 있어도 화면에서는 13px 로 붙는다
  // (w31 의 인재양성 z=+130 · 글로컬대학 z=-113 이 실제로 그랬다).
  // 그래서 화면 좌표로 재고, 밀어낸 양은 각자의 원근 배율로 나눠 되돌린다.
  const scaleOf = (p) => CAM.f / (CAM.z0 - p.z);
  const separate = (passes) => {
    let worst = 0;
    for (let pass = 0; pass < passes; pass++) {
      worst = 0;
      const S = P.map(scaleOf);
      for (let a = 0; a < N; a++) {
        for (let b = a + 1; b < N; b++) {
          const min = (radii[a] * S[a] + radii[b] * S[b]) * 1.1 + 22;
          let dx = P[b].x * S[b] - P[a].x * S[a];
          let dy = P[b].y * S[b] - P[a].y * S[a];
          let d = Math.hypot(dx, dy);
          // 완전히 겹친 두 점은 밀어낼 방향이 없다. 결정적인 방향을 준다.
          if (d < 0.5) { dx = Math.cos(a * 2.4) || 1; dy = Math.sin(b * 2.4) || 0.6; d = 1.2; }
          if (d < min) {
            const push = ((min - d) / 2) * 0.5;
            P[a].x -= (dx / d) * push / S[a]; P[a].y -= (dy / d) * push / S[a];
            P[b].x += (dx / d) * push / S[b]; P[b].y += (dy / d) * push / S[b];
            worst = Math.max(worst, min - d);
          }
        }
      }
      if (worst < 0.5) break;
    }
    return worst;
  };

  // 맞춤(fitBox)은 가로를 늘리면서 세로는 줄일 수 있다(비등방). 세로가 줄면 상하로 붙은
  // 쌍이 다시 겹친다. 그래서 '맞추고 → 푼다'를 몇 번 되풀이하고, 마지막은 분리로 끝낸다.
  // 프레임에 여유가 충분하므로 요구 간격은 줄이지 않는다.
  if (radii) {
    for (let round = 0; round < 8; round++) {
      const worst = separate(300);
      if (worst < 0.5 && round > 0) break;
      fitBox();
    }
    separate(300);
  }

  // 마지막 안전장치 — 그래도 넘치면 테두리 안으로 가둔다.
  P.forEach((p) => { p.x = clamp(p.x, -halfX, halfX); p.y = clamp(p.y, -halfY, halfY); });
  return P;
}

/** 원근 투영 — app.js 의 같은 이름 함수와 식이 같아야 한다. */
export function project(p, W, H) {
  const s = CAM.f / (CAM.z0 - p.z);
  return { x: W / 2 + p.x * s, y: H / 2 + p.y * s, s };
}

/**
 * 네트워크 SVG 한 장.
 * @param net  { nodes:[{key,n,risk,field,sample}], links:[{s,t,n}] }
 * @param opt  { esc, id, W, H, max, label }
 */
export function networkSvg(net, opt = {}) {
  const esc = opt.esc || ((x) => x);
  const W = opt.W || 1000, H = opt.H || 580;
  const MAX = opt.max || 22;
  const id = esc(opt.id || 'x');

  const nodes = net.nodes.slice(0, MAX);
  if (!nodes.length) return '';
  const pos = new Map(nodes.map((n, i) => [n.key, i]));
  const links = net.links
    .map((l) => ({ s: pos.get(net.nodes[l.s] && net.nodes[l.s].key), t: pos.get(net.nodes[l.t] && net.nodes[l.t].key), n: l.n }))
    .filter((l) => l.s !== undefined && l.t !== undefined);

  const maxN = Math.max(...nodes.map((n) => n.n));
  const rOf = (n) => 13 + Math.sqrt(n.n / maxN) * 25;

  // 노드가 화면 밖으로 나가지 않을 한계. 원근 배율이 1 을 넘을 수 있어(앞쪽 노드)
  // 여유분(SMAX)을 곱해 두고, 라벨이 원 아래 붙으므로 세로는 더 깎는다.
  const rMax = Math.max(...nodes.map(rOf));
  const SMAX = CAM.f / (CAM.z0 - Math.min(W, H) * 0.25);
  const halfX = (W / 2 - rMax * SMAX - 12) / SMAX;
  const halfY = (H / 2 - rMax * SMAX - 26) / SMAX;
  const P = layout3d(nodes, links, halfX, halfY, nodes.map(rOf));

  // 그리는 순서는 뒤 → 앞. 앞의 원이 뒤를 가려야 깊이가 보인다.
  const order = nodes.map((_, i) => i).sort((a, b) => P[a].z - P[b].z);
  const maxE = Math.max(...links.map((l) => l.n), 1);

  // 분야마다 구(球)처럼 보이는 그라디언트를 하나씩. 빛은 왼쪽 위에서 온다.
  const fields = [...new Set(nodes.map((n) => n.field))];
  const defs = `<defs>
    ${fields.map((f, i) => {
      const c = FIELD_COLOR[f] || FIELD_COLOR['기타'];
      return `<radialGradient id="g${id}-${i}" cx="34%" cy="30%" r="72%">
        <stop offset="0%" stop-color="#fff" stop-opacity=".55"/>
        <stop offset="42%" stop-color="${c}" stop-opacity=".97"/>
        <stop offset="100%" stop-color="${c}" stop-opacity=".82"/>
      </radialGradient>`;
    }).join('')}
  </defs>`;
  const gradOf = (n) => `g${id}-${fields.indexOf(n.field)}`;

  const pr = (i) => project(P[i], W, H);

  // 뷰박스를 구름에 맞춰 자른다. 1000×580 에 고정하면 주차에 따라 좌우가 크게 비었다
  // (w36 은 가로의 38% 만 썼다). 잘라내면 컨테이너 폭에 맞춰 그만큼 확대돼 글자도 커진다.
  const box = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    nodes.forEach((n, i) => {
      const q = pr(i), r = rOf(n) * q.s;
      x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r);
      y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r + 17 * q.s);   // 라벨은 원 아래
    });
    // 회전하면 깊이(z)가 가로·세로로 돌아 나온다. 그만큼 미리 비워 두지 않으면
    // 마우스를 올렸을 때 바깥 노드가 잘린다.
    const zMax = Math.max(...P.map((p) => Math.abs(p.z)), 0);
    const padX = 16 + zMax * Math.sin(MAXYAW);
    const padY = 16 + zMax * Math.sin(MAXPITCH);
    x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
    let bw = x1 - x0, bh = y1 - y0;
    // 가로:세로 비는 1.4~2.1 사이로 묶는다. 너무 납작하거나 정사각이면 본문 흐름이 어색하다.
    const want = clamp(bw / bh, 1.4, 2.1);
    if (bw / bh < want) { const t = bh * want; x0 -= (t - bw) / 2; bw = t; }
    else { const t = bw / want; y0 -= (t - bh) / 2; bh = t; }
    return { x: x0, y: y0, w: bw, h: bh };
  })();

  // 선은 곡선으로 띄운다. 직선 다발보다 겹침이 덜하고 입체감이 산다.
  const edges = links.map((l) => {
    const a = pr(l.s), b = pr(l.t);
    const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const bow = Math.min(len * 0.12, 26);
    const cx = mx - (dy / len) * bow, cy = my + (dx / len) * bow;
    const depth = (a.s + b.s) / 2;                       // 앞쪽 선일수록 진하고 굵다
    return `<path class="ed" data-a="${l.s}" data-b="${l.t}" data-n="${l.n}"
      d="M${a.x.toFixed(1)} ${a.y.toFixed(1)} Q${cx.toFixed(1)} ${cy.toFixed(1)} ${b.x.toFixed(1)} ${b.y.toFixed(1)}"
      stroke-width="${(0.7 + (l.n / maxE) * 3.6) * depth}" stroke-opacity="${(0.18 + depth * 0.16).toFixed(3)}"
      ><title>${esc(nodes[l.s].key)} × ${esc(nodes[l.t].key)} — ${l.n}</title></path>`;
  }).join('');

  const circles = order.map((i) => {
    const n = nodes[i], p = pr(i), r = rOf(n) * p.s;
    const tip = [`${n.key} — ${n.n} · 위험신호 ${n.risk}% · ${n.field}`, n.sample ? n.sample.title : null].filter(Boolean).join('\n');
    // 깊이에 따라 라벨과 테두리도 함께 줄어든다
    const fs = (12.5 * p.s).toFixed(2);
    return `<g class="nd" data-i="${i}" data-key="${esc(n.key)}"
      data-x="${P[i].x.toFixed(2)}" data-y="${P[i].y.toFixed(2)}" data-z="${P[i].z.toFixed(2)}"
      data-r="${rOf(n).toFixed(2)}"
      data-fill="${FIELD_COLOR[n.field] || FIELD_COLOR['기타']}" data-ring="${riskColor(n.risk)}"
      data-cnt="${n.n}" data-risk="${n.risk}" data-field="${esc(n.field)}"
      transform="translate(${p.x.toFixed(1)} ${p.y.toFixed(1)})">
      <circle class="halo" r="${(r + 5).toFixed(1)}" fill="${riskColor(n.risk)}" fill-opacity="${n.risk >= 20 ? 0.22 : 0.1}"/>
      <circle class="shadow" r="${r.toFixed(1)}" cy="${(r * 0.14).toFixed(1)}" fill="#0b1220" fill-opacity=".17"/>
      <circle class="ball" r="${r.toFixed(1)}" fill="url(#${gradOf(n)})"
        stroke="${riskColor(n.risk)}" stroke-width="${((n.risk >= 20 ? 2.6 : 1.4) * p.s).toFixed(2)}"/>
      <text class="nl" y="${(r + 13 * p.s).toFixed(1)}" text-anchor="middle" font-size="${fs}">${esc(n.key)}</text>
      <title>${esc(tip)}</title>
    </g>`;
  }).join('');

  // 화면에서는 캔버스가 그리고(발광·안개·자동 회전), 인쇄와 자바스크립트 미동작 시에는 이 SVG 가 그대로 쓰인다.
  return `<canvas class="net-gl" data-gl aria-hidden="true"></canvas>
<svg class="net" id="net-${id}" viewBox="${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}" data-w="${W}" data-h="${H}"
    data-vx="${box.x.toFixed(1)}" data-vy="${box.y.toFixed(1)}" data-vw="${box.w.toFixed(1)}" data-vh="${box.h.toFixed(1)}"
    role="img" aria-label="${esc(opt.label || '주간 키워드 공기 네트워크')}">
    ${defs}<g class="edges">${edges}</g><g class="nodes">${circles}</g></svg>`;
}
