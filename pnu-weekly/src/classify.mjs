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

export const FIELDS = {
  '거버넌스': ['통합', '연합', '거버넌스', '구조개혁', '총장', '국립대', '공공기관', '재편', '법인화',
    'merger', 'governance', 'restructuring', 'chancellor', 'consolidation', 'autonomy',
    'reform', 'accreditation', 'policy', 'regulation', 'oversight', 'crackdown', 'ban', 'law', 'bill'],
  '재정': ['예산', 'RISE', '라이즈', '등록금', '재정지원', '국고', '교부금', '적자', '지원금',
    'funding', 'budget', 'tuition', 'grant', 'subsidy', 'deficit', 'endowment', 'fee'],
  '입시·학령인구': ['수시', '정시', '경쟁률', '충원', '입시', '학령인구', '모집', '정원', '신입생', '수능',
    'enrollment', 'admission', 'applicant', 'demographic', 'intake', 'quota', 'freshman', 'undocumented', 'international student'],
  'AI·디지털': ['AI', '인공지능', '디지털', 'AX', '생성형', '데이터', '에이전트', 'SW', '반도체',
    'artificial intelligence', 'generative', 'digital', 'chatbot', 'semiconductor']
};

// 위험어 바로 뒤에 이런 말이 오면 그 단어는 위험을 뜻하지 않는다.
// '반발 없이' · '부담 없는' · '우려 해소' · '논란 불식'.
const NEG = /^\s*(?:이|가|을|를|은|는|도|만|의|에|과|와)?\s*(없이|없는|없다|없어|없음|없었|아닌|아니라|해소|불식|종식|막았|막은|막는|막기|방지|피했|피하|씻|잠재웠|덜었|줄였)/;

// 각 등급의 위험어. 문자열이면 그대로 찾고, 정규식이면 그 꼴일 때만 센다.
export const RISK = {
  crisis: [
    '폐교', '폐과', '학과 폐지', '통폐합', '위기', '미달', '무산', '삭감', '소송', '파행', '퇴출',
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

const LEVELS = ['crisis', 'warning', 'watch'];

/**
 * @param title  기사 제목. 분류는 제목만 본다.
 * @returns { field, level, why } — why 는 등급을 만든 낱말(없으면 null)
 */
export function classify(title) {
  const text = String(title || '');

  let field = '기타', best = 0;
  for (const [f, ws] of Object.entries(FIELDS)) {
    const n = ws.filter((w) => text.includes(w)).length;
    if (n > best) { best = n; field = f; }
  }

  for (const lv of LEVELS) {
    for (const pat of RISK[lv]) {
      const w = riskHit(text, pat);
      if (w) return { field, level: lv, why: w };
    }
  }
  return { field, level: 'normal', why: null };
}
