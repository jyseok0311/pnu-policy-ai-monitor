// 법령·자치법규·입법예고 수집.
//
// 기사는 '무슨 일이 있었나'를 알려 주지만 법령은 '무엇이 확정됐나'를 알려 준다.
// 정책이 보도자료 → 입법예고 → 공포 → 시행으로 내려오는 동안
// 대학이 실제로 대응해야 하는 시점은 뒤쪽 둘이다. 그래서 세 갈래를 따로 모은다.
//
//   입법예고  아직 바뀔 수 있다. 의견을 낼 수 있는 유일한 구간이다.
//   법령      공포됨. 시행일까지 남은 기간이 준비 기간이다.
//   자치법규  조례·규칙. 부울경 것이 대학에 직접 닿는다.
//
// 출처
//   국가법령정보센터 공동활용 OpenAPI (law.go.kr/DRF) — 법령·자치법규
//   국민참여입법센터 통합입법예고 (opinion.lawmaking.go.kr) — 목록 HTML 파싱
//
// OC 파라미터는 공동활용 신청자의 이메일 아이디다. 공개 샘플 계정 'test' 로도
// 조회가 되지만(2026-10 확인) 호출 한도가 어떻게 걸리는지는 공개돼 있지 않다.
// 환경변수 LAW_OC 를 주면 그것을 쓴다 — 한도에 걸리면 각자 계정을 발급받아 넣으면 된다.

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36';
const OC = process.env.LAW_OC || 'test';
const DRF = 'https://www.law.go.kr/DRF/lawSearch.do';

