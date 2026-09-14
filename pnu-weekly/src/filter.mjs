// 수집 항목의 관련성 필터 — aggregate.mjs 와 series.mjs 가 같은 기준을 쓰도록 한 곳에 둔다.
// 기준이 갈리면 주차 간 비교가 무의미해진다.

// 대학 이름이 스쳐도 대학 정책 기사가 아닌 것들. 제목·요약 어디에 있어도 뺀다.
const NOISE = /MC몽|아이돌|가수|연예|드라마|예능|축구|야구|프로야구|배구|농구|골프|검도|씨름|복권|로또|오늘날씨|내일날씨|주간날씨|미세먼지|부고|별세|운세|코스피|코스닥/;

// 고등교육 정책 어휘.
// '연구'는 뺐다 — 기업 연구소·학회·지자체 연구원까지 끌고 들어와 오탐 1위였다.
// 대학 연구 기사는 대학명이나 다른 어휘로 이미 걸린다.
const TOPIC = /대학|학생|교수|교육|입시|수시|정시|수능|학과|캠퍼스|등록금|국립|사립|학령|총장|학장|학사|로스쿨|의대|교대|대학원|RISE|라이즈|글로컬|전문대|교부금|정원|충원|장학|학칙|학점|졸업생|재학생|신입생|석학|교원|교직원|연구비|연구윤리|케이무크|평생교육|교사노조|교원단체|교육감|교육청|인재\s?양성|인재\s?육성/;

// 과학기술원·영문 약칭 대학은 한글 패턴에 걸리지 않는다. KAIST·GIST 기사가 통째로 빠졌다.
const UNIV_ABBR = /\b(?:KAIST|GIST|DGIST|UNIST|POSTECH|KENTECH|K-MOOC)\b/;

// 한국 대학명은 '대학'이 아니라 '대'로 끝난다(충남대·서울대·공주대…).
// '대학'만 보던 초기 필터가 거점국립대 핵심 기사를 통째로 걸러낸 적이 있어 추가한 패턴이다.
// 뒤에 무엇이 붙는지가 까다롭다.
//   · 조사가 붙는 경우 — '경북대마저 탈락' 이 통째로 새어 나갔다.
//   · 부속기관이 붙는 경우 — '부산대병원'·'양산부산대병원'·'부산대치병'.
const UNIV_NAME = /[가-힣]{2,4}대(?:학교)?(?:병원|치병|치과병원|한방병원|산학협력단)?(?:[^가-힣]|$|(?:은|는|이|가|을|를|의|에|와|과|도|만|로|에서|에게|부터|까지|마저|조차|처럼|보다)(?![가-힣]))/;

// 행정 AX 기사는 제목에 대학 낱말이 없는 경우가 많다('공공부문 생성형 AI 도입 가이드라인').
// AURA 의 적응형행정은 공공 AX 까지 포함하므로 이 길을 따로 낸다.
// 'AI' 한 낱말로 열면 온갖 기사가 들어오므로 '공공·행정·학사·업무' 가 붙은 꼴만 받는다.
const AX_ADMIN = /(?:공공|행정|학사|업무|기관|부처|지자체)\s?(?:부문\s?)?(?:생성형\s?AI|AI\s?전환|AX|AI\s?도입|AI\s?활용)|생성형\s?AI\s?(?:도입|활용|행정|업무|전환)|공공\s?AX|행정\s?AX|AI\s?행정|대학\s?ERP|학사\s?행정/;

// 해외 기사는 한국어 키워드에 걸리지 않으므로 영문 조건을 따로 둔다.
const TOPIC_EN = /universit|college|higher education|campus|tuition|enrollment|faculty|student/i;

/**
 * 관련성 판정은 '제목'으로 한다.
 * 전에는 제목 + RSS 요약을 함께 봤는데, 요약은 기사 첫 문단이라 본문 소재가 섞여 들어온다.
 * 날씨·촉매 연구·급식센터 기사가 요약 어딘가의 '대학'·'연구' 한 단어로 통과했다.
 * (같은 이유로 위험등급 분류도 제목만 보도록 바꿨다 — src/classify.mjs)
 */
export function relevant(items) {
  return items.filter((x) => {
    const title = String(x.title || '');
    if (NOISE.test(title + ' ' + x.summary)) return false;
    if (x.region === 'overseas') return TOPIC_EN.test(title);
    return TOPIC.test(title) || UNIV_NAME.test(title) || UNIV_ABBR.test(title) || AX_ADMIN.test(title);
  });
}

// 주차 간 비교는 같은 소스 구성에서만 공정하다.
// 과거 주차는 구글 뉴스로만 소급 수집되므로(언론사 RSS는 최신 50건뿐), 비교 지표는 구글 소스로 통일한다.
export function googleOnly(items) {
  return items.filter((x) => (x.feeds || []).some((f) => f.startsWith('구글뉴스')));
}

// 사업명이 대학명을 포함해 오탐을 만든다. '서울대 10개 만들기'는 거점국립대 기사지 서울대 기사가 아니다.
const PROGRAM_NAMES = [/서울대\s?10개\s?만들기/g, /서울대\s?10개/g];
export function mentionsOf(items, name) {
  return items.filter((x) => {
    let t = x.title + ' ' + x.summary;
    PROGRAM_NAMES.forEach((re) => { t = t.replace(re, '«사업명»'); });
    return t.includes(name);
  }).length;
}
