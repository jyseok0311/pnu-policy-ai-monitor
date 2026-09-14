// 공기어(共起) 네트워크 — 분야별 깊이판 배치.
//
// 분야마다 깊이를 하나씩 준다. 판이 겹쳐 보이는 것만으로 입체가 읽히고,
// '어느 분야가 어느 분야와 엮였나'가 판을 가로지르는 선으로 드러난다.
//
// 왜 이 배치인가 — 앞선 구름형 배치는 3D 로 보이지 않았다(실측).
//   가로:세로:깊이 = 584:431:203 으로 깊이가 가로의 35% 뿐이었고,
//   카메라가 멀어 앞뒤 크기 차이가 18% 에 그쳤다. 라벨 겹침을 피하려 깊이를 눌렀던 탓이다.
//   깊이판은 판 자체가 기준면이 되어, 깊이를 적게 줘도 입체가 또렷하고 라벨도 안 겹친다.
//
// 화면은 캔버스(src/browser/net3d.js)가 그리고, 인쇄와 자바스크립트 미동작 시에는
// 여기서 만든 SVG 가 그대로 쓰인다. 좌표는 빌드 때 한 번 계산해 굳힌다 —
// 열 때마다 달라지면 화면과 PDF 가 어긋난다.

export const FIELD_COLOR = {
  '거버넌스': '#3b6fb8',
  '재정': '#8a5fc0',
  '입시·학령인구': '#c07b2a',
  'AI·디지털': '#1f8f7a',
  '기타': '#7a8595'
};
export const riskColor = (r) => (r >= 40 ? '#b3261e' : r >= 20 ? '#d9822b' : r >= 8 ? '#c9a227' : '#2f8f5b');

// 판을 비스듬히 본다. 정면에서 보면 판이 선으로 겹쳐 아무것도 안 보인다.
// net3d.js 가 같은 값을 써야 첫 화면과 회전 후가 이어진다.
export const CAM = { f: 900, z0: 1150, yaw: 0.46, pitch: 0.30 };
// 화면에서는 끌어서 360° 돌릴 수 있다. 마우스를 가만히 올렸을 때의 시차는 좁게 둔다.
// 위아래는 묶는다 — 판을 위에서 내려다보면 다섯 겹이 포개져 아무것도 안 보인다.
export const MAXYAW = 0.16, MAXPITCH = 0.10;
export const PITCH_MIN = -0.22, PITCH_MAX = 0.58;   // 위아래는 좁게 — 내려다보면 다섯 겹이 포개진다
export const PLANE = { hw: 300, hh: 200, gap: 210 };

// 판 순서. AI·디지털을 맨 뒤에 두면 거버넌스·재정과의 연결선이 앞으로 흐른다.
const FIELD_ORDER = ['AI·디지털', '거버넌스', '재정', '입시·학령인구', '기타'];

/**
 * 분야별 깊이판 배치.
 * 판 안에서만 2D 로 편다 — 판을 가로지르는 선까지 당기면 판이 흐트러진다.
 */
