// 기관 공식 홈페이지의 보도자료·소식 게시판.
//
// 네이버 블로그 대신 각 기관의 공식 홈페이지를 직접 읽는다. 블로그는 홍보 편집본이라
// 원문 보도자료와 제목·시점이 어긋나고, 링크도 blog.naver.com 으로 나가 출처가 흐려진다.
//
// 어느 기관도 RSS 를 내주지 않아(2026-09 확인) 목록 HTML 을 직접 파싱한다.
// 그래서 사이트 개편에 약하다 — 파서가 0건을 돌려주면 feeds.mjs 가 '실패'로 기록하고,
// 리포트에는 그 기관의 최신 글 대신 홈페이지 링크만 남는다. 조용히 비지 않는다.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';

export const strip = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '').replace(/<[^>]+>/g, ' ')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#034;|&quot;/g, '"')
  .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&middot;/g, '·')
  .replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// href 를 그대로 쓰면 두 가지가 링크를 망가뜨린다.
//  ① ;jsessionid=... — 정부 eGov 사이트가 첫 방문에 URL 에 박아 준다. 세션이 끊기면 목록으로 튕긴다.
//  ② &amp; — HTML 소스의 실체는 엔티티다. 디코드하지 않으면 'amp;nttId' 라는 엉뚱한 파라미터가 되고
//     서버는 nttId 를 못 받아 게시글 대신 목록을 보여준다(행안부에서 실제로 그랬다).
const clean = (u) => String(u || '')
  .replace(/;jsessionid=[^?#]*/i, '')
  .replace(/&amp;/g, '&').replace(/&#38;/g, '&');
const ymd = (s) => {
  const m = String(s || '').match(/(20\d\d)[.\-/](\d{1,2})[.\-/](\d{1,2})/);
  return m ? `${m[1]}-${String(m[2]).padStart(2, '0')}-${String(m[3]).padStart(2, '0')}` : null;
};
const abs = (base, href) => { try { return new URL(clean(href), base).href; } catch { return null; } };
const rows = (html) => [...html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)].map((m) => m[0]);

export const SITES = [
  {
    id: 'moe', name: '교육부', board: '보도자료',
    home: 'https://www.moe.go.kr/main.do?s=moe',
    list: 'https://www.moe.go.kr/boardCnts/listRenew.do?boardID=294&m=020402&s=moe',
    parse(html, url) {
      const out = [];
      for (const tr of rows(html)) {
        const g = tr.match(/goView\('(\d+)',\s*'(\d+)'/);
        const t = tr.match(/title="([^"]+)"/);
        if (!g || !t) continue;
        out.push({
          title: strip(t[1]),
          // 상세 페이지 주소는 goView() 가 만드는 것과 같은 조합이다
          link: `https://www.moe.go.kr/boardCnts/viewRenew.do?boardID=${g[1]}&boardSeq=${g[2]}&lev=0&searchType=null&statusYN=W&page=1&s=moe&m=020402&opType=N`,
          date: ymd(tr)
        });
      }
      return out;
    }
  },
  {
    id: 'msit', name: '과학기술정보통신부', board: '보도자료',
    home: 'https://www.msit.go.kr/index.do',
    list: 'https://www.msit.go.kr/bbs/list.do?sCode=user&mId=113&mPid=112',
    parse(html, url) {
      return [...html.matchAll(/<a[^>]+href="([^"]*view\.do[^"]*)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)]
        .map((m) => ({ title: strip(m[2]), link: abs(url, m[1]), date: null }))
        .filter((x) => x.title.length > 8 && x.link);
    }
  },
  {
    id: 'motir', name: '산업통상부', board: '보도자료',
    home: 'https://www.motir.go.kr/',
    list: 'https://www.motir.go.kr/kor/article/ATCL3f49a5a8c',
    parse(html, url) {
      const out = [];
      // 목록 행 안에 링크와 날짜가 함께 있다. 행 단위로 잘라야 날짜가 섞이지 않는다.
      for (const tr of rows(html)) {
        const a = tr.match(/<a[^>]+href="(\/kor\/article\/[^"]*\/view[^"]*)"[^>]*>([\s\S]{0,300}?)<\/a>/i);
        if (!a) continue;
        const title = strip(a[2]);
        if (title.length < 8) continue;
        out.push({ title, link: abs(url, a[1]), date: ymd(tr) });
      }
      return out;
    }
  },
  {
    id: 'mois', name: '행정안전부', board: '보도자료',
    home: 'https://www.mois.go.kr/frt/a01/frtMain.do',
    list: 'https://www.mois.go.kr/frt/bbs/type010/commonSelectBoardList.do?bbsId=BBSMSTR_000000000008',
    parse(html, url) {
      const out = [];
      const seen = new Set();
      for (const m of html.matchAll(/<a[^>]+href="([^"]*type010\/commonSelectBoardArticle\.do[^"]*)"[^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
        const link = abs(url, m[1]);
        const title = strip(m[2]);
        if (!link || title.length < 8 || seen.has(link)) continue;
        seen.add(link);
        // 날짜는 링크 뒤쪽 같은 행에 있다
        const after = html.slice(m.index, m.index + 900);
        out.push({ title, link, date: ymd(after) });
      }
      return out;
    }
  },
  {
    // 공지사항은 채용·입찰 공고가 대부분이다. 이 리포트에 쓸모 있는 건 연구자료 쪽이다
    // (SPRi AI Brief · SW 산업 보고서가 모두 data_all 에 들어온다).
    id: 'spri', name: '소프트웨어정책연구소', board: '연구자료',
    home: 'https://spri.kr/',
    list: 'https://spri.kr/posts?code=data_all',
    parse(html, url) {
      const out = [];
      // 날짜가 제목 앵커 '앞'에 온다. 항목 블록으로 잘라야 옆 항목 날짜를 집어오지 않는다.
      for (const box of html.split('<div class="box">').slice(1)) {
        const a = box.match(/<a href="(\/posts\/view\/\d+[^"]*)"[^>]*>([\s\S]{0,240}?)<\/a>/);
        if (!a) continue;
        const title = strip(a[2]);
        if (title.length < 8) continue;
        out.push({ title, link: abs(url, a[1]), date: ymd(box.slice(0, a.index)) });
      }
      return out;
    }
  },
  {
    id: 'edpolicy', name: '교육정책네트워크', board: '국내교육동향',
    home: 'https://edpolicy.kedi.re.kr/edpolicy',
    list: 'https://edpolicy.kedi.re.kr/edpolicy/board/226',
    parse(html) {
      const out = [];
      for (const tr of rows(html)) {
        const v = tr.match(/view\((\d+)/);
        const t = tr.match(/class="tit-a"[^>]*>([\s\S]{0,200}?)<\/a>/);
        if (!v || !t) continue;
        out.push({
          title: strip(t[1]),
          link: `https://edpolicy.kedi.re.kr/edpolicy/board/226/${v[1]}`,
          date: ymd(tr)
        });
      }
      return out;
    }
  },
  {
    // 화면은 자바스크립트로 그리지만, 그 화면이 부르는 목록 API 가 공개돼 있다.
    // 헤드리스 브라우저를 붙이지 않고 같은 API 를 그대로 부른다.
    // 사람이 열 주소는 브라우저에서 직접 눌러 확인한 상세 경로를 쓴다.
    // main.do?menu_cd=…&num=… 는 홈으로 리다이렉트된다(처음에 그렇게 만들어 틀렸다).
    id: 'aikorea', name: '국가인공지능전략위원회', board: '보도자료',
    home: 'https://www.aikorea.go.kr/web/board/brdList.do?menu_cd=000012',
    list: 'https://www.aikorea.go.kr/web/board/newsList.do?menu_cd=000012&screenTp=USER',
    json: true,
    // 이 사이트는 Accept 로 응답 형태를 고른다. 화면(HTML)이 아니라 목록(JSON)을 달라고 해야 한다.
    accept: 'application/json, text/plain, */*',
    parse(data) {
      return (data.brdList || []).map((b) => ({
        // 제목 앞에 붙는 배포일 표기 ('26. 9. 8.) 는 날짜 칸과 겹친다. 떼어 낸다.
        title: strip(b.title).replace(/^\(\s*'?\d{2}\.\s*\d{1,2}\.\s*\d{1,2}\.?\s*\)\s*/, ''),
        link: `https://www.aikorea.go.kr/web/board/brdDetail.do?menu_cd=000012&num=${b.num}`,
        date: ymd(b.write_dt || b.disp_write_dt)
      }));
    }
  }
];

export async function fetchSite(site, timeoutMs = 20000) {
  if (!site.list) return { items: [], note: site.linkOnly || '수집 대상 아님' };
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeoutMs);
  try {
    // 브라우저처럼 Accept 를 보내야 한다. 이게 없으면 어떤 사이트는 화면 대신 JSON 을 돌려준다.
    const r = await fetch(site.list, {
      headers: { 'User-Agent': UA, 'Accept-Language': 'ko', Accept: site.accept || 'text/html,application/xhtml+xml,*/*;q=0.8' },
      signal: c.signal
    });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (site.json) {
      const items = site.parse(await r.json()).filter((x) => x.title && x.link);
      return { items, note: items.length ? null : '목록 API 응답 0건' };
    }
    const html = await r.text();
    // 정부 사이트는 점검 중에도 200 을 준다. 제목으로 가려낸다.
    const title = (html.match(/<title>([^<]*)/) || [])[1] || '';
    if (/점검|일시\s*중단|서비스\s*중지/.test(title)) throw new Error('사이트 점검 중: ' + strip(title));
    const items = site.parse(html, site.list).filter((x) => x.title && x.link);
    return { items, note: items.length ? null : '목록 파싱 0건 — 사이트 개편 가능성' };
  } finally {
    clearTimeout(t);
  }
}
