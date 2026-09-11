/* QS 랭킹 페이지에서 카드 데이터를 꺼낸다.
   전역 페이지는 대학명이 앵커가 아니라 .univ-names-text 블록 첫 줄에 있고,
   국가 필터 페이지는 앵커에 들어 있다 — 두 경우를 모두 처리한다. */
(() => {
  const cards = Array.prototype.slice.call(document.querySelectorAll('.new-ranking-cards'));
  const rows = [];
  cards.forEach((c) => {
    const blk = c.querySelector('.univ-names-text');
    if (!blk) return;
    const parts = blk.innerText.split('\n').map((s) => s.trim()).filter(Boolean);
    const anchor = (c.querySelector('.univ-names-text a') || {}).textContent || '';
    const name = (anchor.trim() || parts[0] || '').trim();
    if (!name) return;
    const t = c.innerText.replace(/\s+/g, ' ');
    // 대소문자에 주의: 대화형 브라우저는 'RANK', 헤드리스는 'Rank' 로 렌더된다(CSS text-transform 차이)
    const rm = t.match(/rank\s*(=?[\d\-–]+)/i);
    const sm = t.match(/overall score:\s*([\d.]+)/i);
    const loc = (parts[1] || '');
    rows.push({
      name: name,
      rank: rm ? rm[1] : null,
      score: sm ? sm[1] : null,
      city: loc.split(',')[0].trim(),
      country: (loc.split(',').pop() || '').trim()
    });
  });
  return { cards: cards.length, rows: rows };
})()
