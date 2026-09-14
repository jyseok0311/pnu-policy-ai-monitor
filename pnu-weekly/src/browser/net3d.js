/* 주간 키워드 네트워크 — 화면용 캔버스 렌더러.
 *
 * 왜 캔버스인가
 *   발광(glow)·깊이 안개·상시 회전을 SVG 로 하면 feGaussianBlur 가 인쇄 때 래스터로 구워져
 *   합본 PDF 가 3배로 불어난다(실제로 14MB 까지 갔다). 그래서 화면은 캔버스가 그리고,
 *   인쇄와 자바스크립트 미동작 시에는 같은 자리의 SVG 가 그대로 쓰인다.
 *   좌표·색·크기는 전부 그 SVG 노드에서 읽는다 — 데이터를 두 벌로 두지 않는다.
 *
 * 참고한 화면은 AX360(ax360.kr) 의 회전 구체다. 다만 그쪽 점은 장식이라 위치에 뜻이 없고,
 * 이 그림은 위치가 곧 군집(함께 등장한 키워드 묶음)이라 구(球)로 만들지 않았다.
 * 가져온 것은 배경·발광·안개·상시 회전이고, 배치는 그대로 둔다.
 *
 * WebGL 을 쓰지 않은 이유: 노드 22개·선 40개면 2D 캔버스로 충분하고,
 * 외부 라이브러리(CDN)를 끌어올 필요도 없다.
 */
