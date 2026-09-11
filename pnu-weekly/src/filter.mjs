// 수집 항목의 관련성 필터 — aggregate.mjs 와 series.mjs 가 같은 기준을 쓰도록 한 곳에 둔다.
// 기준이 갈리면 주차 간 비교가 무의미해진다.

const NOISE = /MC몽|아이돌|가수|연예|드라마|예능|축구|야구|프로야구|골프|복권|로또/;
const TOPIC = /대학|학생|교수|교육|입시|수시|정시|학과|캠퍼스|등록금|국립|사립|학령|총장|학사|연구|RISE|라이즈|글로컬|전문대|교부금|정원|충원|장학/;
// 한국 대학명은 '대학'이 아니라 '대'로 끝난다(충남대·서울대·공주대…).
// '대학'만 보던 초기 필터가 거점국립대 핵심 기사를 통째로 걸러낸 적이 있어 추가한 패턴이다.
const UNIV_NAME = /[가-힣]{2,4}대(?:학교)?(?:[^가-힣]|$)/;

export function relevant(items) {
  return items.filter((x) => {
    const t = x.title + ' ' + x.summary;
    return !NOISE.test(t) && (TOPIC.test(t) || UNIV_NAME.test(t));
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