const txt = (s) => String(s || '')
  .replace(/<!\[CDATA\[|\]\]>/g, '')
  .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
  .replace(/&quot;|&#034;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
  .replace(/\s+/g, ' ').trim();

// 태그 하나를 꺼낸다. CDATA 와 줄바꿈이 섞여 있어 [\s\S] 로 받는다.
const tag = (rec, name) => {
  const m = rec.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
  return m ? txt(m[1]) : '';
};
// 20260818 → 2026-08-18
const ymd8 = (s) => (/^\d{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6)}` : (s || null));

async function getText(url, timeoutMs = 20000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'ko' }, signal: ac.signal });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return await r.text();
  } finally { clearTimeout(t); }
}

// ── 법령명 검색어.
// 본문 전체가 아니라 '법령 이름'을 뒤진다(section=lawNm 이 기본값). 그래서 정밀하다.
// 이름에 안 들어가지만 대학에 닿는 법(예: 「조세특례제한법」의 연구인력개발비)은 놓친다 —
// 그런 것까지 걸러내려면 본문 검색이 필요한데 오탐이 급증해 쓸 수 없다.
export const LAW_QUERIES = ['고등교육', '대학', '학술', '산학', '평생교육', '인공지능', '지능정보', '사립학교', '교육공무원'];
export const ORDIN_QUERIES = ['대학', '인재양성', '인공지능', '산학'];
// 행정규칙(고시·훈령·예규)은 법령보다 아래지만 대학 실무가 실제로 묶이는 자리다.
// 재정지원사업 기본계획, 정원 기준, 특성화대학원 지정 같은 것이 전부 여기 고시로 나온다.
export const ADMRUL_QUERIES = ['대학', '고등교육', '학술', '산학', '인공지능'];

// 입법예고는 제목으로만 거른다 — 목록에 분야 정보가 있지만 분류가 성겨서 쓰기 어렵다.
const NOTICE_HIT = /대학|고등교육|학교|학술|산학|학위|장학|교원|교육공무원|평생교육|인공지능|지능정보|데이터|연구개발|학점|입학|등록금/;
// 초·중등 전용은 뺀다. '학교'로 걸려 들어오는 양이 많다.
const NOTICE_SKIP = /유아교육|어린이집|초등학교|중학교|고등학교 교과|학교급식|학교보건|교과용도서/;

// 부울경 — 이 지역 조례는 대학에 바로 닿는다
const LOCAL_ORG = /부산|울산|경상남도|창원|김해|양산|진주|거제|통영|사천|밀양/;

/** 현행법령 — 최근 공포된 것 */
export async function fetchLaws(queries = LAW_QUERIES) {
  const out = [];
  for (const q of queries) {
    const url = `${DRF}?OC=${encodeURIComponent(OC)}&target=law&type=XML&query=${encodeURIComponent(q)}&display=50&sort=ddes`;
    const xml = await getText(url);
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1];
    if (msg && msg !== 'success') throw new Error(`law.go.kr: ${msg}`);
    for (const m of xml.matchAll(/<law id="\d+">([\s\S]*?)<\/law>/g)) {
      const r = m[1];
      const seq = tag(r, '법령일련번호');
      out.push({
        kind: 'law',
        title: tag(r, '법령명한글'),
        change: tag(r, '제개정구분명'),          // 일부개정 · 전부개정 · 제정 · 폐지
        org: tag(r, '소관부처명'),
        category: tag(r, '법령구분명'),           // 법률 · 대통령령 · 부령
        date: ymd8(tag(r, '공포일자')),           // 공포일
        effective: ymd8(tag(r, '시행일자')),      // 시행일
        link: viewer('law', seq),
        q
      });
    }
  }
  return dedup(out);
}

// 링크는 law.go.kr 의 공개 열람 화면으로 건다.
// API 가 주는 상세링크(/DRF/lawService.do?OC=…)는 호출용 주소라 OC 계정이 그대로 드러나고,
// 법령명으로 거는 짧은 주소(/법령/<이름>)는 늘 '현행'을 가리켜 공포 당시 판이 아닐 수 있다.
// 일련번호로 거는 열람 화면이 그 개정본을 정확히 연다(2026-10 세 가지 모두 실제 문서로 확인).
const VIEWER = {
  law: 'https://www.law.go.kr/LSW/lsInfoP.do?lsiSeq=',
  ordin: 'https://www.law.go.kr/LSW/ordinInfoP.do?ordinSeq=',
  admrul: 'https://www.law.go.kr/LSW/admRulInfoP.do?admRulSeq='
};
const viewer = (kind, seq) => (/^\d+$/.test(seq || '') ? VIEWER[kind] + seq : null);

/** 자치법규(조례·규칙) */
export async function fetchOrdinances(queries = ORDIN_QUERIES) {
  const out = [];
  for (const q of queries) {
    const url = `${DRF}?OC=${encodeURIComponent(OC)}&target=ordin&type=XML&query=${encodeURIComponent(q)}&display=50&sort=ddes`;
    const xml = await getText(url);
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1];
    if (msg && msg !== 'success') throw new Error(`law.go.kr(ordin): ${msg}`);
    // 자치법규도 레코드 태그는 <law> 다(루트만 OrdinSearch).
    for (const m of xml.matchAll(/<law id="\d+">([\s\S]*?)<\/law>/g)) {
      const r = m[1];
      const seq = tag(r, '자치법규일련번호');
      const org = tag(r, '지자체기관명');
      out.push({
        kind: 'ordin',
        title: tag(r, '자치법규명'),
        change: tag(r, '제개정구분명'),
        org,
        category: tag(r, '자치법규종류'),         // 조례 · 규칙
        date: ymd8(tag(r, '공포일자')),
        effective: ymd8(tag(r, '시행일자')),
        link: viewer('ordin', seq),
        local: LOCAL_ORG.test(org),
        q
      });
    }
  }
  return dedup(out);
}

/** 행정규칙 — 고시·훈령·예규 */
export async function fetchAdminRules(queries = ADMRUL_QUERIES) {
  const out = [];
  for (const q of queries) {
    const url = `${DRF}?OC=${encodeURIComponent(OC)}&target=admrul&type=XML&query=${encodeURIComponent(q)}&display=50&sort=ddes`;
    const xml = await getText(url);
    const msg = (xml.match(/<resultMsg>([^<]*)<\/resultMsg>/) || [])[1];
    if (msg && msg !== 'success') throw new Error(`law.go.kr(admrul): ${msg}`);
    for (const m of xml.matchAll(/<admrul id="\d+">([\s\S]*?)<\/admrul>/g)) {
      const r = m[1];
      const seq = tag(r, '행정규칙일련번호');
      out.push({
        kind: 'admrul',
        title: tag(r, '행정규칙명'),
        change: tag(r, '제개정구분명'),
        org: tag(r, '소관부처명'),
        category: tag(r, '행정규칙종류'),        // 고시 · 훈령 · 예규
        date: ymd8(tag(r, '발령일자')),
        effective: ymd8(tag(r, '시행일자')),
        link: viewer('admrul', seq),
        q
      });
    }
  }
  return dedup(out);
}

/** 통합입법예고 — 의견 접수가 열려 있는 건.
 *
 *  목록은 최신 20건만 내주고 GET 으로는 다음 쪽도 검색도 되지 않는다(POST 폼이다).
 *  대신 이 수집은 매일 돈다 — 지나가는 것을 그날그날 주워 쌓으면 결국 다 걸린다.
 *  쌓는 일은 legal.mjs 가 한다. 여기서는 오늘 보이는 것만 돌려준다. */
export async function fetchNotices() {
  const html = await getText('https://opinion.lawmaking.go.kr/gcom/ogLmPp', 25000);
  const out = [];
  for (const m of html.matchAll(/<tr[\s>][\s\S]*?<\/tr>/gi)) {
    const tr = m[0];
    const a = tr.match(/<a href="(\/gcom\/ogLmPp\/\d+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const title = txt(a[2]);
    if (!title) continue;
    // 각 칸은 data-th 로 이름이 붙어 있다 — 열 순서에 기대지 않는다(개편에 덜 깨진다).
    const cell = (name) => {
      const c = tr.match(new RegExp(`<td[^>]*data-th="${name}"[^>]*>([\\s\\S]*?)</td>`));
      return c ? txt(c[1]) : '';
    };
    const period = cell('입법의견 접수기간') || cell('입법의견접수기간');
    const dates = period.match(/(20\d\d[.\-/]\d{1,2}[.\-/]\d{1,2})/g) || [];
    const norm = (s) => s && s.replace(/[.\/]/g, '-').replace(/-(\d)(?=-|$)/g, '-0$1');
    out.push({
      kind: 'notice',
      title,
      change: (tr.match(/class="ogmark_\d"[^>]*>([^<]{1,8})</) || [])[1] || '',
      org: (cell('소관부처') || cell('소관부처 (법령종류)')).replace(/\s+/g, ' '),
      date: norm(dates[0]) || null,          // 접수 시작
      deadline: norm(dates[1]) || null,      // 접수 마감
      link: new URL(a[1], 'https://opinion.lawmaking.go.kr').href
    });
  }
  return out.filter((x) => NOTICE_HIT.test(x.title) && !NOTICE_SKIP.test(x.title));
}

// 같은 법령이 여러 검색어에 걸린다. 이름+공포일로 묶는다.
function dedup(arr) {
  const seen = new Set();
  return arr.filter((x) => {
    if (!x.title) return false;
    const k = `${x.title}|${x.date}`;
    if (seen.has(k)) return false;
    seen.add(k); return true;
  });
}

/** 최근 N일 안에 공포된 것만 */
export function recent(items, days, today) {
  const cut = new Date(Date.parse(today) - days * 864e5).toISOString().slice(0, 10);
  return items.filter((x) => x.date && x.date >= cut);
}

// ── 관련성 판정.
// 법령명 검색이라 정밀한 편이지만 '학술'·'대학' 두 낱말이 엉뚱한 것을 끌고 온다.
//   · '관람 또는 학술 연구 목적으로 용도변경한 곰을 사육할 수 있는 시설 고시'  ← 학술
//   · '청주시 농업인대학 설치 및 운영 조례'                                   ← 대학
// 뒤쪽이 특히 많다. 지자체의 농업인·시민·노인 대상 평생학습 프로그램은 이름만 '대학'이고
// 고등교육과 무관하다. 조례에서 걸러야 할 양의 대부분이 이것이다.
const SKIP = new RegExp([
  '농업인\\s?대학', '시민\\s?대학', '주부\\s?대학', '노인\\s?대학', '경로\\s?대학',
  '아카데미\\s?대학', '행복\\s?대학', '어르신\\s?대학', '귀농', '귀촌',
  '학술지\\s?간행', '기념관', '박물관', '수목원', '사육', '도축', '묘지', '장사시설'
].join('|'));

// 고등교육·연구·AX 중 어느 하나에는 닿아야 한다.
const HIT = new RegExp([
  '대학', '고등교육', '전문대학', '대학원', '학위', '학점', '등록금', '입학', '학칙',
  '산학', '학술진흥', '연구개발', '학술진흥', '교육공무원', '사립학교', '평생교육',
  '인재양성', '지역인재', '지역균형인재', '장학',
  '인공지능', '지능정보', '데이터\\s?기반\\s?행정', '소프트웨어'
].join('|'));

/** 대학 정책과 닿는 것만 남긴다. 제목으로 판정한다. */
export function relevantLaw(items) {
  return items.filter((x) => {
    const t = String(x.title || '');
    if (!t) return false;
    if (SKIP.test(t)) return false;
    return HIT.test(t);
  });
}
