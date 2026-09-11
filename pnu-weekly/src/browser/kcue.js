/* 한국대학평가원 대학기관평가인증 — 인증대학 현황 전체를 한 번에 받는다.
   목록 엔드포인트가 pageUnit 을 받아 167건을 한 요청으로 돌려준다(기본 10건/페이지).
   worldrank/univdata 가 이 파일을 그대로 읽어 브라우저에서 평가한다. */
(async () => {
  const r = await fetch('/kor/sub02/univ/univList.do?pageUnit=500', { credentials: 'same-origin' });
  if (!r.ok) return { error: 'HTTP ' + r.status };
  const html = await r.text();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const total = ((doc.body.innerText.match(/Total\s*([\d,]+)/) || [])[1] || '').replace(/,/g, '');
  const rows = [];
  Array.prototype.slice.call(doc.querySelectorAll('table tr')).forEach((tr) => {
    if (tr.cells.length < 5) return;
    const c = Array.prototype.map.call(tr.cells, (x) => x.innerText.replace(/\s+/g, ' ').trim());
    if (!/^\d+$/.test(c[0])) return;                   // 머리행 제외
    const period = (c[4] || '').split('~').map((s) => s.trim());
    rows.push({ type: c[1], region: c[2], name: c[3], from: period[0] || null, to: period[1] || null });
  });
  return { total: total ? +total : rows.length, rows: rows };
})()