export function layoutLayers(nodes, links, maxE, steps = 700) {
  const used = FIELD_ORDER.filter((f) => nodes.some((n) => n.field === f));
  const z0 = -((used.length - 1) / 2) * PLANE.gap;
  const planeZ = {};
  used.forEach((f, i) => { planeZ[f] = z0 + i * PLANE.gap; });

  const P = nodes.map((n, i) => ({
    x: Math.cos(i * 2.399) * 150,
    y: Math.sin(i * 2.399) * 110,
    z: planeZ[n.field] !== undefined ? planeZ[n.field] : 0
  }));

  for (let s = 0; s < steps; s++) {
    const temp = 26 * Math.pow(1 - s / steps, 1.4);
    const D = P.map(() => ({ x: 0, y: 0 }));
    for (let i = 0; i < nodes.length; i++) {
      for (let j = i + 1; j < nodes.length; j++) {
        const same = P[i].z === P[j].z;
        let dx = P[i].x - P[j].x, dy = P[i].y - P[j].y;
        const d = Math.hypot(dx, dy) || 1;
        // 다른 판이라도 화면에서 겹치면 읽기 나쁘다. 약하게 밀어 둔다.
        const f = (same ? 5200 : 2100) / (d * d);
        D[i].x += (dx / d) * f; D[i].y += (dy / d) * f;
        D[j].x -= (dx / d) * f; D[j].y -= (dy / d) * f;
      }
    }
    for (const l of links) {
      if (P[l.s].z !== P[l.t].z) continue;
      const dx = P[l.s].x - P[l.t].x, dy = P[l.s].y - P[l.t].y;
      const d = Math.max(Math.hypot(dx, dy), 1);
      const f = d * 0.014 * (0.5 + l.n / maxE);
      D[l.s].x -= (dx / d) * f; D[l.s].y -= (dy / d) * f;
      D[l.t].x += (dx / d) * f; D[l.t].y += (dy / d) * f;
    }
    for (let i = 0; i < nodes.length; i++) {
      D[i].x -= P[i].x * 0.05; D[i].y -= P[i].y * 0.05;
      const d = Math.max(Math.hypot(D[i].x, D[i].y), 0.01);
      const m = Math.min(d, temp) / d;
      P[i].x += D[i].x * m; P[i].y += D[i].y * m;
    }
  }

  // 판마다 가운데로 모으고, 판 밖으로 나간 노드는 안으로 넣는다
  used.forEach((f) => {
    const idx = nodes.map((n, i) => (n.field === f ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) return;
    const cx = idx.reduce((a, i) => a + P[i].x, 0) / idx.length;
    const cy = idx.reduce((a, i) => a + P[i].y, 0) / idx.length;
    idx.forEach((i) => {
      P[i].x = Math.max(-PLANE.hw + 26, Math.min(PLANE.hw - 26, P[i].x - cx));
      P[i].y = Math.max(-PLANE.hh + 22, Math.min(PLANE.hh - 30, P[i].y - cy));
    });
  });
  return { P, planeZ, used };
}

/** 고정 각도 원근 투영 — net3d.js 의 같은 이름 함수와 식이 같아야 한다. */
export function project(p, W, H, yaw = CAM.yaw, pitch = CAM.pitch) {
  const cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
  const x1 = p.x * cy + p.z * sy;
  const z1 = -p.x * sy + p.z * cy;
  const y2 = p.y * cp - z1 * sp;
  const z2 = p.y * sp + z1 * cp;
  const s = CAM.f / Math.max(CAM.z0 - z2, 80);
  return { x: W / 2 + x1 * s, y: H / 2 + y2 * s, s, z: z2 };
}

const esc0 = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * 네트워크 SVG 한 장. 인쇄와 폴백용.
 * @param net  { nodes:[{key,n,risk,field,sample}], links:[{s,t,n}] }
 * @param opt  { esc, id, W, H, max, label }
 */
export function networkSvg(net, opt = {}) {
  const esc = opt.esc || esc0;
  const W = opt.W || 1000, H = opt.H || 640;
  const MAX = opt.max || 22;
  const id = esc(opt.id || 'x');

  const nodes = net.nodes.slice(0, MAX);
  if (!nodes.length) return '';
  const pos = new Map(nodes.map((n, i) => [n.key, i]));
  const links = net.links
    .map((l) => ({ s: pos.get(net.nodes[l.s] && net.nodes[l.s].key), t: pos.get(net.nodes[l.t] && net.nodes[l.t].key), n: l.n }))
    .filter((l) => l.s !== undefined && l.t !== undefined);

  const maxN = Math.max(...nodes.map((n) => n.n));
  const maxE = Math.max(...links.map((l) => l.n), 1);
  const rOf = (n) => 13 + Math.sqrt(n.n / maxN) * 24;

  const { P, planeZ, used } = layoutLayers(nodes, links, maxE);

  // 겹침은 '투영된 화면'에서 일어난다. 판 안에서만 벌려 두면 다른 판 노드와 화면에서 겹친다
  // (주차당 10~28쌍이 겹쳤다). 화면 좌표로 재서 밀되, 각 노드는 자기 판 위에서만 움직인다.
  // 판 위 이동 → 화면 이동의 관계(야코비안)를 수치로 구해 역으로 푼다.
  (function separateOnPlanes() {
    const radii = nodes.map((n) => rOf(n));
    for (let pass = 0; pass < 160; pass++) {
      const q = P.map((p) => project(p, W, H));
      let worst = 0;
      const mv = P.map(() => ({ x: 0, y: 0 }));
      for (let i = 0; i < P.length; i++) {
        for (let j = i + 1; j < P.length; j++) {
          const min = radii[i] * q[i].s + radii[j] * q[j].s + 16;
          let dx = q[j].x - q[i].x, dy = q[j].y - q[i].y;
          let d = Math.hypot(dx, dy);
          if (d < 0.5) { dx = 1; dy = 0.4; d = 1.1; }
          if (d >= min) continue;
          worst = Math.max(worst, min - d);
          const push = ((min - d) / 2) * 0.55;
          mv[i].x -= (dx / d) * push; mv[i].y -= (dy / d) * push;
          mv[j].x += (dx / d) * push; mv[j].y += (dy / d) * push;
        }
      }
      if (worst < 0.5) break;
      for (let i = 0; i < P.length; i++) {
        if (!mv[i].x && !mv[i].y) continue;
        // 이 노드가 놓인 판에서 x·y 를 1 씩 움직였을 때 화면이 얼마나 움직이는지
        const o = q[i];
        const ex = project({ x: P[i].x + 1, y: P[i].y, z: P[i].z }, W, H);
        const ey = project({ x: P[i].x, y: P[i].y + 1, z: P[i].z }, W, H);
        const a11 = ex.x - o.x, a12 = ey.x - o.x;
        const a21 = ex.y - o.y, a22 = ey.y - o.y;
        const det = a11 * a22 - a12 * a21;
        if (Math.abs(det) < 1e-6) continue;
        P[i].x += (mv[i].x * a22 - mv[i].y * a12) / det;
        P[i].y += (-mv[i].x * a21 + mv[i].y * a11) / det;
        P[i].x = Math.max(-PLANE.hw + 24, Math.min(PLANE.hw - 24, P[i].x));
        P[i].y = Math.max(-PLANE.hh + 20, Math.min(PLANE.hh - 28, P[i].y));
      }
    }
  })();

  const pr = (i) => project(P[i], W, H);

  // 보기 범위 — 판 네 귀퉁이와 노드·라벨을 모두 담는다
  const box = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    used.forEach((f) => {
      [[-PLANE.hw, -PLANE.hh], [PLANE.hw, -PLANE.hh], [PLANE.hw, PLANE.hh], [-PLANE.hw, PLANE.hh]].forEach((c) => {
        const q = project({ x: c[0], y: c[1], z: planeZ[f] }, W, H);
        x0 = Math.min(x0, q.x); x1 = Math.max(x1, q.x);
        y0 = Math.min(y0, q.y - 16); y1 = Math.max(y1, q.y);
      });
    });
    nodes.forEach((n, i) => {
      const q = pr(i), r = rOf(n) * q.s;
      x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r);
      y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r + 18 * q.s);
    });
    const pad = 14;
    return { x: x0 - pad, y: y0 - pad, w: x1 - x0 + pad * 2, h: y1 - y0 + pad * 2 };
  })();

  // 분야마다 구(球)처럼 보이는 그라디언트
  const fields = [...new Set(nodes.map((n) => n.field))];
  const defs = `<defs>${fields.map((f, i) => {
    const c = FIELD_COLOR[f] || FIELD_COLOR['기타'];
    return `<radialGradient id="g${id}-${i}" cx="34%" cy="30%" r="72%">
      <stop offset="0%" stop-color="#fff" stop-opacity=".6"/>
      <stop offset="42%" stop-color="${c}" stop-opacity=".97"/>
      <stop offset="100%" stop-color="${c}" stop-opacity=".84"/>
    </radialGradient>`;
  }).join('')}</defs>`;
  const gradOf = (n) => `g${id}-${fields.indexOf(n.field)}`;

  // ── 판: 뒤에서 앞으로
  const planes = used.map((f) => ({ f, z: planeZ[f] })).sort((a, b) => a.z - b.z).map((pl) => {
    const c = FIELD_COLOR[pl.f] || FIELD_COLOR['기타'];
    const pts = [[-PLANE.hw, -PLANE.hh], [PLANE.hw, -PLANE.hh], [PLANE.hw, PLANE.hh], [-PLANE.hw, PLANE.hh]]
      .map((p) => project({ x: p[0], y: p[1], z: pl.z }, W, H));
    const lab = pts[0];
    return `<g class="pl" data-field="${esc(pl.f)}">
      <polygon points="${pts.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}"
        fill="${c}" fill-opacity=".055" stroke="${c}" stroke-opacity=".3" stroke-width="1.1"/>
      <text x="${(lab.x + 7).toFixed(1)}" y="${(lab.y - 5).toFixed(1)}" class="plab" fill="${c}">${esc(pl.f)}</text>
    </g>`;
  }).join('');

  // ── 선: 판을 가로지르는 것만 진하게. 그게 이 그림의 핵심 정보다.
  const edges = links.map((l) => {
    const a = pr(l.s), b = pr(l.t);
    const cross = P[l.s].z !== P[l.t].z;
    const col = cross ? (FIELD_COLOR[nodes[l.s].field] || '#7a8595') : '#96a2b4';
    return `<line class="ed${cross ? ' x' : ''}" data-a="${l.s}" data-b="${l.t}" data-n="${l.n}"
      x1="${a.x.toFixed(1)}" y1="${a.y.toFixed(1)}" x2="${b.x.toFixed(1)}" y2="${b.y.toFixed(1)}"
      stroke="${col}" stroke-opacity="${cross ? (0.28 + (l.n / maxE) * 0.3).toFixed(2) : 0.16}"
      stroke-width="${(cross ? 0.9 + (l.n / maxE) * 2.2 : 0.7).toFixed(2)}"
      ><title>${esc(nodes[l.s].key)} × ${esc(nodes[l.t].key)} — ${l.n}</title></line>`;
  }).join('');

  // ── 노드: 뒤에서 앞으로. 판까지 기둥을 내려 어느 판에 속하는지 보인다.
  const order = nodes.map((_, i) => i).sort((a, b) => P[a].z - P[b].z);
  const circles = order.map((i) => {
    const n = nodes[i], q = pr(i), r = rOf(n) * q.s;
    const foot = project({ x: P[i].x, y: PLANE.hh, z: P[i].z }, W, H);
    const tip = [`${n.key} — ${n.n}건 · 위험신호 ${n.risk}% · ${n.field}`, n.sample ? n.sample.title : null].filter(Boolean).join('\n');
    return `<g class="nd" data-i="${i}" data-key="${esc(n.key)}"
      data-x="${P[i].x.toFixed(2)}" data-y="${P[i].y.toFixed(2)}" data-z="${P[i].z.toFixed(2)}"
      data-r="${rOf(n).toFixed(2)}"
      data-fill="${FIELD_COLOR[n.field] || FIELD_COLOR['기타']}" data-ring="${riskColor(n.risk)}"
      data-cnt="${n.n}" data-risk="${n.risk}" data-field="${esc(n.field)}">
      <line class="stem" x1="${q.x.toFixed(1)}" y1="${q.y.toFixed(1)}" x2="${q.x.toFixed(1)}" y2="${foot.y.toFixed(1)}"
        stroke="${FIELD_COLOR[n.field] || '#7a8595'}" stroke-opacity=".22" stroke-width="1" stroke-dasharray="3 3"/>
      <circle class="ball" cx="${q.x.toFixed(1)}" cy="${q.y.toFixed(1)}" r="${r.toFixed(1)}" fill="url(#${gradOf(n)})"
        stroke="${riskColor(n.risk)}" stroke-width="${((n.risk >= 20 ? 2.3 : 1.2) * q.s).toFixed(2)}"/>
      <text class="nl" x="${q.x.toFixed(1)}" y="${(q.y + r + 12 * q.s).toFixed(1)}" text-anchor="middle"
        font-size="${(12 * q.s).toFixed(2)}">${esc(n.key)}</text>
      <title>${esc(tip)}</title>
    </g>`;
  }).join('');

  const planeData = used.map((f) => ({ f, z: planeZ[f], c: FIELD_COLOR[f] || FIELD_COLOR['기타'] }));

  // 화면용 회전 범위 — 360° 어느 각도에서도 잘리지 않는 틀.
  // 인쇄용 viewBox(box)는 정면에 딱 맞춘 것이라 돌리면 넘친다. 둘을 따로 둔다.
  const spin = (() => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const eat = (q, pad) => {
      x0 = Math.min(x0, q.x - pad); x1 = Math.max(x1, q.x + pad);
      y0 = Math.min(y0, q.y - pad); y1 = Math.max(y1, q.y + pad);
    };
    for (let a = 0; a < 24; a++) {
      const yaw = (a / 24) * Math.PI * 2;
      for (let b = 0; b <= 4; b++) {
        const pitch = PITCH_MIN + (b / 4) * (PITCH_MAX - PITCH_MIN);
        // 판 외곽선은 기준에서 뺀다. 회전하면 판 모서리가 가장 멀리 나가는데,
        // 그것까지 담으려면 틀이 1157×1054 로 커져 쉬고 있을 때 화면이 헐거워진다.
        // 모서리가 살짝 잘려도 옅은 선이라 읽는 데 지장이 없다. 노드와 글자만 지킨다.
        nodes.forEach((n, i) => {
          const q = project(P[i], W, H, yaw, pitch);
          eat(q, rOf(n) * q.s + 15 * q.s);
        });
      }
    }
    // 정면 기준으로 가운데를 맞춘다. 모든 각도의 합집합을 그대로 쓰면 쉬고 있을 때
    // 아래쪽이 크게 빈다(회전해야 채워지는 자리라서). 중심은 정면에, 크기는 회전 여유만큼.
    const cx = (box.x + box.w / 2), cy = (box.y + box.h / 2);
    // 정면 틀(판 포함)보다 작아지면 안 된다. 노드만 기준으로 잡으면 판이 좁은 주차에서
    // 쉬고 있을 때부터 판 모서리가 잘린다(실제로 -23% 까지 줄었다).
    const hx = Math.max(cx - x0, x1 - cx, box.w / 2);
    const hy = Math.max(cy - y0, y1 - cy, box.h / 2);
    return { x: cx - hx, y: cy - hy, w: hx * 2, h: hy * 2 };
  })();

  return `<canvas class="net-gl" data-gl aria-hidden="true"></canvas>
<svg class="net" id="net-${id}" viewBox="${box.x.toFixed(1)} ${box.y.toFixed(1)} ${box.w.toFixed(1)} ${box.h.toFixed(1)}"
    data-w="${W}" data-h="${H}" data-vx="${box.x.toFixed(1)}" data-vy="${box.y.toFixed(1)}"
    data-vw="${box.w.toFixed(1)}" data-vh="${box.h.toFixed(1)}"
    data-planes="${esc(JSON.stringify(planeData))}" data-hw="${PLANE.hw}" data-hh="${PLANE.hh}"
    data-rx="${spin.x.toFixed(1)}" data-ry="${spin.y.toFixed(1)}" data-rw="${spin.w.toFixed(1)}" data-rh="${spin.h.toFixed(1)}"
    role="img" aria-label="${esc(opt.label || '주간 키워드 네트워크 — 분야별 깊이판')}">
    ${defs}<g class="planes">${planes}</g><g class="edges">${edges}</g><g class="nodes">${circles}</g></svg>`;
}
