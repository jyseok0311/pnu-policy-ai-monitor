/* 3D 시안 3종 렌더러 — dist/net-lab.html 전용.
 * 셋 다 같은 데이터(w37)를 쓰고 좌표만 다르다. 공통 뼈대(투영·루프·입력)를 나눠 쓰고,
 * 그리는 방식만 시안마다 다르게 둔다. */
(function () {
  'use strict';
  var D = window.__LAB__;
  if (!D) return;

  var hexc = function (c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '')); if (!m) return [122, 133, 149];
    var v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  };
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0]; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  var NODES = D.nodes.map(function (n) { return { k: n.k, n: n.n, r: n.r, f: n.f, rad: n.rad, s: n.s, c: hexc(n.c), g: hexc(n.g) }; });
  var LINKS = D.links.map(function (l) { return { a: l[0], b: l[1], n: l[2] }; });
  var MAXE = D.maxE;
  var FOG = [237, 242, 249];
  var INK = [30, 38, 52];

  // 말풍선 하나를 셋이 같이 쓴다
  var tip = document.createElement('div');
  tip.className = 'tipbox'; tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(n, ev) {
    if (!n || !ev) { tip.hidden = true; return; }
    tip.innerHTML = '<b>' + n.k.replace(/[<>&]/g, '') + '</b><span>' + n.n + '건 · 위험신호 ' + n.r + '% · ' + n.f + '</span>' +
      (n.s ? '<span style="margin-top:5px;color:#4b5563">' + n.s.slice(0, 60).replace(/[<>&]/g, '') + '</span>' : '');
    tip.hidden = false;
    var x = clamp(ev.clientX + 14, 8, window.innerWidth - tip.offsetWidth - 8);
    var y = ev.clientY - tip.offsetHeight - 14;
    if (y < 8) y = ev.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  /* ── 공통 무대: 캔버스 크기, 애니메이션 루프, 마우스 회전, 피킹 ── */
  function stage(cv, opt) {
    var ctx = cv.getContext('2d');
    var st = {
      ctx: ctx, cv: cv, W: opt.W, H: opt.H, cam: opt.cam,
      yaw: opt.yaw0 || 0, pitch: opt.pitch0 || 0, tYaw: opt.yaw0 || 0, tPitch: opt.pitch0 || 0,
      spin: 0, hot: -1, hover: false, drag: null, pts: [], scale: 1, cw: 0, ch: 0, dpr: 1
    };
    var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var raf = null, last = 0;

    function resize() {
      var r = cv.parentNode.getBoundingClientRect();
      if (!r.width) return false;
      st.dpr = Math.min(window.devicePixelRatio || 1, 2);
      st.cw = r.width; st.ch = r.width * (opt.H / opt.W);
      cv.width = Math.round(st.cw * st.dpr); cv.height = Math.round(st.ch * st.dpr);
      cv.style.width = st.cw + 'px'; cv.style.height = st.ch + 'px';
      st.scale = st.cw / opt.W;
      return true;
    }
    st.project = function (p) {
      var cy = Math.cos(st.yaw + st.spin), sy = Math.sin(st.yaw + st.spin);
      var cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
      var x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
      var y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
      var s = st.cam.f / Math.max(st.cam.z0 - z2, 60);
      return { x: (opt.W / 2 + x1 * s) * st.scale, y: (opt.H / 2 + y2 * s) * st.scale, s: s * st.scale, z: z2 };
    };
    function frame(ts) {
      raf = null;
      var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0; last = ts;
      if (!st.hover && !st.drag && !reduced && opt.spin) st.spin += opt.spin * dt;
      var e = reduced ? 1 : 0.15;
      st.yaw += (st.tYaw - st.yaw) * e;
      st.pitch += (st.tPitch - st.pitch) * e;
      st.pts = opt.coords.map(st.project);
      ctx.setTransform(st.dpr, 0, 0, st.dpr, 0, 0);
      ctx.clearRect(0, 0, st.cw, st.ch);
      opt.paint(st);
      if (Math.abs(st.tYaw - st.yaw) > 1e-4 || Math.abs(st.tPitch - st.pitch) > 1e-4 || (!st.hover && !st.drag && !reduced && opt.spin)) go();
    }
    function go() { if (raf == null) raf = requestAnimationFrame(frame); }
    st.go = go;

    function pick(ev) {
      var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var best = -1, bd = 1e9;
      for (var i = 0; i < st.pts.length; i++) {
        var q = st.pts[i]; if (!q) continue;
        var rr = NODES[i].rad * q.s;
        var d = Math.hypot(q.x - mx, q.y - my);
        if (d <= rr + 4 && d < bd) { bd = d; best = i; }
      }
      return best;
    }
    cv.addEventListener('pointermove', function (ev) {
      st.hover = true;
      if (st.drag) {
        st.tYaw = st.drag.y0 + (ev.clientX - st.drag.x) * 0.007;
        st.tPitch = clamp(st.drag.p0 + (ev.clientY - st.drag.y) * 0.005, -0.9, 0.9);
      } else if (opt.steer !== false) {
        var r = cv.getBoundingClientRect();
        st.tYaw = (opt.yaw0 || 0) + ((ev.clientX - r.left) / r.width - 0.5) * 2 * opt.maxYaw;
        st.tPitch = (opt.pitch0 || 0) + ((ev.clientY - r.top) / r.height - 0.5) * 2 * opt.maxPitch;
      }
      var h = pick(ev);
      if (h !== st.hot || h >= 0) { st.hot = h; showTip(h >= 0 ? NODES[h] : null, ev); }
      go();
    });
    cv.addEventListener('pointerdown', function (ev) {
      st.drag = { x: ev.clientX, y: ev.clientY, y0: st.tYaw, p0: st.tPitch };
      cv.setPointerCapture && cv.setPointerCapture(ev.pointerId);
    });
    cv.addEventListener('pointerup', function () { st.drag = null; });
    ['pointerleave', 'mouseleave'].forEach(function (e) {
      cv.addEventListener(e, function () {
        st.hover = false; st.drag = null; st.hot = -1;
        st.tYaw = opt.yaw0 || 0; st.tPitch = opt.pitch0 || 0;
        showTip(null); go();
      });
    });
    if (window.ResizeObserver) new ResizeObserver(function () { if (resize()) go(); }).observe(cv.parentNode);
    if (window.IntersectionObserver) new IntersectionObserver(function (es) { if (es[0].isIntersecting) { last = 0; go(); } }, { rootMargin: '150px' }).observe(cv);
    if (!resize()) return null;
    go();
    return st;
  }

  // 이웃 판정 — 셋이 공통으로 쓴다
  function neighbours(hot) {
    if (hot < 0) return null;
    var near = {}; near[hot] = 1;
    LINKS.forEach(function (l) { if (l.a === hot || l.b === hot) { near[l.a] = 1; near[l.b] = 1; } });
    return near;
  }

  function label(ctx, text, x, y, size, ink, alpha) {
    ctx.font = '700 ' + size.toFixed(1) + 'px Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    ctx.lineWidth = Math.max(size * 0.26, 2);
    ctx.strokeStyle = rgba([255, 255, 255], 0.94 * alpha);
    ctx.strokeText(text, x, y);
    ctx.fillStyle = rgba(ink, alpha);
    ctx.fillText(text, x, y);
  }

  /* ══════ 시안 1 — 깊은 원근 ══════ */
  function paintDeep(st) {
    var ctx = st.ctx, near = neighbours(st.hot);
    var zs = st.pts.map(function (q) { return q.z; });
    var zlo = Math.min.apply(null, zs), zhi = Math.max.apply(null, zs);
    var dep = function (z) { return (z - zlo) / Math.max(zhi - zlo, 1); };

    // 선 — 뒤에서 앞으로
    LINKS.map(function (l, i) { return i; })
      .sort(function (p, q) { return (st.pts[LINKS[p].a].z + st.pts[LINKS[p].b].z) - (st.pts[LINKS[q].a].z + st.pts[LINKS[q].b].z); })
      .forEach(function (i) {
        var l = LINKS[i], a = st.pts[l.a], b = st.pts[l.b];
        var on = !near || (near[l.a] && near[l.b]);
        var d = (dep(a.z) + dep(b.z)) / 2;
        var ca = NODES[l.a].c, cb = NODES[l.b].c;
        var g = ctx.createLinearGradient(a.x, a.y, b.x, b.y);
        var al = (on ? 0.2 + d * 0.55 : 0.05) * (0.5 + l.n / MAXE * 0.5);
        g.addColorStop(0, rgba(mix(ca, FOG, (1 - d) * 0.72), al));
        g.addColorStop(1, rgba(mix(cb, FOG, (1 - d) * 0.72), al));
        ctx.strokeStyle = g;
        ctx.lineWidth = (0.5 + l.n / MAXE * 2.2) * (0.3 + d * 1.1) * st.scale;
        ctx.lineCap = 'round';
        var dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy) || 1;
        var bow = Math.min(len * 0.1, 24 * st.scale);
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo((a.x + b.x) / 2 - dy / len * bow, (a.y + b.y) / 2 + dx / len * bow, b.x, b.y);
        ctx.stroke();
      });

    // 노드 — 뒤에서 앞으로. 먼 것은 흐리게(피사계 심도).
    NODES.map(function (_, i) { return i; }).sort(function (p, q) { return st.pts[p].z - st.pts[q].z; })
      .forEach(function (i) {
        var n = NODES[i], q = st.pts[i], d = dep(q.z);
        var on = !near || near[i], al = on ? 1 : 0.17;
        var r = n.rad * q.s;
        var blur = (1 - d) * 5.5;
        ctx.filter = blur > 0.4 ? 'blur(' + blur.toFixed(1) + 'px)' : 'none';

        // 접지 그림자 — 아래쪽에 눌린 타원
        ctx.fillStyle = rgba([26, 43, 76], 0.13 * d * al);
        ctx.beginPath(); ctx.ellipse(q.x, q.y + r * 0.92, r * 0.82, r * 0.28, 0, 0, 6.2832); ctx.fill();

        var col = mix(n.c, FOG, (1 - d) * 0.62);
        var sg = ctx.createRadialGradient(q.x - r * 0.36, q.y - r * 0.38, r * 0.08, q.x, q.y, r);
        sg.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.62), al));
        sg.addColorStop(0.45, rgba(col, al));
        sg.addColorStop(1, rgba(mix(col, [0, 0, 0], 0.2), al));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(mix(n.g, FOG, (1 - d) * 0.6), (n.r >= 20 ? 0.95 : 0.55) * al);
        ctx.lineWidth = (n.r >= 20 ? 2.4 : 1.3) * q.s;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.stroke();
        ctx.filter = 'none';

        // 라벨은 가까운 것만 — 멀어지면 사라진다
        var la = clamp((d - 0.28) / 0.32, 0, 1) * al;
        if (la > 0.04) label(ctx, n.k, q.x, q.y + r + 4 * st.scale, 12.5 * q.s, INK, la);
      });
  }

  /* ══════ 시안 2 — 회전 구체 ══════ */
  function paintSphere(st) {
    var ctx = st.ctx, near = neighbours(st.hot);
    var R = 290;
    var front = function (z) { return clamp((z + R) / (2 * R), 0, 1); };

    // 위도선 — 구를 읽게 해 주는 최소한의 격자
    ctx.lineWidth = 1 * st.scale;
    for (var li = -2; li <= 2; li++) {
      var lat = li * 0.42, cl = Math.cos(lat), sl = Math.sin(lat);
      ctx.beginPath();
      var started = false;
      for (var a = 0; a <= 64; a++) {
        var th = a / 64 * 6.2832;
        var q = st.project({ x: Math.cos(th) * cl * R, y: sl * R * 0.92, z: Math.sin(th) * cl * R });
        if (q.z < -R * 0.15) { started = false; continue; }   // 뒤쪽 반은 끊는다
        if (!started) { ctx.moveTo(q.x, q.y); started = true; } else ctx.lineTo(q.x, q.y);
      }
      ctx.strokeStyle = 'rgba(120,140,170,.14)';
      ctx.stroke();
    }

    // 선 — 표면을 따라 도는 호
    LINKS.map(function (l, i) { return i; })
      .sort(function (p, q) { return (st.pts[LINKS[p].a].z + st.pts[LINKS[p].b].z) - (st.pts[LINKS[q].a].z + st.pts[LINKS[q].b].z); })
      .forEach(function (i) {
        var l = LINKS[i], A = D.sphere[l.a], B = D.sphere[l.b];
        var on = !near || (near[l.a] && near[l.b]);
        ctx.beginPath();
        var seg = 14, prev = null, drew = false;
        for (var t = 0; t <= seg; t++) {
          var u = t / seg;
          // 두 점을 이은 뒤 다시 구 표면으로 밀어 올린다 = 큰 원에 가까운 호
          var p = { x: A.x + (B.x - A.x) * u, y: A.y + (B.y - A.y) * u, z: A.z + (B.z - A.z) * u };
          var m = Math.hypot(p.x, p.y / 0.92, p.z) || 1;
          p.x = p.x / m * R; p.y = p.y / m * R * 0.92; p.z = p.z / m * R;
          var q = st.project(p);
          if (!drew) { ctx.moveTo(q.x, q.y); drew = true; } else ctx.lineTo(q.x, q.y);
          prev = q;
        }
        var d = front((st.pts[l.a].z + st.pts[l.b].z) / 2);
        ctx.strokeStyle = rgba(mix(mix(NODES[l.a].c, NODES[l.b].c, 0.5), FOG, (1 - d) * 0.85),
          (on ? 0.18 + d * 0.5 : 0.04) * (0.5 + l.n / MAXE * 0.5));
        ctx.lineWidth = (0.5 + l.n / MAXE * 2) * (0.35 + d * 0.9) * st.scale;
        ctx.stroke();
      });

    NODES.map(function (_, i) { return i; }).sort(function (p, q) { return st.pts[p].z - st.pts[q].z; })
      .forEach(function (i) {
        var n = NODES[i], q = st.pts[i], d = front(q.z);
        var on = !near || near[i], al = (on ? 1 : 0.16) * (0.2 + d * 0.8);
        var r = n.rad * q.s * 0.85;
        var col = mix(n.c, FOG, (1 - d) * 0.8);
        var sg = ctx.createRadialGradient(q.x - r * 0.34, q.y - r * 0.36, r * 0.1, q.x, q.y, r);
        sg.addColorStop(0, rgba(mix(col, [255, 255, 255], 0.6), al));
        sg.addColorStop(1, rgba(col, al));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        if (d > 0.45) {
          ctx.strokeStyle = rgba(n.g, (n.r >= 20 ? 0.9 : 0.5) * al);
          ctx.lineWidth = (n.r >= 20 ? 2.2 : 1.2) * q.s;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.stroke();
        }
        // 앞면만 라벨 — 구가 돌면서 자연스럽게 교대한다
        var la = clamp((d - 0.52) / 0.2, 0, 1) * (on ? 1 : 0.15);
        if (la > 0.04) label(ctx, n.k, q.x, q.y + r + 4 * st.scale, 12.5 * q.s, INK, la);
      });
  }

  /* ══════ 시안 3 — 분야별 깊이판 ══════ */
  function paintLayers(st) {
    var ctx = st.ctx, near = neighbours(st.hot);
    var HW = 300, HH = 200;

    // 판 — 뒤에서 앞으로. 판이 겹쳐 보이는 것만으로 깊이가 읽힌다.
    var planes = D.used.map(function (f) { return { f: f, z: D.planeZ[f] }; }).sort(function (a, b) { return a.z - b.z; });
    planes.forEach(function (pl) {
      var c = hexc(D.fieldColor[pl.f] || '#7a8595');
      var corners = [[-HW, -HH], [HW, -HH], [HW, HH], [-HW, HH]].map(function (p) {
        return st.project({ x: p[0], y: p[1], z: pl.z });
      });
      ctx.beginPath();
      corners.forEach(function (q, i) { i ? ctx.lineTo(q.x, q.y) : ctx.moveTo(q.x, q.y); });
      ctx.closePath();
      ctx.fillStyle = rgba(c, 0.055);
      ctx.fill();
      ctx.strokeStyle = rgba(c, 0.3);
      ctx.lineWidth = 1.1 * st.scale;
      ctx.stroke();
      // 판 이름은 왼쪽 위 모서리에
      var lab = corners[0];
      ctx.font = '800 ' + (12 * st.scale).toFixed(1) + 'px Pretendard, system-ui, sans-serif';
      ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillStyle = rgba(c, 0.92);
      ctx.fillText(pl.f, lab.x + 6 * st.scale, lab.y - 4 * st.scale);
    });

    // 선 — 판을 가로지르는 것만 진하게. 그게 이 시안의 핵심 정보다.
    LINKS.forEach(function (l) {
      var a = st.pts[l.a], b = st.pts[l.b];
      var cross = D.layers[l.a].z !== D.layers[l.b].z;
      var on = !near || (near[l.a] && near[l.b]);
      ctx.strokeStyle = rgba(cross ? mix(NODES[l.a].c, NODES[l.b].c, 0.5) : [150, 162, 180],
        (on ? (cross ? 0.5 : 0.16) : 0.04) * (0.5 + l.n / MAXE * 0.5));
      ctx.lineWidth = (cross ? 0.8 + l.n / MAXE * 2.4 : 0.6) * st.scale;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    });

    // 노드 — 판 위에 놓이고 기둥이 판까지 내려간다
    NODES.map(function (_, i) { return i; }).sort(function (p, q) { return st.pts[p].z - st.pts[q].z; })
      .forEach(function (i) {
        var n = NODES[i], q = st.pts[i];
        var on = !near || near[i], al = on ? 1 : 0.18;
        var r = n.rad * q.s * 0.82;
        var base = st.project({ x: D.layers[i].x, y: HH, z: D.layers[i].z });
        // 기둥 — 노드가 어느 판에 속하는지 알려 주는 가장 강한 단서
        ctx.strokeStyle = rgba(n.c, 0.2 * al);
        ctx.lineWidth = 1 * st.scale;
        ctx.setLineDash([3 * st.scale, 3 * st.scale]);
        ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, base.y); ctx.stroke();
        ctx.setLineDash([]);

        var sg = ctx.createRadialGradient(q.x - r * 0.34, q.y - r * 0.36, r * 0.1, q.x, q.y, r);
        sg.addColorStop(0, rgba(mix(n.c, [255, 255, 255], 0.58), al));
        sg.addColorStop(0.45, rgba(n.c, al));
        sg.addColorStop(1, rgba(mix(n.c, [0, 0, 0], 0.2), al));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(n.g, (n.r >= 20 ? 0.95 : 0.5) * al);
        ctx.lineWidth = (n.r >= 20 ? 2.3 : 1.2) * q.s;
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.stroke();
        label(ctx, n.k, q.x, q.y + r + 3 * st.scale, 12 * q.s, INK, al);
      });
  }

  /* ── 시작 ── */
  var setups = {
    // 카메라를 바짝 붙인다(z0 640) — 앞뒤 크기 차이가 커진다
    deep: { coords: D.deep, cam: { f: 520, z0: 640 }, W: 1000, H: 620, maxYaw: 0.95, maxPitch: 0.5, spin: 0.16, paint: paintDeep },
    sphere: { coords: D.sphere, cam: { f: 900, z0: 1000 }, W: 1000, H: 660, maxYaw: 0.7, maxPitch: 0.4, spin: 0.3, paint: paintSphere },
    // 고정 각도로 비스듬히 본다 — 판이 겹쳐 보여야 깊이가 읽힌다
    layers: { coords: D.layers, cam: { f: 900, z0: 1150 }, W: 1000, H: 640, yaw0: 0.46, pitch0: 0.3, maxYaw: 0.16, maxPitch: 0.1, spin: 0, paint: paintLayers }
  };
  [].forEach.call(document.querySelectorAll('canvas[data-lab]'), function (cv) {
    var s = setups[cv.dataset.lab];
    if (s) stage(cv, s);
  });
})();
