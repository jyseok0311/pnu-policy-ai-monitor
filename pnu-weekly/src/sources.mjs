// 기사 수집 대상 — 무엇을 어디서 모으는가.
//
// collect.mjs(실제 수집)와 daily.mjs(화면의 '수집 기준' 표시)가 같은 목록을 본다.
// 예전에는 collect.mjs 안에 박혀 있어서, 화면에 기준을 보이려면 따로 한 벌을 적어 둬야 했고
// 그러면 검색어를 하나 더하고 화면은 안 고치는 일이 생긴다. 한 곳에 두고 양쪽이 가져다 쓴다.

import { PROGRAMS } from './programs.mjs';

// 국내 — 구글 뉴스 검색어. 제목에 이 말이 나오는 기사가 아니라 '이 검색에 걸리는' 기사를 가져온다.
// 가져온 뒤에는 filter.mjs 가 제목으로 다시 거른다(수집은 넓게, 판정은 제목으로).
export const GOOGLE_QUERIES = [
  '거점국립대', '국립대 통합', '글로컬대학', 'RISE 지역혁신중심 대학지원',
  '대학 정원 감축', '대학 등록금', '대학 생성형 AI', '대학 구조개혁', '부산대학교',
  // 적응형행정(AURA A) — 대학·공공의 행정 AX.
  // 대학 기사만 봐서는 주당 서너 건뿐이라 분야 판이 그려지지 않았다.
  '대학 행정 AI', '대학 학사행정 시스템', '공공부문 생성형 AI', '공공기관 AI 행정혁신',
  '생성형 AI 업무 도입',
  // 정부 AI·AX 인재양성 사업(src/programs.mjs). 이 사업들을 겨냥한 검색어가 없어
  // 넓은 검색어에 우연히 걸린 것만 들어왔다 — 전자신문 「15개 AX대학원…」은 아예 빠졌다.
  ...PROGRAMS.map((p) => p.query)
];

// 대학 전문 언론 RSS. 구글 뉴스와 달리 매체가 직접 주는 원문 링크라 최신 50건 정도만 준다.
export const PRESS_FEEDS = [
  { media: '한국대학신문', url: 'https://news.unn.net/rss/allArticle.xml' },
  { media: '교수신문', url: 'https://www.kyosu.net/rss/allArticle.xml' },
  { media: '베리타스알파', url: 'https://www.veritas-a.com/rss/allArticle.xml' },
  { media: '대학지(유니프레스)', url: 'https://www.unipress.co.kr/rss/allArticle.xml' }
];

// 해외 고등교육 정책 — 국내 이슈의 선행/대조 사례로 쓴다.
// 영문 구글 뉴스는 언어·지역 파라미터만 바꾸면 된다.
export const OVERSEAS_QUERIES = [
  'higher education policy reform',
  'university funding cuts government',
  'national university merger',
  'university tuition free policy',
  'generative AI university policy',
  'declining student enrollment university',
  'regional university revitalization',
  'university world rankings policy'
];
