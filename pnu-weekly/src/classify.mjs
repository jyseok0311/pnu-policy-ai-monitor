// 기사 → 분야 · 위험등급. 규칙 기반이며 LLM 을 쓰지 않는다.
// 수치의 근거가 되는 단계라 결정적이어야 하고, 왜 그 등급이 됐는지 되짚을 수 있어야 한다.
//
// ── 세 가지를 고쳤다 (2026-09 · 오분류 신고에서 출발)
//   ① 제목만 본다. 전에는 제목 + RSS 요약을 함께 봤는데, 위험신호 221건 중 43건(19%)이
//      요약에만 있는 단어로 등급을 받았다. '검도대회 우승' 기사가 요약 어딘가의 '위기'로
//      crisis 가 되는 식이다. 요약은 기사 첫 문단이라 본문 소재가 섞여 들어온다.
//      게다가 저장은 200자로 잘라 두면서 분류는 원문 전체로 해, 저장된 데이터만 봐서는
//      그 등급이 왜 붙었는지 재현조차 되지 않았다.
//   ② 부정 표현을 본다. '학내 반발 없이 혁신'이 '반발' 때문에 crisis 였다.
//   ③ 뜻이 갈리는 낱말은 위험을 뜻하는 꼴일 때만 센다. '지적'은 요약 오탐 1위였는데
//      지적재산·지적호기심·지적 능력이 대부분이었다.
//
// 판정 근거를 why 로 함께 돌려준다 — 나중에 "왜 위기야?" 라는 질문에 답할 수 있어야 한다.

// ── 분야: AURA (2026-09 재분류)
//   A 정책/철학    대학이 어디로 갈 것인가 — 제도·거버넌스·재정·윤리
//   U 융합연구      학문 간 융합과 산학 — 연구·기술·창업
//   R 증강인재교육  AI 로 증강된 배움 — 교육과정·학생·인재양성
//   A 적응형행정    행정 자체의 AX — 학사행정·업무 자동화·정보시스템
//
// 전에는 'AI·디지털' 이 한 분야였다. AURA 에서는 AI 가 분야가 아니라 전제다.
// 그래서 맨 'AI' 로는 분야를 정하지 않고 'AI 교육'·'AI 에이전트' 처럼 쓰임이 붙은 말만 센다.
//
// 강한 말(3점)은 분야를 거의 확정짓는 말, 약한 말(1점)은 거들기만 하는 말이다.
// 가중치를 둔 이유: 한 단어씩 세면 '교육' 같은 흔한 말이 '대학 ERP' 같은 결정적인 말을 이긴다.
// 어느 분야도 0점이면 '기타' 로 둔다 — 억지로 넷 중 하나에 넣으면 없는 정확도를 꾸며 내는 셈이다.
// 대분류. 네트워크 깊이판을 이 둘로 나눈다 — 판을 가로지르는 선이 곧 '교육-산업 연계'다.
export const FIELD_GROUP = {
  '정책/철학': '교육', '융합연구': '교육', '증강인재교육': '교육',
  '적응형행정': '산업', 'AX 기술 동향': '산업',
  '기타': '기타'
};
export const groupOf = (field) => FIELD_GROUP[field] || '기타';

// 지역(부울경)은 분야가 아니라 태그다. 주제와 다른 축이라 분야로 두면
// '부울경 산학협력' 기사가 융합연구와 지역 중 한쪽에서 사라진다.
const BUKYEONG = /부울경|동남권|부산|울산|경남|창원|김해|양산|진주|거제|통영|밀양|사천|함안|거창|합천/;
export const isLocal = (title) => BUKYEONG.test(String(title || ''));

