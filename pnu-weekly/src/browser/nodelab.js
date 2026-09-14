/* 노드 표현 비교 렌더러 — dist/node-lab.html 전용.
 * 배치·선·라벨은 production 과 같고, 노드 그리는 부분만 style 로 갈아 끼운다. */
(function () {
  'use strict';
  var CAM = { f: 900, z0: 1150, yaw: 0.46, pitch: 0.30 };
  var MAXYAW = 0.16, MAXPITCH = 0.10, PITCH_MIN = -0.22, PITCH_MAX = 0.58;

  function hex(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return [122, 133, 149];
    var v = parseInt(m[1], 16); return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  var mix = function (a, b, t) { return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0]; };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  var tip = document.createElement('div');
  tip.className = 'tipbox'; tip.hidden = true;
  document.body.appendChild(tip);
  function showTip(n, ev) {
    if (!n || !ev) { tip.hidden = true; return; }
    tip.innerHTML = '<b>' + n.key.replace(/[<>&]/g, '') + '</b><span>' + n.cnt + '건 · 위험신호 ' + n.risk + '% · ' + n.field + '</span>';
    tip.hidden = false;
    var x = clamp(ev.clientX + 14, 8, window.innerWidth - tip.offsetWidth - 8);
    var y = ev.clientY - tip.offsetHeight - 14;
    if (y < 8) y = ev.clientY + 18;
    tip.style.left = x + 'px'; tip.style.top = y + 'px';
  }

  function build(stage) {
    var style = stage.dataset.style;
    var svg = stage.querySelector('.net');
    if (!svg) return;
    // 캔버스를 새로 만들어 얹는다(각 시안마다 하나씩)
    var cv = document.createElement('canvas');
    stage.insertBefore(cv, svg);
    svg.style.display = 'none';
    var ctx = cv.getContext('2d');
    if (!ctx) { svg.style.display = ''; return; }

    var VX = +svg.dataset.rx, VY = +svg.dataset.ry, VW = +svg.dataset.rw, VH = +svg.dataset.rh;
    var W = +svg.dataset.w || 1000, H = +svg.dataset.h || 640;
    var HW = +svg.dataset.hw || 300, HH = +svg.dataset.hh || 200;
    var PLANES = [];
    try { PLANES = JSON.parse(svg.dataset.planes || '[]'); } catch (e) {}
    PLANES.forEach(function (p) { p.rgb = hex(p.c); });
    PLANES.sort(function (a, b) { return a.z - b.z; });

    var N = [].slice.call(svg.querySelectorAll('.nd')).map(function (g) {
      return {
        i: g.dataset.i, key: g.dataset.key,
        x: +g.dataset.x, y: +g.dataset.y, z: +g.dataset.z, r: +g.dataset.r,
        fill: hex(g.dataset.fill), ring: hex(g.dataset.ring),
        cnt: +g.dataset.cnt, risk: +g.dataset.risk, field: g.dataset.field
      };
    });
    if (!N.length) return;
    var slot = {}; N.forEach(function (n, k) { slot[n.i] = k; });
    var L = [].slice.call(svg.querySelectorAll('.ed')).map(function (e) {
      return { a: slot[e.dataset.a], b: slot[e.dataset.b], n: +e.dataset.n || 1 };
    }).filter(function (l) { return l.a !== undefined && l.b !== undefined; });
    var maxE = L.reduce(function (m, l) { return Math.max(m, l.n); }, 1);
    var rMin = Math.min.apply(null, N.map(function (n) { return n.r; }));
    var rMax = Math.max.apply(null, N.map(function (n) { return n.r; }));
    var norm = function (n) { return rMax > rMin ? (n.r - rMin) / (rMax - rMin) : 0.5; };

    var INK = [30, 38, 52];
    var yaw = CAM.yaw, pitch = CAM.pitch, tYaw = yaw, tPitch = pitch;
    var base = { yaw: yaw, pitch: pitch };
    var hot = -1, raf = null, dpr = 1, cw = 0, ch = 0, scale = 1, drag = null, pts = [];

    function resize() {
      var r = stage.getBoundingClientRect();
      if (!r.width) return false;
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      cw = r.width; ch = r.width * (VH / VW);
      cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr);
      cv.style.width = cw + 'px'; cv.style.height = ch + 'px';
      scale = cw / VW;
      return true;
    }
    function project(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
      var y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
      var s = CAM.f / Math.max(CAM.z0 - z2, 80);
      return { x: (W / 2 + x1 * s - VX) * scale, y: (H / 2 + y2 * s - VY) * scale, s: s * scale, z: z2 };
    }
    function compute() { pts = N.map(project); }

    function label(text, x, y, size, alpha, align) {
      ctx.font = '700 ' + size.toFixed(1) + 'px Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif';
      ctx.textAlign = align || 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(size * 0.26, 2);
      ctx.strokeStyle = rgba([255, 255, 255], 0.94 * alpha);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = rgba(INK, alpha);
      ctx.fillText(text, x, y);
    }

    // ── 노드 그리기 — 여기만 시안마다 다르다
    function paintNode(n, q, al) {
      var R = n.r * q.s;
      if (style === 'ball') {
        var sg = ctx.createRadialGradient(q.x - R * .34, q.y - R * .36, R * .1, q.x, q.y, R);
        sg.addColorStop(0, rgba(mix(n.fill, [255, 255, 255], .6), al));
        sg.addColorStop(.45, rgba(n.fill, al));
        sg.addColorStop(1, rgba(mix(n.fill, [0, 0, 0], .2), al));
        ctx.fillStyle = sg;
        ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(n.ring, (n.risk >= 20 ? .95 : .5) * al);
        ctx.lineWidth = (n.risk >= 20 ? 2.3 : 1.2) * q.s;
        ctx.beginPath(); ctx.arc(q.x, q.y, R, 0, 6.2832); ctx.stroke();
        label(n.key, q.x, q.y + R + 3 * scale, 12 * q.s, al);

      } else if (style === 'dot') {
        // 점은 위치만. 크기 차이는 좁히고 색은 위험신호를 쓴다.
        var r = (5 + norm(n) * 6) * q.s;
        ctx.fillStyle = rgba(n.risk >= 8 ? n.ring : mix(n.fill, [0, 0, 0], .1), al);
        ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
        // 분야는 라벨 색으로 옮긴다
        ctx.font = '800 ' + (13 * q.s).toFixed(1) + 'px Pretendard, system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
        ctx.lineWidth = Math.max(13 * q.s * .28, 2);
        ctx.strokeStyle = rgba([255, 255, 255], .94 * al);
        ctx.strokeText(n.key, q.x + r + 5 * scale, q.y);
        ctx.fillStyle = rgba(mix(n.fill, [0, 0, 0], .25), al);
        ctx.fillText(n.key, q.x + r + 5 * scale, q.y);

      } else if (style === 'ring') {
        // 속을 비운다. 선이 원을 통과해 보인다.
        var rr = R * 0.82;
        ctx.fillStyle = rgba([255, 255, 255], .55 * al);
        ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 6.2832); ctx.fill();
        ctx.strokeStyle = rgba(n.fill, .95 * al);
        ctx.lineWidth = Math.max(2.2 * q.s, 1.4);
        ctx.beginPath(); ctx.arc(q.x, q.y, rr, 0, 6.2832); ctx.stroke();
        if (n.risk >= 20) {   // 위험신호가 높으면 이중 링
          ctx.strokeStyle = rgba(n.ring, .9 * al);
          ctx.lineWidth = Math.max(1.6 * q.s, 1);
          ctx.beginPath(); ctx.arc(q.x, q.y, rr - Math.max(3.4 * q.s, 2.6), 0, 6.2832); ctx.stroke();
        }
        label(n.key, q.x, q.y + rr + 3 * scale, 12 * q.s, al);

      } else {  // halo
        var hr = (12 + norm(n) * 28) * q.s;
        var hg = ctx.createRadialGradient(q.x, q.y, hr * .15, q.x, q.y, hr);
        hg.addColorStop(0, rgba(n.fill, .34 * al));
        hg.addColorStop(1, rgba(n.fill, 0));
        ctx.fillStyle = hg;
        ctx.beginPath(); ctx.arc(q.x, q.y, hr, 0, 6.2832); ctx.fill();
        var dr = 6 * q.s;
        ctx.fillStyle = rgba(n.risk >= 8 ? n.ring : mix(n.fill, [0, 0, 0], .2), al);
        ctx.beginPath(); ctx.arc(q.x, q.y, dr, 0, 6.2832); ctx.fill();
        label(n.key, q.x, q.y + dr + 4 * scale, 12 * q.s, al);
      }
    }

    function draw() {
      raf = null;
      yaw += (tYaw - yaw) * .15; pitch += (tPitch - pitch) * .15;
      compute();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, 'rgb(252,253,255)'); g.addColorStop(1, 'rgb(237,242,249)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, cw, ch);

      var dim = hot >= 0, near = {};
      if (dim) { near[hot] = 1; L.forEach(function (l) { if (l.a === hot || l.b === hot) { near[l.a] = 1; near[l.b] = 1; } }); }
      var hotField = dim ? N[hot].field : null;

      PLANES.forEach(function (pl) {
        var on = !dim || pl.f === hotField;
        var q = [[-HW, -HH], [HW, -HH], [HW, HH], [-HW, HH]].map(function (p) { return project({ x: p[0], y: p[1], z: pl.z }); });
        ctx.beginPath(); q.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); }); ctx.closePath();
        ctx.fillStyle = rgba(pl.rgb, on ? .06 : .025); ctx.fill();
        ctx.strokeStyle = rgba(pl.rgb, on ? .32 : .12); ctx.lineWidth = 1.1 * scale; ctx.stroke();
        ctx.font = '800 ' + (11.5 * scale).toFixed(1) + 'px Pretendard, system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(pl.rgb, on ? .95 : .35);
        ctx.fillText(pl.f, q[0].x + 6 * scale, q[0].y - 4 * scale);
      });

      L.forEach(function (l) {
        var a = pts[l.a], b = pts[l.b];
        var cross = N[l.a].z !== N[l.b].z;
        var on = !dim || (near[l.a] && near[l.b]);
        ctx.strokeStyle = rgba(cross ? mix(N[l.a].fill, N[l.b].fill, .5) : [150, 162, 180],
          (on ? (cross ? .52 : .17) : .04) * (.5 + (l.n / maxE) * .5));
        ctx.lineWidth = (cross ? .8 + (l.n / maxE) * 2.4 : .6) * scale;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });

      N.map(function (_, i) { return i; }).sort(function (p, q) { return pts[p].z - pts[q].z; })
        .forEach(function (i) {
          var n = N[i], q = pts[i], on = !dim || near[i];
          // 기둥 — 어느 판인지 알려 준다
          var foot = project({ x: n.x, y: HH, z: n.z });
          ctx.strokeStyle = rgba(n.fill, .22 * (on ? 1 : .18));
          ctx.lineWidth = 1 * scale;
          ctx.setLineDash([3 * scale, 3 * scale]);
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, foot.y); ctx.stroke();
          ctx.setLineDash([]);
          paintNode(n, q, on ? 1 : .18);
        });

      if (Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tPitch - pitch) > 1e-4) schedule();
    }
    function schedule() { if (raf == null) raf = requestAnimationFrame(draw); }

    function pick(ev) {
      var r = cv.getBoundingClientRect(), mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var best = -1, bd = 1e9;
      for (var i = 0; i < N.length; i++) {
        var q = pts[i]; if (!q) continue;
        var hit = (style === 'dot' ? 12 : style === 'halo' ? 14 : N[i].r) * q.s;
        var d = Math.hypot(q.x - mx, q.y - my);
        if (d <= hit + 4 && d < bd) { bd = d; best = i; }
      }
      return best;
    }
    cv.addEventListener('pointermove', function (ev) {
      if (drag) {
        tYaw = drag.yaw + (ev.clientX - drag.x) * .008;
        tPitch = clamp(drag.pitch + (ev.clientY - drag.y) * .005, PITCH_MIN, PITCH_MAX);
        showTip(null); schedule(); return;
      }
      var r = stage.getBoundingClientRect();
      tYaw = base.yaw + ((ev.clientX - r.left) / r.width - .5) * 2 * MAXYAW;
      tPitch = clamp(base.pitch + ((ev.clientY - r.top) / r.height - .5) * 2 * MAXPITCH, PITCH_MIN, PITCH_MAX);
      var h = pick(ev);
      if (h !== hot || h >= 0) { hot = h; showTip(h >= 0 ? N[h] : null, ev); }
      schedule();
    });
    cv.addEventListener('pointerdown', function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, yaw: tYaw, pitch: tPitch };
      if (cv.setPointerCapture) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} }
    });
    cv.addEventListener('pointerup', function () {
      if (drag) { base.yaw = tYaw; base.pitch = tPitch; }
      drag = null;
    });
    cv.addEventListener('dblclick', function () {
      base.yaw = CAM.yaw; base.pitch = CAM.pitch; tYaw = CAM.yaw; tPitch = CAM.pitch; schedule();
    });
    ['pointerleave', 'mouseleave'].forEach(function (e) {
      cv.addEventListener(e, function () {
        hot = -1; drag = null; tYaw = base.yaw; tPitch = base.pitch; showTip(null); schedule();
      });
    });
    if (window.ResizeObserver) new ResizeObserver(function () { if (resize()) { compute(); schedule(); } }).observe(stage);
    if (!resize()) { svg.style.display = ''; return; }
    compute(); schedule();
  }

  [].forEach.call(document.querySelectorAll('.stage[data-style]'), build);
})();
