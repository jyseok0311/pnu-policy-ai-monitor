/* 클라이언트 동작: Leaflet 리스크 지도, 각주 이동, 사이드바 스크롤스파이, 인쇄/PDF, 전체 펼치기 */
(function () {
  'use strict';

  var D = window.__MAPDATA__ || { universities: [], weeks: {} };
  // 크기 = 주목도(언급량), 색 = 위험신호 비율. 두 축을 분리한다.
  var RADIUS = { 4: 15, 3: 10, 2: 7, 1: 6 };
  var ATTN = { 4: '최다', 3: '많음', 2: '보통', 1: '적음' };
  var RISKC = { 3: '#b3261e', 2: '#d9822b', 1: '#c9a227', 0: '#2f8f5b' };
  var RISKW = { 3: '위험신호 높음', 2: '위험신호 있음', 1: '위험신호 일부', 0: '위험신호 없음' };
  var COLOR = { 4: '#b3261e', 3: '#d9822b', 2: '#c9a227', 1: '#2f8f5b' };  // 경로선 등 기존 용도
  var DASH = { solid: null, dash: '8,6', dot: '2,6' };
  var MAPS = [];   // 인쇄 시 현재 화면(중심·확대)을 유지하려면 지도 인스턴스를 들고 있어야 한다

  function toast(msg) {
    var el = document.getElementById('toast');
    if (!el) return;
    el.textContent = msg;
    el.classList.add('on');
    clearTimeout(el._t);
    el._t = setTimeout(function () { el.classList.remove('on'); }, 3200);
  }

  /* ---------- 1. 리스크 지도 ---------- */
  function buildMap(el) {
    var wid = el.dataset.week, cfg = D.weeks[wid];
    if (!cfg || typeof L === 'undefined') {
      el.innerHTML = '<div class="map-fallback">' + (window.__SANJINI_TENSE__ || '') +
        '<div><b>지도를 불러올 수 없습니다</b>' +
        '<span>오프라인이거나 타일 서버에 접근할 수 없습니다. 학내망 운영 시에는 ' +
        '타일 서버를 내부에 두거나 GeoJSON 경계로 대체합니다.</span></div></div>';
      return;
    }
    var map = L.map(el, { scrollWheelZoom: false, zoomSnap: 0.25, attributionControl: true })
      .setView([36.3, 127.9], 6.4);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, minZoom: 2,   // 세계 랭킹 레이어를 켜면 전 세계를 봐야 한다
      attribution: '&copy; OpenStreetMap contributors'
    }).addTo(map);

    var byId = {};
    D.universities.forEach(function (u) { byId[u.id] = u; });

    // 이슈 전파 경로 (교육부 → 대학)
    (cfg.flows || []).forEach(function (f) {
      var to = byId[f.to];
      if (!to) return;
      var mid = [(D.hub.lat + to.lat) / 2 + 0.35, (D.hub.lng + to.lng) / 2 - 0.45];
      var pts = curve([D.hub.lat, D.hub.lng], mid, [to.lat, to.lng]);
      L.polyline(pts, {
        color: f.color, weight: 2.5, opacity: .85,
        dashArray: DASH[f.style] || null
      }).addTo(map).bindTooltip(f.label, { sticky: true });
    });

    // 교육부 허브
    L.circleMarker([D.hub.lat, D.hub.lng], {
      radius: 6, color: '#1a2b4c', fillColor: '#1a2b4c', fillOpacity: 1, weight: 2
    }).addTo(map).bindTooltip(D.hub.name, { permanent: true, direction: 'top', className: 'uni-label' });

    // 대학 마커 — 크기·색 = 주간 리스크 신호 강도
    D.universities.forEach(function (u) {
      var lv = (cfg.levels && cfg.levels[u.id]) || 1;
      var d0 = (cfg.uni && cfg.uni[u.id]) || {};
      var rl = d0.riskLevel || 0;
      L.circleMarker([u.lat, u.lng], {
        radius: RADIUS[lv], color: '#fff', weight: u.focus ? 3 : 1.5,
        fillColor: RISKC[rl], fillOpacity: .92
      }).addTo(map)
        .bindTooltip(u.name, {
          permanent: true, direction: 'right', offset: [6, 0],
          className: 'uni-label' + (u.focus ? ' focus' : '')
        })
        .bindPopup(hintHtml(u, lv, cfg))
        .on('mouseover', function (e) { showHint(el, hintHtml(u, lv, cfg), e.originalEvent); })
        .on('mousemove', function (e) { moveHint(el, e.originalEvent); })
        .on('mouseout', function () { hideHint(el); });
    });

    MAPS.push({ el: el, map: map });
    addWorldLayer(map, el);

    // 내 위치 — 버튼을 눌렀을 때만 요청한다(자동 요청 안 함).
    // 좌표는 브라우저 안에서만 쓰이고 서버로 전송되지 않는다.
    var LocateCtl = L.Control.extend({
      options: { position: 'topleft' },
      onAdd: function () {
        var b = L.DomUtil.create('a', 'leaflet-locate');
        b.href = '#'; b.title = '내 위치 표시 (브라우저에만 사용)'; b.innerHTML = '◎';
        L.DomEvent.on(b, 'click', function (ev) { L.DomEvent.preventDefault(ev); locate(map, b); });
        return b;
      }
    });
    map.addControl(new LocateCtl());

    /* 휠 확대/축소 — 커서 위치를 기준으로 동작한다(Leaflet 기본).
       다만 긴 보고서 한가운데의 지도라, 켜 두면 페이지를 스크롤해 지나갈 때 휠을 빼앗긴다.
       그래서 '지도를 클릭하면 켜지고, 마우스가 벗어나면 꺼지는' 방식으로 둔다.
       Ctrl+휠은 활성화 여부와 무관하게 항상 동작한다. */
    map.scrollWheelZoom.disable();
    var hint = L.DomUtil.create('div', 'map-wheel-hint', el);
    hint.innerHTML = '지도를 클릭하면 <b>휠 확대/축소</b>가 켜집니다 · Ctrl+휠은 바로 가능';

    function wheelOn() {
      if (map._wheelOn) return;
      map._wheelOn = true;
      map.scrollWheelZoom.enable();
      el.classList.add('wheel-on');
      hint.innerHTML = '휠 확대/축소 <b>켜짐</b> — 커서 위치 기준 · 지도 밖으로 나가면 꺼짐';
    }
    function wheelOff() {
      if (!map._wheelOn) return;
      map._wheelOn = false;
      map.scrollWheelZoom.disable();
      el.classList.remove('wheel-on');
      hint.innerHTML = '지도를 클릭하면 <b>휠 확대/축소</b>가 켜집니다 · Ctrl+휠은 바로 가능';
    }
    map.on('click', wheelOn);
    map.on('mouseout', wheelOff);
    el.addEventListener('mouseleave', wheelOff);
    document.addEventListener('keydown', function (ev) { if (ev.key === 'Escape') wheelOff(); });

    // Ctrl+휠은 언제나 동작 (커서 위치 기준으로 확대)
    el.addEventListener('wheel', function (ev) {
      if (!ev.ctrlKey || map._wheelOn) return;
      ev.preventDefault();
      var pt = map.mouseEventToContainerPoint(ev);
      map.setZoomAround(map.containerPointToLatLng(pt), map.getZoom() + (ev.deltaY < 0 ? 0.5 : -0.5));
    }, { passive: false });
  }

  /* 마커 호버 힌트 — 대학별 주요 키워드
     키워드는 서술이 아니라 '그 대학을 언급한 기사 제목'에서 파이프라인이 집계한 값이다. */
  var LVWORD = { crisis: '위기', warning: '경고', watch: '관찰', normal: '일반' };
  function esc(t) {
    return String(t == null ? '' : t)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function hintHtml(u, lv, cfg) {
    var d = cfg.uni && cfg.uni[u.id];
    var rl = (d && d.riskLevel) || 0;
    var h = '<div class="hint-h"><b>' + esc(u.name) + '</b>' +
      '<span class="hint-g" style="background:' + RISKC[rl] + '">' + RISKW[rl] + '</span></div>';
    if (!d || !d.mentions) return h + rankHtml(d) + '<div class="hint-n">이번 주 언급 없음</div>';
    h += rankHtml(d);
    h += '<div class="hint-n">주목도 <b style="color:#1f2937">' + ATTN[lv] + '</b> · 언급 ' + d.mentions + '건' +
      (d.risky ? ' · 위험신호 <b>' + d.risky + '건</b> (' + d.riskRate + '%)' : '') + '</div>';
    if (d.keywords && d.keywords.length) {
      h += '<div class="hint-k">' + d.keywords.map(function (k) {
        return '<span>' + esc(k[0]) + '<i>' + k[1] + '</i></span>';
      }).join('') + '</div>';
    }
    if (d.lead) {
      h += '<div class="hint-l"><span class="lv ' +
        ({ crisis: 's', warning: 'i', watch: 'm', normal: 'l' }[d.lead.level]) + '">' +
        LVWORD[d.lead.level] + '</span>' + esc(d.lead.title) + '</div>';
    }
    return h;
  }
  // 세계대학랭킹 — 지도에서 위치와 함께 보여준다
  function rankHtml(d) {
    if (!d || !d.rank) return '';
    var r = d.rank;
    return '<div class="hint-r">' +
      (r.city ? '<span class="hint-city">' + esc(r.city) + '</span>' : '') +
      '<span class="hint-rk"><i>QS</i>' + esc(r.qs || '—') + '</span>' +
      '<span class="hint-rk"><i>THE</i>' + esc(r.the || '—') + '</span>' +
      (r.ja ? '<span class="hint-rk ja"><i>중앙</i>' + esc(r.ja.rank) + '위 <em>' + esc(r.ja.year) + '</em></span>' : '') +
      '</div>' +
      (d.accredit ? '<div class="hint-ac">평가인증 ' +
        (d.accredit.daysLeft > 0 ? '<b>유효</b>' : '<b class="bad">만료</b>') +
        ' <span>' + esc(d.accredit.from) + ' ~ ' + esc(d.accredit.to) + '</span></div>' : '');
  }

  function hintBox(el) {
    if (!el._hint) {
      var b = document.createElement('div');
      b.className = 'map-hint';
      el.appendChild(b);
      el._hint = b;
    }
    return el._hint;
  }
  function showHint(el, html, ev) {
    var b = hintBox(el);
    b.innerHTML = html;
    b.style.display = 'block';
    moveHint(el, ev);
  }
  function moveHint(el, ev) {
    var b = el._hint;
    if (!b || b.style.display === 'none' || !ev) return;
    var r = el.getBoundingClientRect();
    var x = ev.clientX - r.left + 14, y = ev.clientY - r.top + 14;
    if (x + b.offsetWidth > r.width - 8) x = ev.clientX - r.left - b.offsetWidth - 14;
    if (y + b.offsetHeight > r.height - 8) y = ev.clientY - r.top - b.offsetHeight - 14;
    b.style.left = Math.max(6, x) + 'px';
    b.style.top = Math.max(6, y) + 'px';
  }
  function hideHint(el) { if (el._hint) el._hint.style.display = 'none'; }

  /* 세계 랭킹 레이어 — QS·THE 에 오른 대학의 위치와 순위.
     기본은 꺼져 있고 🌐 버튼으로 켠다. 켜면 세계가 보이도록 시야를 넓힌다. */
  function rankBand(r) {
    var n = parseInt(String(r || '').replace(/[^0-9]/g, ''), 10);
    if (!n) return 4;
    return n <= 50 ? 0 : n <= 200 ? 1 : n <= 500 ? 2 : 3;
  }
  var WCOLOR = ['#7c1d6f', '#b3261e', '#d9822b', '#3b7dd8', '#94a3b8'];
  var WLABEL = ['1–50위', '51–200위', '201–500위', '501위+', '순위 미상'];

  function addWorldLayer(map, el) {
    var W = D.world;
    if (!W || !W.rows || !W.rows.length) return;
    var home = map.getCenter(), homeZoom = map.getZoom();
    var layer = L.layerGroup();

    W.rows.forEach(function (r) {
      var name = r[0], country = r[1], lat = r[2], lng = r[3], the = r[4], qs = r[5], hist = r[6] || [];
      if (lat == null || lng == null) return;
      var band = rankBand(the || qs);
      var m = L.circleMarker([lat, lng], {
        radius: band === 0 ? 6 : band === 1 ? 5 : 4,
        color: '#fff', weight: 1, fillColor: WCOLOR[band], fillOpacity: .85
      });
      var trend = hist.length > 1
        ? '<div class="hint-n">THE 추이 ' + hist.map(function (h) { return h[0] + ' ' + h[1]; }).join(' → ') + '</div>' : '';
      m.bindTooltip('<b>' + esc(name) + '</b><br>' + esc(country || '') +
        '<br>QS ' + esc(qs || '—') + ' · THE ' + esc(the || '—'),
        { direction: 'top', className: 'world-tip' });
      m.bindPopup('<div class="hint-h"><b>' + esc(name) + '</b></div>' +
        '<div class="hint-r"><span class="hint-city">' + esc(country || '') + '</span>' +
        '<span class="hint-rk"><i>QS</i>' + esc(qs || '—') + '</span>' +
        '<span class="hint-rk"><i>THE</i>' + esc(the || '—') + '</span></div>' + trend);
      layer.addLayer(m);
    });

    var on = false;
    var Ctl = L.Control.extend({
      options: { position: 'topright' },
      onAdd: function () {
        var b = L.DomUtil.create('a', 'leaflet-world');
        b.href = '#'; b.innerHTML = '🌐';
        b.title = '세계 랭킹 대학 표시 (QS ' + W.panel.qs.join('/') + ' · THE ' + W.panel.the.join('/') + ')';
        L.DomEvent.on(b, 'click', function (ev) {
          L.DomEvent.preventDefault(ev);
          on = !on;
          if (on) {
            layer.addTo(map);
            // 실제 마커 분포에 맞춰 시야를 맞춘다(고정 좌표보다 안정적)
            try { map.fitBounds(layer.getBounds(), { padding: [24, 24], animate: false }); }
            catch (e) { map.setView([20, 10], 2, { animate: false }); }
            b.classList.add('on');
            el.classList.add('world-on');
          } else {
            map.removeLayer(layer);
            map.setView(home, homeZoom, { animate: false });
            b.classList.remove('on');
            el.classList.remove('world-on');
          }
        });
        return b;
      }
    });
    map.addControl(new Ctl());

    // 범례 (레이어가 켜졌을 때만 보인다)
    var lg = L.DomUtil.create('div', 'world-legend', el);
    lg.innerHTML = '<b>세계 랭킹</b>' + WLABEL.map(function (t, i) {
      return '<span><i style="background:' + WCOLOR[i] + '"></i>' + t + '</span>';
    }).join('') + '<em>QS ' + W.panel.qs.join('/') + ' · THE ' + W.panel.the.join('/') + '</em>';
  }

  // 내 위치 표시
  function locate(map, btn) {
    if (!navigator.geolocation) { toast('이 브라우저는 위치 기능을 지원하지 않습니다'); return; }
    btn.innerHTML = '…';
    navigator.geolocation.getCurrentPosition(function (pos) {
      btn.innerHTML = '◎';
      var la = pos.coords.latitude, lo = pos.coords.longitude, acc = pos.coords.accuracy || 0;
      if (map._meLayer) map.removeLayer(map._meLayer);
      map._meLayer = L.layerGroup([
        L.circle([la, lo], { radius: Math.max(acc, 150), color: '#3b7dd8', weight: 1, fillColor: '#3b7dd8', fillOpacity: .15 }),
        L.circleMarker([la, lo], { radius: 7, color: '#fff', weight: 3, fillColor: '#3b7dd8', fillOpacity: 1 })
          .bindTooltip('현재 위치', { permanent: true, direction: 'top', className: 'uni-label' })
      ]).addTo(map);

      // 부산대까지의 거리 — 지도의 기준 대학과 얼마나 떨어져 있는지
      var focus = null;
      D.universities.forEach(function (u) { if (u.focus) focus = u; });
      var msg = '현재 위치를 표시했습니다';
      if (focus) msg += ' · ' + focus.name + '까지 약 ' + km(la, lo, focus.lat, focus.lng).toFixed(1) + 'km';
      msg += ' (좌표는 브라우저에만 사용, 전송되지 않음)';
      map.setView([la, lo], Math.max(map.getZoom(), 9), { animate: false });
      toast(msg);
    }, function (err) {
      btn.innerHTML = '◎';
      toast(err.code === 1 ? '위치 권한이 거부되었습니다' : '위치를 가져오지 못했습니다');
    }, { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 });
  }

  function km(a1, o1, a2, o2) {
    var R = 6371, r = Math.PI / 180;
    var dA = (a2 - a1) * r, dO = (o2 - o1) * r;
    var x = Math.sin(dA / 2) * Math.sin(dA / 2) +
      Math.cos(a1 * r) * Math.cos(a2 * r) * Math.sin(dO / 2) * Math.sin(dO / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
  }

  // 2차 베지어를 폴리라인 점들로 근사
  function curve(a, m, b) {
    var out = [];
    for (var t = 0; t <= 1.0001; t += 0.05) {
      var u = 1 - t;
      out.push([
        u * u * a[0] + 2 * u * t * m[0] + t * t * b[0],
        u * u * a[1] + 2 * u * t * m[1] + t * t * b[1]
      ]);
    }
    return out;
  }

  /* ---------- 2. 각주 [n] → 참조 기사 목록 ---------- */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.ref');
    if (!btn) return;
    var week = btn.closest('.week');
    var li = week && week.querySelector('#' + week.id + '-ref-' + btn.dataset.ref);
    if (!li) { toast('[' + btn.dataset.ref + '] 참조 항목을 찾을 수 없습니다'); return; }
    document.querySelectorAll('.reflist li.hit').forEach(function (x) { x.classList.remove('hit'); });
    li.classList.add('hit');
    li.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(function () { li.classList.remove('hit'); }, 2600);
  });

  /* ---------- 3. 사이드바 스크롤스파이 ---------- */
  var navs = [].slice.call(document.querySelectorAll('[data-nav]'));
  var weeks = [].slice.call(document.querySelectorAll('.week'));
  if ('IntersectionObserver' in window && weeks.length) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (!en.isIntersecting) return;
        navs.forEach(function (a) { a.classList.toggle('on', a.dataset.nav === en.target.id); });
      });
    }, { rootMargin: '-96px 0px -70% 0px' });
    weeks.forEach(function (w) { io.observe(w); });
  }

  /* ---------- 3-2. ?only=<id> — 한 주차(또는 하루)만 남긴다 ----------
     주차별 PDF 를 굽기 위한 인쇄 전용 뷰다. pdf.mjs 가 이 쿼리로 페이지를 열어 인쇄한다. */
  (function () {
    var only = new URLSearchParams(location.search).get('only');
    if (!only) return;
    var keep = document.getElementById(only);
    if (!keep) return;
    document.querySelectorAll('.week').forEach(function (w) { if (w !== keep) w.remove(); });
    var side = document.querySelector('.side'); if (side) side.remove();
    var trend = document.querySelector('.trend'); if (trend) trend.remove();
    var acts = document.querySelector('.acts'); if (acts) acts.remove();
    document.body.classList.add('only-view');
  })();

  /* ---------- 4. 버튼 ---------- */
  // 날짜 선택 — 고른 회차의 PDF 로 링크를 바꾼다
  var pdfSel = document.querySelector('[data-pdf-select]');
  if (pdfSel) {
    pdfSel.addEventListener('change', function () {
      var btn = document.querySelector('[data-pdf]');
      if (btn && pdfSel.value) btn.setAttribute('href', pdfSel.value);
    });
  }

  // PDF: 사전 생성 파일(KMI 방식). 없으면 브라우저 인쇄로 폴백.
  // 브라우저 인쇄(Ctrl+P)로 직접 뽑을 때도 기사 목록이 펼쳐지고 지도 화면이 유지되도록
  // 관련 처리는 아래 beforeprint 리스너에 모아 두었다.
  var pdfBtn = document.querySelector('[data-pdf]');
  if (pdfBtn) {
    pdfBtn.addEventListener('click', function (e) {
      if (location.protocol === 'file:') return; // 로컬은 그대로 열기 시도
      e.preventDefault();
      fetch(pdfBtn.getAttribute('href'), { method: 'HEAD' })
        .then(function (r) {
          if (r.ok) { window.open(pdfBtn.getAttribute('href'), '_blank'); }
          else { toast('사전 생성 PDF가 없어 인쇄 대화상자로 대체합니다'); window.print(); }
        })
        .catch(function () { toast('PDF를 찾을 수 없어 인쇄로 대체합니다'); window.print(); });
    });
  }

  /* ---------- 5. 지도 지연 생성 ---------- */
  var maps = [].slice.call(document.querySelectorAll('.lmap'));

  function ensure(el) { if (!el._built) { el._built = true; buildMap(el); } }

  // 최신 주차 지도는 항상 즉시 생성한다.
  // (IntersectionObserver 는 탭이 백그라운드거나 창이 가려지면 발화하지 않아 지도가 빈 채로 남는다)
  if (maps.length) ensure(maps[0]);

  if ('IntersectionObserver' in window) {
    var mo = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        mo.unobserve(en.target);
        ensure(en.target);
      });
    }, { rootMargin: '250px' });
    maps.slice(1).forEach(function (m) { mo.observe(m); });
  } else {
    maps.forEach(ensure);
  }

  /* PDF 사전 생성용 — 한반도(거점국립대 전체)가 가운데 오도록 시야를 맞춘다.
     인쇄 시 지도 컨테이너 폭이 화면과 달라지는데, 중심·확대를 그대로 두면
     한반도가 한쪽으로 밀린다. 실제로 PDF 에서 오른쪽으로 치우쳐 나왔다.
     pdf.mjs 가 인쇄 직전에 이 함수를 부른다. Ctrl+P 는 기존대로 현재 화면을 유지한다. */
  window.__pnuFitKorea = function () {
    if (!MAPS.length || typeof L === 'undefined') return 0;
    var pts = D.universities.map(function (u) { return [u.lat, u.lng]; });
    if (D.hub) pts.push([D.hub.lat, D.hub.lng]);
    var b = L.latLngBounds(pts);
    MAPS.forEach(function (m) {
      if (m.el.classList.contains('world-on')) return;   // 세계 레이어가 켜진 지도는 건드리지 않는다
      m.map.invalidateSize({ animate: false });
      m.map.fitBounds(b, { padding: [26, 26], animate: false });
    });
    // 검증용으로 결과를 돌려준다. pdf.mjs 는 값이 있는지만 본다.
    var first = MAPS[0];
    return {
      n: MAPS.length,
      w: first ? Math.round(first.el.getBoundingClientRect().width) : 0,
      h: first ? Math.round(first.el.getBoundingClientRect().height) : 0,
      center: first ? [+first.map.getCenter().lat.toFixed(3), +first.map.getCenter().lng.toFixed(3)] : null,
      zoom: first ? +first.map.getZoom().toFixed(2) : null
    };
  };

  // 인쇄: 화면에서 보고 있던 중심·확대를 그대로 유지한다.
  // 인쇄 시 컨테이너 크기가 바뀌면 Leaflet 이 다른 영역을 그리므로,
  // invalidateSize 후 저장해 둔 중심·확대로 되돌린다.
  window.addEventListener('beforeprint', function () {
    document.querySelectorAll('details.day').forEach(function (d) { d.open = true; });
    maps.forEach(ensure);
    MAPS.forEach(function (m) {
      m.saved = { c: m.map.getCenter(), z: m.map.getZoom() };
      m.map.invalidateSize({ animate: false });
      m.map.setView(m.saved.c, m.saved.z, { animate: false });
    });
  });
  window.addEventListener('afterprint', function () {
    MAPS.forEach(function (m) {
      m.map.invalidateSize({ animate: false });
      if (m.saved) m.map.setView(m.saved.c, m.saved.z, { animate: false });
    });
  });

  /* ---------- 9. 주간 키워드 네트워크 (3D) ---------- */
  // 그리는 일은 src/browser/net3d.js 의 캔버스 렌더러가 한다.
  // 여기서는 붙이고, 말풍선과 클릭(기사 표시)을 이어 준다.
  // 캔버스를 못 쓰는 환경에서는 아무것도 안 하면 된다 — 자리에 있는 SVG 가 그대로 보인다.
  (function network() {
    var boxes = [].slice.call(document.querySelectorAll('[data-net]'));
    if (!boxes.length) return;

    var tip = document.createElement('div');
    tip.className = 'net-tip';
    tip.hidden = true;
    document.body.appendChild(tip);

    function showTip(n, ev) {
      if (!n || !ev) { tip.hidden = true; return; }
      tip.innerHTML = '<b>' + esc(n.key) + '</b>' +
        '<span class="t-meta">' + n.cnt + '건 · 위험신호 ' + n.risk + '% · ' + esc(n.field) + '</span>' +
        (n.tip.indexOf('\n') > 0 ? '<span class="t-art">' + esc(n.tip.split('\n').slice(1).join(' ')) + '</span>' : '');
      tip.hidden = false;
      var w = tip.offsetWidth, h = tip.offsetHeight;
      var x = Math.min(Math.max(ev.clientX + 14, 8), window.innerWidth - w - 8);
      var y = ev.clientY - h - 14;
      if (y < 8) y = ev.clientY + 18;
      tip.style.left = x + 'px';
      tip.style.top = y + 'px';
    }
    function esc(t) {
      return String(t == null ? '' : t)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    boxes.forEach(function (box) {
      if (!window.__pnuNet3D) return;
      window.__pnuNet3D(box, {
        tip: showTip,
        pick: function (key) { markArticles(box, key); }
      });
    });

    // 인쇄는 SVG 가 맡는다. 캔버스를 숨기는 것은 CSS 가 하고, 여기서는 할 일이 없다.

    function markArticles(box, key) {
      if (!key) return;
      var week = box.closest('section.week');
      if (!week) return;
      // 앞서 표시한 것은 지운다. 두 키워드가 동시에 켜져 있으면 뭘 봤는지 알 수 없다.
      week.querySelectorAll('.kw-on').forEach(function (el) { el.classList.remove('kw-on'); });

      var hits = [];
      week.querySelectorAll('.cat li, .reflist li, .artlist li').forEach(function (li) {
        if (li.classList.contains('more')) return;
        if ((li.textContent || '').indexOf(key) < 0) return;
        li.classList.add('kw-on');
        hits.push(li);
        var d = li.closest('details');
        if (d) d.open = true;
      });

      var m = (window.__PNU_NETMSG__ || {})[key] || {};
      if (!hits.length) { toast(m.miss || key); return; }
      toast((m.hit || key + ' {n}').replace('{n}', hits.length));
      hits[0].scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  })();

  /* ---------- 10. 모바일 고정 ---------- */
  // 모바일에서 고정하는 것은 헤더가 아니라 날짜 칩 띠(.side)다.
  // 그건 CSS 의 position:sticky 만으로 되므로 헤더를 접던 stickyHead() 는 없앴다.

})();