export const FIELDS = {
  '정책/철학': {
    strong: ['서울대 10개', '대학서열', '거점국립대', '글로컬대학', 'RISE', '라이즈', '고등교육법', '특별법',
      '구조개혁', '법인화', '대학체제', '거버넌스', '국가장학금', '교부금', '고등교육', '대학정책',
      '기본계획', '시행령', '국정과제', '규제완화', 'AI 기본법', '윤리', '철학',
      'governance', 'policy', 'regulation', 'ethics', 'accreditation', 'autonomy',
      'higher education', 'minister', 'government', 'legislation', 'merger', 'job cuts',
      'cost-cutting', 'budget cut', 'union', 'faculty association', 'chancellor', 'board of',
      'watchdog', 'inquiry', 'crisis', 'super-university', 'league table', 'ranking'],
    weak: ['총장', '교육부', '국회', '정부', '정책', '제도', '법안', '규제', '재편', '통합', '연합',
      '예산', '국고', '재정지원', '등록금', '무상', '전액', '지원사업', '선정', '탈락', '공청회',
      '평가', '인증', '진흥', '개편', '조례', '의결', '발의',
      '선도대학', '1도1국립대', '서열', '순위', '랭킹', '경쟁력', '위기', '존폐', '폐교', '정원감축',
      '유치', '공모', '협의회', '대학혁신', '자율혁신', '재정지원사업', '무전공', '학과 통폐합',
      '글로컬', '지정 취소', '대학지원체계', '국립대병원', '지역의료', '필수의료', '의대', '등급',
      'reform', 'law', 'bill', 'budget', 'funding', 'tuition', 'subsidy', 'grant']
  },
  '융합연구': {
    strong: ['산학협력', '지산학', '공동연구', '연구중심', '연구개발', '연구비', '연구소', '연구단', '연구진',
      '논문', '특허', '학술', 'R&D', '기술이전', '실증', '클러스터', '연구특구', '강소연구', '컨소시엄',
      '얼라이언스', '성장엔진', '초광역', '창업', '스타트업', '융합연구', '학제간', '소셜벤처', '벤처', '기술사업화',
      'research', 'convergence', 'patent', 'startup', 'collaboration',
      'laboratory', 'institute', 'science', 'scientist', 'engineering', 'spin-out',
      'AI research', 'breakthrough', 'clinical trial'],
    weak: [/융합(?!고)/, '연구', '기술', '산업', '반도체', '바이오', '제약', '소재', '로봇', '양자', '우주',
      '에너지', '방산', '2차전지', '특구', '앵커', '협약', '맞손', '산단', '산학',
      'industry', 'innovation']
  },
  '증강인재교육': {
    strong: ['인재양성', '인재 양성', '교육과정', '커리큘럼', '교수학습', '교수법', '비교과', '마이크로디그리',
      '리터러시', '부트캠프', '평생교육', '재교육', '학습자', '수시모집', '정시모집', '입학정원', '학령인구',
      'AI 교육', '디지털 교육', '학생 지원', '현장실습', '교육혁신', '학사구조',
      'AI 과목', 'AI 연수', 'AI 아카데미', '교직원 대상', '디지털 역량', 'AI 활용 역량',
      'curriculum', 'learning', 'literacy', 'enrollment', 'admission',
      'enrolment', 'entry rate', 'undergraduate', 'postgraduate', 'degree', 'course',
      'teaching', 'lecturer', 'graduate', 'tuition fee', 'scholarship', 'campus life',
      'international student', 'applicant'],
    weak: [/교육(?!부|청|감|단체|위원|국|장관|계|계청)/, '학생', '인재', '양성', '육성', '강의', '수업', '학습',
      '역량', '교과', '학과', '전공', '학부', '대학원', '신입생', '재학생', '졸업', '학점', '학년도',
      '취업', '진로', '채용', '청년', '인턴', '수시', '정시', '입시', '경쟁률', '모집', '선발', '정원',
      '충원', '수능', '장학', '교원', '학칙',
      '연수', '특강', '아카데미', '캠프', '세미나', '워크숍', '교직원', '과목', '실습', '멘토링',
      'student', 'talent', 'freshman', 'quota']
  },
  '적응형행정': {
    strong: ['학사행정', '행정혁신', '업무혁신', '수강신청', '전자결재', '스마트캠퍼스', '정보시스템', '학사관리',
      '대학 ERP', 'ERP', '챗봇', '업무 자동화', '행정 자동화', '정보화', '전산시스템', '통합관리시스템',
      '대시보드', '데이터 기반 행정', '내부통제', '정보보호', '개인정보',
      'AI 에이전트', '학사일정', '휴학', '복학', '수강', '증명서', '학생지원시스템',
      '공공 AX', '행정 AX', '공공AX', '행정AX', 'AI 행정', '행정혁신', '공공부문 AI',
      '생성형 AI 도입', '생성형 AI 활용', '생성형 AI 업무', '생성형 AI 행정', 'AI 업무',
      'AI 전환', '디지털 전환', '업무 효율화', '공공기관 AI', '지자체 AI',
      'administration', 'automation', 'workflow', 'chatbot',
      'admin system', 'IT system', 'data platform', 'digital transformation', 'back office'],
    weak: [/(?:대학|학사|교무|학생|교직원|캠퍼스|입학|등록)\s*행정|행정\s*(?:혁신|전산|시스템|업무|절차|효율)/, '업무', '자동화', '전산', '민원', '프로세스', '클라우드', '조직개편', '규정', '운영체계']
  },
  'AX 기술 동향': {
    strong: ['거대언어모델', 'LLM', '파운데이션 모델', '소버린 AI', '온디바이스', '멀티모달',
      'AI 반도체', 'AI 데이터센터', 'AI 모델', 'AI 기술', 'AI 산업', 'AI 시장', 'AI 생태계',
      'AI 투자', 'AI 인프라', 'AI 서비스', 'AI 플랫폼', 'AI 솔루션', 'AX 기술', 'AX 전환',
      '챗GPT', 'ChatGPT', '오픈AI', 'OpenAI', '엔비디아', 'NVIDIA', '딥러닝', '머신러닝',
      'GPU', 'NPU', 'RAG', 'MCP', '피지컬 AI', 'AI 윤리기술',
      'foundation model', 'large language model'],
    weak: ['인공지능', '생성형', '알고리즘', '모델', '데이터센터', '반도체', '클라우드', '오픈소스',
      '기술 동향', '상용화', '고도화']
  }
};

