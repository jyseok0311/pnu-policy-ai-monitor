/* QS 다음 페이지로 넘긴다. 넘길 수 있으면 true. */
(() => {
  const cand = Array.prototype.slice.call(document.querySelectorAll('a,button,li'));
  const next = cand.find((b) => {
    const x = (b.textContent || '').trim().toLowerCase();
    const cls = (b.className || '').toString();
    return x === 'next' || x === '\u203a' || x === '\u00bb'
      || b.getAttribute('aria-label') === 'Next page' || /next/i.test(cls);
  });
  if (!next) return false;
  next.click();
  return true;
})()
