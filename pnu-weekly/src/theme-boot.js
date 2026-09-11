/* 테마 부트 — <head> 에서 동기 실행된다. 첫 페인트 전에 결정해야 흰 화면이 번쩍이지 않는다.
   저장값은 auto | light | dark 세 가지. 'auto' 는 OS 설정을 그때그때 따른다.
   CSS 에는 다크 토큰 블록이 하나뿐이므로, auto 의 해석은 여기서 끝낸다. */
(function () {
  var KEY = 'pnu-theme';
  var pref = 'auto';
  try { pref = localStorage.getItem(KEY) || 'auto'; } catch (e) { /* 프라이빗 모드 */ }
  if (pref !== 'light' && pref !== 'dark') pref = 'auto';

  var mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  function resolve(p) { return p === 'auto' ? (mq && mq.matches ? 'dark' : 'light') : p; }

  window.__pnuTheme = {
    key: KEY,
    pref: pref,
    resolve: resolve,
    apply: function (p) {
      this.pref = p;
      document.documentElement.setAttribute('data-theme', resolve(p));
      try { localStorage.setItem(KEY, p); } catch (e) {}
      // 지도 타일 필터가 바뀌면 Leaflet 은 알아서 다시 그리지 않는다. 알려준다.
      window.dispatchEvent(new CustomEvent('pnu:theme', { detail: { theme: resolve(p), pref: p } }));
    }
  };
  document.documentElement.setAttribute('data-theme', resolve(pref));

  // 'auto' 인 동안에는 OS 설정 변경을 따라간다.
  if (mq && mq.addEventListener) mq.addEventListener('change', function () {
    if (window.__pnuTheme.pref === 'auto') window.__pnuTheme.apply('auto');
  });
})();