// 위험어 바로 뒤에 이런 말이 오면 그 단어는 위험을 뜻하지 않는다.
// '반발 없이' · '부담 없는' · '우려 해소' · '논란 불식'.
// 위험어 바로 뒤에 이런 말이 오면 그 단어는 위험을 뜻하지 않는다.
// '반발 없이' · '부담 제로' · '우려 해소' · '논란 불식'.
// 인용부호를 건너뛰는 이유: 등록금 부담 '제로' 처럼 따옴표가 끼면 뒤를 못 읽었다.
const NEG = /^[\s'"‘’“”]*(?:이|가|을|를|은|는|도|만|의|에|과|와)?[\s'"‘’“”]*(없이|없는|없다|없어|없음|없었|없도록|없애|없앤|아닌|아니라|해소|불식|종식|막았|막은|막는|막기|방지|피했|피하|씻|잠재웠|덜었|덜어|줄였|제로|경감|완화|낮췄|낮춰|낮추)/;

// 각 등급의 위험어. 문자열이면 그대로 찾고, 정규식이면 그 꼴일 때만 센다.
export const RISK = {
  crisis: [
    '폐교', '폐과', '학과 폐지', '통폐합', '미달', '무산', '삭감', '소송', '파행', '퇴출',
    // '위기' 는 다른 말 속에 잘 숨는다 — 기후위기 · 위기가구 · 행위기준(행위+기준).
    // 대학의 위기를 가리킬 때만 센다.
    /(?<!기후|행)위기(?!가구|가정|아동|청소년|의식|경보|단계|관리)/,
    // 제목만 보게 되면서 놓치던 것들. '글로컬 탈락'·'통합 부결'은 그 대학에 무산과 같은 무게다.
    '탈락', '부결', '좌초', '백지화', '불발', '파업', '농성', '횡령', '비리',
    /반발(?!력)/,                       // 반발력(물리)은 제외
    'closure', 'shut down', 'crisis', 'collapse', 'lawsuit', 'scrapped', 'axed', 'slashed'
  ],
  warning: [
    '감축', '하락', '우려', '갈등', '축소', '논란', '경고', '압박', '차질',
    '반대', '제외', '패싱', '중단', '사퇴', '규탄', '항의', '난항', '표류', '적발', '부실', '반납', '철회', '징계', '고발',
    /부담(?!금)/,                       // 부담금(법정 부담금)은 다른 말이다
    /지적(?:됐|된|되|했|하는|하며|이 나|이 제기|을 받|도 나)/,   // 지적재산·지적호기심 제외
    'cuts', 'decline', 'concern', 'dispute', 'warning', 'pressure', 'backlash', 'shortfall'
  ],
  watch: [
    '검토', '추진', '논의', '개편', '예고', '공청회', '발의', '심사',
    'review', 'proposal', 'plan', 'consultation', 'bill', 'reform'
  ]
};

/** 위험어 하나가 이 글에서 실제로 위험을 뜻하는가. 뜻하면 매치된 문자열을, 아니면 null. */
function riskHit(text, pat) {
  if (pat instanceof RegExp) {
    const re = new RegExp(pat.source, pat.flags.includes('g') ? pat.flags : pat.flags + 'g');
    for (const m of text.matchAll(re)) {
      if (!NEG.test(text.slice(m.index + m[0].length))) return m[0];
    }
    return null;
  }
  let i = text.indexOf(pat);
  while (i >= 0) {
    if (!NEG.test(text.slice(i + pat.length))) return pat;
    i = text.indexOf(pat, i + 1);
  }
  return null;
}

/** 분야어가 제목에 있는가. 문자열은 그대로, 정규식은 그 꼴일 때만. */
// 영문 분류어는 대소문자를 가리지 않는다 — 제목은 'Faculty Associations' 처럼 대문자로 온다.
// 다만 대문자가 든 말(RISE·ERP·R&D·AI 교육)은 그대로 찾는다. 소문자로 낮추면
// RISE 가 'sunrise' 에, ERP 가 엉뚱한 말에 걸린다.
const has = (text, w) => {
  if (w instanceof RegExp) return w.test(text);
  return /[A-Z]/.test(w) ? text.includes(w) : text.toLowerCase().includes(w);
};

const LEVELS = ['crisis', 'warning', 'watch'];

/**
 * @param title  기사 제목. 분류는 제목만 본다.
 * @returns { field, level, why } — why 는 등급을 만든 낱말(없으면 null)
 */
export function classify(title) {
  const text = String(title || '');

  let field = '기타', best = 0;
  for (const [f, g] of Object.entries(FIELDS)) {
    const n = g.strong.filter((w) => has(text, w)).length * 3 + g.weak.filter((w) => has(text, w)).length;
    if (n > best) { best = n; field = f; }
  }

  for (const lv of LEVELS) {
    for (const pat of RISK[lv]) {
      const w = riskHit(text, pat);
      if (w) return { field, group: groupOf(field), local: isLocal(text), level: lv, why: w };
    }
  }
  return { field, group: groupOf(field), local: isLocal(text), level: 'normal', why: null };
}