(function () {
  'use strict';

  var CAM = { f: 1150, z0: 1250 };
  var MAXYAW = 0.42, MAXPITCH = 0.26;
  var SPIN = 0.055;                 // 가만히 둘 때 도는 속도(라디안/초)

  function hex(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return [122, 133, 149];
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  var mix = function (a, b, t) {
    return [Math.round(a[0] + (b[0] - a[0]) * t), Math.round(a[1] + (b[1] - a[1]) * t), Math.round(a[2] + (b[2] - a[2]) * t)];
  };

  window.__pnuNet3D = function init(box, hooks) {
    var svg = box.querySelector('.net');
    var cv = box.querySelector('.net-gl');
    if (!svg || !cv || !cv.getContext) return null;
    var ctx = cv.getContext('2d');
    if (!ctx) return null;

    // 좌표계는 SVG 의 viewBox 를 그대로 쓴다. 같은 그림이 나와야 인쇄본과 어긋나지 않는다.
    var VX = +svg.dataset.vx, VY = +svg.dataset.vy, VW = +svg.dataset.vw, VH = +svg.dataset.vh;
    var W = +svg.dataset.w || 1000, H = +svg.dataset.h || 580;

    var nds = [].slice.call(svg.querySelectorAll('.nd'));
    if (!nds.length) return null;
    // 좁은 화면에서는 원과 글자가 서로 덮는다. 노드 수부터 줄이고(언급 많은 순),
    // 남은 것도 작게 그린다. 잘라 낸 노드에 걸린 선은 아래에서 함께 빠진다.
    var narrow = Math.min(window.innerWidth || 1200, screen.width || 1200) < 680;
    var CAP = narrow ? 14 : 22;
    var NODE = narrow ? 0.72 : 1;        // 원 크기 배율
    var LABEL = narrow ? 15 : 12.5;      // 라벨 글자(px) — 작은 화면일수록 상대적으로 키운다
    if (nds.length > CAP) {
      nds.sort(function (a, b) { return (+b.dataset.cnt) - (+a.dataset.cnt); });
      nds = nds.slice(0, CAP);
    }
    var N = nds.map(function (g) {
      return {
        i: g.dataset.i, key: g.dataset.key,
        x: +g.dataset.x, y: +g.dataset.y, z: +g.dataset.z, r: (+g.dataset.r) * NODE,
        fill: hex(g.dataset.fill), ring: hex(g.dataset.ring),
        cnt: +g.dataset.cnt, risk: +g.dataset.risk, field: g.dataset.field,
        tip: (g.querySelector('title') || {}).textContent || ''
      };
    });
    var slot = {};
    N.forEach(function (n, k) { slot[n.i] = k; });

    var L = [].slice.call(svg.querySelectorAll('.ed')).map(function (e) {
      return { a: slot[e.dataset.a], b: slot[e.dataset.b], n: +e.dataset.n || 1 };
    }).filter(function (l) { return l.a !== undefined && l.b !== undefined; });
    var maxE = L.reduce(function (m, l) { return Math.max(m, l.n); }, 1);

    // 밝은 판. 뒤로 갈수록 배경색에 잠기게 해서 거리감을 준다(대기 원근).
    var BG0 = [252, 253, 255], BG1 = [234, 240, 248];
    var FOG = [236, 241, 248];

    var yaw = 0, pitch = 0, tYaw = 0, tPitch = 0, spin = 0;
    var hot = -1;                                  // 마우스가 올라간 노드
    var raf = null, last = 0, dpr = 1, cw = 0, ch = 0, scale = 1;
    var hover = false;
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function resize() {
      var r = box.getBoundingClientRect();
      if (!r.width) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = r.width; ch = r.width * (VH / VW);
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      scale = cw / VW;
      return true;
    }

    // 뷰박스 좌표 → 캔버스 픽셀
    function toPx(x, y) { return [(x - VX) * scale, (y - VY) * scale]; }

    function project(p, cy, sy, cp, sp) {
      var x1 = p.x * cy + p.z * sy;
      var z1 = -p.x * sy + p.z * cy;
      var y2 = p.y * cp - z1 * sp;
      var z2 = p.y * sp + z1 * cp;
      var s = CAM.f / (CAM.z0 - z2);
      return { x: W / 2 + x1 * s, y: H / 2 + y2 * s, s: s, z: z2 };
    }

    var pts = [];
    function compute() {
      var cy = Math.cos(yaw + spin), sy = Math.sin(yaw + spin);
      var cp = Math.cos(pitch), sp = Math.sin(pitch);
      pts = N.map(function (p) { return project(p, cy, sy, cp, sp); });
    }

    // 깊이 → 0(뒤) ~ 1(앞)
    var zMax = N.reduce(function (m, p) { return Math.max(m, Math.abs(p.z)); }, 1);
    function depth(z) { return Math.max(0, Math.min(1, (z + zMax) / (2 * zMax))); }

    // 화면에 남은 노드에 맞춰 보기 범위를 다시 잡는다.
    // SVG 의 viewBox 는 노드 22개 기준이라, 좁은 화면에서 14개로 줄이면 빈 자리가 크게 남는다.
    // 회전으로 깊이가 가로·세로로 돌아 나오는 만큼(zMax·sin) 미리 비워 둔다.
    (function fitView() {
      var cy = 1, sy = 0, cp = 1, sp = 0;
      var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      N.forEach(function (p) {
        var q = project(p, cy, sy, cp, sp);
        var r = p.r * q.s;
        x0 = Math.min(x0, q.x - r); x1 = Math.max(x1, q.x + r);
        y0 = Math.min(y0, q.y - r); y1 = Math.max(y1, q.y + r + LABEL * 1.5 * q.s);
      });
      var padX = 10 + zMax * Math.sin(MAXYAW);
      var padY = 10 + zMax * Math.sin(MAXPITCH);
      x0 -= padX; x1 += padX; y0 -= padY; y1 += padY;
      var bw = x1 - x0, bh = y1 - y0;
      // 좁은 화면은 세로로 긴 판이 낫다(가로 스크롤 없이 크게 보인다).
      var want = narrow ? 1.15 : Math.max(1.4, Math.min(bw / bh, 2.1));
      if (bw / bh < want) { var t = bh * want; x0 -= (t - bw) / 2; bw = t; }
      else { var u = bw / want; y0 -= (u - bh) / 2; bh = u; }
      VX = x0; VY = y0; VW = bw; VH = bh;
    })();

    function draw(ts) {
      raf = null;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
      last = ts;

      // 마우스가 없으면 천천히 계속 돈다. 올라가 있으면 그 자리를 따라간다.
      if (!hover && !reduced) spin += SPIN * dt;
      var ease = reduced ? 1 : 0.14;
      yaw += (tYaw - yaw) * ease;
      pitch += (tPitch - pitch) * ease;
      compute();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);

      // 배경 — 가운데가 살짝 밝은 어두운 판
      var g = ctx.createRadialGradient(cw * 0.42, ch * 0.34, 0, cw * 0.5, ch * 0.5, Math.max(cw, ch) * 0.78);
      g.addColorStop(0, 'rgb(' + BG0.join(',') + ')');
      g.addColorStop(1, 'rgb(' + BG1.join(',') + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      var dim = hot >= 0;
      var near = {};
      if (dim) { near[hot] = 1; L.forEach(function (l) { if (l.a === hot || l.b === hot) { near[l.a] = 1; near[l.b] = 1; } }); }

      // ── 선: 뒤에서 앞으로. 앞쪽일수록 굵고 밝다.
      var order = L.map(function (_, i) { return i; }).sort(function (p, q) {
        return (pts[L[p].a].z + pts[L[p].b].z) - (pts[L[q].a].z + pts[L[q].b].z);
      });
      ctx.lineCap = 'round';
      order.forEach(function (oi) {
        var l = L[oi], a = pts[l.a], b = pts[l.b];
        var on = !dim || (near[l.a] && near[l.b]);
        var d = (depth(a.z) + depth(b.z)) / 2;
        var A = toPx(a.x, a.y), B = toPx(b.x, b.y);
        var dx = B[0] - A[0], dy = B[1] - A[1], len = Math.hypot(dx, dy) || 1;
        var bow = Math.min(len * 0.12, 26 * scale);
        var mx = (A[0] + B[0]) / 2 - (dy / len) * bow, my = (A[1] + B[1]) / 2 + (dx / len) * bow;

        // 양 끝 노드 색을 이어 흐르게 한다 — 어느 묶음에 속한 선인지 색으로 읽힌다.
        var ca = N[l.a].fill, cb = N[l.b].fill;
        var grad = ctx.createLinearGradient(A[0], A[1], B[0], B[1]);
        // 밝은 바탕에서는 선을 '밝게' 섞으면 배경에 묻힌다. 뒤쪽일수록 배경색에 잠기게 한다.
        var al = (on ? 0.34 + d * 0.4 : 0.06) * (0.55 + (l.n / maxE) * 0.45);
        grad.addColorStop(0, rgba(mix(ca, FOG, (1 - d) * 0.55), al));
        grad.addColorStop(1, rgba(mix(cb, FOG, (1 - d) * 0.55), al));
        ctx.strokeStyle = grad;
        ctx.lineWidth = (0.55 + (l.n / maxE) * 2.0) * (0.55 + d * 0.45) * scale * (on ? 1 : 0.8);
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        ctx.quadraticCurveTo(mx, my, B[0], B[1]);
        ctx.stroke();
      });

      // ── 노드: 뒤에서 앞으로. 발광 → 구체 → 테두리 → 라벨.
      var nord = N.map(function (_, i) { return i; }).sort(function (p, q) { return pts[p].z - pts[q].z; });
      nord.forEach(function (i) {
        var n = N[i], q = pts[i];
        var on = !dim || near[i];
        var d = depth(q.z);
        var P0 = toPx(q.x, q.y);
        var r = n.r * q.s * scale;
        var col = mix(n.fill, FOG, (1 - d) * 0.4);
        var alpha = on ? 1 : 0.2;

        // 밝은 바탕에서는 '빛나는' 대신 옅은 색 무리로 띄운다. 번쩍이면 지저분해진다.
        var glowC = n.risk >= 20 ? n.ring : n.fill;
        var gR = r * 1.5;
        var gr = ctx.createRadialGradient(P0[0], P0[1], r * 0.9, P0[0], P0[1], gR);
        gr.addColorStop(0, rgba(glowC, (0.1 + d * 0.09) * alpha));
        gr.addColorStop(1, rgba(glowC, 0));
        ctx.fillStyle = gr;
        ctx.beginPath(); ctx.arc(P0[0], P0[1], gR, 0, 6.2832); ctx.fill();

        // 구체 — 왼쪽 위에서 빛이 온다
        var sg = ctx.createRadialGradient(P0[0] - r * 0.34, P0[1] - r * 0.36, r * 0.1, P0[0], P0[1], r);
        sg.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.6), alpha));
        sg.addColorStop(0.45, rgba(col, alpha));
        sg.addColorStop(1, rgba(mix(col, [0, 0, 0], 0.22), alpha));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(P0[0], P0[1], r, 0, 6.2832); ctx.fill();

        // 테두리 = 위험신호 비율
        ctx.strokeStyle = rgba(mix(n.ring, FOG, (1 - d) * 0.45), (n.risk >= 20 ? 0.95 : 0.6) * alpha);
        ctx.lineWidth = (n.risk >= 20 ? 2.4 : 1.3) * q.s * scale;
        ctx.beginPath(); ctx.arc(P0[0], P0[1], r, 0, 6.2832); ctx.stroke();

        // 라벨 — 어두운 글자에 밝은 테두리를 둘러 선 위에서도 읽히게 한다. 뒤쪽은 흐리게.
        var fs = LABEL * q.s * scale;
        ctx.font = '700 ' + fs.toFixed(1) + 'px Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif';
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        var ly = P0[1] + r + 4 * scale;
        ctx.lineWidth = Math.max(2.6 * scale, 2);
        ctx.strokeStyle = rgba([255, 255, 255], 0.92 * alpha);
        ctx.strokeText(n.key, P0[0], ly);
        ctx.fillStyle = rgba(mix([30, 38, 52], FOG, (1 - d) * 0.42), alpha);
        ctx.fillText(n.key, P0[0], ly);
      });

      var moving = Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tPitch - pitch) > 1e-4 || (!hover && !reduced);
      if (moving) schedule();
    }
    function schedule() { if (raf == null) raf = requestAnimationFrame(draw); }

    // ── 입력
    function pick(ev) {
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var best = -1, bestD = 1e9;
      for (var i = 0; i < N.length; i++) {
        var q = pts[i]; if (!q) continue;
        var P0 = toPx(q.x, q.y);
        var rr = N[i].r * q.s * scale;
        var d = Math.hypot(P0[0] - mx, P0[1] - my);
        if (d <= rr + 3 && d < bestD) { bestD = d; best = i; }
      }
      return best;
    }

    box.addEventListener('pointermove', function (ev) {
      hover = true;
      var r = box.getBoundingClientRect();
      tYaw = ((ev.clientX - r.left) / r.width - 0.5) * 2 * MAXYAW;
      tPitch = ((ev.clientY - r.top) / r.height - 0.5) * 2 * MAXPITCH;
      var h = pick(ev);
      if (h !== hot) {
        hot = h;
        cv.style.cursor = h >= 0 ? 'pointer' : 'crosshair';
        if (hooks && hooks.tip) hooks.tip(h >= 0 ? N[h] : null, ev);
      } else if (h >= 0 && hooks && hooks.tip) hooks.tip(N[h], ev);
      schedule();
    });
    ['pointerleave', 'mouseleave'].forEach(function (e) {
      box.addEventListener(e, function () {
        hover = false; tYaw = 0; tPitch = 0; hot = -1;
        if (hooks && hooks.tip) hooks.tip(null);
        schedule();
      });
    });
    cv.addEventListener('click', function (ev) {
      var h = pick(ev);
      if (h >= 0 && hooks && hooks.pick) hooks.pick(N[h].key);
    });

    // 크기가 바뀌면 다시 재야 한다. 화면 밖이면 그리지 않는다(스크롤이 무거워진다).
    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (resize()) { compute(); schedule(); } }) : null;
    if (ro) ro.observe(box);
    else window.addEventListener('resize', function () { if (resize()) { compute(); schedule(); } });

    var visible = true;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) { last = 0; schedule(); }
      }, { rootMargin: '120px' }).observe(box);
    }
    var origSchedule = schedule;
    schedule = function () { if (visible) origSchedule(); };

    if (!resize()) return null;
    compute();
    box.classList.add('gl-on');
    schedule();
    return { redraw: function () { compute(); schedule(); } };
  };
})();
