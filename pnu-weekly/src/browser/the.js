/* THE 랭킹 페이지에서 표 데이터를 꺼낸다.
   표가 Next.js 하이드레이션 데이터에만 있어 원시 HTML 파싱이 불가능하다.
   worldrank.mjs 가 이 파일을 그대로 읽어 브라우저에서 평가한다(템플릿 리터럴 이스케이프 문제 회피). */
(() => {
  const nd = window.__NEXT_DATA__;
  const cfg = nd && nd.props && nd.props.pageProps && nd.props.pageProps.page
    && nd.props.pageProps.page.rankingsTableConfig;
  if (!cfg || !cfg.rankingsData || !cfg.rankingsData.data) return { error: 'no __NEXT_DATA__ rankings' };
  const D = cfg.rankingsData.data;
  return {
    total: D.length,
    rows: D.map((r) => ({ name: r.name, rank: r.rank, country: r.location, score: r.scores_overall }))
  };
})()
