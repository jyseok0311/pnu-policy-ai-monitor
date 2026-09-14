/* 주간 키워드 네트워크 — 화면용 캔버스 렌더러 (분야별 깊이판).
 *
 * 분야마다 깊이판을 하나씩 두고 비스듬히 본다. 판이 겹쳐 보이는 것만으로 입체가 읽히고,
 * 판을 가로지르는 선이 '어느 분야가 어느 분야와 엮였나'를 드러낸다.
 *
 * 왜 캔버스인가
 *   판의 반투명 겹침·기둥·부드러운 음영을 SVG 필터로 내면 인쇄 때 래스터로 구워져
 *   합본 PDF 가 3배로 불어난다(실제로 14MB 까지 갔다). 그래서 화면은 캔버스가 그리고,
 *   인쇄와 자바스크립트 미동작 시에는 같은 자리의 SVG 가 그대로 쓰인다.
 *   좌표·색·크기·판 정보는 전부 그 SVG 에서 읽는다 — 데이터를 두 벌로 두지 않는다.
 *
 * 카메라 각도는 src/network.mjs 의 CAM 과 같아야 첫 화면(SVG)과 이어진다.
 */
(function () {
  'use strict';

  var CAM = { f: 900, z0: 1150, yaw: 0.46, pitch: 0.30 };
  var MAXYAW = 0.16, MAXPITCH = 0.10;   // 가만히 올렸을 때의 시차는 좁게
  // 끌면 가로로 360° 돈다. 위아래는 묶는다 — 내려다보면 다섯 겹이 포개져 아무것도 안 보인다.
  var PITCH_MIN = -0.22, PITCH_MAX = 0.58;

  function hex(c) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(c || '').trim());
    if (!m) return [122, 133, 149];
    var v = parseInt(m[1], 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
  }
  var rgba = function (c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; };
  var mix = function (a, b, t) {
    return [a[0] + (b[0] - a[0]) * t | 0, a[1] + (b[1] - a[1]) * t | 0, a[2] + (b[2] - a[2]) * t | 0];
  };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };

  window.__pnuNet3D = function init(box, hooks) {
    var svg = box.querySelector('.net');
    var cv = box.querySelector('.net-gl');
    if (!svg || !cv || !cv.getContext) return null;
    var ctx = cv.getContext('2d');
    if (!ctx) return null;

    // 화면은 '돌려도 안 잘리는 틀'(data-r*)을 쓴다. 인쇄용 viewBox(data-v*)는 정면에 딱 맞춘 것이라
    // 그대로 쓰면 돌리는 순간 바깥 판이 잘린다.
    var VX = +svg.dataset.rx, VY = +svg.dataset.ry, VW = +svg.dataset.rw, VH = +svg.dataset.rh;
    if (!isFinite(VW) || !VW) { VX = +svg.dataset.vx; VY = +svg.dataset.vy; VW = +svg.dataset.vw; VH = +svg.dataset.vh; }
    var W = +svg.dataset.w || 1000, H = +svg.dataset.h || 640;
    var HW = +svg.dataset.hw || 300, HH = +svg.dataset.hh || 200;
    var PLANES = [];
    try { PLANES = JSON.parse(svg.dataset.planes || '[]'); } catch (e) { PLANES = []; }
    PLANES.forEach(function (p) { p.rgb = hex(p.c); });
    PLANES.sort(function (a, b) { return a.z - b.z; });

    var nds = [].slice.call(svg.querySelectorAll('.nd'));
    if (!nds.length) return null;
    // 좁은 화면에서는 원과 글자가 서로 덮는다. 노드 수부터 줄인다(언급 많은 순).
    // 판은 그대로 둔다 — 판이 빠지면 분야 축이 무너진다.
    var narrow = Math.min(window.innerWidth || 1200, screen.width || 1200) < 680;
    var CAP = narrow ? 15 : 22;
    var NODE = narrow ? 0.8 : 1;
    var LABEL = narrow ? 13.5 : 12;
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

    var BG0 = [252, 253, 255], BG1 = [237, 242, 249];
    var INK = [30, 38, 52];

    var yaw = CAM.yaw, pitch = CAM.pitch, tYaw = CAM.yaw, tPitch = CAM.pitch;
    // 끌어서 돌린 각도가 새 기준이 된다. 마우스를 떼도 정면으로 튕겨 돌아가지 않는다.
    var base = { yaw: CAM.yaw, pitch: CAM.pitch };
    var hot = -1, raf = null, dpr = 1, cw = 0, ch = 0, scale = 1, hover = false;
    var drag = null;
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
    function toPx(x, y) { return [(x - VX) * scale, (y - VY) * scale]; }

    function project(p) {
      var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
      var x1 = p.x * cy + p.z * sy, z1 = -p.x * sy + p.z * cy;
      var y2 = p.y * cp - z1 * sp, z2 = p.y * sp + z1 * cp;
      var s = CAM.f / Math.max(CAM.z0 - z2, 80);
      var P0 = toPx(W / 2 + x1 * s, H / 2 + y2 * s);
      return { x: P0[0], y: P0[1], s: s * scale, z: z2 };
    }

    var pts = [];
    function compute() { pts = N.map(project); }

    function label(text, x, y, size, alpha) {
      ctx.font = '700 ' + size.toFixed(1) + 'px Pretendard, "Apple SD Gothic Neo", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.lineWidth = Math.max(size * 0.26, 2);
      ctx.strokeStyle = rgba([255, 255, 255], 0.94 * alpha);
      ctx.strokeText(text, x, y);
      ctx.fillStyle = rgba(INK, alpha);
      ctx.fillText(text, x, y);
    }

    function draw() {
      raf = null;
      var e = reduced ? 1 : 0.15;
      yaw += (tYaw - yaw) * e;
      pitch += (tPitch - pitch) * e;
      compute();

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      var g = ctx.createLinearGradient(0, 0, 0, ch);
      g.addColorStop(0, 'rgb(' + BG0.join(',') + ')');
      g.addColorStop(1, 'rgb(' + BG1.join(',') + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, cw, ch);

      var dim = hot >= 0;
      var near = {};
      if (dim) { near[hot] = 1; L.forEach(function (l) { if (l.a === hot || l.b === hot) { near[l.a] = 1; near[l.b] = 1; } }); }
      var hotField = dim ? N[hot].field : null;

      // ── 판: 뒤에서 앞으로
      PLANES.forEach(function (pl) {
        var c = pl.rgb;
        var on = !dim || pl.f === hotField;
        var q = [[-HW, -HH], [HW, -HH], [HW, HH], [-HW, HH]].map(function (p) {
          return project({ x: p[0], y: p[1], z: pl.z });
        });
        ctx.beginPath();
        q.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
        ctx.closePath();
        ctx.fillStyle = rgba(c, on ? 0.06 : 0.025);
        ctx.fill();
        ctx.strokeStyle = rgba(c, on ? 0.32 : 0.12);
        ctx.lineWidth = 1.1 * scale;
        ctx.stroke();
        ctx.font = '800 ' + (11.5 * scale).toFixed(1) + 'px Pretendard, system-ui, sans-serif';
        ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
        ctx.fillStyle = rgba(c, on ? 0.95 : 0.35);
        ctx.fillText(pl.f, q[0].x + 6 * scale, q[0].y - 4 * scale);
      });

      // ── 선: 판을 가로지르는 것만 진하게
      L.forEach(function (l) {
        var a = pts[l.a], b = pts[l.b];
        var cross = N[l.a].z !== N[l.b].z;
        var on = !dim || (near[l.a] && near[l.b]);
        ctx.strokeStyle = rgba(cross ? mix(N[l.a].fill, N[l.b].fill, 0.5) : [150, 162, 180],
          (on ? (cross ? 0.52 : 0.17) : 0.04) * (0.5 + (l.n / maxE) * 0.5));
        ctx.lineWidth = (cross ? 0.8 + (l.n / maxE) * 2.4 : 0.6) * scale;
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      });

      // ── 노드: 뒤에서 앞으로. 기둥이 어느 판인지 알려 준다.
      N.map(function (_, i) { return i; }).sort(function (p, q) { return pts[p].z - pts[q].z; })
        .forEach(function (i) {
          var n = N[i], q = pts[i];
          var on = !dim || near[i], al = on ? 1 : 0.18;
          var r = n.r * q.s;
          var foot = project({ x: n.x, y: HH, z: n.z });

          ctx.strokeStyle = rgba(n.fill, 0.22 * al);
          ctx.lineWidth = 1 * scale;
          ctx.setLineDash([3 * scale, 3 * scale]);
          ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(q.x, foot.y); ctx.stroke();
          ctx.setLineDash([]);

          var sg = ctx.createRadialGradient(q.x - r * 0.34, q.y - r * 0.36, r * 0.1, q.x, q.y, r);
          sg.addColorStop(0, rgba(mix(n.fill, [255, 255, 255], 0.6), al));
          sg.addColorStop(0.45, rgba(n.fill, al));
          sg.addColorStop(1, rgba(mix(n.fill, [0, 0, 0], 0.2), al));
          ctx.fillStyle = sg;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.fill();
          ctx.strokeStyle = rgba(n.ring, (n.risk >= 20 ? 0.95 : 0.5) * al);
          ctx.lineWidth = (n.risk >= 20 ? 2.3 : 1.2) * q.s;
          ctx.beginPath(); ctx.arc(q.x, q.y, r, 0, 6.2832); ctx.stroke();

          label(n.key, q.x, q.y + r + 3 * scale, LABEL * q.s, al);
        });

      if (Math.abs(tYaw - yaw) > 1e-4 || Math.abs(tPitch - pitch) > 1e-4) schedule();
    }
    function schedule() { if (raf == null) raf = requestAnimationFrame(draw); }

    function pick(ev) {
      var r = cv.getBoundingClientRect();
      var mx = ev.clientX - r.left, my = ev.clientY - r.top;
      var best = -1, bd = 1e9;
      for (var i = 0; i < N.length; i++) {
        var q = pts[i]; if (!q) continue;
        var rr = N[i].r * q.s;
        var d = Math.hypot(q.x - mx, q.y - my);
        if (d <= rr + 4 && d < bd) { bd = d; best = i; }
      }
      return best;
    }

    box.addEventListener('pointermove', function (ev) {
      hover = true;
      if (drag) {
        // 끌어서 돌리기 — 가로는 제한 없이 360°, 세로는 판이 포개지지 않는 범위로 묶는다
        tYaw = drag.yaw + (ev.clientX - drag.x) * 0.008;
        tPitch = clamp(drag.pitch + (ev.clientY - drag.y) * 0.005, PITCH_MIN, PITCH_MAX);
        if (hooks && hooks.tip) hooks.tip(null);
        schedule();
        return;
      }
      var r = box.getBoundingClientRect();
      tYaw = base.yaw + ((ev.clientX - r.left) / r.width - 0.5) * 2 * MAXYAW;
      tPitch = clamp(base.pitch + ((ev.clientY - r.top) / r.height - 0.5) * 2 * MAXPITCH, PITCH_MIN, PITCH_MAX);
      var h = pick(ev);
      if (h !== hot) {
        hot = h;
        cv.style.cursor = h >= 0 ? 'pointer' : 'default';
        if (hooks && hooks.tip) hooks.tip(h >= 0 ? N[h] : null, ev);
      } else if (h >= 0 && hooks && hooks.tip) hooks.tip(N[h], ev);
      schedule();
    });
    ['pointerleave', 'mouseleave'].forEach(function (e) {
      box.addEventListener(e, function () {
        hover = false; hot = -1; drag = null;
        tYaw = base.yaw; tPitch = base.pitch;
        cv.style.cursor = 'grab';
        if (hooks && hooks.tip) hooks.tip(null);
        schedule();
      });
    });
    cv.addEventListener('pointerdown', function (ev) {
      drag = { x: ev.clientX, y: ev.clientY, yaw: tYaw, pitch: tPitch, moved: 0 };
      cv.style.cursor = 'grabbing';
      if (cv.setPointerCapture) { try { cv.setPointerCapture(ev.pointerId); } catch (e) {} }
    });
    cv.addEventListener('pointerup', function (ev) {
      var was = drag;
      drag = null;
      cv.style.cursor = 'grab';
      // 끌지 않고 누르기만 했으면 '클릭'으로 친다 — 기사 표시
      if (was && Math.hypot(ev.clientX - was.x, ev.clientY - was.y) < 4) {
        var h = pick(ev);
        if (h >= 0 && hooks && hooks.pick) hooks.pick(N[h].key);
      } else if (was) {
        // 끌어서 돌린 각도를 기준으로 삼는다. 마우스를 떼도 되돌아가지 않는다.
        base.yaw = tYaw; base.pitch = tPitch;
      }
    });
    // 두 번 누르면 처음 각도로
    cv.addEventListener('dblclick', function () {
      base.yaw = CAM.yaw; base.pitch = CAM.pitch;
      tYaw = CAM.yaw; tPitch = CAM.pitch;
      schedule();
    });

    var ro = window.ResizeObserver ? new ResizeObserver(function () { if (resize()) { compute(); schedule(); } }) : null;
    if (ro) ro.observe(box);
    else window.addEventListener('resize', function () { if (resize()) { compute(); schedule(); } });

    var visible = true;
    if (window.IntersectionObserver) {
      new IntersectionObserver(function (es) {
        visible = es[0].isIntersecting;
        if (visible) schedule();
      }, { rootMargin: '120px' }).observe(box);
    }
    var origSchedule = schedule;
    schedule = function () { if (visible) origSchedule(); };

    if (!resize()) return null;
    cv.style.cursor = 'grab';
    compute();
    box.classList.add('gl-on');
    schedule();
    return { redraw: function () { compute(); schedule(); } };
  };
})();
